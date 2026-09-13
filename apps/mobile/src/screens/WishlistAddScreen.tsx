import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import Chip from '../components/Chip';
import ListGroup from '../components/ListGroup';
import RowActions from '../components/RowActions';
import SearchField from '../components/SearchField';
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

/**
 * The row's figure, for the numeral column — B6, round 37.
 *
 * A suggestion carries one figure: an issue's mileage window, a service's
 * interval, a modification's difficulty. Core prints it as a sentence
 * (`note`: "Typically 60,000 - 100,000 miles", "Every 5,000 mi or 12
 * months", "Easy") and the row used to set that sentence in sans under the
 * reason — the critique's *"the values are sans"*. A spec table's figure is
 * mono and ends at the rule, so the sentence is read back into its numbers
 * here: `60,000–100,000 MI`, `5,000 MI / 12 MO`, `EASY`. The numbers are
 * core's own, unrounded (§10).
 *
 * ⚠ A window the model wrote as two — the M235i's coils say "30,000 -
 * 60,000 miles (plugs), 60,000 - 100,000 miles (coils)" — is spanned, first
 * low to last high, which says less than the sentence and nothing the
 * sentence did not; a note with no window in it gives the column nothing
 * and is not printed as a sentence in the body (round 39). Better an empty
 * slot than a figure guessed from prose.
 *
 * ⚠ **This belongs in `packages/core` beside `note`** — a `value` on
 * `WishlistSuggestion`, built from the raw fields rather than read back out
 * of the sentence, so the web can print the same figure. Written here
 * because a worktree does not edit core; the shapes matched are the exact
 * templates `wishlist-suggestions.ts` writes, and the test pins them
 * against core's real output so a template change cannot pass silently.
 */
const WINDOW = /([\d,]+)\s*[-–]\s*([\d,]+)\s*(?:mi|miles)\b/gi;
const INTERVAL = /^Every (?:([\d,]+) mi)?(?: or )?(?:(\d+) months)?$/;

export function suggestionValue(suggestion: Pick<WishlistSuggestion, 'type' | 'note'>): string | null {
  if (!suggestion.note) return null;
  if (suggestion.type === 'issue') {
    /*
      Every window in the sentence, spanned: the coils' "30,000 - 60,000
      miles (plugs), 60,000 - 100,000 miles (coils)" is the row's window from
      the first low to the last high — what the model wrote and no more,
      which is the direction §10 allows. Round 39: a numeric sentence in the
      body is never the answer; the figure is the column's or nowhere.
    */
    const windows = [...suggestion.note.matchAll(WINDOW)].map(([, low, high]) => [
      Number(low.replace(/,/g, '')),
      Number(high.replace(/,/g, '')),
    ]);
    if (windows.length === 0) return null;
    const low = Math.min(...windows.map(([from]) => from));
    const high = Math.max(...windows.map(([, to]) => to));
    return `${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')} MI`;
  }
  if (suggestion.type === 'maintenance') {
    const match = INTERVAL.exec(suggestion.note);
    if (!match || (!match[1] && !match[2])) return null;
    return [match[1] ? `${match[1]} MI` : null, match[2] ? `${match[2]} MO` : null]
      .filter(Boolean)
      .join(' / ');
  }
  return suggestion.note.toUpperCase();
}

/**
 * Two lines of the reason, ended on a word — R41, revised in round 37.
 *
 * `numberOfLines={2}` cut the prose mid-word ("coolant loss, and p…"),
 * which the critique read three times on one frame as *"an unedited
 * default, not a decision"*. The platform's tail truncation has no word
 * mode, so the cut is made here, at the last space before the cap, with the
 * platform's own two-line limit kept beneath it for a narrower phone. Ninety-six
 * characters is two lines of the 13pt value face at the row's text width on
 * every iPhone this runs on.
 */
export const REASON_CAP = 96;

export function clipWords(prose: string, cap = REASON_CAP): string {
  if (prose.length <= cap) return prose;
  const cut = prose.lastIndexOf(' ', cap);
  return `${prose.slice(0, cut > 0 ? cut : cap).replace(/[,;:.]$/, '')}…`;
}

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
    async (name: string, itemType: WishlistItemType, description?: string) => {
      const identifier = wishlistItemIdentifier(itemType, name);

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
          We have not worked out what {state.name} needs yet. That fills in shortly after a car is
          added — pull back and open this again in a minute. You can still type anything in above
          and add it.
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
                      accessibilityLabel: `Add ${suggestion.name} to the wishlist`,
                      onPress: () => void add(suggestion.name, suggestion.type, suggestion.reason),
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
                      ── 13 Sep · neutral, on every row — urgency is the section ──

                      This coloured the chip sodium when the research said
                      urgent (a High issue, a Critical service), on the spec's
                      rule that "priority chips are neutral unless the item is
                      genuinely urgent". Round 38 read what that draws: the
                      same SERVICE chip sodium here and grey on Needs one
                      screen back, and a routine oil change wearing the
                      warning hue because its priority is Critical — while
                      DO FIRST, the head the row sits under, already says so.
                      The section carries urgency; the chip names the kind and
                      nothing else, which is the one rule both screens can
                      keep (Needs has no severity to colour by, §10). `urgent`
                      still sorts and sections; it no longer colours.
                    */}
                    <Chip label={suggestion.chip} />
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
            accessibilityLabel={`Add ${typed} to the wishlist`}
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

  own: { gap: space.sm },
  ownLead: { ...type.value, color: text.muted, lineHeight: 19 },
  empty: { ...type.body, color: text.secondary },
});
