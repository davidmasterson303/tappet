/**
 * The three health drivers — computed, never generated.
 *
 * @jest-environment node
 *
 * David chose the computed route on 15 Aug over adding three fields to the
 * health-summary prompt. These tests are what that choice buys: every number
 * below is checkable against its inputs, which is the whole argument — a driver
 * the model invented could not be asserted on at all.
 */

import {
  alsoHoldingBack,
  healthDrivers,
  holdingBack,
  maintenanceDriver,
  mileageLoadDriver,
  recallDriver,
} from '@tappet/core/health-drivers';
import type { ServiceDue } from '@tappet/core/service-due';

/** A `ServiceDue` with only the fields the drivers read. */
const due = (
  status: ServiceDue['status'],
  priority: ServiceDue['priority'] = 'Recommended'
): ServiceDue =>
  ({
    service: 'Engine oil and filter',
    description: '',
    priority,
    intervalMiles: 7500,
    intervalMonths: null,
    dueAtMiles: 60_000,
    milesRemaining: 0,
    dueOn: null,
    monthsRemaining: null,
    drivenBy: 'miles',
    status,
    basedOnHistory: true,
    evidence: 'records',
  }) as ServiceDue;

describe('maintenanceDriver', () => {
  it('says it does not know rather than scoring a car with no schedule', () => {
    /*
      The rule the garage card already follows for a missing health score. A
      car whose knowledge base has not generated is not a car in bad condition,
      and `null` is how that difference reaches the screen.
    */
    const driver = maintenanceDriver([]);

    expect(driver.score).toBeNull();
    expect(driver.detail).toMatch(/no service schedule/i);
  });

  it('scores a fully up-to-date car at the top', () => {
    const driver = maintenanceDriver([due('later'), due('later'), due('later')]);

    expect(driver.score).toBe(100);
    expect(driver.detail).toMatch(/Nothing overdue/);
  });

  it('charges an overdue critical service more than an overdue optional one', () => {
    // The knowledge base already grades priority; this reads that grade rather
    // than holding a second opinion about which services matter.
    const critical = maintenanceDriver([due('overdue', 'Critical')]).score;
    const optional = maintenanceDriver([due('overdue', 'Optional')]).score;

    expect(critical).toBeLessThan(optional!);
    expect(critical).toBe(78);
    expect(optional).toBe(93);
  });

  it('does not charge for a service it has no record of', () => {
    /*
      ⚠ The load-bearing one. A time-only service with no date to count from is
      a gap in *our records*, not a fault in the car. Charging for it would let
      a car with no invoices score worse than one with a genuine overdue brake
      fluid — punishing the owner for our missing data.

      Asserted against a car where **something** is known, because that is where
      the property is actually observable: two clean services and one unknown
      must score the same as two clean services alone.
    */
    const partial = maintenanceDriver([due('later'), due('later'), due('unknown')]);
    const known = maintenanceDriver([due('later'), due('later')]);

    expect(partial.score).toBe(known.score);
    // Reported rather than absorbed. "—" on its own reads as a bug.
    expect(partial.detail).toMatch(/1 service with no record to count from/);
  });

  it('scores nothing at all when nothing is known — FN-01b', () => {
    /*
      ⚠ **The defect this replaces, seen live on 23 Aug.** Three unknowns
      produced `100 - 0 = 100` and the sentence *"Nothing overdue, across 3
      tracked services"* — a **perfect maintenance score for a car with no
      service records**, in the module written to stop absence reading as an
      all-clear.

      Both halves were individually right: not penalising an unknown is correct,
      and 100 minus nothing is 100. What is wrong is **scoring at all** when
      every input is a gap. `null` already means "we cannot say" here — the
      no-schedule branch returns it — and this is the same absence reached one
      step later.
    */
    const blind = maintenanceDriver([due('unknown'), due('unknown'), due('unknown')]);

    expect(blind.score).toBeNull();
    expect(blind.detail).toMatch(/No service records yet for any of 3 tracked services/);
    // And it must not be dressed as good news on the way out.
    expect(blind.detail).not.toMatch(/[Nn]othing overdue/);
  });

  it('leads with the absence when there is nothing else to report', () => {
    /*
      "Nothing overdue, across 8 tracked services. 3 services with no record to
      count from." reads as a clean bill with a footnote — and the footnote is
      the load-bearing half. When missing records are the only thing to say,
      they are what the sentence opens with.
    */
    const mostlyBlind = maintenanceDriver([
      due('later'),
      due('unknown'),
      due('unknown'),
      due('unknown'),
    ]);

    expect(mostlyBlind.detail).toMatch(/^3 services with no record to count from\./);
  });

  it('describes the same car the number does', () => {
    const driver = maintenanceDriver([
      due('overdue', 'Critical'),
      due('due'),
      due('later'),
      due('unknown'),
    ]);

    expect(driver.detail).toBe(
      '1 service overdue, 1 due now, across 4 tracked services. 1 service with no record to count from.'
    );
  });

  it('never falls below the floor, however far behind the car is', () => {
    const wrecked = maintenanceDriver(
      Array.from({ length: 30 }, () => due('overdue', 'Critical'))
    );

    expect(wrecked.score).toBe(1);
  });
});

describe('recallDriver', () => {
  const recall = (extra: Record<string, unknown> = {}) => ({
    NHTSACampaignNumber: '21V123',
    Component: 'AIR BAGS',
    Summary: 'Inflator may rupture.',
    Remedy: 'Dealer will replace the inflator.',
    ...extra,
  });

  it('does not clear a car whose recalls were never checked', () => {
    /*
      Absent is not empty. Scoring an unchecked vehicle 100 is a claim about
      NHTSA's completeness this product cannot make — the same argument
      `worstSeverity` makes for rendering nothing rather than a green badge.
    */
    expect(recallDriver(null).score).toBeNull();
    expect(recallDriver(undefined).detail).toMatch(/have not been checked/i);
  });

  it('scores a checked car with none at the top', () => {
    const driver = recallDriver([]);

    expect(driver.score).toBe(100);
    expect(driver.detail).toBe('No recalls on record.');
  });

  it('charges the first recall most', () => {
    // One open recall and three are both "a car with an unfixed safety
    // defect"; that difference matters less than the difference from none.
    const one = recallDriver([recall()]).score!;
    const two = recallDriver([recall(), recall()]).score!;
    const three = recallDriver([recall(), recall(), recall()]).score!;

    expect(100 - one).toBeGreaterThan(one - two);
    expect(one - two).toBe(two - three);
  });

  it('puts a do-not-drive recall below anything a count could reach', () => {
    /*
      A do-not-drive recall is not a score, it is an instruction. No amount of
      otherwise-good news may lift the card out of the alarming range.
    */
    // `parkIt` and `parkOutSide` — NHTSA's own field names, which is why the
    // driver goes through `normaliseRecalls` rather than reading raw fields.
    const driver = recallDriver([recall({ parkIt: true })]);

    expect(driver.score).toBeLessThanOrEqual(5);
    expect(driver.detail).toMatch(/do-not-drive/);
  });

  it('is not fooled by NHTSA s string booleans', () => {
    /*
      `"false"` is truthy in JavaScript, which is exactly how a do-not-drive
      flag ends up on every recall in the list. `recalls.ts` already handles it;
      this asserts the driver inherits that rather than re-reading the raw field.
    */
    const driver = recallDriver([recall({ parkIt: 'false' })]);

    expect(driver.score).toBeGreaterThan(5);
    expect(driver.detail).not.toMatch(/do-not-drive/);
  });

  it('says "on record" rather than "open", because completion is not tracked', () => {
    // A recall the owner had fixed last year still counts. Conservative in the
    // right direction, but the wording must not overclaim.
    expect(recallDriver([recall()]).detail).toMatch(/on record/);
    expect(recallDriver([recall()]).detail).not.toMatch(/\bopen\b/i);
  });
});

describe('mileageLoadDriver', () => {
  const today = '2026-08-15';

  it('needs both an odometer reading and a year', () => {
    expect(mileageLoadDriver({ currentMileage: 66_000, year: null, today }).score).toBeNull();
    expect(mileageLoadDriver({ currentMileage: null, year: 2015, today }).score).toBeNull();
  });

  it('scores a lightly used car at the top', () => {
    // 5,000 a year over 11 years — well under half the 12,000 average.
    const driver = mileageLoadDriver({ currentMileage: 55_000, year: 2015, today });

    expect(driver.score).toBe(100);
  });

  it('puts an average car high but not at the top', () => {
    /*
      12,000 a year is the yardstick, not a fault. A car being used normally
      should not read as a problem — the ramp is gentle on purpose, because the
      steep version made an ordinary high-mileage car look like a wreck.
    */
    const driver = mileageLoadDriver({ currentMileage: 132_000, year: 2015, today });

    expect(driver.score).toBe(85);
  });

  it('does not send a heavy commuter to the floor', () => {
    // 30,000 a year is hard use, not a write-off. This is the range real cars
    // occupy, and it has to stay legible rather than pinning at the bottom.
    const driver = mileageLoadDriver({ currentMileage: 330_000, year: 2015, today });

    expect(driver.score).toBe(40);
  });

  it('floors rather than going negative at the extreme', () => {
    /*
      The ramp is linear and reaches the floor at about 3.8x the average —
      roughly 46,000 miles a year. A car there genuinely is at the bottom of a
      mileage-load scale, so the floor is the honest answer rather than a
      clamp hiding a broken formula. Asserted so the clamp cannot quietly
      become the thing every high-mileage car hits.
    */
    expect(mileageLoadDriver({ currentMileage: 528_000, year: 2015, today }).score).toBe(1);
    // 20,000 a year, still well clear of the floor.
    expect(mileageLoadDriver({ currentMileage: 220_000, year: 2015, today }).score).toBe(65);
  });

  it('does not divide by zero on a current-model-year car', () => {
    const driver = mileageLoadDriver({ currentMileage: 3_000, year: 2026, today });

    expect(driver.score).toBe(100);
    expect(Number.isFinite(driver.score!)).toBe(true);
  });

  it('shows its working', () => {
    const driver = mileageLoadDriver({ currentMileage: 66_000, year: 2015, today });

    expect(driver.detail).toBe('About 6,000 miles a year over 11 years, against a 12,000 average.');
  });
});

describe('healthDrivers', () => {
  it('returns the three in the order the card shows them', () => {
    /*
      Maintenance first because it is the one the owner can act on today,
      recalls second because they can be urgent, mileage load last because it is
      context rather than a task. One function, so no caller assembles its own
      order.
    */
    const drivers = healthDrivers({
      services: [due('later')],
      recalls: [],
      currentMileage: 66_000,
      year: 2015,
      today: '2026-08-15',
    });

    expect(drivers.map((driver) => driver.key)).toEqual([
      'maintenance',
      'recalls',
      'mileage-load',
    ]);
  });

  it('gives every driver a sentence, including the ones it cannot score', () => {
    // A card cell showing "—" and nothing else reads as a bug rather than as
    // an honest absence.
    const drivers = healthDrivers({ services: [], recalls: null });

    for (const driver of drivers) {
      expect(driver.score).toBeNull();
      expect(driver.detail.length).toBeGreaterThan(10);
    }
  });

  it('never scores anything outside the health scale', () => {
    const drivers = healthDrivers({
      services: Array.from({ length: 40 }, () => due('overdue', 'Critical')),
      recalls: [{ NHTSACampaignNumber: '1' }, { NHTSACampaignNumber: '2' }],
      currentMileage: 600_000,
      year: 2015,
      today: '2026-08-15',
    });

    for (const driver of drivers) {
      expect(driver.score).toBeGreaterThanOrEqual(1);
      expect(driver.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('a driver says when it found nothing outstanding', () => {
  /*
    ── ⚠ What this fact is for, and why it is a fact ─────────────────────────

    The dashboard renders a computed driver and a model-written claim about the
    same subject, and on a car with a gap in its records they can disagree in
    plain sight: "Maintenance 97 — nothing overdue among the 6 we can check"
    directly above "Brake fluid overdue". Neither is wrong — `nextDueMileage`
    counts an unrecorded service from the next interval boundary above the
    odometer, while the model reads the same silence as "never done" — so the
    screen names the disagreement instead of suppressing either side.

    It reads this flag to do that. The alternative was a threshold in the
    component (`score >= 80`), which would be the invented precision this whole
    module refuses.
  */
  it('is set when nothing is overdue and nothing is due', () => {
    const driver = maintenanceDriver([due('later'), due('soon'), due('later')]);

    expect(driver.nothingOutstanding).toBe(true);
  });

  it('is not set when something is overdue or due', () => {
    /*
      The assertion that fails if the flag is ever hard-coded true — which
      would make the screen announce a disagreement on a car where the two
      sides agree that work is owed.
    */
    expect(maintenanceDriver([due('overdue'), due('later')]).nothingOutstanding).toBeFalsy();
    expect(maintenanceDriver([due('due'), due('later')]).nothingOutstanding).toBeFalsy();
  });

  it('is not set when there is nothing to say at all', () => {
    // `null` score. "We cannot say" is not "we looked and found nothing", and
    // a screen that treated the two alike would claim a disagreement with a
    // check that never ran.
    expect(maintenanceDriver([]).nothingOutstanding).toBeFalsy();
    expect(maintenanceDriver([due('unknown'), due('unknown')]).nothingOutstanding).toBeFalsy();
  });

  it('says the same thing about a clean recall check, and not about an absent one', () => {
    expect(recallDriver([]).nothingOutstanding).toBe(true);
    // Never checked — the FN-03 case. Absence is not a clean result.
    expect(recallDriver(undefined).nothingOutstanding).toBeFalsy();
  });
});

/**
 * ── The cause beside the verdict (22 Sep) ───────────────────────────────────
 *
 * The hub's three lenses asked for one line that says what holds the score
 * back and what to do about it. Each driver carries its reason and its act
 * in its own counts; `holdingBack` picks the one to name — and names an
 * unjudged history before any scored driver, because too few records is the
 * cause of a low reading more often than anything a score can say.
 */
describe('the cause beside the verdict', () => {
  it('phrases a scored maintenance driver as a reason with an act', () => {
    const driver = maintenanceDriver([
      { ...due('overdue'), service: 'Brake fluid' },
      { ...due('overdue'), service: 'Coolant' },
      { ...due('due'), service: 'Engine oil and filter' },
      due('later'),
    ]);
    expect(driver.cause).toBe('2 services overdue, 1 due now');
    expect(driver.act).toBe('see what is due');
  });

  it('gives a history nobody can judge its own reason and act, and nothing to a clean one', () => {
    const unjudged = maintenanceDriver([due('unknown'), due('unknown')]);
    expect(unjudged.score).toBeNull();
    expect(unjudged.cause).toBe('no service records to judge from');
    expect(unjudged.act).toBe('scan an invoice');

    const clean = maintenanceDriver([due('later'), due('later')]);
    expect(clean.cause).toBeUndefined();
    expect(maintenanceDriver([]).cause).toBeUndefined();
  });

  it('phrases recalls as the model\'s, never this car\'s', () => {
    const recall = { NHTSACampaignNumber: '21V123', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' };
    const driver = recallDriver([recall, recall]);
    expect(driver.cause).toBe('2 recalls for this model');
    expect(driver.act).toBe('review them');
    expect(recallDriver([]).cause).toBeUndefined();
    expect(recallDriver(null).cause).toBeUndefined();
  });

  it('names mileage only above the average, with no act', () => {
    const today = '2026-08-15';
    const hard = mileageLoadDriver({ currentMileage: 200_000, year: 2015, today });
    expect(hard.cause).toMatch(/^mileage above average, about [\d,]+ a year$/);
    expect(hard.act).toBeUndefined();
    expect(mileageLoadDriver({ currentMileage: 30_000, year: 2015, today }).cause).toBeUndefined();
  });

  it('calls a thin history a reason even when nothing checked is outstanding', () => {
    // One record among many tracked services: nothing overdue among the checked, most unknown.
    const thin = maintenanceDriver([due('later'), due('unknown'), due('unknown'), due('unknown')]);
    expect(thin.nothingOutstanding).toBe(true);
    expect(thin.cause).toBe('3 services with no record to count from');
    expect(thin.act).toBe('scan an invoice');
    // A history with a few gaps is not thin: the gaps are stated, not blamed.
    const patchy = maintenanceDriver([due('later'), due('later'), due('later'), due('unknown')]);
    expect(patchy.cause).toBeUndefined();
    expect(patchy.detail).toMatch(/1 service with no record/);
  });

  it('names the history beside the recalls where both hold a thin car back, and only then', () => {
    const recall = { NHTSACampaignNumber: '21V123', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' };
    const today = '2026-08-15';
    const thin = maintenanceDriver([due('later'), due('unknown'), due('unknown')]);
    const recalls = recallDriver([recall, recall, recall, recall]);
    const load = mileageLoadDriver({ currentMileage: 69_573, year: 2017, today });
    const first = holdingBack([thin, recalls, load]);
    expect(first?.key).toBe('maintenance');
    expect(alsoHoldingBack([thin, recalls, load], first)?.key).toBe('recalls');
    // No recalls open: the history alone.
    expect(alsoHoldingBack([thin, recallDriver([]), load], first)).toBeNull();
    // Recalls first (a scored history): nothing second — one comparison, one loser.
    const overdue = maintenanceDriver([due('overdue'), due('later')]);
    const weakest = holdingBack([overdue, recalls, load]);
    if (weakest?.key === 'recalls') expect(alsoHoldingBack([overdue, recalls, load], weakest)).toBeNull();
  });

  it('names an unjudged history before any scored driver, then the weakest, and nothing for a clean car', () => {
    const recall = { NHTSACampaignNumber: '21V123', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' };
    const today = '2026-08-15';
    const unjudged = maintenanceDriver([due('unknown')]);
    const recalls = recallDriver([recall, recall, recall, recall]);
    const load = mileageLoadDriver({ currentMileage: 69_573, year: 2017, today });
    // The F-PACE: one record, four recalls — the history is the cause, not the recalls.
    expect(holdingBack([unjudged, recalls, load])?.key).toBe('maintenance');

    const overdue = maintenanceDriver([due('overdue'), due('later')]);
    // Scored on both sides: the lower wins.
    const weakest = holdingBack([overdue, recalls, load]);
    expect(weakest).not.toBeNull();
    expect(weakest!.score).toBe(Math.min(overdue.score!, recalls.score!, load.score!));

    const clean = maintenanceDriver([due('later'), due('later')]);
    expect(holdingBack([clean, recallDriver([]), mileageLoadDriver({ currentMileage: 20_000, year: 2020, today })])).toBeNull();
    expect(holdingBack([])).toBeNull();
  });
});
