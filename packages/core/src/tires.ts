/**
 * A tire set, and what Tappet may say about it.
 *
 * ── The feature in one sentence ─────────────────────────────────────────────
 *
 * A tire set becomes an object on the vehicle, the owner tells us its rotation
 * interval, and we tell them when they are outside it. v1.1, decided by David
 * 18–20 Sep 2026; the design is `design-loop/tires/` (graded 8/10, round 4),
 * and this module is the part of it that is arithmetic rather than layout.
 *
 * ⚠ **It is not a warranty-claim product, and no string here may imply that it
 * is.** From eight manufacturers' own warranty PDFs: a treadwear claim pays
 * $31–39 a tire, only when all four reach 2/32", OE tires carry no mileage
 * warranty at all, warranties do not transfer, and the three biggest makers
 * want a dealer-signed rotation record this app cannot produce. What is
 * unoccupied is narrower and real: nobody checks the owner's *logged* interval
 * against what their warranty *requires*, and the intervals genuinely run
 * 3,500–8,000 miles — Michelin publishes three numbers for one warranty.
 *
 * ── The rule that governs this module is already written ────────────────────
 *
 * `service-due.ts`: *"a generic table is a reasonable placeholder on a screen
 * someone chose to open and a bad basis for an unprompted notification."* That
 * module deleted a hardcoded `COMMON_INTERVALS` table for exactly this reason,
 * and this one does not reintroduce it for tires. **The interval is asked,
 * never assumed.** There is no default interval anywhere below; a set with none
 * entered has no obligation, produces no overrun, no sodium mark and no push —
 * which is what `TAPPET WILL NOT GUESS THIS` says on screen.
 *
 * `IntervalSource` records *who* said it. Only an owner-entered interval —
 * read off their own warranty card — licenses the sentence *"you are currently
 * outside your warranty's terms"*, because only the card can source a claim
 * about the warranty. `'vehicle'` exists for the day Tappet holds a
 * manufacturer's own figure; nothing writes it yet, and a `'vehicle'` interval
 * would draw the overrun but never the warranty sentence.
 *
 * ── Every number on a screen is derived, never written ──────────────────────
 *
 * The design loop found the same defect three times: a figure that agreed with
 * the data on the day it was typed and would not have moved with it — the
 * `$29.99` failure in geometry. So this module owns every derivation the two
 * clients render (`tireReading`), *and* the axis they draw it on
 * (`tireAxis`): the ticks, the due point and the sodium run are fractions of
 * one span, computed from the same object as the figures. `tires.test.ts`
 * carries the ratchet the loop's `_finalproof.mjs` ran on the HTML — mutate
 * the interval, and the caption and the run must move together.
 *
 * ⚠ Its known ceiling, stated so nobody over-claims it: the strip's `ON THIS
 * SET`, the axis span and the numeral all derive from `odometerNow −
 * installOdometer`, so a fault *inside* that expression is invisible to the
 * proof.
 *
 * ── Why the reading counts from the last *event*, not the last rotation ─────
 *
 * The obligation starts at install: the first rotation is due at the install
 * odometer plus the interval. A set with no rotation logged is not "0 miles
 * since the last rotation" — that would be the `null`-is-`0` error CLAUDE.md
 * §6 collects — it is *n* miles since the set went on, and `sinceBasis` says
 * which so a caption can name it. The notification's sentence branches on the
 * same field, because "since the last rotation" is false of a set that has
 * never had one.
 *
 * ── Portable on purpose ─────────────────────────────────────────────────────
 *
 * No Node, no Supabase, no React. The phone, the web page and the nightly
 * sweep all import this, and a derivation that lived in one of them would be
 * the second implementation this codebase keeps finding drifted from the
 * first.
 */

/** Where a record came from. The two shapes `service-provenance.ts` already draws. */
export type TireProvenance = 'invoice' | 'typed';

/**
 * Who stated the rotation interval.
 *
 * `'owner'` — typed from the warranty card. The only source that licenses
 * "outside your warranty's terms".
 * `'vehicle'` — a figure Tappet holds for the vehicle itself. ⚠ Nothing
 * writes this yet; the CHECK constraint carries it so a third meaning cannot
 * arrive unannounced.
 */
export type IntervalSource = 'owner' | 'vehicle';

export interface TireSet {
  id: string;
  vehicleId: string;
  brand: string;
  line: string;
  /** As entered, e.g. `245/35R19`. Compared through `tireSizeKey`. */
  sizeFront: string;
  sizeRear: string;
  /** ISO `YYYY-MM-DD`, or null when the owner did not say. */
  installedOn: string | null;
  installOdometer: number | null;
  purchasePlace: string | null;
  rotationIntervalMiles: number | null;
  intervalSource: IntervalSource | null;
  /** The mileage figure printed on the warranty, as the owner typed it. Never derived. */
  treadwearMilesEntered: number | null;
  /** How the set's own facts were recorded. */
  provenance: TireProvenance;
}

export interface TireRotation {
  id: string;
  setId: string;
  /** ISO `YYYY-MM-DD`. */
  rotatedOn: string;
  odometer: number;
  provenance: TireProvenance;
}

// ─── Sizes ────────────────────────────────────────────────────────────────────

/**
 * A tire size, normalised for comparison: case and whitespace only.
 *
 * `245/35 R19`, `245/35r19` and `245/35R19` are one size. `P245/35R19` and
 * `245/35R19` are **not** collapsed — the P-metric prefix is part of the
 * designation, and a comparison that dropped it would call a genuinely mixed
 * fitment square.
 */
export function tireSizeKey(size: string): string {
  return size.replace(/\s+/g, '').toUpperCase();
}

/**
 * Whether a string is a tire size at all: `245/35R19`, `P225/40ZR19`,
 * `LT265/70R17`, `255/35R19.5`. Speed and load ratings are not part of the
 * size and are refused rather than silently kept — `245/35R19 93Y` is a size
 * with an extra fact glued on, and the glue is what would make two entries of
 * one size compare unequal.
 */
export function isTireSize(size: string): boolean {
  return /^(?:P|LT)?\d{3}\/\d{2}Z?R\d{2}(?:\.5)?$/.test(tireSizeKey(size));
}

/**
 * Staggered: the front and rear sizes differ.
 *
 * The consequence is the point, not the label. A staggered set cannot be
 * rotated front to rear, and on five of eight majors the rear tires' mileage
 * warranty is halved — Michelin, verbatim: *"the mileage warranty on each rear
 * tire will be half that specified."* Said once, as a fact, and **no halved
 * number is printed**: Tappet does not know the owner's warranty figure, it
 * knows what the owner typed, and halving a figure the owner typed would be a
 * claim about the warranty this module cannot source.
 */
export function isStaggered(set: Pick<TireSet, 'sizeFront' | 'sizeRear'>): boolean {
  return tireSizeKey(set.sizeFront) !== tireSizeKey(set.sizeRear);
}

// ─── The interval ─────────────────────────────────────────────────────────────

export interface ResolvedInterval {
  miles: number;
  source: IntervalSource;
}

/**
 * The interval this set is held to, or `null` when nobody stated one.
 *
 * A row with a mileage and no source — or a source and no mileage — resolves
 * to `null`, deliberately: the schema forbids the pair, and a row that reached
 * here in that state is one nothing should act on. Guessing `'owner'` for it
 * would license the warranty sentence on a figure whose origin is unknown,
 * which is the exact overclaim this type exists to prevent.
 */
export function resolveInterval(
  set: Pick<TireSet, 'rotationIntervalMiles' | 'intervalSource'>
): ResolvedInterval | null {
  const miles = set.rotationIntervalMiles;
  const source = set.intervalSource;
  if (typeof miles !== 'number' || !Number.isFinite(miles) || miles <= 0) return null;
  if (source !== 'owner' && source !== 'vehicle') return null;
  return { miles, source };
}

/**
 * Whether Tappet may say "you are currently outside your warranty's terms".
 *
 * Only because the owner entered the interval from the card. A `'vehicle'`
 * interval — when one exists — is Tappet's figure, and being past it is a
 * fact about rotation, not about a warranty.
 */
export function mayClaimWarrantyTerms(interval: ResolvedInterval | null): boolean {
  return interval !== null && interval.source === 'owner';
}

// ─── The reading ──────────────────────────────────────────────────────────────

export interface TireReading {
  /** `odometerNow − installOdometer`, or null when either is unknown. */
  onThisSet: number | null;
  /** Miles since the last event — the last rotation, else the install. */
  since: number | null;
  /** Which event `since` counts from. Null when nothing can be counted from. */
  sinceBasis: 'rotation' | 'install' | null;
  /** The odometer reading of that event. */
  lastEventOdometer: number | null;
  interval: ResolvedInterval | null;
  /** Where the next rotation was due: the last event plus the interval. */
  dueAt: number | null;
  /**
   * `max(0, since − interval)`. Null when there is no interval or nothing to
   * count from — never `0`, because "not past it" and "we cannot say" are
   * different answers and only one of them earns a quiet screen.
   */
  past: number | null;
  /** An interval was stated and the set is past it. The one sodium mark. */
  overrun: boolean;
  staggered: boolean;
  /** Rotations, oldest first, as the axis plots them. */
  rotations: TireRotation[];
}

/** Rotations in odometer order, oldest first. Ties keep the date's order. */
function inOrder(rotations: readonly TireRotation[]): TireRotation[] {
  return [...rotations].sort(
    (a, b) => a.odometer - b.odometer || a.rotatedOn.localeCompare(b.rotatedOn)
  );
}

/**
 * Everything the screens print about a set, from the set, its rotations and
 * the car's current odometer — and nothing else.
 *
 * `odometerNow` is the vehicle's `current_mileage`, which the owner confirms
 * monthly (`mileage-tracking.ts`). It is `null` when there is no reading, and
 * then every figure here is `null` too: a set whose car has no odometer has no
 * "miles since" to show, and drawing one from an assumed reading would be
 * precision this module cannot support (CLAUDE.md §10).
 *
 * A reading behind an event — the car says 60,000 and a rotation was logged
 * at 67,012 — yields `null` rather than a negative: the data disagrees with
 * itself and the honest answer is to say nothing until it is corrected.
 */
export function tireReading(
  set: TireSet,
  rotations: readonly TireRotation[],
  odometerNow: number | null
): TireReading {
  const ordered = inOrder(rotations);
  const last = ordered.length > 0 ? ordered[ordered.length - 1] : null;
  const now = typeof odometerNow === 'number' && Number.isFinite(odometerNow) ? odometerNow : null;
  const install =
    typeof set.installOdometer === 'number' && Number.isFinite(set.installOdometer)
      ? set.installOdometer
      : null;

  const lastEventOdometer = last ? last.odometer : install;
  const sinceBasis: TireReading['sinceBasis'] = last ? 'rotation' : install !== null ? 'install' : null;

  const onThisSet = now !== null && install !== null && now >= install ? now - install : null;
  const since =
    now !== null && lastEventOdometer !== null && now >= lastEventOdometer
      ? now - lastEventOdometer
      : null;

  const interval = resolveInterval(set);
  const dueAt = interval && lastEventOdometer !== null ? lastEventOdometer + interval.miles : null;
  const past = interval && since !== null ? Math.max(0, since - interval.miles) : null;

  return {
    onThisSet,
    since,
    sinceBasis: since === null ? null : sinceBasis,
    lastEventOdometer,
    interval,
    dueAt,
    past,
    overrun: past !== null && past > 0,
    staggered: isStaggered(set),
    rotations: ordered,
  };
}

// ─── The axis ─────────────────────────────────────────────────────────────────

export interface AxisEvent {
  kind: 'install' | 'rotation' | 'now';
  odometer: number;
  /** `'derived'` is today's reading — the odometer, not a record. */
  provenance: TireProvenance | 'derived';
  /** Fraction along the axis: 0 at install, 1 at today. */
  x: number;
}

export interface TireAxis {
  /** Miles the line spans — `ON THIS SET`, exactly. */
  span: number;
  events: AxisEvent[];
  /**
   * The one sodium run, as fractions of the span, or `null`. `from` is the
   * missed due point, `to` is today, and `miles` is what the caption prints
   * — the same expression, so the two cannot disagree.
   */
  run: { from: number; to: number; miles: number } | null;
}

/**
 * The strip odometer: the set's own axis, from install to today.
 *
 * ⚠ **It is not a progress bar.** It grows *from* a target toward the edge and
 * has no maximum — the critic's line was *"a warning that is also a
 * measurement"*: the sodium's *length is the overrun*, at the same scale as
 * every other span on the line. Do not add a track, a maximum, a percentage or
 * a fill; the health dial is taken and this system has no fills.
 *
 * One scale function, applied to everything drawn on the line — every tick,
 * the due point, both ends of the run — so a third rotation puts a third tick
 * on the axis without anyone touching a style, and a changed interval moves the
 * run and the caption together. That is the property the ratchet proves.
 *
 * `null` when the axis cannot be drawn: no install odometer, no current
 * reading, or a reading that has not moved past the install. An axis of zero
 * span has no scale, and a made-up one would put every tick in one place.
 */
export function tireAxis(set: TireSet, reading: TireReading, odometerNow: number | null): TireAxis | null {
  const install = set.installOdometer;
  if (typeof install !== 'number' || typeof odometerNow !== 'number') return null;
  if (!Number.isFinite(install) || !Number.isFinite(odometerNow)) return null;

  const span = odometerNow - install;
  if (span <= 0) return null;

  const at = (odometer: number) => Math.min(1, Math.max(0, (odometer - install) / span));

  const events: AxisEvent[] = [
    { kind: 'install', odometer: install, provenance: set.provenance, x: 0 },
    ...reading.rotations
      .filter((rotation) => rotation.odometer >= install && rotation.odometer <= odometerNow)
      .map((rotation): AxisEvent => ({
        kind: 'rotation',
        odometer: rotation.odometer,
        provenance: rotation.provenance,
        x: at(rotation.odometer),
      })),
    { kind: 'now', odometer: odometerNow, provenance: 'derived', x: 1 },
  ];

  const run =
    reading.overrun && reading.dueAt !== null && reading.past !== null
      ? { from: at(reading.dueAt), to: 1, miles: reading.past }
      : null;

  return { span, events, run };
}

// ─── The record ───────────────────────────────────────────────────────────────

export interface RotationRow {
  /** `01` is the most recent — see the note. */
  index: string;
  rotation: TireRotation;
}

/**
 * The rotations table, newest first, indexed.
 *
 * ⚠ `01` means the most recent rotation, as the graded design draws it — so
 * logging a third renumbers both rows. An index that changes when a record is
 * added is a rank, not an identity, and whether that is the right convention
 * is David's open question (design-loop/tires, parking lot 5). Kept as
 * designed rather than resolved by a default; changing it is this function
 * and its test.
 */
export function rotationRows(rotations: readonly TireRotation[]): RotationRow[] {
  const newestFirst = inOrder(rotations).reverse();
  return newestFirst.map((rotation, i) => ({
    index: String(i + 1).padStart(2, '0'),
    rotation,
  }));
}

// ─── Formats — §0.6 of the shared frame ───────────────────────────────────────

/** `11,400 MI` — thousands comma, the unit always present, never abbreviated further. */
export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString('en-US')} MI`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * `09 NOV 2025` — day, month, year, caps, no punctuation, no locale trap.
 *
 * Built from the string's own parts rather than through `Date`: a `YYYY-MM-DD`
 * parsed as UTC midnight and printed in a western zone is the day before, and
 * a rotation dated the 9th that prints as the 8th is a record that lies by
 * one day. Anything that is not a calendar date comes back as it was.
 */
export function formatDateMono(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${match[3]} ${month} ${match[1]}`;
}

// ─── Copy — every string, verbatim from the graded design ─────────────────────

/**
 * The feature's strings, in one place so the phone and the web print the same
 * words and a test can hold them to the design.
 *
 * Labels are sentence case and rely on the mono-label style to set them in
 * caps; **values** rendered in plain mono carry their own case, which is why
 * `NOT POSSIBLE`, `OFTEN HALVED` and `NOT ENTERED` are capitals here.
 *
 * ⚠ `OFTEN HALVED` is the last deliberately unbound string in the feature —
 * David's call between it and the sourced `HALVED ON 5 OF 8 MAKERS`, which
 * invites *which eight?* Left as designed.
 */
export const TIRE_COPY = {
  /** The leaf's name — the hub's door and the screen's title with no set. */
  tires: 'Tires',
  installed: 'Installed',
  onThisSet: 'On this set',
  boughtAt: 'Bought at',
  sinceRotation: 'Miles since last rotation',
  sinceInstall: 'Miles since installed',
  yourInterval: 'Your interval',
  rotations: 'Rotations',
  addRotation: 'Add a rotation',
  enterInterval: 'Enter the interval',
  front: 'Front',
  rear: 'Rear',
  frontToRear: 'Front to rear',
  notPossible: 'NOT POSSIBLE',
  rearWarranty: 'Rear mileage warranty',
  oftenHalved: 'OFTEN HALVED',
  checkYourCard: 'Check your card',
  rotationInterval: 'Rotation interval',
  notEntered: 'NOT ENTERED',
  willNotGuess: 'Tappet will not guess this',
} as const;

/** `PAST 5,400 MI` — the axis's one caption, bound to the run it measures. */
export function pastCaption(miles: number): string {
  return `PAST ${formatMiles(miles)}`;
}

/** The caption over the numeral, naming what it counts from. */
export function sinceLabel(basis: TireReading['sinceBasis']): string | null {
  if (basis === 'rotation') return TIRE_COPY.sinceRotation;
  if (basis === 'install') return TIRE_COPY.sinceInstall;
  return null;
}

/**
 * The title block's sub-line: the brand, plus a size **only where one size is
 * true**. One size in this line is the statement that the set is square; a
 * staggered set prints no size here because then the sizes are the subject
 * and belong at numeral scale on their own rows. Cut 1 of the graded round —
 * the fitment was a word here (`ALL FOUR`) and a label 20pt away (`SQUARE
 * SET`), one boolean printed twice.
 */
export function tireSubline(set: Pick<TireSet, 'brand' | 'sizeFront' | 'sizeRear'>): string {
  const parts = [set.brand, ...(isStaggered(set) ? [] : [tireSizeKey(set.sizeFront)])];
  return parts.join(' · ').toUpperCase();
}

export interface ConsequenceRow {
  index: string;
  label: string;
  value: string;
  sub?: string;
}

/**
 * The two consequences of a staggered fitment, or nothing.
 *
 * Both are computed from `size.front ≠ size.rear`; neither is a label about
 * the fitment itself. The rule adopted in round 4: **a label appears only when
 * it has a consequence.** `SQUARE SET` named the absence of a condition and
 * was cut; these two rows are what the condition costs.
 */
export function staggeredConsequences(set: Pick<TireSet, 'sizeFront' | 'sizeRear'>): ConsequenceRow[] {
  if (!isStaggered(set)) return [];
  return [
    { index: '01', label: TIRE_COPY.frontToRear, value: TIRE_COPY.notPossible },
    {
      index: '02',
      label: TIRE_COPY.rearWarranty,
      value: TIRE_COPY.oftenHalved,
      sub: TIRE_COPY.checkYourCard,
    },
  ];
}

/**
 * The stat strip's cells, in order, **only the ones with a value**.
 *
 * A label appears only when it has a consequence, and a strip with no stats is
 * not a strip: `INSTALLED — · ON THIS SET — · BOUGHT AT —` is 49pt and two
 * hairlines to say "nothing" three times. The caller drops the strip when this
 * is empty, and never draws a dash — `StatStrip` carries that rule already.
 */
export function tireStats(set: TireSet, reading: TireReading): Array<{ label: string; value: string }> {
  const stats: Array<{ label: string; value: string }> = [];
  if (set.installedOn) stats.push({ label: TIRE_COPY.installed, value: formatDateMono(set.installedOn) });
  if (reading.onThisSet !== null) stats.push({ label: TIRE_COPY.onThisSet, value: formatMiles(reading.onThisSet) });
  if (set.purchasePlace && set.purchasePlace.trim()) {
    stats.push({ label: TIRE_COPY.boughtAt, value: set.purchasePlace.trim().toUpperCase() });
  }
  return stats;
}

// ─── Entry — the drafts both clients collect, and what is wrong with them ──────

export interface TireSetDraft {
  brand: string;
  line: string;
  sizeFront: string;
  /** Blank means "same as the front" — the common case, one field fewer. */
  sizeRear: string;
  /** ISO date or blank. */
  installedOn: string;
  installOdometer: string;
  purchasePlace: string;
  rotationIntervalMiles: string;
  treadwearMilesEntered: string;
}

export type TireSetField = keyof TireSetDraft;

export interface TireSetProblem {
  field: TireSetField;
  message: string;
}

export function emptyTireSetDraft(): TireSetDraft {
  return {
    brand: '',
    line: '',
    sizeFront: '',
    sizeRear: '',
    installedOn: '',
    installOdometer: '',
    purchasePlace: '',
    rotationIntervalMiles: '',
    treadwearMilesEntered: '',
  };
}

/** A draft pre-filled from a stored set, for editing. */
export function draftFromTireSet(set: TireSet): TireSetDraft {
  return {
    brand: set.brand,
    line: set.line,
    sizeFront: set.sizeFront,
    sizeRear: isStaggered(set) ? set.sizeRear : '',
    installedOn: set.installedOn ?? '',
    installOdometer: set.installOdometer === null ? '' : String(set.installOdometer),
    purchasePlace: set.purchasePlace ?? '',
    rotationIntervalMiles: set.rotationIntervalMiles === null ? '' : String(set.rotationIntervalMiles),
    treadwearMilesEntered: set.treadwearMilesEntered === null ? '' : String(set.treadwearMilesEntered),
  };
}

/**
 * Bounds on the two figures the owner types about the warranty.
 *
 * ⚠ These are typo catches, not opinions about tires. Real rotation intervals
 * run 3,500–8,000 miles and treadwear warranties 30,000–90,000; the bounds sit
 * far outside both so a genuine outlier is accepted and a dropped or doubled
 * digit is refused in the field's own words. Nothing here supplies a value.
 */
export const INTERVAL_MIN_MILES = 1_000;
export const INTERVAL_MAX_MILES = 30_000;
export const TREADWEAR_MIN_MILES = 1_000;
export const TREADWEAR_MAX_MILES = 200_000;
/** The same ceiling `mileage-tracking.ts` puts on an odometer. */
const MAX_PLAUSIBLE_ODOMETER = 2_000_000;

/** Whole miles from what was typed, or `undefined` for blank or unusable. */
export function parseWholeMiles(raw: string): number | undefined {
  if (raw.trim().length === 0) return undefined;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 0 || digits.length !== raw.replace(/[\s,]/g, '').length) return undefined;
  const value = Number(digits);
  return Number.isInteger(value) && value >= 0 && value <= MAX_PLAUSIBLE_ODOMETER ? value : undefined;
}

/** `YYYY-MM-DD` that names a real calendar day. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Whether a set draft may be saved, and what is wrong if not.
 *
 * ── What is required, and why so little ─────────────────────────────────────
 *
 * Brand, line and a front size. That is what makes the row an object rather
 * than a note, and it is what a person can read off the sidewall in the
 * driveway. Everything else is genuinely often unknown at entry — the receipt
 * is in a drawer, the install odometer was never written down — and requiring
 * it pushes people to type a number they are guessing at, which is worse than
 * an absent one because nothing downstream can tell them apart. The screen
 * says what each absence costs: no install odometer, no axis; no interval, no
 * obligation.
 *
 * ── The interval's bounds are a typo catch, not a default ───────────────────
 *
 * A refused `600` is not Tappet stating an interval; it is Tappet declining
 * to hold the owner to a figure that is almost certainly missing a zero. The
 * message names the bounds and nothing else.
 *
 * ── `purchasePlace` is not bounded here ─────────────────────────────────────
 *
 * Whether a shop name has a maximum length is David's open question (parking
 * lot 8): the render truncates by trailing words and never overflows, so the
 * data decision is not forced by the layout. Trimmed, and otherwise taken as
 * typed.
 */
export function tireSetProblems(draft: TireSetDraft, today: string): TireSetProblem[] {
  const problems: TireSetProblem[] = [];

  if (draft.brand.trim().length === 0) problems.push({ field: 'brand', message: 'Say who makes the tire.' });
  if (draft.line.trim().length === 0) problems.push({ field: 'line', message: 'Say which tire it is — the name on the sidewall.' });

  if (draft.sizeFront.trim().length === 0) {
    problems.push({ field: 'sizeFront', message: 'The size is on the sidewall — 245/35R19, for example.' });
  } else if (!isTireSize(draft.sizeFront)) {
    problems.push({ field: 'sizeFront', message: 'That is not a tire size. It reads like 245/35R19.' });
  }

  if (draft.sizeRear.trim().length > 0 && !isTireSize(draft.sizeRear)) {
    problems.push({ field: 'sizeRear', message: 'That is not a tire size. Leave it blank if the rears match.' });
  }

  if (draft.installedOn.trim().length > 0) {
    const day = draft.installedOn.trim();
    if (!isCalendarDate(day)) problems.push({ field: 'installedOn', message: 'That is not a date. YYYY-MM-DD.' });
    else if (day > today.slice(0, 10)) {
      problems.push({ field: 'installedOn', message: 'That date has not happened yet.' });
    }
  }

  if (draft.installOdometer.trim().length > 0 && parseWholeMiles(draft.installOdometer) === undefined) {
    problems.push({ field: 'installOdometer', message: 'Enter whole miles, or leave it blank.' });
  }

  if (draft.rotationIntervalMiles.trim().length > 0) {
    const miles = parseWholeMiles(draft.rotationIntervalMiles);
    if (miles === undefined) {
      problems.push({ field: 'rotationIntervalMiles', message: 'Enter whole miles, or leave it blank.' });
    } else if (miles < INTERVAL_MIN_MILES || miles > INTERVAL_MAX_MILES) {
      problems.push({
        field: 'rotationIntervalMiles',
        message: `Check the digits — an interval is between ${INTERVAL_MIN_MILES.toLocaleString('en-US')} and ${INTERVAL_MAX_MILES.toLocaleString('en-US')} miles.`,
      });
    }
  }

  if (draft.treadwearMilesEntered.trim().length > 0) {
    const miles = parseWholeMiles(draft.treadwearMilesEntered);
    if (miles === undefined) {
      problems.push({ field: 'treadwearMilesEntered', message: 'Enter whole miles, or leave it blank.' });
    } else if (miles < TREADWEAR_MIN_MILES || miles > TREADWEAR_MAX_MILES) {
      problems.push({
        field: 'treadwearMilesEntered',
        message: `Check the digits — a treadwear figure is between ${TREADWEAR_MIN_MILES.toLocaleString('en-US')} and ${TREADWEAR_MAX_MILES.toLocaleString('en-US')} miles.`,
      });
    }
  }

  return problems;
}

/** What the API is sent. Every absence is `null`, never a blank or a zero. */
export interface TireSetPayload {
  brand: string;
  line: string;
  sizeFront: string;
  sizeRear: string;
  installedOn: string | null;
  installOdometer: number | null;
  purchasePlace: string | null;
  rotationIntervalMiles: number | null;
  treadwearMilesEntered: number | null;
}

/**
 * The payload from a draft `tireSetProblems` passed.
 *
 * A blank rear size becomes the front's: the row stores both axles from the
 * start, because retrofitting axles later is a data migration, and "same as
 * the front" is an entry convenience rather than a storage state.
 */
export function tireSetPayload(draft: TireSetDraft): TireSetPayload {
  const front = tireSizeKey(draft.sizeFront);
  const rear = draft.sizeRear.trim().length > 0 ? tireSizeKey(draft.sizeRear) : front;
  const place = draft.purchasePlace.trim();
  return {
    brand: draft.brand.trim(),
    line: draft.line.trim(),
    sizeFront: front,
    sizeRear: rear,
    installedOn: draft.installedOn.trim() || null,
    installOdometer: parseWholeMiles(draft.installOdometer) ?? null,
    purchasePlace: place.length > 0 ? place : null,
    rotationIntervalMiles: parseWholeMiles(draft.rotationIntervalMiles) ?? null,
    treadwearMilesEntered: parseWholeMiles(draft.treadwearMilesEntered) ?? null,
  };
}

/**
 * The same judgement, applied to what arrived over the wire.
 *
 * The route re-validates rather than trusting the phone — a client is not a
 * guarantee — and it does so through the draft rules so the two cannot drift:
 * the body is turned back into a draft and judged by the same function. A
 * field of the wrong type is a problem on that field, not a 500.
 */
export function tireSetPayloadProblems(body: unknown, today: string): TireSetProblem[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const typeProblems: TireSetProblem[] = [];
  const absent = (v: unknown) => v === null || v === undefined;

  const str = (field: TireSetField) => {
    const v = b[field];
    if (typeof v === 'string') return v;
    if (!absent(v)) typeProblems.push({ field, message: 'Send this as text.' });
    return '';
  };
  const num = (field: TireSetField) => {
    const v = b[field];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (!absent(v)) typeProblems.push({ field, message: 'Send this as a number of miles.' });
    return '';
  };

  const draft: TireSetDraft = {
    brand: str('brand'),
    line: str('line'),
    sizeFront: str('sizeFront'),
    sizeRear: str('sizeRear'),
    installedOn: str('installedOn'),
    installOdometer: num('installOdometer'),
    purchasePlace: str('purchasePlace'),
    rotationIntervalMiles: num('rotationIntervalMiles'),
    treadwearMilesEntered: num('treadwearMilesEntered'),
  };

  // A field of the wrong type is reported once, as a type problem, rather
  // than also as "missing" — the sender did say something, just not text.
  const typed = new Set(typeProblems.map((p) => p.field));
  return [...typeProblems, ...tireSetProblems(draft, today).filter((p) => !typed.has(p.field))];
}

// ─── A rotation ───────────────────────────────────────────────────────────────

export interface RotationDraft {
  /** ISO date. */
  rotatedOn: string;
  odometer: string;
}

export interface RotationProblem {
  field: keyof RotationDraft;
  message: string;
}

/** A fresh rotation: today, at the car's current reading. */
export function emptyRotationDraft(today: string, currentMileage?: number | null): RotationDraft {
  return {
    rotatedOn: today.slice(0, 10),
    odometer: typeof currentMileage === 'number' && currentMileage > 0 ? String(currentMileage) : '',
  };
}

/**
 * Whether a rotation may be logged against this set.
 *
 * ── The odometer only goes up ───────────────────────────────────────────────
 *
 * A rotation below the install odometer, or below a rotation already logged,
 * is refused with the reading it is below named in the message. This is the
 * axis's integrity: every tick is plotted by its odometer, and a record out
 * of order would draw a rotation before the set went on. The same argument
 * `mileage-tracking.ts` makes for the car's odometer, without the correction
 * path — a wrong rotation is deleted and re-entered, not moved.
 *
 * The date is held the same way: not in the future, and not before the install
 * date when one is known.
 */
export function rotationProblems(
  draft: RotationDraft,
  context: {
    today: string;
    set: Pick<TireSet, 'installedOn' | 'installOdometer'>;
    rotations: readonly Pick<TireRotation, 'odometer'>[];
  }
): RotationProblem[] {
  const problems: RotationProblem[] = [];
  const today = context.today.slice(0, 10);
  const day = draft.rotatedOn.trim();

  if (!isCalendarDate(day)) {
    problems.push({ field: 'rotatedOn', message: 'That is not a date. YYYY-MM-DD.' });
  } else if (day > today) {
    problems.push({ field: 'rotatedOn', message: 'That date has not happened yet.' });
  } else if (context.set.installedOn && day < context.set.installedOn.slice(0, 10)) {
    problems.push({
      field: 'rotatedOn',
      message: `Before the set was installed on ${formatDateMono(context.set.installedOn)}.`,
    });
  }

  const odometer = parseWholeMiles(draft.odometer);
  if (odometer === undefined) {
    problems.push({ field: 'odometer', message: 'Enter the odometer as whole miles.' });
  } else {
    const floor = Math.max(
      context.set.installOdometer ?? 0,
      ...context.rotations.map((rotation) => rotation.odometer)
    );
    if (odometer < floor) {
      problems.push({
        field: 'odometer',
        message: `Below the ${floor.toLocaleString('en-US')} miles already on record for this set.`,
      });
    }
  }

  return problems;
}

export interface RotationPayload {
  rotatedOn: string;
  odometer: number;
}

/** The payload from a draft `rotationProblems` passed. */
export function rotationPayload(draft: RotationDraft): RotationPayload {
  return {
    rotatedOn: draft.rotatedOn.trim(),
    odometer: parseWholeMiles(draft.odometer) ?? 0,
  };
}

/** The wire body, judged by the draft rules — see `tireSetPayloadProblems`. */
export function rotationPayloadProblems(
  body: unknown,
  context: Parameters<typeof rotationProblems>[1]
): RotationProblem[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const typeProblems: RotationProblem[] = [];
  if (b.rotatedOn !== undefined && typeof b.rotatedOn !== 'string') {
    typeProblems.push({ field: 'rotatedOn', message: 'Send the date as text, YYYY-MM-DD.' });
  }
  if (b.odometer !== undefined && !(typeof b.odometer === 'number' && Number.isFinite(b.odometer))) {
    typeProblems.push({ field: 'odometer', message: 'Send the odometer as a number of miles.' });
  }
  const draft: RotationDraft = {
    rotatedOn: typeof b.rotatedOn === 'string' ? b.rotatedOn : '',
    odometer: typeof b.odometer === 'number' && Number.isFinite(b.odometer) ? String(b.odometer) : '',
  };
  const typed = new Set(typeProblems.map((p) => p.field));
  return [...typeProblems, ...rotationProblems(draft, context).filter((p) => !typed.has(p.field))];
}

// ─── Rows ↔ records ───────────────────────────────────────────────────────────

/** The `tire_sets` row as PostgREST returns it. */
export interface TireSetRow {
  id: string;
  vehicle_id: string;
  brand: string;
  line: string;
  size_front: string;
  size_rear: string;
  installed_on: string | null;
  install_odometer: number | null;
  purchase_place: string | null;
  rotation_interval_miles: number | null;
  interval_source: string | null;
  treadwear_miles_entered: number | null;
  provenance: string | null;
  /** When the sweep last pushed about this set. Read by the sweep, never by a screen. */
  rotation_notified_at?: string | null;
  retired_at?: string | null;
}

/** The `tire_rotations` row as PostgREST returns it. */
export interface TireRotationRow {
  id: string;
  set_id: string;
  rotated_on: string;
  odometer: number;
  provenance: string | null;
}

function asProvenance(value: unknown): TireProvenance {
  // A row with an unrecognised provenance reads as typed — the weaker claim.
  // "Read off an invoice" is the one that needs the document behind it.
  return value === 'invoice' ? 'invoice' : 'typed';
}

/**
 * A stored row as the record the derivations read.
 *
 * Narrowing happens here, once: the clients read these off JSON, so whatever
 * the route's type says, what arrives is `unknown`. An interval source that is
 * not one of the two words becomes `null`, and `resolveInterval` then refuses
 * the interval — a row with a figure and no known source asserts nothing.
 */
export function tireSetFromRow(row: TireSetRow): TireSet {
  const source = row.interval_source;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    brand: row.brand,
    line: row.line,
    sizeFront: row.size_front,
    sizeRear: row.size_rear,
    installedOn: row.installed_on,
    installOdometer: typeof row.install_odometer === 'number' ? row.install_odometer : null,
    purchasePlace: row.purchase_place,
    rotationIntervalMiles:
      typeof row.rotation_interval_miles === 'number' ? row.rotation_interval_miles : null,
    intervalSource: source === 'owner' || source === 'vehicle' ? source : null,
    treadwearMilesEntered:
      typeof row.treadwear_miles_entered === 'number' ? row.treadwear_miles_entered : null,
    provenance: asProvenance(row.provenance),
  };
}

export function tireRotationFromRow(row: TireRotationRow): TireRotation {
  return {
    id: row.id,
    setId: row.set_id,
    rotatedOn: row.rotated_on,
    odometer: row.odometer,
    provenance: asProvenance(row.provenance),
  };
}
