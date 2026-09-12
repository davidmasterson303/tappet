import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Field from '../components/Field';
import { apiRequest, ApiRequestError } from '../api/client';
import Working from '../components/Working';
import { useRootScroll } from '../components/RootScreen';
import {
  evaluateSchedule,
  milestoneReason,
  nextMilestone,
  type ScheduleEntry,
  type ServiceDue,
} from '@tappet/core/service-due';
import {
  SCHEDULE_BASIS_LABELS,
  SERVICE_BASIS_LABELS,
  serviceBasis,
} from '@tappet/core/service-provenance';
import { historyLookups, type ServiceHistoryRow } from '@tappet/core/service-history';
import { validateMileageUpdate } from '@tappet/core/mileage-tracking';
import { wishlistItemIdentifier } from '@tappet/core/wishlist-identifier';
import {
  PAGE_BODY,
  SPEC_ROW,
  TABULAR,
  TARGET_MIN,
  border,
  radius,
  space,
  status,
  surface,
  text,
  type,
} from '../theme';
import { interFace } from '../theme/fonts';

/**
 * Phase 5.6 — where a service-due notification lands.
 *
 * ── Confirm, then assert, with provenance. All three ────────────────────────
 *
 * David's decision, 7 Aug. The schedule comes from a model and the odometer is
 * user-reported, so the screen opens on **the mileage it is about to reason
 * from** rather than asserting a milestone over an unverified number. Confirm
 * or correct, then the answer.
 *
 * That ordering is not politeness. Every figure below is derived from the
 * reading, so a stale odometer does not make the screen slightly wrong — it
 * makes it confidently wrong, which is the failure mode a notification cannot
 * afford.
 *
 * ── Why the provenance label is not decoration ──────────────────────────────
 *
 * This app has shipped unsubstantiated provenance claims twice, and
 * `provenance-claims.test.ts` exists because of it. Every label here derives
 * from `evaluateSchedule`'s own `evidence` field, and each row carries the
 * claim its own evidence supports — because a reader takes "from your service
 * records" as covering whatever it sits beside.
 *
 * Three rungs since Track A2a, not two: records, then what the owner told us at
 * sign-up, then a bare estimate. The middle one exists because an invoice is a
 * document and a recollection is not, and collapsing them would make the app
 * cite a memory as a record. The label is rendered by lookup, so a fourth rung
 * would appear here without an edit — `isServiceBasis` is what stops an
 * unrecognised one drawing a blank chip.
 *
 * ── ⚠ 12 Sep · per row, not per milestone ───────────────────────────────────
 *
 * The milestone used to carry one line — `milestoneBasis`, the *weakest* claim
 * its services could jointly support — so a visit mixing an invoice with an
 * estimate said "estimated" over both. Conservative, and true, but it threw
 * away a distinction the data holds. Web's due list (`ServiceDueList.tsx`)
 * answers per row, and `service-provenance.ts` argues at length why the three
 * sources must never share a sentence; the phone joins that: every row that
 * has a position says where the position came from, in its own line.
 *
 * ── What is deliberately not here ───────────────────────────────────────────
 *
 * Nothing books an appointment. Needs — the Plan tab's list — is the action:
 * it is what the advisor prices, and adding a job to it is the step that
 * actually leads somewhere in this product.
 *
 * ── ⚠ 12 Sep · the list is the spec table, and the whole schedule is on it ──
 *
 * Locked brief B6: *"Factors, recommendations and every record list are a mono
 * spec table with 01 indices, right-aligned numerals, hairline rows."* This
 * segment was the one list on the phone that was not: bold sans heads, prose
 * rows, and a full-width "Add to wishlist" slab under each of them, inside a
 * bordered card. The critique's words (round 30): *"the tab speaks two
 * dialects and the weaker one is the landing segment."*
 *
 * It is the History table now — the same row the record list draws, with the
 * position where the price goes — and it lists **every** service the schedule
 * evaluates, not only the next visit. The screen used to show the milestone
 * and nothing else, so a car with a schedule and nothing due read "Nothing due
 * right now" over a blank, and the six services coming up were invisible.
 * Web's Due lists them all in urgency order (`ServiceDueList.tsx`, 8 Sep:
 * *"Due computes what is due, instead of listing the schedule"*), and the
 * phone joins that. The milestone is still the unit — it heads the table and
 * carries the notification's own sentence — and what is not part of the visit
 * sits under its own head beneath it, so the grouping `service-due.ts` argues
 * for is visible rather than implied by omission.
 */

interface Props {
  vehicleId: string;
  onSignOut: () => void;
}

/**
 * `knowledge` is a **top-level sibling of `vehicle`**, not nested inside it.
 *
 * `/api/v1/load-vehicle` runs two queries and returns `{ vehicle, knowledge }`;
 * `VEHICLE_COLUMNS` embeds `nhtsa_data` and `vehicle_health_summary` but not the
 * knowledge base. Reading `vehicle.vehicle_knowledge_base` — the shape the
 * embedded siblings would suggest — is always `undefined`, which here would
 * render "no structured service schedule yet" on every car forever, with no
 * error anywhere.
 */
interface VehicleResponse {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    current_mileage?: number | null;
  };
  knowledge?: { maintenance_schedule?: unknown } | null;
}

/**
 * `/api/v1/load-maintenance-data`. Only `lineItems` is read here.
 *
 * It is **owner-only** — a demo caller is deliberately not issued that query at
 * all — so an empty array is the correct and expected answer on the demo cars,
 * and the screen falls back to estimating from the odometer exactly as it did
 * before Track A2a.
 */
interface MaintenanceResponse {
  /**
   * `maintenance_line_items` — the service record.
   *
   * ⚠ **Not `lineItems`, which this screen read until 12 Aug 2026.** That key
   * carries `invoice_line_items`: the raw lines extracted from an uploaded
   * invoice. They have a `description` and a price and **no `service_date` and
   * no `mileage_at_service`** — so every lookup built from them returned null,
   * and the A2a fix below silently did nothing.
   *
   * It typechecked because `ServiceHistoryRow` accepts `description` *or*
   * `item_description`, so invoice rows satisfy the type while being unable to
   * answer the question. The server sweep has always read the right table
   * (`route.ts:424`), which is why the notification and the screen it opens
   * could disagree: the sweep knew when the oil was last changed and this
   * screen said "unknown".
   */
  maintenanceLineItems?: ServiceHistoryRow[] | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      name: string;
      mileage: number;
      schedule: ScheduleEntry[];
      history: ServiceHistoryRow[];
    };

const miles = new Intl.NumberFormat('en-US');

/**
 * The numeral column: where this car stands against the interval.
 *
 * ⚠ The *position*, never the interval. "5,000 MI" in the value column of a
 * row whose car is 400 miles from that service would be the reading the data
 * does not support — the rule it was computed from is in the meta line, where
 * a rule goes. Negative when the car is past it, and the sign is kept: a
 * countdown that has gone through zero is the instrument reading, and the
 * sodium mark beside the name is what says it is a warning (B7). A row with
 * nothing to count from draws a dash rather than a number, because `null` is
 * "we cannot say" (`CLAUDE.md` §6) and its group head says why.
 */
function positionLabel(service: ServiceDue): string | null {
  if (service.status === 'unknown') return null;

  if (service.drivenBy === 'time' && service.monthsRemaining !== null) {
    const months = Math.round(Math.abs(service.monthsRemaining));
    return `${service.monthsRemaining < 0 ? '−' : ''}${months} MO`;
  }

  if (service.milesRemaining !== null) {
    const distance = miles.format(Math.abs(Math.round(service.milesRemaining)));
    return `${service.milesRemaining < 0 ? '−' : ''}${distance} MI`;
  }

  return null;
}

/** The same position, as a sentence for the reader. */
function positionSentence(service: ServiceDue): string | null {
  if (service.status === 'unknown') return 'no date on record';

  if (service.drivenBy === 'time' && service.monthsRemaining !== null) {
    const months = Math.round(Math.abs(service.monthsRemaining));
    const unit = months === 1 ? 'month' : 'months';
    return service.monthsRemaining < 0 ? `${months} ${unit} overdue` : `due in ${months} ${unit}`;
  }

  if (service.milesRemaining !== null) {
    const distance = miles.format(Math.abs(Math.round(service.milesRemaining)));
    return service.milesRemaining < 0 ? `${distance} miles overdue` : `due in ${distance} miles`;
  }

  return null;
}

/**
 * "Every 5,000 mi or 12 months", from whichever halves the entry carries.
 *
 * Web's `MaintenanceItemCard` words it the same way, and for the same reason
 * returns nothing when neither half is present: `evaluateSchedule` has already
 * dropped an entry with no usable interval, so a row here always has one, but
 * a reader of this function should not have to know that.
 */
function intervalLabel(service: ServiceDue): string | null {
  const byMiles = service.intervalMiles ? `${miles.format(service.intervalMiles)} mi` : null;
  const byMonths = service.intervalMonths
    ? `${service.intervalMonths} ${service.intervalMonths === 1 ? 'month' : 'months'}`
    : null;

  if (byMiles && byMonths) return `Every ${byMiles} or ${byMonths}`;
  if (byMiles) return `Every ${byMiles}`;
  if (byMonths) return `Every ${byMonths}`;
  return null;
}

export function ServiceMilestoneScreen({ vehicleId, onSignOut }: Props) {
  /*
    B8 · the root's scroll contract. `null` when this screen is pushed with a
    native header or mounted on its own, and spreads to nothing there.
  */
  const rootScroll = useRootScroll();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [confirmed, setConfirmed] = useState(false);
  const [reading, setReading] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      /*
        Two requests, in parallel, and only one of them may fail the screen.

        The vehicle is the screen; without it there is nothing to draw. History
        is an *improvement* to what gets drawn — with it, a service counts from
        when it was last done; without it, from the odometer. That is precisely
        the degradation this screen shipped with, so falling back to it is a
        return to a known-good state rather than a broken one.

        `Promise.all` would have coupled them and made a maintenance failure
        blank a screen that a push notification just opened. Handled separately
        so it cannot.
      */
      const [body, history] = await Promise.all([
        apiRequest<VehicleResponse>(`/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`),
        apiRequest<MaintenanceResponse>(
          `/load-maintenance-data?vehicleId=${encodeURIComponent(vehicleId)}`
        ).catch(() => null),
      ]);

      const vehicle = body.vehicle;
      const mileage = typeof vehicle?.current_mileage === 'number' ? vehicle.current_mileage : 0;
      const rawSchedule = body.knowledge?.maintenance_schedule;

      setState({
        kind: 'ready',
        name: [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'this car',
        mileage,
        schedule: Array.isArray(rawSchedule) ? (rawSchedule as ScheduleEntry[]) : [],
        /*
          ⚠ `history?.` on both sides. `Array.isArray(history?.maintenanceLineItems)`
          narrows the *property* and not `history` itself, so the true branch was
          dereferencing a possibly-null object — a real `TS18047` that had been
          filtered out of this session's typechecks as "pre-existing noise".
        */
        history: Array.isArray(history?.maintenanceLineItems)
          ? history?.maintenanceLineItems ?? []
          : [],
      });
      setReading(String(mileage));
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
      setState({ kind: 'error', message: apiError.message ?? 'Could not load this car' });
    }
  }, [vehicleId, onSignOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = useCallback(async () => {
    if (state.kind !== 'ready' || saving) return;

    const next = Number(reading.replace(/[^0-9]/g, ''));
    const decision = validateMileageUpdate({ current: state.mileage, next });

    if (!decision.ok) {
      /*
        The rule's own message, not one written here. It is phrased for the
        person who typed the number — "that is below the 60,000 already
        recorded. Correcting an earlier mistake?" — and rewording it at each
        call site is how two surfaces start explaining the same refusal
        differently.
      */
      Alert.alert('Check that reading', decision.message ?? 'That does not look right.');
      return;
    }

    // Unchanged is the common answer and costs nothing to skip.
    if (next === state.mileage) {
      setConfirmed(true);
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/vehicles', {
        method: 'PATCH',
        body: { vehicleId, currentMileage: next },
      });
      setState({ ...state, mileage: next });
      setConfirmed(true);
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
      Alert.alert('Could not save that', apiError.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }, [state, reading, saving, vehicleId, onSignOut]);

  const addToNeeds = useCallback(
    async (service: ServiceDue) => {
      setAdding(service.service);
      try {
        await apiRequest('/wishlist', {
          method: 'POST',
          body: {
            vehicleId,
            itemType: 'maintenance',
            itemName: service.service,
            itemIdentifier: wishlistItemIdentifier('maintenance', service.service),
            description: service.description || null,
          },
        });
        setAdded((prev) => [...prev, service.service]);
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
        // 409 means it is already there, which is the outcome the button wanted.
        if (apiError.status === 409) {
          setAdded((prev) => [...prev, service.service]);
          return;
        }
        Alert.alert('Could not add that', apiError.message ?? 'Try again in a moment.');
      } finally {
        setAdding(null);
      }
    },
    [vehicleId, onSignOut]
  );

  if (state.kind === 'loading') {
    /* 12 Sep: the delayed full instrument — see `Working` for the rule. */
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Reading the schedule" />
      </ScrollView>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Could not load this car</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Pressable style={styles.button} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  /*
    ── ⚠ 12 Sep · nothing to compute from is its own state ───────────────────

    With no schedule there is nothing the odometer is *for* on this screen —
    every figure below the gate is derived from the reading, and there are no
    figures — so the gate, the "Nothing due right now" head and the "Typical
    schedule…" line all went, on the critique's Cut list and on the sense of
    it: a caption citing a schedule the car does not have, over a question
    whose answer changes nothing. The honest words are `nextService`'s: a car
    whose every service is unknown is *"no schedule yet"*, never *"nothing
    due"* — those are different claims and only one of them is safe. The
    odometer is still editable where it is a fact about the car, on What you
    told us.

    No action: SCAN INVOICE is pinned above every state of this tab, and the
    history's empty state lost its second copy of the same button for the
    same reason (one button, one label).
  */
  if (state.schedule.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.body} {...rootScroll}>
        <EmptyState
          inset={false}
          headline="No schedule yet"
          body="This car has no structured service schedule yet, so nothing can be worked out from its mileage."
        />
      </ScrollView>
    );
  }

  /*
    ── ⚠ R14 / §5 · the gate is a banner, not a screen ───────────────────────

    This used to `return` here: the whole screen was one question, one field and
    one button, with 70% of the display empty under it, and what is actually
    due was on the other side of answering it. The review's general rule came
    out of this exact screen — **no screen exists whose only content is one
    question.** It is a sheet, a banner, or an inline edit.

    So the schedule renders either way and the question sits above it. Two taps
    become one for anyone whose odometer has not changed, and somebody who
    ignores the banner still sees what their car needs — computed from the last
    reading, which is the honest thing to compute it from and is what the
    banner says.

    ⚠ **It is not dismissible, and that is deliberate.** The reading is what
    everything below is derived from; a banner that could be waved away would
    leave a schedule quietly computed from a number nobody confirmed, with
    nothing on screen saying so.

    ── ⚠ 12 Sep · a band, not a card; a field, not a box ─────────────────────

    It was a bordered, tinted card (B5: *"cards become hairline-ruled bands"*)
    holding a square sans input (B4, B1) and a second off-white primary 60pt
    under SCAN INVOICE (one filled primary per screen — `Button`'s rule, and
    the critique counted both). It is a band now: the question in the body
    sans, the reading in the `Field` primitive — mono, cut, cyan hairline and
    caret on focus — and THAT IS RIGHT stepped down to the secondary hairline,
    so the scan is the only off-white on the screen.
  */
  const confirmBanner = confirmed ? null : (
    <View style={styles.confirm}>
      <Text style={styles.confirmLead}>Still around {miles.format(state.mileage)} miles?</Text>
      {/*
        One sentence. "What is due depends on the odometer" said the same
        thing as the line that follows it, and the critique's Cut list said
        keep one; this is the one the §10 test holds — the list is computed
        from the reading, and the screen says so.
      */}
      <Text style={styles.confirmBody}>The list below is worked out from this reading.</Text>

      {/* The field and its verb on one line — it is one question, not a form. */}
      <View style={styles.confirmRow}>
        <View style={styles.confirmField}>
          {/*
            No `hint`. "miles" sat in the label row's far corner — the field's,
            not the band's, so mid-screen beside the verb — and the question
            two lines up already names the unit. The strip and the reading row
            below set the same value as "66,000 MI"; the field is where it is
            typed, and a person typing an odometer is not in doubt about the
            unit.
          */}
          <Field
            label="Odometer"
            value={reading}
            onChangeText={setReading}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => void confirm()}
          />
        </View>

        {/*
          ⚠ It also closes a double-submit. This was a bare `Pressable` with no
          `disabled` — the label changed to "Saving…" and the control stayed
          live, so a second tap fired `confirm()` again mid-write. `Button`'s
          `busy` blocks the press and keeps the accessible name, which a label
          swapped for "Saving…" does not: a screen reader loses the verb at the
          moment it matters.
        */}
        <Button
          label="That is right"
          variant="outline"
          size="small"
          busy={saving}
          busyLabel="Saving"
          onPress={() => void confirm()}
          style={styles.confirmAction}
        />
      </View>
    </View>
  );

  /*
    Track A2a. These three lookups have been parameters of `evaluateSchedule`
    since it was written and nothing ever passed any — so every time-based
    service on this screen reported `unknown`, and every mileage-based one
    counted from the odometer rather than from when the work was actually done.

    `historyLookups` returns all three, so it spreads.

    ⚠ **A2a wired these up and fed them the wrong table.** Until 12 Aug the
    history came from `lineItems` (`invoice_line_items`), which carries no
    service date and no mileage — so the lookups still returned null and the
    bug this comment describes was still live, behind a fix that looked
    applied. See `MaintenanceResponse` above.
  */
  const services = evaluateSchedule({
    schedule: state.schedule,
    currentMileage: state.mileage,
    ...historyLookups(state.history),
  });
  const milestone = nextMilestone(services, { horizonMiles: 5_000 });
  const inMilestone = new Set(milestone?.services.map((service) => service.service) ?? []);
  /*
    Surfaced, not hidden. A time-based service with no recorded date cannot
    be placed on the odometer — and dropping it silently is how brake fluid
    went missing from every car in the product.
  */
  const unknowns = services.filter((service) => service.status === 'unknown');
  const later = services.filter(
    (service) => service.status !== 'unknown' && !inMilestone.has(service.service)
  );

  /*
    The groups, in the order a reader wants them: the visit to book, what comes
    after it, what cannot be placed. `evaluateSchedule` already sorts by
    urgency, so each group keeps that order, and the index runs across the
    whole table — it is the order to do them in, and a number that restarted
    under each head would read as three lists.
  */
  const groups: Array<{ key: string; label: string; detail: string | null; rows: ServiceDue[] }> =
    [];
  if (milestone) {
    groups.push({
      key: 'milestone',
      label: milestone.mileage === null ? 'Next service' : `${miles.format(milestone.mileage)} service`,
      detail: milestoneReason(milestone, state.mileage),
      rows: milestone.services,
    });
  }
  if (later.length > 0) {
    groups.push({
      key: 'later',
      label: milestone ? 'Coming up' : 'Nothing due right now',
      detail: milestone ? null : 'The next service is far enough out that it is not worth a trip.',
      rows: later,
    });
  }
  if (unknowns.length > 0) {
    groups.push({
      key: 'unknown',
      label: 'Timed by date, not mileage',
      detail:
        'Nothing on record says when these were last done, so there is no due date to work out. Scanning the invoice would fix that.',
      rows: unknowns,
    });
  }

  let index = 0;

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      {...rootScroll}
    >
      {confirmBanner}

      {/*
        R33, the other state. The nav carries the car; what this screen adds is
        the reading everything below is derived from — a row of the table, in
        the table's voice, rather than the sans line it was (B1, B6).
      */}
      {confirmed ? (
        <View style={styles.readingRow}>
          <Text style={styles.readingLabel}>Odometer</Text>
          <Text style={styles.readingValue}>{miles.format(state.mileage)} MI</Text>
        </View>
      ) : null}

      <View style={styles.table}>
        {groups.map((group) => (
          <View key={group.key}>
            <View style={styles.groupHead}>
              <Text style={styles.groupLabel} accessibilityRole="header">
                {group.label}
              </Text>
              {group.detail ? <Text style={styles.groupDetail}>{group.detail}</Text> : null}
            </View>

            {group.rows.map((service) => {
              index += 1;
              return (
                <DueRow
                  key={service.service}
                  index={index}
                  service={service}
                  added={added.includes(service.service)}
                  adding={adding === service.service}
                  onAdd={() => void addToNeeds(service)}
                />
              );
            })}
          </View>
        ))}
      </View>

      <Text style={styles.footnote}>{SCHEDULE_BASIS_LABELS['generated-schedule']}</Text>
    </ScrollView>
  );
}

/**
 * One service, as a row of the spec table.
 *
 * The History row's shape: the mono index, the grotesk label, the mono numeral
 * right-aligned, a hairline per row (B6) — and beneath the label, in the quiet
 * sans the record's provenance line uses, the rule the position was computed
 * from and where the count started (`service-provenance.ts`).
 *
 * ── The action is a word in the row, not a slab under it ────────────────────
 *
 * "Add to wishlist" was a full-width graphite button under every row — the
 * critique's *"list-item-with-CTA templating"*, three of them outweighing the
 * three lines they served. It is a mono caps word now, the voice the roots
 * give their chrome (ADD CAR, ADD, ACCOUNT). Once added it becomes its state
 * — ADDED, in the state ink, no longer pressable — because the outcome the
 * control wanted is the thing to show, not a disabled verb.
 *
 * ⚠ 12 Sep · **on the meta line, so the numeral reaches the rule.** Round 31
 * put the word in a column of its own beside the position, and the critique
 * measured what that cost: every numeral stopped inboard of the rule by the
 * column's width, and the longest name wrapped to an orphaned "inspect". A
 * spec table's numerals end at the rule (B6; the History rows do), so the
 * head line is index, name, mark, position — the record row exactly — and
 * the action sits at the end of the second line, beside the rule it was
 * computed from. Its 44pt target is centred on that 16pt line and reaches
 * into the head line above it; the row does not grow around it.
 *
 * ⚠ The row itself is deliberately **not** the affordance, which is what the
 * critique proposed instead. A tap that writes a row to Needs, with no
 * visible verb, is a write on a mis-scroll; `WishlistAddScreen` made the same
 * call for its own rows (R39: *"the card itself is deliberately not the
 * affordance"*), and the History row's tap *opens* something rather than
 * writing. The verb stays visible; it moves off the numeral's line.
 *
 * ⚠ The name is in the accessible label: "ADD" alone is unambiguous to an eye
 * that can see the row it sits in, and ambiguous to a reader that hears
 * eight of them.
 */
function DueRow({
  index,
  service,
  added,
  adding,
  onAdd,
}: {
  index: number;
  service: ServiceDue;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const overdue = service.status === 'overdue';
  const position = positionLabel(service);
  const basis = service.status === 'unknown' ? null : SERVICE_BASIS_LABELS[serviceBasis(service.evidence)];
  const interval = intervalLabel(service);
  const spoken = [service.service, positionSentence(service)].filter(Boolean).join(', ');

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.index} accessibilityElementsHidden importantForAccessibility="no">
          {String(index).padStart(2, '0')}
        </Text>

        <Text style={styles.name} accessibilityLabel={spoken}>
          {service.service}
        </Text>

        {overdue ? (
          /*
            ⚠ `△` (U+25B3) in sodium — B7's *"hairline triangle beside a
            genuine warning"*, and a service the car has driven past is the
            one genuine warning this table has. `due` and `soon` carry no
            mark: the numeral says how close, and a triangle on every row that
            is merely coming up is the amber-on-everything the chip family's
            rule exists to prevent. Beside the *reading* rather than the name,
            so every name in the table keeps the shared left edge a spec table
            is — the garage puts it beside OPEN RECALLS because that row's
            warning is its label; this row's warning is its number. Hidden
            from the reader, whose sentence already says "overdue".
          */
          <Text style={styles.mark} accessibilityElementsHidden>
            △
          </Text>
        ) : null}

        {position ? (
          <Text style={styles.position} accessibilityElementsHidden>
            {position}
          </Text>
        ) : (
          <Text style={styles.positionNone} accessibilityElementsHidden>
            —
          </Text>
        )}
      </View>

      <View style={styles.rowFoot}>
        {interval || basis ? (
          <Text style={styles.meta}>
            {interval}
            {interval && basis ? ' · ' : null}
            {/*
              Its own node, so the claim is findable as the sentence core wrote
              — the provenance tests look for `SERVICE_BASIS_LABELS[...]` whole.
            */}
            {basis ? <Text style={styles.metaBasis}>{basis}</Text> : null}
          </Text>
        ) : (
          <View style={styles.metaSpacer} />
        )}

        {added ? (
          <Text style={styles.addedText} accessibilityLabel={`${service.service} is on Needs`}>
            Added
          </Text>
        ) : (
          <Button
            label="Add"
            variant="ghost"
            size="small"
            busy={adding}
            busyLabel=""
            accessibilityLabel={`Add ${service.service} to Needs`}
            onPress={onAdd}
            style={styles.action}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { ...PAGE_BODY },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },

  /* ── R14 · the confirm band ────────────────────────────────────────────── */
  /*
    B5: a top rule and the page's own surface. The table beneath opens with a
    rule of its own, so this band closes on nothing — two hairlines a pixel
    apart read as a seam, which is `Card`'s argument for a top rule only.
  */
  confirm: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    paddingTop: space.lg,
    gap: space.sm,
  },
  confirmLead: { ...type.body, color: text.primary },
  confirmBody: { ...type.value, color: text.muted },
  /*
    Bottoms aligned: the field carries its label above the input, so the row's
    top edge is the label's and the verb sits beside the input, not the label.
  */
  confirmRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.xs },
  confirmField: { flex: 1 },
  confirmAction: { flexShrink: 0 },

  /* ── R33 · the confirmed reading, as a row of the table ────────────────── */
  readingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: SPEC_ROW,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  readingLabel: { ...type.monoLabel, color: text.muted },
  readingValue: { ...type.mono, fontSize: 15, lineHeight: 20, color: text.primary, ...TABULAR },

  /* ── B6 · the table ────────────────────────────────────────────────────── */
  /*
    One rule under the last row, so the table closes and the footnote beneath
    is outside it — `BandRow`'s `last` rule, drawn once on the container.
  */
  table: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  /*
    A group head is the History's visit head: the condensed grotesk over the
    quiet line, on a rule. The milestone's detail is `milestoneReason`, which
    the notification body also prints — the two must agree, so it is not
    reworded here into the table's caps.
  */
  groupHead: {
    gap: 2,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  /*
    ⚠ 12 Sep · the token's own size. At 15 the condensed face was read as
    "bold body-sans caps" (round 32) — the misread drift §6.13 records at
    12pt, one size up — and the web sets its section heads (SPECIFICATION,
    PERFORMANCE) at the size the token carries, as do the hub's rows.
  */
  groupLabel: { ...type.displaySection, color: text.primary },
  groupDetail: { ...type.value, color: text.secondary },

  /*
    ⚠ `SPEC_ROW` rule to rule, text centred — the record list's row, measured
    against B6's 56 in round 24. The meta line grows the row; it never shrinks
    it. The head line's `flex-start` alignment keeps the index, the mark and
    the numeral on the name's first line when the name wraps.
  */
  row: {
    gap: 2,
    minHeight: SPEC_ROW,
    justifyContent: 'center',
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  /** The spec table's index — mono, muted, fixed width so the labels line up. */
  index: { ...type.mono, color: text.muted, ...TABULAR, minWidth: 22, lineHeight: 20 },
  /* Tight to the numeral it marks: the row's gap, less the mark's own air. */
  mark: {
    ...type.monoLabel,
    lineHeight: 20,
    color: status.attention,
    width: 16,
    textAlign: 'center',
    marginRight: -space.sm,
  },
  name: { ...type.ui, color: text.primary, flex: 1 },
  /* B6: the numeral, mono, right-aligned and tabular so a column is a column. */
  position: { ...type.mono, color: text.primary, textAlign: 'right', ...TABULAR, lineHeight: 20 },
  positionNone: { ...type.mono, color: text.muted, textAlign: 'right', lineHeight: 20 },
  /*
    The second line: the meta, then the action at the rule. The meta takes
    the width and wraps within it; the word keeps its own.
  */
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingLeft: 22 + space.md,
  },
  /*
    The control clears 44 through `Button`'s own floor and pulls that height
    back into the 16pt line so the row does not grow around it; the label's
    own padding is pulled back too, so the word ends where the numerals do.
  */
  action: { marginVertical: -(TARGET_MIN - 16) / 2, marginRight: -space.md },
  addedText: { ...type.monoLabel, color: text.muted },
  /*
    The record's provenance voice: the quiet sans, under the name and clear of
    the index column. A sentence, so not the mono (B1 gives the mono to
    values; "Every 5,000 mi" is a rule stated in words, and "From your service
    records" is a claim).
  */
  meta: { ...type.label, letterSpacing: 0, color: text.muted, flex: 1 },
  metaBasis: { ...type.label, letterSpacing: 0, color: text.muted },
  /* Holds the action at the rule on a row with nothing to say beneath its name. */
  metaSpacer: { flex: 1 },

  footnote: { ...type.label, letterSpacing: 0, color: text.muted },

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
