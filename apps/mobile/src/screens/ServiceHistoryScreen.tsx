import { useCallback, useEffect, useState } from 'react';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { apiRequest, ApiRequestError } from '../api/client';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import {
  describeRecord,
  describeRemoval,
  formatRecordDate,
  groupIntoVisits,
  recordSourceLabel,
  totalRecorded,
  type ServiceRecord,
  type ServiceVisit,
} from '@tappet/core/service-record';
import { formatCurrency } from '@tappet/core/formatting-utils';
import CutSurface from '../components/CutSurface';
import SwipeToRemove from '../components/SwipeToRemove';
import Icon from '../components/Icon';
import { useRootScroll } from '../components/RootScreen';
import { border, cut, FIELD_FONT_MIN, PAGE_BODY, radius, SPEC_ROW, space, status, surface, TABULAR, TARGET_MIN, text, type } from '../theme';
import { interFace } from '../theme/fonts';

/**
 * What has been done to this car, on the phone.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The phone could **write** to the service record in three ways — scan an
 * invoice, complete a wishlist item, answer the onboarding history question —
 * and could not read it back anywhere. The only surface that showed any of it
 * was `ServiceMilestoneScreen`, which you reach by tapping a service-due
 * notification, and no notification has ever fired.
 *
 * So a person could file a job from the shop's car park and have no way to
 * confirm it landed. That is the loop this closes.
 *
 * ── Provenance is the point, not decoration ────────────────────────────────
 *
 * Four rows in one column, identical in weight, read as four equally solid
 * facts. One of them may be a recollection typed on a sign-up screen. The
 * schema went to the trouble of storing that difference —
 * `20260808150000` added `'owner-onboarding'` rather than reusing `'manual'`
 * specifically so it could be said — and a list is where it becomes visible or
 * is lost.
 *
 * ── The total is the number most likely to be misread ──────────────────────
 *
 * Rows without a cost are skipped rather than counted as zero, and the header
 * says how many rows the figure covers. "$1,820 across 6 of 9 services" is a
 * different claim from "$1,820", and only one of them is true.
 */

interface Props {
  vehicleId: string;
  /**
   * Start a scan from here.
   *
   * ⚠ David, 30 Aug: *"it still needs to retain the 'scan an invoice' button…
   * it ties together existing history and adding to that history with new
   * invoices."* Scanning was previously reachable only by opening a car and
   * finding it on the hub — a screen away from the record it writes into.
   */
  onScan: () => void;
  /** Open the whole visit behind one line item. */
  onOpenVisit: (visit: ServiceVisit) => void;
  onSignOut: () => void;
}

interface MaintenanceResponse {
  /**
   * The service record. **Not `lineItems`** — that key carries
   * `invoice_line_items`, which has a description and a price and no service
   * date, and reading it here was a live bug on `ServiceMilestoneScreen` until
   * 12 Aug 2026.
   */
  maintenanceLineItems?: ServiceRecord[] | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; records: ServiceRecord[] };

/**
 * The visit's stamp: when it happened and at what odometer reading.
 *
 * ⚠ A visit is a *moment* — one date, one shop, one reading — so all three
 * belong to its heading and only the description and the price belong to a line
 * beneath it. `describeRecord`'s `withShop`/`withDate`/`withMileage` are the
 * other half of the same idea, turning each field off at the row.
 *
 * Reads the odometer from the first line that carries one, exactly as `date`
 * does. Lines of one invoice can disagree — extraction sometimes reads a
 * different number off a different part of the page — and picking the first is
 * the same honest guess the date already makes, rather than inventing a range.
 */
function visitStamp(visit: ServiceVisit): string | null {
  const parts: string[] = [];

  const date = formatRecordDate(visit.date);
  if (date) parts.push(date);

  const reading = visit.records.find(
    (r) => typeof r.mileage_at_service === 'number' && r.mileage_at_service > 0
  )?.mileage_at_service;
  if (typeof reading === 'number') parts.push(`${reading.toLocaleString('en-US')} mi`);

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function ServiceHistoryScreen({ vehicleId, onScan, onOpenVisit, onSignOut }: Props) {
  /*
    B8 · the root's scroll contract. `null` when this screen is pushed with a
    native header or mounted on its own, and spreads to nothing there.
  */
  const rootScroll = useRootScroll();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setState({ kind: 'loading' });

      try {
        const body = await apiRequest<MaintenanceResponse>(
          `/load-maintenance-data?vehicleId=${encodeURIComponent(vehicleId)}`
        );
        setState({
          kind: 'loaded',
          records: Array.isArray(body.maintenanceLineItems) ? body.maintenanceLineItems : [],
        });
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
          An error is shown rather than an empty list. "No service history" and
          "we could not load the service history" look identical as a blank
          screen and mean opposite things — and the route was changed in
          `load-maintenance-data` for this exact reason, so throwing it away
          here would undo that.
        */
        setState({
          kind: 'error',
          message: apiError.message ?? 'Could not load the service history',
        });
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
    (record: ServiceRecord) => {
      if (!record.id) return;

      /*
        Confirmed, and the confirmation says what is actually lost rather than
        asking "are you sure?" — a question the person has no way to answer from
        the row in front of them. `describeRemoval` supplies the three facts
        that are invisible on the card: the invoice survives, a combined row
        takes its parts with it, and due dates are computed from these records.
      */
      Alert.alert(
        'Remove this record?',
        `“${record.item_description ?? 'This service'}” will be removed. ${describeRemoval(record)}`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await apiRequest('/delete-maintenance-item', {
                    method: 'POST',
                    body: { itemId: record.id, itemType: 'maintenance_line_item' },
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
                  /*
                    A 404 is its own message. The route returns one when the
                    delete matched no rows — the bug it is named for — and
                    "already gone" is a different thing to tell somebody than
                    "that failed".
                  */
                  Alert.alert(
                    apiError.status === 404 ? 'Already removed' : 'Could not remove that',
                    apiError.status === 404
                      ? 'That record is no longer here. Pull to refresh.'
                      : (apiError.message ?? 'Try again in a moment.')
                  );
                }
              })();
            },
          },
        ]
      );
    },
    [load, onSignOut]
  );

  if (state.kind === 'loading') {
    /*
      A summary line then records — the shape this screen actually resolves
      into, rather than three identical cards.
    */
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Skeleton width="45%" height={18} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </ScrollView>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Could not load the service history</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Pressable
          style={styles.retry}
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { total, counted } = totalRecorded(state.records);

  /*
    ── ⚠ Filtered here, not on the server ────────────────────────────────────

    A service history is tens of rows, already on the device, and the whole
    list is in memory the moment the screen loads. A round trip per keystroke
    would be latency bought for nothing — the same argument the wishlist's
    catalogue makes, and the opposite of the add-a-car screen's model list,
    which genuinely lives at NHTSA.

    It matches the shop and the date as well as the description, because "what
    did that garage do" and "what happened in March" are the two questions
    somebody actually opens this screen with.
  */
  const query = filter.trim().toLowerCase();
  const shown = query
    ? state.records.filter((record) =>
        [record.item_description, record.shop_name, record.service_date]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
    : state.records;

  /*
    ── ⚠ Grouped into visits, not listed as line items (R17) ─────────────────

    Rows sharing a `source_document_id` *are* one invoice — one afternoon, one
    shop, one total — and the screen used to draw a card per row and repeat that
    parent on every one of them. `groupIntoVisits` carries the argument and the
    grouping; this screen only renders it.

    Grouped from the **filtered** list, so a search narrows the lines inside a
    visit rather than hiding the visit. The totals in each visit header are
    computed over the lines actually shown, which is why they are recomputed
    here rather than taken from an unfiltered pass: a header reading $1,461 over
    two visible lines is the same misreading `totalRecorded` exists to prevent.
  */
  const visits = groupIntoVisits(shown);

  return (
    /*
      ── ⚠ The search is pinned, not scrolled ──────────────────────────────────

      Same fix as the wishlist's filter, for the same reason: a control whose
      job is to shorten a list must not scroll away with the list. By the time
      you have scrolled far enough to want it, it is off screen — so you scroll
      back up to reach the thing that would have saved you the scrolling.

      Outside the scroller rather than `stickyHeaderIndices`, because sticky
      headers on a `ScrollView` with `keyboardShouldPersistTaps` behave
      inconsistently on Android once the keyboard resizes the frame, and this is
      a text input.
    */
    <View style={styles.screen}>
      {/*
        ⚠ 6 Sep · B4: the cut is drawn by `CutSurface`, not by this view. This is
        a hand-rolled search box rather than the `Field` primitive — giving
        `Field` the cut left this one square, which is how the critique kept
        finding "the search field is square" after the fix had landed.
      */}
      {state.records.length > 0 && (
        <CutSurface
          style={[styles.search, styles.searchPinned]}
          cut={['bottomRight']}
          size={cut.control}
          fill={surface.well}
          stroke={border.field}
        >
          <Icon name="search" size={17} />
          <TextInput
            style={styles.searchInput}
            value={filter}
            onChangeText={setFilter}
            placeholder="Search services"
            placeholderTextColor={text.muted}
            accessibilityLabel="Search this service history"
            autoCorrect={false}
            returnKeyType="search"
          />
          {filter.length > 0 && (
            <Pressable
              onPress={() => setFilter('')}
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              style={styles.searchClear}
            >
              <Icon name="x" size={16} />
            </Pressable>
          )}
        </CutSurface>
      )}

      <ScrollView
        /*
          R37 / R57 centred this while there was nothing on file. 11 Sep: top-
          aligned in every state, for the reason `WishlistScreen` gives — under
          a title, a rail, a primary and a search field the caption is never
          the first thing on the page, and the centring left a void above it.
        */
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        {...rootScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={text.muted} />
        }
      >
      {state.records.length === 0 ? (
        /*
          ⚠ This used to carry no action, and said so: *"this screen has no
          navigation callbacks — only a vehicle id and a sign-out — so an
          'action' here could not go anywhere."* It has one now. The note is
          kept because it is the reason the copy read the way it did, and
          because the fix was to give the screen the callback rather than to
          reword around the gap.
        */
        <EmptyState
          inset={false}
          headline="Nothing recorded yet"
          body="Scan an invoice, or mark something done on the wishlist, and it will appear here."
          actionLabel="Scan an invoice"
          onAction={onScan}
        />
      ) : (
        <>
          {/*
            ── R35 · a label, not a word after a figure ─────────────────────

            It read `5 services   $1,461 recorded`, and "recorded" trailing a
            currency figure parses as a **unit** — the way "miles" does after a
            number. The word does real work (it names what the total covers,
            which is the misreading this line exists to prevent), so it lives in
            the label.

            ── ⚠ 11 Sep · B6: one label, one numeral, one baseline ────────────

            The label then sat *above* the figure, right-aligned, beside a
            lowercase "5 services" on the left — the critique counted "three
            voices on one row". A spec-table row is a mono-caps label on the
            left and a numeral on the right, so the count and the scope join
            into one label, with `$1,313` on the same baseline. The caps are
            the style's, so the words stay findable as words.

            ⚠ "Recorded across 4 of 5" then read as an unfinished sentence —
            *"five of what?"* — and the critique was right. `4 PRICED` says the
            same thing in one word: the total covers the four rows that carry a
            cost, and a recollection carries none. The count beside it already
            says five.
          */}
          <View style={styles.summary}>
            <Text style={styles.summaryLabel} numberOfLines={1}>
              {[
                query
                  ? `${shown.length} of ${state.records.length} shown`
                  : `${state.records.length} ${state.records.length === 1 ? 'service' : 'services'}`,
                counted > 0 && counted !== state.records.length ? `${counted} priced` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {counted > 0 && <Text style={styles.summaryCost}>{formatCurrency(total)}</Text>}
          </View>

          {shown.length === 0 && (
            <Text style={styles.noMatch}>
              Nothing matches “{filter.trim()}”. Clear the search to see all{' '}
              {state.records.length}.
            </Text>
          )}

          {visits.map((visit) => (
            <Card key={visit.key} style={styles.card}>
              {/*
                ── R17 · the visit's own head, said once ────────────────────

                Shop, date and total. This is the parent that used to be
                repeated on every child row — five times, in caps, for a
                five-line invoice.
              */}
              <View style={styles.visitHead}>
                <View style={styles.visitIdentity}>
                  <Text style={styles.visitShop} numberOfLines={1}>
                    {visit.shop ?? 'Service record'}
                  </Text>
                  {/*
                    ⚠ The visit's date **and** odometer, together. A visit is a
                    moment: it happened on one date, at one shop, at one reading.
                    All three belong here, and only the description and the price
                    belong to the line — which is what takes a row from four
                    lines back toward B6's one.
                  */}
                  {visitStamp(visit) ? (
                    <Text style={styles.visitDate}>{visitStamp(visit)}</Text>
                  ) : null}
                </View>

                {visit.counted > 0 ? (
                  <Text style={styles.visitTotal}>{formatCurrency(visit.total)}</Text>
                ) : null}
              </View>

              {/*
                The line items, nested. The divider is between them rather than
                around each, because they are parts of one thing.

                ⚠ 11 Sep · B6: in a container of their own, with no gap, so a
                row is `SPEC_ROW` from rule to rule. Laid out as siblings
                of the head they took the card's 12pt gap on top of their own
                padding and measured 44 — `TARGET_MIN` by accident, not the
                table's 56 — which critique 24 measured against the brief.
              */}
              <View style={styles.lines}>
              {visit.records.map((record, index) => {
                /*
                  ⚠ Neither the shop nor the date: both are the visit heading
                  directly above these rows. `withShop` already existed for that
                  reason (R34); `withDate` is the same argument one field over,
                  and it is what takes a row from ~110pt back toward B6's 56.
                */
                const meta = describeRecord(record, { withShop: false, withDate: false, withMileage: false });

                return (
                  /*
                    ── 30 Aug · a line item opens the visit it belongs to ─────

                    David: *"when user clicks into any line item, we should then
                    enter the full invoice detail view."* The row is the way in,
                    because a line is what somebody is looking at when they want
                    the rest of the bill it came from.

                    ⚠ `Pressable` around the row and **not** around the Remove
                    control, which is nested inside it. Two overlapping tap
                    targets where the inner one is destructive is how a stray
                    tap deletes something — UI-01's wishlist delete sat 6px from
                    Done and that is exactly what happened. Remove stops
                    propagation.
                  */
                  <SwipeToRemove
                    key={record.id ?? `${record.item_description}-${index}`}
                    accessibilityLabel={`Remove ${record.item_description ?? 'this record'}`}
                    onRemove={() => remove(record)}
                  >
                  <Pressable
                    onPress={() => onOpenVisit(visit)}
                    accessibilityRole="button"
                    accessibilityLabel={`${record.item_description ?? 'Service'}, open the full record`}
                    style={({ pressed }) => [
                      styles.line,
                      index > 0 && styles.lineDivided,
                      pressed && styles.linePressed,
                    ]}
                  >
                    <View style={styles.head}>
                      {/*
                        ⚠ 6 Sep · B6: the index. Every record list in this app is
                        the mono spec table — *"01 index, grotesk label,
                        right-aligned mono value, hairline per row"* — and this
                        list had the label, the value and the rule but not the
                        index, which the critique caught three rounds running.

                        `index + 1` padded to two digits, scoped to the visit
                        rather than to the screen: the numbers say "second line
                        of this invoice", not "seventh service you have ever
                        recorded". A running total across visits would read as a
                        count of the car's whole history and be wrong the moment
                        a filter hides a row.

                        `accessibilityElementsHidden` because the row already
                        announces itself by description; a screen reader does not
                        need "zero one" before every line.
                      */}
                      <Text style={styles.index} accessibilityElementsHidden importantForAccessibility="no">
                        {String(index + 1).padStart(2, '0')}
                      </Text>
                      <Text style={styles.name}>{record.item_description ?? 'Service'}</Text>
                      {typeof record.total_cost === 'number' && record.total_cost > 0 && (
                        <Text style={styles.cost}>{formatCurrency(record.total_cost)}</Text>
                      )}
                    </View>

                    {meta ? <Text style={styles.meta}>{meta}</Text> : null}

                    {/*
                      ── ⚠ 6 Sep: the critique asked twice for this to go, and it stays ──

                      The note was *"the Remove line under every service row — it
                      turns a 56pt spec row into a four-line form; **the row swipe
                      carries deletion**."*

                      The first half is fair — this row is taller and busier than
                      the spec table B6 asks for. The second half is not true of
                      this screen: **there is no swipe-to-delete here.** No
                      `Swipeable`, no gesture handler, nothing. Removing this
                      control would take away the only way to delete a service
                      record, which is a data-loss defect dressed as a design fix.

                      A critic reading screenshots cannot know which affordances
                      exist, and this one inferred a standard iOS gesture from a
                      list that looks like it should have one.

                      ⚠ **7 Sep: it exists now.** David ruled — *"ok w/ swipe to
                      delete as long as there's a confirm after"* — and
                      `SwipeToRemove` builds the gesture the critique assumed was
                      already there. The refusal above was right for as long as
                      it was true, and it is kept because the *reason* outlives
                      it: a control is not redundant until the thing replacing it
                      is actually built.
                    */}
                    {/*
                      ── ⚠ 7 Sep: the inline Remove became a swipe ─────────────

                      The critique asked four times to cut this row, and the
                      note that used to sit here refused four times for a real
                      reason: there was no swipe-to-delete, so removing the
                      control would have deleted the only way to delete a
                      record. Both halves have now happened at once —
                      `SwipeToRemove` wraps this row, so the control exists and
                      the row is one line again.

                      ⚠ The confirm is unchanged and load-bearing. David: *"ok
                      w/ swipe to delete as long as there's a confirm after."*
                      The swipe *reveals*; `remove(record)` still raises the
                      alert naming what the removal costs. A gesture that
                      deleted on release would have no undo behind it, on rows
                      holding somebody's service history.
                    */}
                  </Pressable>
                  </SwipeToRemove>
                );
              })}
              </View>

              {/*
                ── R17 · provenance once, on the parent, where it is true ────

                It used to sit on every child, so a five-line invoice said "read
                from a scan of 5 lines" five times. Here it describes the object
                it is attached to.
              */}
              <View style={styles.foot}>
                <Text style={styles.provenance}>{visitProvenance(visit)}</Text>
              </View>
            </Card>
          ))}

        </>
      )}
      </ScrollView>

      {/*
        ── 30 Aug · the scan control, pinned ─────────────────────────────────

        David: *"it ties together existing history and adding to that history
        with new invoices."* Scanning was reachable only from the car's hub — a
        screen away from the record it writes into — so the two halves of the
        same job lived apart.

        Pinned rather than in the scroller, because a service record grows
        forever and a control at the bottom of it is a control nobody reaches.
        Same argument the wishlist filter got.

        Hidden while the list is empty: the empty state already offers it, and
        two identical buttons on one screenful is a screen that cannot decide.
      */}
      {/*
        ── ⚠ 6 Sep · B9: this button moved up a level, and its own note said why ─

        A pinned "Scan an invoice" sat here, hidden while the list was empty,
        under a note reading *"two identical buttons on one screenful is a screen
        that cannot decide."* That note is why it is gone rather than why it
        stayed: B9 makes the scan a first-class primary at the top of `Service`,
        above the segment content, so this became the second of exactly the two
        buttons it warned about — and the screen was indeed showing both.

        The empty state below still offers its own, which is the case the note
        was protecting: nothing to scroll to means nothing to pin.
      */}
    </View>
  );
}

/*
  Opaque colours, measured against `surface.page`. `mobile-text-contrast.test.ts`
  composites opacity into its 4.5:1 check, and this screen's quietest text is
  the provenance line — which is the one a reader most needs to be able to read.
*/
/**
 * What a visit was read from, in one line — R17 and the §6 copy pass.
 *
 * Every line item used to carry its own copy of this, so a five-line invoice
 * printed *"From a scan of 5 lines · BLACKMARKET MOTORSPORTS · $1,461 total"*
 * five times and the shop and the total twice within each. Attached to the
 * visit it describes, it is true once and says something.
 *
 * ⚠ Mixed sources inside one visit are possible — a scanned invoice the owner
 * later added a line to by hand — and the honest wording is the general one
 * rather than picking whichever source came first.
 */
function visitProvenance(visit: ServiceVisit): string {
  if (visit.scanned) {
    const lines = visit.records.length;
    return `Read from a ${lines}-line invoice you scanned`;
  }

  const sources = new Set(
    visit.records.map((record) => recordSourceLabel(record.source)).filter(Boolean)
  );

  if (sources.size === 1) return [...sources][0] as string;
  if (sources.size > 1) return 'Recorded from more than one source';

  return 'Recorded on this car';
}

/*
  ── ⚠ 6 Sep · B6 and B1: the record list became a spec table ────────────────

  Locked brief B6: *"Factors, recommendations and every record list are a mono
  spec table with 01 indices, right-aligned numerals, hairline rows."*

  Every value on this screen was a proportional sans — prices, dates, totals,
  the record count — so a column of amounts did not line up as a column and the
  eye had to read each one rather than scan them. `TABULAR` was already applied
  and could not help: tabular *figures* keep a font's digits the same width as
  each other; they do not make Inter behave like a mono in a table.

  Vendors take the condensed grotesk, as section heads. Amounts, dates and
  counts take the mono. The `01` index is the one clause not carried here — the
  rows are grouped by vendor rather than enumerated, so an index would number
  line items inside a visit and not the visits themselves, which is the opposite
  of what it is for.
*/
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  /* Pinned above the scroller, on the page's own surface so nothing shows through. */
  searchPinned: { marginHorizontal: space.lg, marginTop: space.lg, marginBottom: 0 },
  noMatch: { ...type.body, color: text.secondary, paddingVertical: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TARGET_MIN,
    paddingHorizontal: space.md,
    /* ⚠ Ground and border are `CutSurface`'s now; a fill here squares the cut. */
    marginBottom: space.sm,
  },
  /** Pinned at the field floor: under 16px iOS zooms on focus and never back. */
  searchInput: { flex: 1, color: text.primary, fontFamily: interFace('400'),
    fontSize: FIELD_FONT_MIN, paddingVertical: space.sm },
  searchClear: { minHeight: TARGET_MIN, justifyContent: 'center', paddingLeft: space.xs },
  body: { ...PAGE_BODY },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },

  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  summaryLabel: { ...type.monoLabel, color: text.muted, flexShrink: 1 },
  summaryCost: { ...type.mono, fontSize: 15, lineHeight: 20, color: text.primary, ...TABULAR },

  /**
   * The card, on the ladder rather than beside it.
   *
   * ⚠ This was a **private copy** — `surface.raised` with no border, where the
   * `Card` primitive is `surface.card` with `border.panel`. `raised` is the
   * ladder's step for bars, tab strips and chips; a card painted on it sits one
   * step off from every other card in the app, which is precisely the "twelve
   * slightly different containers" the primitive set was built to end.
   *
   * The gap is kept as it was. Padding and gaps across this app want a pass
   * with a designer's eye rather than a find-and-replace — see the note in
   * `mobile-radius-scale.test.ts` on why that rule was scoped to radius.
   */
  card: { gap: space.md },

  /* ── R17 · the visit's head ─────────────────────────────────────────────── */
  visitHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  visitIdentity: { flexShrink: 1, gap: 2 },
  visitShop: { ...type.displaySection, fontSize: 15, lineHeight: 20, color: text.primary },
  /* R11. A date is data. */
  visitDate: { ...type.monoLabel, color: text.muted, ...TABULAR },
  /* R11. The visit's total, and the biggest figure on the card. */
  visitTotal: { ...type.mono, fontSize: 15, lineHeight: 20, color: text.primary, ...TABULAR },

  /* ── the line items, nested inside it ───────────────────────────────────── */
  /*
    ⚠ 11 Sep · B6: *"hairline per 56pt row"*. The lines sit in their own
    container with no gap, and each row is `SPEC_ROW` tall with its text
    centred — 18 above the rule, 18 below — rather than 12 of padding plus the
    card's 12 of gap, which is how the table came to measure 44. A second line
    of meta grows the row; it never shrinks it.
  */
  lines: {},
  line: { gap: 4, minHeight: SPEC_ROW, justifyContent: 'center', paddingVertical: space.lg },
  /*
    Between lines, not around each: they are parts of one object. Inset to the
    card's own padding so the rule reads as a seam rather than a slice.
  */
  linePressed: { backgroundColor: surface.well },
  scanBar: {
    padding: space.lg,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: border.panel,
    backgroundColor: surface.page,
  },
  lineDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },

  /*
    ── ⚠ 6 Sep · B6: `space-between` cannot lay out a spec table ──────────────

    This was `justifyContent: 'space-between'` and it was right for two children
    — label left, price right. Adding the `01` index made it three, and
    space-between spreads three: the index went left, the price right, and the
    label was pushed to the *centre* of whatever was left over. Every row has a
    different label length, so every label started at a different x.

    The critique read it as "centered, not tabular", which is exactly what it
    was. A spec table's whole claim is a shared left edge, and the change that
    added the index is the change that broke it.

    `flex: 1` on the label is the fix rather than a third `justifyContent`: the
    index is a fixed column, the label takes what is left, the price is pushed
    right by that rather than by a distribution rule.
  */
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  /** The spec table's index — mono, muted, fixed width so the labels line up. */
  index: { ...type.mono, color: text.muted, ...TABULAR, minWidth: 22 },
  name: { ...type.ui, color: text.primary, flex: 1 },
  /* R11. A right-aligned price column that is not tabular reads as ragged. */
  cost: { ...type.mono, color: text.primary, textAlign: 'right', ...TABULAR },
  meta: { ...type.mono, color: text.muted, ...TABULAR },

  /*
    Provenance and the remove control share a row, with the label given the
    flexible width. The label is the thing worth reading; the control is the
    thing worth finding, and neither should push the other off the card.
  */
  foot: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    paddingTop: space.sm,
  },
  provenance: { ...type.label, letterSpacing: 0, color: text.muted, flexShrink: 1 },
  removeCta: { minHeight: TARGET_MIN, justifyContent: 'center', alignSelf: 'flex-start' },
  /* R9. Quiet. The destructive colour appears only in the confirm `remove` raises. */
  removeText: { ...type.label, letterSpacing: 0, color: text.muted },
  /*
    ── ⚠ 11 Sep · B7: the recollection carries no sodium at all ──────────────

    This row's provenance was tinted sodium on 6 Sep and given a sodium rule
    down its edge on 7 Sep, each time on the argument that the colour "is what
    survives someone skimming". The next critique, reading the screen cold,
    called the rule what it is under the locked brief: *"the sodium bar spends
    the warning hue on provenance"*. B7 is unambiguous — sodium only on genuine
    warnings — and a recollection is not a warning, it is a source. Web sets
    the same caption in quiet grey with nothing beside it, so the phone now
    does too; the words still say "what you told us at sign-up", and §10 is
    satisfied by the words. Sodium on the service record now means one thing.
  */


  errorTitle: { color: text.primary, fontSize: 17, fontFamily: interFace('600'), fontWeight: '600' },
  errorBody: { color: text.muted, fontFamily: interFace('400'),
    fontSize: 14, textAlign: 'center' },
  retry: {
    marginTop: 6,
    paddingHorizontal: 18,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: border.field,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: { color: text.secondary, fontSize: 14, fontFamily: interFace('600'), fontWeight: '600' },
});
