import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Text from '../components/Text';

import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import ListGroup from '../components/ListGroup';
import RowActions from '../components/RowActions';
import SearchField from '../components/SearchField';
import { clipWords, suggestionValue, type WishlistSourceData } from './wishlist-row';
import Working from '../components/Working';
import { apiRequest, ApiRequestError } from '../api/client';
import {
  filterSuggestions,
  learnMoreQuestion,
  suggestionsFor,
  type WishlistSuggestion,
} from '@tappet/core/wishlist-suggestions';
import { wishlistItemIdentifier, type WishlistItemType } from '@tappet/core/wishlist-identifier';
import type { WishlistSource } from '@tappet/core/wishlist-source';
import { TABULAR, border, space, surface, text, type } from '../theme';

/**
 * Adding to the wishlist — suggestions first, free text last.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * A text box on `WishlistScreen` and three "file it as" chips. David, 23 Aug:
 * *"wishlist is totally underbaked… it can't just be free entry, we need some
 * combo of list of suggestions with CTAs to Add or Learn More, and list should
 * be filterable with type ahead; dynamic filtering as user types."*
 *
 * The old screen's own docblock defended free-text-only on the grounds that
 * *"the phone has none of those [suggestion] surfaces yet."* It had them: the
 * knowledge base is on the `load-vehicle` payload the wishlist screen was one
 * route away from, and `BuildScreen` was already reading `common_mods` out of
 * it. `wishlist-suggestions.ts` carries the mapping.
 *
 * ── Why a route rather than a sheet on the wishlist ─────────────────────────
 *
 * `native-wishlist.spec.html` puts **Add in the nav bar** and says why a
 * floating button is wrong — *"a FAB covers the last row and belongs to a
 * different design language."* A nav-bar `+` implies a destination, and the
 * content earns one: a filter field, a scrolling catalogue and two controls per
 * row do not belong stacked on top of the list they are adding to.
 *
 * ── Free text survives, at the bottom ───────────────────────────────────────
 *
 * ⚠ The suggestions are an accelerator, never a gate. `known_issues` is what
 * research found, not what an owner knows about their own car — the noise their
 * gearbox makes is not in any catalogue. So whatever is typed into the filter
 * can always be added as itself, and that control is **the filter's own text**
 * rather than a second field, so there is nothing to retype.
 *
 * Same argument `Suggest` makes on the add-a-car screen, and the same one §10
 * makes generally: a list that refuses what is not in it asserts a completeness
 * it does not have.
 */

interface Props {
  vehicleId: string;
  title?: string;
  onSignOut: () => void;
  /** Pushes the advisor with the question already in hand. */
  onAskAdvisor: (vehicleId: string, ask: string) => void;
  /** Called after a successful add so the list behind this can refetch. */
  onAdded: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'loaded';
      name: string;
      suggestions: WishlistSuggestion[];
      /** Identifiers already on the list — a suggestion says so rather than duplicating. */
      onList: Set<string>;
    };

/** What a hand-typed item is filed as when nothing else says otherwise. */
const DEFAULT_TYPE: WishlistItemType = 'maintenance';

export function WishlistAddScreen({ vehicleId, title, onSignOut, onAskAdvisor, onAdded }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });

    try {
      /*
        Both, together. The knowledge base is the catalogue and the wishlist is
        what has already been taken from it — a suggestion that is already on
        the list must say so rather than offering to add it twice, which is the
        "lying already-added state" `wishlist-identifier.ts` was written about.
      */
      const [vehicleResult, wishlistResult] = await Promise.allSettled([
        apiRequest<{ vehicle?: { year?: number; make?: string; model?: string }; knowledge?: unknown }>(
          `/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`
        ),
        apiRequest<{ wishlistItems?: Array<{ item_identifier?: string | null }> }>(
          `/wishlist?vehicleId=${encodeURIComponent(vehicleId)}`
        ),
      ]);

      if (vehicleResult.status === 'rejected') throw vehicleResult.reason;

      const vehicle = vehicleResult.value.vehicle;

      setState({
        kind: 'loaded',
        name:
          [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') ||
          title ||
          'this car',
        suggestions: suggestionsFor(vehicleResult.value.knowledge),
        onList: new Set(
          wishlistResult.status === 'fulfilled'
            ? (wishlistResult.value.wishlistItems ?? []).flatMap((item) =>
                typeof item?.item_identifier === 'string' ? [item.item_identifier] : []
              )
            : []
        ),
      });
    } catch (error) {
        /*
          ── ⚠ MOB-08 · a server 401 is not "you are signed out" ─────────────

          This forced a sign-out on **any** 401 and then `return`ed without
          setting a state — which is only safe if `onSignOut()` unmounts the
          screen, and it does not when the network call was the thing that
          failed. Result: offline with an expired token, this screen shows
          skeletons **forever** — no error, no retry, nothing to pull.

          `isLocallySignedOut` is the distinction the client already goes to
          trouble to make, with a docblock recording that a real tester hit this
          three times out of three on 5 Aug — and exactly **one** screen
          consumed it. A `device` 401 is genuinely signed out; a `server` 401
          may be a token the server would accept a second later, and destroying
          a working session over one response is how a spurious failure becomes
          a forced re-login.

          Falls through to the error state either way, so there is always
          something on screen and something to press.
        */
      if (error instanceof ApiRequestError && error.isLocallySignedOut) {
        onSignOut();
        return;
      }
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load suggestions',
      });
    }
  }, [vehicleId, title, onSignOut]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Put something on the list.
   *
   * ⚠ The identifier always comes from `wishlistItemIdentifier`. The table
   * dedupes on `(vehicle_id, item_identifier)`, and a locally-built key
   * produces a duplicate row, an "Add" that never becomes "Added", and a delete
   * that silently matches nothing — all three have happened.
   */
  const add = useCallback(
    async (
      name: string,
      itemType: WishlistItemType,
      description?: string,
      note?: string | null,
      value?: string | null
    ) => {
      const identifier = wishlistItemIdentifier(itemType, name);
      /*
        ── 13 Sep · the figure travels with the item ──────────────────────
        Core's sentence for the row's figure, in `source_data`, so the Needs
        list can print "5,000 MI / 12 MO" beside the item the way this
        screen did (round 40). Nothing is written when there is nothing to
        carry. `wishlist-row.ts` says why the sentence and not the figure,
        and what core should own here.
      */
      const sourceData: WishlistSourceData | undefined =
        note || value ? { ...(note ? { note } : {}), ...(value ? { value } : {}) } : undefined;

      setProblem(null);
      setBusy(identifier);

      try {
        await apiRequest('/wishlist', {
          method: 'POST',
          body: {
            vehicleId,
            itemType,
            itemName: name,
            itemIdentifier: identifier,
            /*
              The reason travels with the item. Six weeks later a row reading
              "Charge pipe" has lost the only thing that made it a
              recommendation rather than a shopping list.
            */
            description: description ?? '',
            /*
              ⚠ `'dossier'`, one of the three words the table accepts. This
              sent `'suggestions'` from the day it was written and the
              database refused every add with `23514` — "Failed to add item
              to wishlist" on David's phone, 12 Sep. The catalogue is what
              the app knows about the car, which is what `dossier` means;
              the web sends the same word for the same add.
              `@tappet/core/wishlist-source` carries the set.
            */
            source: 'dossier' satisfies WishlistSource,
            ...(sourceData ? { sourceData } : {}),
          },
        });

        setState((held) =>
          held.kind === 'loaded'
            ? { ...held, onList: new Set([...held.onList, identifier]) }
            : held
        );
        onAdded();
      } catch (error) {
        /*
          ── ⚠ MOB-08 · a server 401 is not "you are signed out" ─────────────

          This forced a sign-out on **any** 401 and then `return`ed without
          setting a state — which is only safe if `onSignOut()` unmounts the
          screen, and it does not when the network call was the thing that
          failed. Result: offline with an expired token, this screen shows
          skeletons **forever** — no error, no retry, nothing to pull.

          `isLocallySignedOut` is the distinction the client already goes to
          trouble to make, with a docblock recording that a real tester hit this
          three times out of three on 5 Aug — and exactly **one** screen
          consumed it. A `device` 401 is genuinely signed out; a `server` 401
          may be a token the server would accept a second later, and destroying
          a working session over one response is how a spurious failure becomes
          a forced re-login.

          Falls through to the error state either way, so there is always
          something on screen and something to press.
        */
        if (error instanceof ApiRequestError && error.isLocallySignedOut) {
          onSignOut();
          return;
        }
        /*
          409 is the dedupe working, not a failure — the item is on the list,
          which is what was wanted. The row flips rather than showing an error
          about a state the person already has.
        */
        if (error instanceof ApiRequestError && error.status === 409) {
          setState((held) =>
            held.kind === 'loaded'
              ? { ...held, onList: new Set([...held.onList, identifier]) }
              : held
          );
          onAdded();
          return;
        }
        setProblem(error instanceof Error ? error.message : 'That could not be added.');
      } finally {
        setBusy(null);
      }
    },
    [vehicleId, onSignOut, onAdded]
  );

  /*
    ── The typeahead ────────────────────────────────────────────────────────

    Recomputed on every keystroke and deliberately not debounced: this filters
    an in-memory array of a dozen or so items, so there is nothing to wait for.
    A debounce here would be latency added on purpose. `AddVehicleScreen`
    debounces because its list comes over a network; this one does not.
  */
  const typed = query.trim();

  const shown = useMemo(
    () => (state.kind === 'loaded' ? filterSuggestions(query, state.suggestions) : []),
    [state, query]
  );

  const exactMatch = shown.some(
    (suggestion) => suggestion.name.toLowerCase() === typed.toLowerCase()
  );

  /**
   * The list, in sections — R40.
   *
   * ⚠ **Only when nothing is typed.** A filtered set is a search result, not a
   * plan: splitting three matches under two headers is furniture, and the
   * matching count in the label is the useful thing there.
   *
   * A section is omitted when empty rather than rendered with nothing under it,
   * so a car with no urgent work shows one list rather than an empty promise.
   */
  const groups = useMemo(() => {
    if (typed) return [{ label: `${shown.length} matching`, rows: shown }];

    const urgent = shown.filter((suggestion) => suggestion.urgent);
    const rest = shown.filter((suggestion) => !suggestion.urgent);

    return [
      { label: 'Do first', rows: urgent },
      { label: urgent.length > 0 ? 'Everything else' : 'Suggested for this car', rows: rest },
    ].filter((group) => group.rows.length > 0);
  }, [shown, typed]);

  if (state.kind === 'loading') {
    /* 12 Sep: the delayed full instrument — see `Working` for the rule. */
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Opening the suggestions" />
      </ScrollView>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Could not load suggestions</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Button label="Try again" variant="outline" onPress={() => void load()} />
      </View>
    );
  }

  return (
    /*
      ── ⚠ The filter stays put ────────────────────────────────────────────────

      It scrolled away with the list, which is backwards for a control whose
      whole job is to shorten that list: by the time you have scrolled far
      enough to want it, it is off screen, and you scroll back up to reach the
      thing that would have saved you the scrolling.

      Outside the scroller rather than `stickyHeaderIndices`, deliberately.
      Sticky headers on a `ScrollView` with `keyboardShouldPersistTaps` behave
      inconsistently on Android when the keyboard resizes the frame, and this
      control is a text input — the one case where that matters most.
    */
    <View style={styles.screen}>
      {/*
        ── ⚠ 22 Sep · no `PlateBand` here, and the reason is the pinned field ──

        A critic pass flagged this screen as the one real gap in that day's
        coverage work, and it was right that the *exclusion was undocumented*
        — it had been skipped because the placement was awkward, which is not
        an argument. This is the argument.

        Every other band is the scroller's first child, so it scrolls away
        after one flick. This screen's filter is pinned **outside** the
        scroller (see the note below — R38, deliberate), which leaves a band
        two placements and both are wrong:

          - Above the field, it is never inside the scroller, so it is
            **permanent**: 132pt, 15% of a 402×874 display, held forever on
            the one screen whose whole job is browsing a long list. Two rows
            fewer, on every scroll, for the life of the screen.
          - Below the field, the photograph slides under a floating control,
            which is the glassmorphism reading `plinth` exists to refuse.

        A band was briefly shipped in the first placement and reverted when
        the cost was measured rather than estimated. The screen is not
        without imagery either: the rows carry part photographs, and the
        field above them is the subject.

        ⚠ So the rule `PlateBand` states — *a screen takes its stack's
        place* — has a second clause, and it belongs here rather than in a
        list: **a screen whose scroller is not its first child cannot host a
        band**, because the band stops being a head and becomes furniture.
      */}
      {problem && <AlertBanner tone="critical" headline="That was not added" body={problem} />}

      {/*
        The filter. It is also the free-text field — see the header.

        ⚠ **R38.** The placeholder read "Filter suggestions, or type something
        to add", which is the placeholder's two-jobs problem said out loud.
        Filtering an existing list and authoring a new item are different
        verbs with different results, and one name cannot signal which is
        about to happen. The field searches. Authoring is the block at the
        list's foot, which appears with its own lead sentence and its own
        button — a visible affordance rather than a hint inside a field.

        ⚠ 13 Sep · `SearchField`, the History list's box, not a private copy.
        This was a square `View` with a `borderWidth`, grey under focus and
        blue-careted — every defect the History's box had been cured of one
        round at a time (round 38: *"the only container without a cut"*).
      */}
      <SearchField
        style={styles.searchPinned}
        value={query}
        onChangeText={setQuery}
        placeholder="Search suggestions"
        accessibilityLabel="Search suggestions"
        clearAccessibilityLabel="Clear the filter"
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {state.suggestions.length === 0 ? (
        /*
          Nothing known, rather than nothing to suggest. The knowledge base
          fills in seconds after a car is added, and saying "no suggestions"
          about a lookup that has not run is the recall screen's 21 Aug defect
          in another place.
        */
        <Text style={styles.empty}>
          We have not worked out what {state.name} needs yet. That fills in once the car's research
          has run — its page shows it working. You can still type anything in above and add it.
        </Text>
      ) : null}

      {/*
        ── R40 · urgency is where the row sits, not a word on every row ───────

        `suggestionsFor` sorts urgent-first, so "Do first" appeared on every row
        of the first screenful and told the reader nothing they could not see
        from the order. The order still does the work; the section header names
        it once, and the chip goes back to saying what kind of thing the row is.

        Not split while filtering. A search result set is not a plan, and two
        headers over two matches is furniture.
      */}
      {groups.map(({ label, rows }) => (
        <ListGroup key={label} label={label} count={typed.length > 0}>
          {rows.map((suggestion, index) => {
            const added = state.onList.has(suggestion.identifier);
            const working = busy === suggestion.identifier;
            const value = suggestionValue(suggestion);

            /*
              ── 13 Sep · the row is the spec table's — B6, round 37 ──────────

              The History and Due rows' shape: the mono index, the label, the
              mono figure right-aligned at the rule, a hairline per row; the
              reason beneath in the quiet sans, clear of the index column; and
              the row's verbs on its last line (`RowActions`). It was a bold
              sans name with the chip beside it, the sentence, the figure as a
              second sentence, and two controls under everything — *"prose on
              hairlines, not a spec table"*.
            */
            return (
              <View
                key={suggestion.identifier}
                style={[styles.row, index < rows.length - 1 && styles.divided]}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.index} accessibilityElementsHidden importantForAccessibility="no">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text style={styles.name}>{suggestion.name}</Text>
                  {value ? (
                    <Text style={styles.value} accessibilityLabel={suggestion.note ?? value}>
                      {value}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rowBody}>
                  {/*
                    ── R41 · two lines, and then the row stops ──────────────

                    The reason is research prose and runs to whatever length
                    the model wrote. Uncapped, the last row on screen ended
                    mid-sentence at the fold with no ellipsis, which reads as
                    a rendering fault rather than as more text below. Two
                    lines is enough to say what the part is and why it
                    matters; the whole of it is what LEARN MORE is for — and
                    the cut lands on a word (`clipWords`), not inside one.
                  */}
                  <Text style={styles.reason} numberOfLines={2} accessibilityLabel={suggestion.reason}>
                    {clipWords(suggestion.reason)}
                  </Text>

                  {/*
                    ── R39, rewritten 13 Sep · one control per row ────────────

                    `Add` and `Learn more` were once `outline` and `ghost`
                    and read as two equal buttons down the list; R39 made ADD
                    a `quiet` fill so each row had one control the eye could
                    land on. `quiet` left the primitive set on 6 Sep (B4
                    names three treatments, and a graphite fill was a field
                    with no way to tell) and ADD "took `outline`" — back to
                    the pair R39 was written to escape, which is what David
                    read from his phone as *"unclear, not obvious, not
                    inviting"*. The pair is now the pattern `RowActions`
                    states once for every list: the box at the trailing edge
                    is the act, the ghost word before it is the step beneath,
                    and once added the box becomes its state word.

                    ⚠ The row itself is still deliberately **not** the
                    affordance. There is no suggestion detail screen; the only
                    thing a row could navigate to is the advisor, and that
                    spends a model call. A whole-row tap that costs money on a
                    mis-scroll is the wrong trade — declined in this loop as
                    it was in §6.15's.
                  */}
                  <RowActions
                    action={{
                      label: 'Add',
                      accessibilityLabel: `Add ${suggestion.name} to Needs`,
                      onPress: () =>
                        void add(suggestion.name, suggestion.type, suggestion.reason, suggestion.note, suggestion.value),
                      busy: working,
                    }}
                    secondary={{
                      label: 'Learn more',
                      accessibilityLabel: `Ask the advisor about ${suggestion.name}`,
                      onPress: () => onAskAdvisor(vehicleId, learnMoreQuestion(suggestion, state.name)),
                    }}
                    /*
                      ADDED — the Due table's word, so one state has one
                      word across the app; "On the list" was the sentence
                      the reader still hears. Round 39 measured the longer
                      word pushing LEARN MORE off its column.
                    */
                    done={added ? 'Added' : null}
                    doneAccessibilityLabel={`${suggestion.name} is on the list`}
                  >
                    {/*
                      ── 13 Sep · the kind is a word, on every row ───────────

                      This was a `Chip`, and a coloured one when the research
                      said urgent (a High issue, a Critical service). Round 38
                      read what the colour drew — the same SERVICE chip sodium
                      here and grey on Needs one screen back, a routine oil
                      change wearing the warning hue because its priority is
                      Critical, while DO FIRST already said so — and round 40
                      read what the box drew: *"a boxed category label … reads
                      as a control"*, three cut hairlines on one line with the
                      act's. So the kind is the Due row's basis token: a bare
                      mono word in the muted ink, the row's one box being the
                      act. The section carries urgency (`urgent` still sorts
                      and sections); the word carries the kind and nothing
                      else, which is the one rule both screens can keep.
                    */}
                    <Text style={styles.kind}>{suggestion.chip}</Text>
                  </RowActions>
                </View>
              </View>
            );
          })}
        </ListGroup>
      ))}

      {/*
        ── The free-text fallback ──────────────────────────────────────────────

        Offered only once something is typed, and suppressed when it exactly
        names a suggestion already on screen — two controls that do the same
        thing, one of which loses the reason and the type, is a worse list than
        one control.
      */}
      {typed.length > 0 && !exactMatch && (
        <View style={styles.own}>
          <Text style={styles.ownLead}>
            Not in the list? Add it as your own — it files as something to look at, and you can
            ask the advisor about it any time.
          </Text>
          <Button
            label={`Add “${typed}”`}
            variant="primary"
            busy={busy === wishlistItemIdentifier(DEFAULT_TYPE, typed)}
            busyLabel="Adding"
            accessibilityLabel={`Add ${typed} to Needs`}
            onPress={() => void add(typed, DEFAULT_TYPE)}
          />
        </View>
      )}

      {shown.length === 0 && state.suggestions.length > 0 && typed.length > 0 && (
        <Text style={styles.empty}>
          Nothing we know about matches “{typed}”. That does not mean it is not worth doing — add
          it above.
        </Text>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.h2 },
  /* Pinned above the scroller, on the page's own surface so nothing shows through. */
  searchPinned: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.h1,
    gap: space.sm,
  },
  errorTitle: { ...type.title, color: text.primary },
  errorBody: { ...type.body, color: text.muted, textAlign: 'center' },

  /*
    ── The spec table's row — B6 ─────────────────────────────────────────────

    The Due row's numbers (`ServiceMilestoneScreen`): 12 above and below, the
    head line's index at a fixed 22 so every name shares one left edge, the
    figure mono and tabular at the rule, and everything beneath the head
    line indented past the index column. Nothing here is a `padding` on the
    horizontal — `ListGroup`'s rules run the page width and the row's text
    starts on the page margin, as the History rows' does.
  */
  row: { paddingVertical: space.md, gap: space.xs },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  index: { ...type.mono, color: text.muted, ...TABULAR, minWidth: 22, lineHeight: 20 },
  name: { ...type.ui, color: text.primary, flex: 1 },
  /* B6: the figure, mono, right-aligned and tabular so the column is a column. */
  value: { ...type.mono, color: text.primary, textAlign: 'right', ...TABULAR, lineHeight: 20 },
  rowBody: { paddingLeft: 22 + space.md, gap: space.xs },
  reason: { ...type.value, color: text.secondary, lineHeight: 19 },
  /* The kind — KNOWN ISSUE, SERVICE, MODIFICATION — in the Due row's token voice. */
  kind: { ...type.monoLabel, color: text.muted },

  own: { gap: space.sm },
  ownLead: { ...type.value, color: text.muted, lineHeight: 19 },
  empty: { ...type.body, color: text.secondary },
});
