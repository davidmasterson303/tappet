/**
 * The tire set's arithmetic, and the ratchet that keeps the axis honest.
 *
 * @jest-environment node
 *
 * ── The defect the ratchet exists for ───────────────────────────────────────
 *
 * Round 2 of the design loop had **two sources of truth for the axis**: the
 * figures came from a data object and the geometry from CSS literals, and they
 * agreed only by coincidence. Mutating the interval to 7,000 moved the captions
 * to `DUE 74,012 MI` / `PAST 4,400 MI` while the sodium stayed at 78.83pt —
 * still encoding 5,400. Nothing read wrong. Nothing threw. It was found by
 * mutation, not by reading (`design-loop/tires/_finalproof.mjs`).
 *
 * So one rule, checked under mutation: **the caption and the run must encode
 * the same miles.** This file proves it at the model — `tireAxis` and
 * `tireReading` are one object — and the phone's `StripOdometer.test.tsx`
 * proves it against rendered geometry. The proof is made to fail first: a
 * hand-typed run that disagrees is detected by the same reader.
 *
 * ⚠ Known ceiling, stated so nobody over-claims it: the span, the strip's
 * `ON THIS SET` and the numeral all derive from `odometerNow − installOdometer`,
 * so a fault *inside* that expression is invisible here.
 *
 * The worked dataset is §0.8 of the shared frame, verbatim.
 */

import {
  INTERVAL_MAX_MILES,
  INTERVAL_MIN_MILES,
  TIRE_COPY,
  draftFromTireSet,
  emptyRotationDraft,
  formatDateMono,
  formatMiles,
  isStaggered,
  isTireSize,
  mayClaimWarrantyTerms,
  pastCaption,
  resolveInterval,
  rotationPayload,
  rotationPayloadProblems,
  rotationProblems,
  rotationRows,
  sinceLabel,
  staggeredConsequences,
  tireAxis,
  tireReading,
  tireRotationFromRow,
  tireSetFromRow,
  tireSetPayload,
  tireSetPayloadProblems,
  tireSetProblems,
  tireSizeKey,
  tireStats,
  tireSubline,
  type TireRotation,
  type TireSet,
} from '@tappet/core/tires';
import { tireRotationNotification, tiresUrl } from '@tappet/core/notifications';
import { SERVICE_COOLDOWN_DAYS, shouldRaiseTireRotation } from '@tappet/core/notification-sweep';

/** §0.8 — the 2019 Golf R, as written. */
const GOLF: TireSet = {
  id: 'set-1',
  vehicleId: 'v1',
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  sizeFront: '245/35R19',
  sizeRear: '245/35R19',
  installedOn: '2025-03-12',
  installOdometer: 54_232,
  purchasePlace: 'Discount Tire',
  rotationIntervalMiles: 6_000,
  intervalSource: 'owner',
  treadwearMilesEntered: 45_000,
  provenance: 'invoice',
};

const ROTATIONS: TireRotation[] = [
  { id: 'r1', setId: 'set-1', rotatedOn: '2025-06-28', odometer: 60_140, provenance: 'invoice' },
  { id: 'r2', setId: 'set-1', rotatedOn: '2025-11-09', odometer: 67_012, provenance: 'typed' },
];

const ODO_NOW = 78_412;
const TODAY = '2026-09-18';

/** §0.9 — the 2021 M340i: staggered, no install record, no interval. */
const M340I: TireSet = {
  id: 'set-2',
  vehicleId: 'v2',
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  sizeFront: '225/40R19',
  sizeRear: '255/35R19',
  installedOn: null,
  installOdometer: null,
  purchasePlace: null,
  rotationIntervalMiles: null,
  intervalSource: null,
  treadwearMilesEntered: null,
  provenance: 'typed',
};

/** What a screen would print from an axis: the run's miles, read off the fractions. */
function runMiles(axis: NonNullable<ReturnType<typeof tireAxis>>): number | null {
  if (!axis.run) return null;
  return Math.round((axis.run.to - axis.run.from) * axis.span);
}

describe('the worked example — every figure in §0.8 derives, none is written', () => {
  const reading = tireReading(GOLF, ROTATIONS, ODO_NOW);

  it('on this set · since last rotation · past interval by', () => {
    expect(reading.onThisSet).toBe(24_180);
    expect(reading.since).toBe(11_400);
    expect(reading.sinceBasis).toBe('rotation');
    expect(reading.dueAt).toBe(73_012);
    expect(reading.past).toBe(5_400);
    expect(reading.overrun).toBe(true);
    expect(reading.staggered).toBe(false);
  });

  it('prints as the frame prints it', () => {
    expect(formatMiles(reading.onThisSet!)).toBe('24,180 MI');
    expect(pastCaption(reading.past!)).toBe('PAST 5,400 MI');
    expect(tireStats(GOLF, reading)).toEqual([
      { label: 'Installed', value: '12 MAR 2025' },
      { label: 'On this set', value: '24,180 MI' },
      { label: 'Bought at', value: 'DISCOUNT TIRE' },
    ]);
    expect(tireSubline(GOLF)).toBe('MICHELIN · 245/35R19');
  });

  it('the record: 01 is the most recent, and the rows carry their provenance', () => {
    const rows = rotationRows(ROTATIONS);
    expect(rows.map((r) => [r.index, formatDateMono(r.rotation.rotatedOn), formatMiles(r.rotation.odometer), r.rotation.provenance])).toEqual([
      ['01', '09 NOV 2025', '67,012 MI', 'typed'],
      ['02', '28 JUN 2025', '60,140 MI', 'invoice'],
    ]);
  });
});

describe('the axis ratchet — the caption and the run encode the same miles', () => {
  it('as written: a run of 5,400 under a caption of PAST 5,400 MI', () => {
    const reading = tireReading(GOLF, ROTATIONS, ODO_NOW);
    const axis = tireAxis(GOLF, reading, ODO_NOW)!;
    expect(axis.span).toBe(24_180);
    expect(runMiles(axis)).toBe(5_400);
    expect(axis.run!.miles).toBe(reading.past);
    // Four events — install, two rotations, today — each at its own fraction.
    expect(axis.events.map((e) => e.kind)).toEqual(['install', 'rotation', 'rotation', 'now']);
    expect(axis.events.map((e) => e.provenance)).toEqual(['invoice', 'invoice', 'typed', 'derived']);
    expect(axis.events[0].x).toBe(0);
    expect(axis.events[3].x).toBe(1);
    expect(axis.events[2].x).toBeCloseTo((67_012 - 54_232) / 24_180, 6);
    // 78.84pt of a 353pt line at the frame's scale — the critic's number.
    expect(((axis.run!.to - axis.run!.from) * 353).toFixed(2)).toBe('78.83');
  });

  it('mutation 1 — interval 7,000: the run moves and shortens, and the caption follows it', () => {
    const set = { ...GOLF, rotationIntervalMiles: 7_000 };
    const reading = tireReading(set, ROTATIONS, ODO_NOW);
    const axis = tireAxis(set, reading, ODO_NOW)!;
    expect(reading.past).toBe(4_400);
    expect(pastCaption(reading.past!)).toBe('PAST 4,400 MI');
    expect(runMiles(axis)).toBe(4_400);
    expect(axis.run!.from).toBeCloseTo((74_012 - 54_232) / 24_180, 6);
  });

  it('mutation 2 — odometer 80,412: the whole scale re-bases and every tick moves', () => {
    const reading = tireReading(GOLF, ROTATIONS, 80_412);
    const axis = tireAxis(GOLF, reading, 80_412)!;
    expect(axis.span).toBe(26_180);
    expect(reading.past).toBe(7_400);
    expect(runMiles(axis)).toBe(7_400);
    expect(axis.events[2].x).toBeCloseTo((67_012 - 54_232) / 26_180, 6);
  });

  it('a third rotation puts a third tick on the axis without anyone editing a style', () => {
    const more = [...ROTATIONS, { id: 'r3', setId: 'set-1', rotatedOn: '2026-05-02', odometer: 74_000, provenance: 'typed' as const }];
    const reading = tireReading(GOLF, more, ODO_NOW);
    const axis = tireAxis(GOLF, reading, ODO_NOW)!;
    expect(axis.events).toHaveLength(5);
    // And the obligation restarts from it: 4,412 since, inside 6,000, no run.
    expect(reading.since).toBe(4_412);
    expect(reading.past).toBe(0);
    expect(reading.overrun).toBe(false);
    expect(axis.run).toBeNull();
    expect(rotationRows(more)[0].rotation.odometer).toBe(74_000);
  });

  it('can still detect the round-2 failure — a run typed by hand that disagrees with the caption', () => {
    /*
      The proof has to be one that has been seen to fail. Round 2's axis kept
      its sodium in a CSS literal: under a 7,000 interval the caption said
      4,400 and the line still said 5,400. Reconstructed here as a run whose
      width was written once and never re-derived, read by the same reader.
    */
    const set = { ...GOLF, rotationIntervalMiles: 7_000 };
    const reading = tireReading(set, ROTATIONS, ODO_NOW);
    const honest = tireAxis(set, reading, ODO_NOW)!;
    const typedRun = { from: 1 - 5_400 / honest.span, to: 1, miles: 5_400 };
    const stale = { ...honest, run: typedRun };
    expect(runMiles(stale)).toBe(5_400);
    expect(reading.past).toBe(4_400);
    expect(runMiles(stale)).not.toBe(reading.past);
    // Whereas the derived axis agrees on every row above.
    expect(runMiles(honest)).toBe(reading.past);
  });
});

describe('no interval, no obligation — §0.10', () => {
  it('a set with no interval shows neither a run nor a caption, whatever the mileage', () => {
    const set = { ...GOLF, rotationIntervalMiles: null, intervalSource: null };
    const reading = tireReading(set, ROTATIONS, ODO_NOW);
    expect(reading.since).toBe(11_400);
    expect(reading.interval).toBeNull();
    expect(reading.dueAt).toBeNull();
    // `null`, never `0` — "not past it" and "we cannot say" are different answers.
    expect(reading.past).toBeNull();
    expect(reading.overrun).toBe(false);
    expect(tireAxis(set, reading, ODO_NOW)!.run).toBeNull();
  });

  it('a figure with no source, or a source with no figure, asserts nothing', () => {
    expect(resolveInterval({ rotationIntervalMiles: 6_000, intervalSource: null })).toBeNull();
    expect(resolveInterval({ rotationIntervalMiles: null, intervalSource: 'owner' })).toBeNull();
    expect(resolveInterval({ rotationIntervalMiles: 0, intervalSource: 'owner' })).toBeNull();
    expect(resolveInterval({ rotationIntervalMiles: 6_000, intervalSource: 'owner' })).toEqual({ miles: 6_000, source: 'owner' });
  });

  it('only an owner-entered interval licenses the warranty sentence', () => {
    expect(mayClaimWarrantyTerms({ miles: 6_000, source: 'owner' })).toBe(true);
    expect(mayClaimWarrantyTerms({ miles: 6_000, source: 'vehicle' })).toBe(false);
    expect(mayClaimWarrantyTerms(null)).toBe(false);
  });
});

describe('what the reading counts from', () => {
  it('with no rotation logged it counts from the install, and says so', () => {
    const reading = tireReading(GOLF, [], ODO_NOW);
    expect(reading.since).toBe(24_180);
    expect(reading.sinceBasis).toBe('install');
    expect(sinceLabel(reading.sinceBasis)).toBe('Miles since installed');
    expect(reading.dueAt).toBe(60_232);
    expect(reading.past).toBe(18_180);
    expect(sinceLabel('rotation')).toBe('Miles since last rotation');
  });

  it('with no odometer on the car, every figure is "we cannot say"', () => {
    const reading = tireReading(GOLF, ROTATIONS, null);
    expect(reading.onThisSet).toBeNull();
    expect(reading.since).toBeNull();
    expect(reading.sinceBasis).toBeNull();
    expect(reading.past).toBeNull();
    expect(reading.overrun).toBe(false);
    expect(tireAxis(GOLF, reading, null)).toBeNull();
    expect(sinceLabel(null)).toBeNull();
  });

  it('a car whose odometer is behind its own records says nothing rather than a negative', () => {
    const reading = tireReading(GOLF, ROTATIONS, 60_000);
    expect(reading.since).toBeNull();
    expect(reading.past).toBeNull();
    expect(reading.overrun).toBe(false);
  });

  it('with no install odometer there is no axis and no ON THIS SET, but a rotation still counts', () => {
    const set = { ...GOLF, installOdometer: null };
    const reading = tireReading(set, ROTATIONS, ODO_NOW);
    expect(reading.onThisSet).toBeNull();
    expect(reading.since).toBe(11_400);
    expect(tireAxis(set, reading, ODO_NOW)).toBeNull();
    expect(tireStats(set, reading).map((s) => s.label)).toEqual(['Installed', 'Bought at']);
  });

  it('the staggered car with no install record has an empty strip, not a strip of dashes', () => {
    const reading = tireReading(M340I, [], 41_208);
    expect(tireStats(M340I, reading)).toEqual([]);
    expect(reading.since).toBeNull();
  });
});

describe('staggered', () => {
  it('is the sizes differing, compared without case or spaces', () => {
    expect(isStaggered(M340I)).toBe(true);
    expect(isStaggered(GOLF)).toBe(false);
    expect(isStaggered({ sizeFront: '245/35 r19', sizeRear: '245/35R19' })).toBe(false);
    // The P-metric prefix is part of the designation and is not collapsed.
    expect(isStaggered({ sizeFront: 'P245/35R19', sizeRear: '245/35R19' })).toBe(true);
    expect(tireSizeKey(' 245/35 r19 ')).toBe('245/35R19');
  });

  it('heads two consequences, verbatim, and prints no halved number', () => {
    const rows = staggeredConsequences(M340I);
    expect(rows).toEqual([
      { index: '01', label: 'Front to rear', value: 'NOT POSSIBLE' },
      { index: '02', label: 'Rear mileage warranty', value: 'OFTEN HALVED', sub: 'Check your card' },
    ]);
    // The two values and the sub-line carry no figure: Tappet does not know
    // the owner's warranty number, so it cannot halve it.
    expect(rows.flatMap((r) => [r.value, r.sub ?? '']).join(' ')).not.toMatch(/\d/);
    expect(staggeredConsequences(GOLF)).toEqual([]);
  });

  it('the sub-line binds to the same boolean: brand alone when staggered', () => {
    expect(tireSubline(M340I)).toBe('MICHELIN');
  });
});

describe('the copy is the graded design’s, verbatim', () => {
  it.each([
    ['installed', 'Installed'],
    ['onThisSet', 'On this set'],
    ['boughtAt', 'Bought at'],
    ['sinceRotation', 'Miles since last rotation'],
    ['yourInterval', 'Your interval'],
    ['rotations', 'Rotations'],
    ['addRotation', 'Add a rotation'],
    ['enterInterval', 'Enter the interval'],
    ['rotationInterval', 'Rotation interval'],
    ['notEntered', 'NOT ENTERED'],
    ['willNotGuess', 'Tappet will not guess this'],
  ] as const)('%s', (key, value) => {
    expect(TIRE_COPY[key]).toBe(value);
  });

  it('never promises a claim outcome, anywhere in the feature’s strings', () => {
    const all = Object.values(TIRE_COPY).join(' ').toLowerCase();
    expect(all).not.toMatch(/will pay|guarantee|honou?red|claim/);
    // No terminal punctuation on a mono caps label (critique-02 §7).
    expect(TIRE_COPY.willNotGuess.endsWith('.')).toBe(false);
  });
});

describe('formats — §0.6', () => {
  it('dates are day month year, caps, built from the parts', () => {
    expect(formatDateMono('2025-11-09')).toBe('09 NOV 2025');
    expect(formatDateMono('2025-03-12T00:00:00Z')).toBe('12 MAR 2025');
    // Not a date: returned as it was, never invented.
    expect(formatDateMono('unknown')).toBe('unknown');
    expect(formatDateMono('2025-13-40')).toBe('2025-13-40');
  });

  it('miles carry a comma and the unit', () => {
    expect(formatMiles(67_012)).toBe('67,012 MI');
    expect(formatMiles(0)).toBe('0 MI');
    expect(formatMiles(5_400.4)).toBe('5,400 MI');
  });
});

describe('entering a set', () => {
  const draft = draftFromTireSet(GOLF);

  it('round-trips the worked example, with a blank rear meaning "same as the front"', () => {
    expect(draft.sizeRear).toBe('');
    expect(tireSetProblems(draft, TODAY)).toEqual([]);
    expect(tireSetPayload(draft)).toEqual({
      brand: 'Michelin',
      line: 'Pilot Sport 4S',
      sizeFront: '245/35R19',
      sizeRear: '245/35R19',
      installedOn: '2025-03-12',
      installOdometer: 54_232,
      purchasePlace: 'Discount Tire',
      rotationIntervalMiles: 6_000,
      treadwearMilesEntered: 45_000,
    });
    expect(draftFromTireSet(M340I).sizeRear).toBe('255/35R19');
  });

  it('requires only what makes the row an object: brand, line, a front size', () => {
    const problems = tireSetProblems(
      { ...draft, brand: '', line: '', sizeFront: '', installedOn: '', installOdometer: '', purchasePlace: '', rotationIntervalMiles: '', treadwearMilesEntered: '' },
      TODAY
    );
    expect(problems.map((p) => p.field)).toEqual(['brand', 'line', 'sizeFront']);
  });

  it('every absence is null in the payload — never a blank, never a zero', () => {
    const payload = tireSetPayload({ ...draft, installedOn: '', installOdometer: '', purchasePlace: '  ', rotationIntervalMiles: '', treadwearMilesEntered: '' });
    expect(payload.installedOn).toBeNull();
    expect(payload.installOdometer).toBeNull();
    expect(payload.purchasePlace).toBeNull();
    expect(payload.rotationIntervalMiles).toBeNull();
    expect(payload.treadwearMilesEntered).toBeNull();
  });

  it('refuses what is not a size, a date, or whole miles, in the field’s own words', () => {
    const problems = tireSetProblems(
      { ...draft, sizeFront: '245-35-19', sizeRear: 'wide', installedOn: '2025-02-30', installOdometer: '54,232.5', treadwearMilesEntered: 'lots' },
      TODAY
    );
    expect(problems.map((p) => p.field)).toEqual(['sizeFront', 'sizeRear', 'installedOn', 'installOdometer', 'treadwearMilesEntered']);
  });

  it('accepts real sizes and refuses ratings glued on', () => {
    for (const size of ['245/35R19', 'P225/40ZR19', 'LT265/70R17', '255/35R19.5', '245/35 r19']) {
      expect([size, isTireSize(size)]).toEqual([size, true]);
    }
    for (const size of ['245/35R19 93Y', '19', '245/35', '245/35R']) {
      expect([size, isTireSize(size)]).toEqual([size, false]);
    }
  });

  it('a future install date is refused, not clamped', () => {
    expect(tireSetProblems({ ...draft, installedOn: '2026-09-19' }, TODAY).map((p) => p.field)).toEqual(['installedOn']);
    expect(tireSetProblems({ ...draft, installedOn: TODAY }, TODAY)).toEqual([]);
  });

  it('the interval’s bounds catch a dropped digit and supply nothing', () => {
    expect(tireSetProblems({ ...draft, rotationIntervalMiles: '600' }, TODAY)[0]).toMatchObject({ field: 'rotationIntervalMiles' });
    expect(tireSetProblems({ ...draft, rotationIntervalMiles: '60000' }, TODAY)[0]).toMatchObject({ field: 'rotationIntervalMiles' });
    expect(tireSetProblems({ ...draft, rotationIntervalMiles: '3500' }, TODAY)).toEqual([]);
    expect(tireSetProblems({ ...draft, rotationIntervalMiles: '' }, TODAY)).toEqual([]);
    // A dropped zero from 6,000 is 600, and the floor has to catch it while
    // still sitting under the lowest interval any maker publishes.
    expect(INTERVAL_MIN_MILES).toBeGreaterThan(600);
    expect(INTERVAL_MIN_MILES).toBeLessThan(3_500);
    expect(INTERVAL_MAX_MILES).toBeGreaterThan(8_000);
  });

  it('judges the wire body by the same rules, and a wrong type is a problem on its field', () => {
    expect(tireSetPayloadProblems(tireSetPayload(draft), TODAY)).toEqual([]);
    const problems = tireSetPayloadProblems({ ...tireSetPayload(draft), installOdometer: '54232', brand: 7 }, TODAY);
    expect(problems.map((p) => p.field).sort()).toEqual(['brand', 'installOdometer']);
    expect(tireSetPayloadProblems(null, TODAY).map((p) => p.field)).toEqual(['brand', 'line', 'sizeFront']);
  });
});

describe('logging a rotation', () => {
  const context = { today: TODAY, set: GOLF, rotations: ROTATIONS };

  it('opens on today at the car’s reading, and that draft passes', () => {
    const draft = emptyRotationDraft(TODAY, ODO_NOW);
    expect(draft).toEqual({ rotatedOn: TODAY, odometer: '78412' });
    expect(rotationProblems(draft, context)).toEqual([]);
    expect(rotationPayload(draft)).toEqual({ rotatedOn: TODAY, odometer: 78_412 });
    expect(emptyRotationDraft(TODAY, null).odometer).toBe('');
  });

  it('the odometer only goes up — below the set’s last reading is refused by name', () => {
    const [problem] = rotationProblems({ rotatedOn: TODAY, odometer: '66000' }, context);
    expect(problem.field).toBe('odometer');
    expect(problem.message).toContain('67,012');
    // With no rotations yet, the floor is the install.
    const [first] = rotationProblems({ rotatedOn: TODAY, odometer: '50000' }, { ...context, rotations: [] });
    expect(first.message).toContain('54,232');
  });

  it('the date is not in the future and not before the install', () => {
    expect(rotationProblems({ rotatedOn: '2026-09-19', odometer: '78412' }, context)[0].message).toBe('That date has not happened yet.');
    expect(rotationProblems({ rotatedOn: '2025-03-01', odometer: '78412' }, context)[0].message).toContain('12 MAR 2025');
    expect(rotationProblems({ rotatedOn: 'soon', odometer: '78412' }, context)[0].field).toBe('rotatedOn');
  });

  it('judges the wire body by the same rules', () => {
    expect(rotationPayloadProblems({ rotatedOn: TODAY, odometer: 78_412 }, context)).toEqual([]);
    expect(rotationPayloadProblems({ rotatedOn: TODAY, odometer: '78412' }, context)[0].field).toBe('odometer');
    expect(rotationPayloadProblems({}, context).map((p) => p.field)).toEqual(['rotatedOn', 'odometer']);
  });
});

describe('rows from the database', () => {
  it('narrows what arrives, and an unknown interval source asserts nothing', () => {
    const set = tireSetFromRow({
      id: 's', vehicle_id: 'v', brand: 'Michelin', line: 'PS4S', size_front: '245/35R19', size_rear: '245/35R19',
      installed_on: '2025-03-12', install_odometer: 54_232, purchase_place: null,
      rotation_interval_miles: 6_000, interval_source: 'guessed', treadwear_miles_entered: null, provenance: 'invoice',
    });
    expect(set.intervalSource).toBeNull();
    expect(resolveInterval(set)).toBeNull();
    expect(set.provenance).toBe('invoice');
    // An unrecognised provenance reads as typed — the weaker claim.
    expect(tireRotationFromRow({ id: 'r', set_id: 's', rotated_on: '2025-06-28', odometer: 60_140, provenance: 'seed' }).provenance).toBe('typed');
  });
});

describe('the notification — the one place the obligation is a sentence', () => {
  const reading = tireReading(GOLF, ROTATIONS, ODO_NOW);

  it('is the approved string, verbatim, and lands on the tire set', () => {
    const notice = tireRotationNotification({
      vehicleId: 'v1',
      vehicleName: '2019 Volkswagen Golf R',
      sinceMiles: reading.since!,
      intervalMiles: reading.interval!.miles,
      sinceBasis: 'rotation',
      ownerEntered: mayClaimWarrantyTerms(reading.interval),
    })!;
    expect(notice.body).toBe(
      "11,400 miles since the last rotation. Your interval is 6,000. You are currently outside your warranty's terms."
    );
    expect(notice.title).toBe('Tire rotation due — 2019 Volkswagen Golf R');
    expect(notice.url).toBe(tiresUrl('v1'));
    expect(tiresUrl('a b')).toBe('tappet://vehicle/a%20b/tires');
  });

  it('refuses to build the sentence unless the owner entered the interval', () => {
    expect(
      tireRotationNotification({ vehicleId: 'v1', vehicleName: 'x', sinceMiles: 11_400, intervalMiles: 6_000, sinceBasis: 'rotation', ownerEntered: false })
    ).toBeNull();
  });

  it('does not say "since the last rotation" of a set that has never had one', () => {
    const notice = tireRotationNotification({
      vehicleId: 'v1', vehicleName: 'x', sinceMiles: 24_180, intervalMiles: 6_000, sinceBasis: 'install', ownerEntered: true,
    })!;
    expect(notice.body).not.toMatch(/last rotation/);
    expect(notice.body).toMatch(/^24,180 miles since these tires were installed/);
    expect(notice.body).toMatch(/outside your warranty's terms\.$/);
  });
});

describe('the sweep’s decision', () => {
  it('raises an owner-entered overrun once, then not again inside the cooldown', () => {
    expect(shouldRaiseTireRotation({ overrun: true, ownerEntered: true, lastNotifiedOn: null, today: TODAY })).toBe(true);
    expect(shouldRaiseTireRotation({ overrun: true, ownerEntered: true, lastNotifiedOn: '2026-09-01', today: TODAY })).toBe(false);
    const longAgo = new Date(Date.parse(`${TODAY}T00:00:00Z`) - (SERVICE_COOLDOWN_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    expect(shouldRaiseTireRotation({ overrun: true, ownerEntered: true, lastNotifiedOn: longAgo, today: TODAY })).toBe(true);
  });

  it('never raises a set that is not past its interval, or whose interval Tappet supplied', () => {
    expect(shouldRaiseTireRotation({ overrun: false, ownerEntered: true, lastNotifiedOn: null, today: TODAY })).toBe(false);
    expect(shouldRaiseTireRotation({ overrun: true, ownerEntered: false, lastNotifiedOn: null, today: TODAY })).toBe(false);
  });
});
