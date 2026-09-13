import { useCallback, useEffect, useState } from 'react';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../components/EmptyState';
import { apiRequest, ApiRequestError } from '../api/client';
import Working from '../components/Working';
import { useRootScroll } from '../components/RootScreen';
import RowActions from '../components/RowActions';
import { clipWords, storedNote, suggestionValue } from './wishlist-row';
import { formatCurrency } from '@tappet/core/formatting-utils';
import { completionPayload, type CompletionDraft } from '@tappet/core/wishlist-completion';
import { MarkDoneSheet } from './MarkDoneSheet';
import { PAGE_BODY, TABULAR, border, radius, space, surface, text, type } from '../theme';
import { interFace } from '../theme/fonts';

/**
 * Phase 5.6 — the wishlist, on the phone.
 *
 * ── This widens the mobile surface, and that was a decision ─────────────────
 *
 * `cc-product-0001` says mobile is three flows — scan an invoice, ask the
 * advisor, glance at garage health — and that new features default to
 * `mobile: n/a`, with any widening argued explicitly and agreed by David. He
 * agreed on 7 Aug 2026: "people may want to add items to wishlist on the go."
 *
 * That entry's own open question, written 25 July, called this exact moment:
 * *"Push notifications land in the garage flow; whether that widens the surface
 * in practice is worth watching."* It does, and this is it. The KB entry needs
 * revising rather than quietly contradicting.
 *
 * ── Against the existing route, which had to be fixed first ─────────────────
 *
 * `GET /api/v1/wishlist` authenticated cookie-only until `922576f`, so this
 * screen could have added and deleted items and never listed them. The bug was
 * invisible from the web app and would have looked like an empty wishlist here.
 *
 * ── ⚠ 23 Aug: the free-text defence had expired ────────────────────────────
 *
 * This docblock used to say: *"The web adds items from three places — the
 * dossier, the consultant, and a manual dialog — because it has the surfaces
 * that suggest them. The phone has none of those yet, so a free-text add is the
 * honest version."*
 *
 * The phone had them. `vehicle_knowledge_base` is on the `load-vehicle`
 * payload this screen sits one route from, `BuildScreen` had been reading
 * `common_mods` out of it since the same morning, and `known_issues` and
 * `maintenance_schedule` map onto the other two wishlist types exactly.
 *
 * David's verdict was *"totally underbaked"*, and the shape of the fix was his
 * too: suggestions with Add and Learn more, filterable as you type.
 * `WishlistAddScreen` is that catalogue; this screen is the list it feeds.
 *
 * ── What this screen is now ────────────────────────────────────────────────
 *
 * The list, and only the list: a summary line, the rows, and the two things
 * you can do to a row. Adding moved off it entirely — the composer used to sit
 * above the first item and made this a data-entry form with a list underneath.
 *
 * The identifier still comes from `@tappet/core/wishlist-identifier`, which
 * exists because three call sites once built it three different ways and
 * produced duplicates, a lying "already added" state, and deletes that silently
 * matched nothing. A fourth spelling anywhere reintroduces all three.
 */

interface Props {
  vehicleId: string;
  onSignOut: () => void;
}

/*
  ── 13 Sep · `onAdd` and `onEmptyChange` left with the empty state's button ──

  Adding is the Plan root's act now — ADD TO NEEDS, the primary pinned under
  the rail on every state (`PlanScreen`) — so this screen no longer opens the
  catalogue and no longer reports emptiness upward for a nav-bar `+` that the
  11 Sep tab rebuild removed. The docblock those props carried argued for a
  route rather than a sheet (*"a FAB covers the last row and belongs to a
  different design language"*); that stands, one screen up.
*/

interface WishlistItem {
  id: string;
  item_name: string;
  item_type?: string | null;
  description?: string | null;
  category?: string | null;
  estimated_cost_parts?: number | null;
  estimated_cost_labor?: number | null;
  /** The route's `jsonb` passthrough; the catalogue writes its note here (`wishlist-row.ts`). */
  source_data?: unknown;
}

/**
 * The row's figure: the estimate where one is costed, else the interval or
 * window the catalogue sent with the item, read through the same function
 * the catalogue prints it with — so "5,000 MI / 12 MO" survives the trip
 * (round 40). A row with neither prints nothing, never a dash.
 */
function figureOf(item: WishlistItem): string | null {
  return estimate(item) ?? suggestionValue({ type: item.item_type, note: storedNote(item.source_data) });
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; items: WishlistItem[] };

function estimate(item: WishlistItem): string | null {
  const total = (item.estimated_cost_parts ?? 0) + (item.estimated_cost_labor ?? 0);
  return total > 0 ? formatCurrency(total) : null;
}

/**
 * ⚠ The list's total, summed from **the same array the rows render from**.
 *
 * Not a stored figure and not a second query. `native-wishlist.spec.html`
 * records this system shipping "Wishlist · 4 items" over three rows and says
 * why it matters: a count that disagrees with what is on screen is the fastest
 * way to lose a user's trust in every other number. Deriving both from one
 * array is the only version where they cannot disagree.
 *
 * Rows with no estimate contribute 0 and still count as a row — which is
 * honest: it is a real item nobody has costed, and the summary says
 * "estimated" for exactly that reason.
 *
 * ⚠ And when *no* row is costed there is no estimate to state, and the
 * summary must not say "$0". A missing number is "we cannot say", never a
 * reading (CLAUDE.md §6); David's list of one uncosted oil change read
 * "1 ITEM · ESTIMATED $0" on 12 Sep and he called it wrong, because it was.
 * `listTotal` returns null for that case and the line drops the figure, the
 * way the web's card does.
 */
function listTotal(items: readonly WishlistItem[]): number | null {
  const costed = items.filter(
    (item) => (item.estimated_cost_parts ?? 0) + (item.estimated_cost_labor ?? 0) > 0
  );
  if (costed.length === 0) return null;
  return costed.reduce(
    (sum, item) => sum + (item.estimated_cost_parts ?? 0) + (item.estimated_cost_labor ?? 0),
    0
  );
}

/**
 * The row's kind, as a word.
 *
 * `category` when the item came from somewhere that assigned one — the
 * progression ladder writes a role there — falling back to the item type in
 * plain words. Never "Item": a word that says nothing is a word that should
 * not be drawn, and every row has at least a type.
 */
const TYPE_WORD: Record<string, string> = {
  issue: 'Known issue',
  maintenance: 'Service',
  modification: 'Modification',
};

function chipFor(item: WishlistItem): string {
  return item.category?.trim() || TYPE_WORD[item.item_type ?? ''] || 'Service';
}

export function WishlistScreen({ vehicleId, onSignOut }: Props) {
  /*
    B8 · the root's scroll contract. `null` when this screen is pushed with a
    native header or mounted on its own, and spreads to nothing there.
  */
  const rootScroll = useRootScroll();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [doneItem, setDoneItem] = useState<WishlistItem | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setState({ kind: 'loading' });

      try {
        const body = await apiRequest<{ wishlistItems?: WishlistItem[] }>(
          `/wishlist?vehicleId=${encodeURIComponent(vehicleId)}`
        );
        setState({ kind: 'loaded', items: body.wishlistItems ?? [] });
      } catch (error) {
        const apiError = error as ApiRequestError;
        /*
          ⚠ **MOB-08.** `isLocallySignedOut`, not any 401. A `device` 401 is
          genuinely signed out; a `server` 401 may be a token the server would
          accept a second later, and destroying a working session over one
          response is how a spurious failure becomes a forced re-login. The
          client's own docblock records a real tester hitting this three times out
          of three on 5 Aug — and one screen consumed the distinction.
        */
        if (apiError.isLocallySignedOut) {
          onSignOut();
          return;
        }
        setState({ kind: 'error', message: apiError.message ?? 'Could not load the wishlist' });
      } finally {
        setRefreshing(false);
      }
    },
    [vehicleId, onSignOut]
  );

  useEffect(() => {
    void load();
  }, [load]);

  /*
    ── ⚠ MOB-09 · a write behind this screen used to be invisible ─────────────

    Nothing in this app refetched on focus. Every screen loaded once on mount
    and kept whatever it had — so adding to the wishlist, marking a recall
    repaired, confirming an odometer or scanning an invoice all succeeded and
    then returned to a screen that said they had not.

    `useRefetchOnFocus` carries the full argument, including why this runs on
    the first focus too rather than being clever about skipping it.
  */
  useRefetchOnFocus(load);

  const remove = useCallback(
    (item: WishlistItem) => {
      /*
        Confirmed, because there is no undo. The web has the same delete behind
        a dialog; a swipe-to-delete with no restore on a small screen is how
        someone loses a list they built over a month.
      */
      Alert.alert('Remove from wishlist?', `"${item.item_name}" will be removed.`, [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await apiRequest(`/wishlist?itemId=${encodeURIComponent(item.id)}`, {
                  method: 'DELETE',
                });
                await load(true);
              } catch (error) {
                const apiError = error as ApiRequestError;
                /*
                  ⚠ **MOB-08.** `isLocallySignedOut`, not any 401. A `device` 401 is
                  genuinely signed out; a `server` 401 may be a token the server would
                  accept a second later, and destroying a working session over one
                  response is how a spurious failure becomes a forced re-login. The
                  client's own docblock records a real tester hitting this three times out
                  of three on 5 Aug — and one screen consumed the distinction.
                */
                if (apiError.isLocallySignedOut) {
                  onSignOut();
                  return;
                }
                Alert.alert('Could not remove that', apiError.message ?? 'Try again in a moment.');
              }
            })();
          },
        },
      ]);
    },
    [load, onSignOut]
  );

  const complete = useCallback(
    async (draft: CompletionDraft) => {
      const item = doneItem;
      if (!item || completing) return;

      setCompleting(true);
      try {
        await apiRequest('/wishlist/complete', {
          method: 'POST',
          body: completionPayload(item.id, draft),
        });
        setDoneItem(null);
        await load(true);
      } catch (error) {
        const apiError = error as ApiRequestError;
        /*
          ⚠ **MOB-08.** `isLocallySignedOut`, not any 401. A `device` 401 is
          genuinely signed out; a `server` 401 may be a token the server would
          accept a second later, and destroying a working session over one
          response is how a spurious failure becomes a forced re-login. The
          client's own docblock records a real tester hitting this three times out
          of three on 5 Aug — and one screen consumed the distinction.
        */
        if (apiError.isLocallySignedOut) {
          onSignOut();
          return;
        }
        /*
          The sheet stays open on failure. Closing it would discard what the
          person typed and leave them unsure whether the history row was
          written — and this is the one action here with no undo.
        */
        Alert.alert('Could not mark that done', apiError.message ?? 'Try again in a moment.');
      } finally {
        setCompleting(false);
      }
    },
    [doneItem, completing, load, onSignOut]
  );

  if (state.kind === 'loading') {
    /* 12 Sep: the delayed full instrument — see `Working` for the rule. */
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Opening the list" />
      </ScrollView>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Could not load the wishlist</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Pressable style={styles.button} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const empty = state.items.length === 0;

  return (
    <ScrollView
      /*
        ── ⚠ 11 Sep · the empty state is top-aligned; R57 no longer applies ──

        R37 / R57 centred the empty state optically, and the rule was right for
        the screen it was written on: a single block "at the very top of a
        black field reads as a page that failed to finish loading". This list
        is not that screen any more. As a tab root it opens under a 34pt title
        and a segment rail, so its content is never the first thing on the
        page — and centring it left "a ruled void" a third of the screen tall
        between the rail and the caption, which the critique named as the one
        thing keeping the round off an 8. A list ends at its foot; the void
        belongs there.
      */
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      {...rootScroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={text.muted}
        />
      }
    >
      {/*
        ── The summary line ────────────────────────────────────────────────────

        ⚠ **The count and the total come from the same array**, and that is a
        rule with a history. `native-wishlist.spec.html`: *"the total sums to
        $4,980 and the four rows are all four rows. Stated because this system
        has shipped 'Wishlist · 4 items' over three rows before; a count that
        disagrees with what is on screen is the fastest way to lose a user's
        trust in every other number."*

        `estimated` is said out loud rather than implied by a currency symbol.
        Some rows carry no price at all — nobody has costed them — so the total
        is a floor, and calling it an estimate is the honest framing §10 asks
        for.
      */}
      {state.items.length > 0 && (() => {
        const total = listTotal(state.items);
        return (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>
              {state.items.length} {state.items.length === 1 ? 'ITEM' : 'ITEMS'}
              {total !== null ? ' · ESTIMATED' : ''}
            </Text>
            {total !== null ? (
              <Text style={styles.summaryTotal}>{formatCurrency(total)}</Text>
            ) : null}
          </View>
        );
      })()}

      {state.items.length === 0 ? (
        /*
          ── 13 Sep · words, and no button — the primary is pinned above ────

          This carried SEE SUGGESTIONS, and the note beside it argued for one
          control per *state*: the filled button on the empty screen, the
          band's word once there were rows. The word was the problem — David,
          on the root with rows: *"it looks like a nav element, like Account.
          But it's not, it's part of the core functionality of Plan"* — so the
          act took the Service root's grammar instead: ADD TO NEEDS is the
          full-width primary pinned under the rail on every state
          (`PlanScreen`), the way SCAN INVOICE is. A second one here would be
          two ways to do one thing on a screen with nothing on it, which is
          the redundancy the empty History resolved the same way (§6.15).
          The caption and the body stay: they say why the list is empty and
          what the control above it opens.
        */
        <EmptyState
          inset={false}
          rule={false}
          headline="Nothing on the list yet"
          /*
            One sentence (round 38's Cut list): "You can add anything of your
            own too" restated what the catalogue offers at its own foot.
          */
          body="See what we already know this car needs — its known issues, its schedule, and the usual modifications."
        />
      ) : (
        state.items.map((item, index) => (
          /*
            ── 13 Sep · the row is the spec table's — B6, round 37 ──────────

            The History and Due rows' shape: the mono index, the label, the
            mono figure at the rule (the estimate, or a dash — `ListRow`'s
            rule: a missing value is "we cannot say", never a vanished
            column), the reason beneath in the quiet sans, and the row's verbs
            on its last line. It was a bold sans name, a bold sans price, and
            a cyan-bordered Done beside a sodium Remove — the pre-brief
            controls that never went through a loop, which the critique
            ranked as the palette breach on this tab (*"the list one screen
            back speaks another [dialect]"*).

            ⚠ A divided row, not a `Card` each. The spec is explicit: *"rows
            get whitespace and a hairline divider, never zebra striping"* —
            and a stack of bordered cards is the same mistake in the other
            direction. The last row draws no rule.
          */
          <View
            key={item.id}
            style={[styles.item, index < state.items.length - 1 && styles.itemDivided]}
          >
            <View style={styles.itemHead}>
              <Text style={styles.index} accessibilityElementsHidden importantForAccessibility="no">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <Text style={styles.itemName}>{item.item_name}</Text>
              {/*
                The figure — the estimate, or the interval the item was added
                with. ⚠ No dash where there is neither: `ListRow`'s em dash
                marks a tracked reading that is missing, and neither is
                tracked for every item — a column of dashes read as *"a stray
                glyph"* (round 38).
              */}
              {figureOf(item) ? <Text style={styles.itemCost}>{figureOf(item)}</Text> : null}
            </View>

            <View style={styles.itemBody}>
              {/* Two lines, cut on a word — the catalogue's own cut (`clipWords`), so the list stays a table. */}
              {item.description ? (
                <Text style={styles.itemReason} numberOfLines={2} accessibilityLabel={item.description}>
                  {clipWords(item.description)}
                </Text>
              ) : null}

              {/*
                ── The row's verbs, in the pattern `RowActions` states ────────

                DONE is the act — the box at the trailing edge — because it
                writes the job into the car's service history and is the
                reason to keep a list at all; REMOVE is the ghost word before
                it. ⚠ REMOVE is not the sodium `delete` treatment: B7 gives
                sodium one job, and a sodium hairline on every row of a list
                is a list that is all warning. The destructive step is the
                confirm the word opens (`remove`'s alert), which is where the
                brief puts the hue.
              */}
              <RowActions
                action={{
                  label: 'Done',
                  accessibilityLabel: `Mark ${item.item_name} done`,
                  onPress: () => setDoneItem(item),
                }}
                secondary={{
                  label: 'Remove',
                  accessibilityLabel: `Remove ${item.item_name} from the wishlist`,
                  onPress: () => remove(item),
                }}
              >
                {/*
                  ── 13 Sep · the kind is a word, on every row ─────────────

                  This was a `Chip`, sodium on every issue, on the reading
                  that an issue is "a thing that is wrong" — a rule the
                  catalogue did not share, so the same item changed hue
                  between the two screens (round 38); and a box, which read
                  as a second control beside DONE's (round 40). A wishlist
                  row carries no severity, and colouring by type alone tells
                  the owner a Low-severity coil is a warning (§10). The kind
                  is the Due row's basis token — a bare mono word in the
                  muted ink — and the spec's own line stands: *"semantic
                  colour does semantic work only."*
                */}
                <Text style={styles.kind}>{chipFor(item)}</Text>
              </RowActions>
            </View>
          </View>
        ))
      )}

      <MarkDoneSheet
        visible={doneItem !== null}
        itemName={doneItem?.item_name ?? ''}
        today={new Date().toISOString().slice(0, 10)}
        saving={completing}
        onCancel={() => setDoneItem(null)}
        onConfirm={(draft) => void complete(draft)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /*
    ── The summary line ─────────────────────────────────────────────────────

    Label left, total right at the editorial size in tabular figures. It is
    the one big number on the screen and it earns that: the list exists so
    somebody can see what this car is going to cost.

    ⚠ 13 Sep · B1: the label is a count and a state — "2 ITEMS · ESTIMATED"
    — so it is set in the mono the rail and the chips speak, not the sans
    eyebrow it was (the critique: *"2 ITEMS … are sans"*).
  */
  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
  },
  summaryLabel: { ...type.monoLabel, color: text.muted },
  summaryTotal: {
    ...type.display,
    fontSize: 26,
    lineHeight: 32,
    color: text.primary,
    ...TABULAR,
  },

  /*
    ── B6 · the table's row ─────────────────────────────────────────────────

    The Due row's numbers (`ServiceMilestoneScreen`): 12 above and below, the
    index at a fixed 22 so every name shares one left edge, the figure mono
    and tabular at the rule, and everything beneath the head line indented
    past the index column. Rows in one list, divided by a hairline. Never
    cards, never striped.
  */
  item: { paddingVertical: space.md, gap: space.xs },
  itemDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  index: { ...type.mono, color: text.muted, ...TABULAR, minWidth: 22, lineHeight: 20 },
  itemName: { ...type.ui, color: text.primary, flex: 1 },
  /* The estimate, mono and tabular at the rule. */
  itemCost: { ...type.mono, color: text.primary, textAlign: 'right', ...TABULAR, lineHeight: 20 },
  itemBody: { paddingLeft: 22 + space.md, gap: space.xs },
  /* The reason the row is here, in the quiet sans — it travelled with the item from the catalogue. */
  itemReason: { ...type.value, color: text.secondary, lineHeight: 19 },
  /* The kind — KNOWN ISSUE, SERVICE, MODIFICATION — in the Due row's token voice. */
  kind: { ...type.monoLabel, color: text.muted },

  body: { ...PAGE_BODY },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },

  errorTitle: { color: text.primary, fontSize: 17, fontFamily: interFace('600'), fontWeight: '600' },
  errorBody: { color: text.muted, fontFamily: interFace('400'),
    fontSize: 14, textAlign: 'center' },
  button: {
    marginTop: 6,
    paddingHorizontal: 18,
    borderRadius: radius.button,
    backgroundColor: surface.raised,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: text.primary, fontFamily: interFace('400'),
    fontSize: 14 },
});
