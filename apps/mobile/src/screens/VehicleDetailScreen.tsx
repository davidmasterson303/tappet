import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import {
  Platform,
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Text from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiRequest, ApiRequestError } from '../api/client';
import Working from '../components/Working';
import { alsoHoldingBack, holdingBack, type HealthDriver } from '@tappet/core/health-drivers';
import { buildPosition } from '@tappet/core/build-progress';
import { showsModifications } from '@tappet/core/mod-progression';
import { UNKNOWN_TIMING, describeNextService, displayServiceName, localToday, monthsAway } from '@tappet/core/garage-next-service';
import { componentPlainName } from '@tappet/core/recalls';
import { MINDEDNESS_LABELS, leadPhrase, type Mindedness } from '@tappet/core/vehicle-profile';
import { newestFiledAt, openRecalls } from './verdict-inputs';
import { healthVerdict, leadOf } from '@tappet/core/health-claims';
import { TIRE_COPY, sinceLabel, tireReading, tireRotationFromRow, tireSetFromRow, type TireRotationRow, type TireSetRow } from '@tappet/core/tires';
import AlertBanner from '../components/AlertBanner';
import BandRow from '../components/BandRow';
import Binnacle, { BinnacleCell, BinnacleRow } from '../components/Binnacle';
import Button from '../components/Button';
import ClusterGauge from '../components/ClusterGauge';
import DialChip from '../components/DialChip';
import { HeroBed, HeroEmpty } from '../components/HeroBed';
import PlateStatusLine from '../components/PlateStatusLine';
import CarSheet from '../components/switcher/CarSheet';
import CarSwitch from '../components/switcher/CarSwitch';
import { useCarSet } from '../components/switcher/car-set';
import { PushPrimer } from '../notifications/PushPrimer';
import { usePushPrimer } from '../notifications/usePushPrimer';
import Icon from '../components/Icon';
import type { PlateStatus } from '@tappet/core/plates';
import { type HealthReading } from '../components/HealthHistory';
import StatStrip, { type Stat } from '../components/StatStrip';
import SectionHeader from '../components/SectionHeader';
import {
  HERO_DIM_MAX,
  HERO_DIM_REST,
  HERO_DIM_SPAN,
  HERO_IMAGE_BLEED,
  HERO_NAV_FADE_SPAN,
  HERO_NAV_FADE_START,
  HERO_PARALLAX_RATE,
  HERO_SCALE_GAIN,
  HERO_SHEET_OVERLAP,
  HERO_TITLE_FADE_SPAN,
  detailHeroHeight,
  heroBands,
  navFadeStartFor,
  sheetMinHeight,
} from '../theme/hero-motion';
import Svg, { Line, Path } from 'react-native-svg';
import { TABULAR, border, brand, cut, hero, plinth, radius, space, status, surface, text, type } from '../theme';
import { cornerCovers } from '../components/CutSurface';
import { bandForReading, healthBandHex } from '@tappet/core/health-band';
import type { ResearchObservation } from '@tappet/core/research-milestones';
import ResearchLog from '../components/ResearchLog';
import Seat from '../components/Seat';
import { useResearchRunner } from '../components/useResearchRunner';
import { monoFace } from '../theme/fonts';

/*
  ⚠ `PHOTO_HERO = 196` is gone. The hero is no longer a band with a number on
  it — `detailHeroHeight` clamps 62% of the display, and `heroBands` decides
  which of the two layouts that height gets. See `theme/hero-motion.ts`.
*/

/**
 * Phase 3.2, second half — the detail behind a garage row.
 *
 * The list has existed since 1 Aug and its rows were not tappable, so this is
 * the half of 3.2 that was never built rather than a new idea.
 *
 * ── One request, and no photograph ──────────────────────────────────────────
 *
 * `GET /api/v1/load-vehicle?vehicleId=…` returns the vehicle, its knowledge
 * base, the computed health drivers and the score history in one round trip —
 * already stripped of `custom_image_url` and carrying a signed `photo_url`.
 *
 * ── The photograph, which this screen used to decline to draw ───────────────
 *
 * It did, and the reason was sound at the time: the signed URL points at the
 * stored original, the one real photo on this account is a 2.3 MB legacy upload
 * that never decodes on a device, and repeating the garage card's timeout
 * machinery here would have doubled a net rather than removed the need for one.
 *
 * All three parts of that changed on 15 Aug. The net is now **one component** —
 * `VehiclePlate` owns the timeout, the two exits from loading and the fallback,
 * so the hero reuses it rather than copying it. And the plate is no longer a
 * dead end: `/api/v1/upload-photo` means a car that falls back to it can be
 * given a picture from this screen.
 * `GarageScreen`'s `PHOTO_TIMEOUT_MS` docblock carries the full measurement.
 *
 * ── States, and which ones are not errors ───────────────────────────────────
 *
 * Loading, loaded, and the two that get skipped. **401** is not an error box:
 * `App.tsx` swaps to sign-in the moment the session clears, so this reports it
 * plainly and calls `onSignOut`. **404** is its own state and not a crash — a
 * vehicle deleted on the web while this screen sat open is an ordinary race,
 * and the honest answer is that it is gone, with a way back.
 *
 * ── Why the shared health band, again ───────────────────────────────────────
 *
 * Same reasoning as the garage: `@tappet/core/health-band` holds the
 * thresholds and the wording, the web dashboard reads it, and a local copy of
 * "80 is good" drifts silently. This screen and the row it came from must
 * agree, and the only way to guarantee that is to not have a second opinion.
 */

interface HealthSummary {
  health_score?: number | null;
  summary?: string | null;
  red_flags?: unknown[] | null;
  /**
   * When this reading was taken. Added 23 Aug alongside `healthVerdict` — the
   * screen cannot refuse an out-of-date sentence without knowing its date.
   */
  last_generated?: string | null;
}

interface Vehicle {
  id: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  color?: string | null;
  current_mileage?: number | null;
  avg_miles_per_month?: number | null;
  /** When the odometer was last set — the reading's as-of (22 Sep). */
  last_mileage_update_date?: string | null;
  vehicle_status?: string | null;
  /*
    The owner's actual answer, not `performance_goal`.

    This screen rendered `performance_goal` until 7 Aug 2026 — a column with a
    `NOT NULL DEFAULT 'moderate'` that **no screen has ever written**. So the
    phone displayed "Moderate" for every car regardless of what its owner
    picked in onboarding, while their real choice sat in a column the mobile
    API did not select. `app/actions.ts:2062` records the same column causing
    the same class of bug in the modification analysis.
  */
  performance_mindedness?: string | null;
  ownership_objective?: string | null;
  /**
   * The signed URL, resolved from `custom_image_url` by the route.
   *
   * ⚠ It has been on this payload since `2eb172a` — the roadmap listed it as a
   * missing API field on 15 Aug and it was already there. The screen simply
   * declared it and never drew it.
   */
  photo_url?: string | null;
  /**
   * Which kind of picture `photo_url` is — `owner`, `catalog` or `plate` —
   * served since 13 Sep. Absent from an older API: then any `photo_url` is
   * read as the owner's, which is what it always was before the plates.
   */
  photo_kind?: 'owner' | 'catalog' | 'plate' | null;
  /** The generation plate's status beside the photo — `null` is nothing to say. See `PlateStatusLine`. */
  plate_status?: PlateStatus | null;
  /* Both embedded shapes accepted, for the reason GarageScreen sets out. */
  vehicle_health_summary?: HealthSummary | HealthSummary[] | null;
  nhtsa_data?:
    | { recalls?: unknown[] | null; lookup_status?: string | null }
    | { recalls?: unknown[] | null; lookup_status?: string | null }[]
    | null;
  /**
   * The stored next-service columns, written by the nightly sweep.
   *
   * ⚠ These are **applied in the live database** and were simply not in
   * `VEHICLE_COLUMNS` until 23 Aug, so the schedule row rendered its unknown
   * branch on every car in the product. `GarageBay` still carried a docblock
   * saying the migration had not been applied. §1: verify against the artefact.
   *
   * Still optional at the type level, because the sweep has not written a row
   * for every car — an absent value is "we have not worked it out", which
   * `describeNextService` words rather than hides.
   */
  next_service_label?: string | null;
  next_service_at_miles?: number | null;
  next_service_due_on?: string | null;
  /**
   * Campaigns this owner has marked repaired, embedded by the route.
   *
   * ⚠ It rides on the vehicle rather than coming from `/api/v1/recalls`, and
   * that is a deliberate simplification of the first draft. A separate request
   * meant a fourth round trip **and** a fourth failure mode — a "could not
   * check the marks" state this screen had to word and could not avoid. The
   * embed costs nothing extra: `vehicle-detail-not-poorer.test.ts` requires
   * this route to ask for everything the garage list asks for, so the join was
   * already being paid for.
   */
  recall_actions?: Array<{ campaign_number?: string | null }> | null;
}

/**
 * The wishlist row: how many, and what they add up to.
 *
 * ⚠ **The total and the count must come from the same array**, and that is a
 * rule with a history — `specs/native-wishlist.spec.html` records this system
 * shipping "Wishlist · 4 items" over three rows, and says why it matters: *"a
 * count that disagrees with what is on screen is the fastest way to lose a
 * user's trust in every other number."*
 *
 * Parts and labour are summed because that is what the wishlist screen totals.
 * A row with neither contributes 0 to the money and 1 to the count, which is
 * honest: it is a real item whose price nobody has estimated yet.
 */
function summariseWishlist(
  items: Array<Record<string, unknown>> | undefined
): { count: number; total: number } | null {
  if (!Array.isArray(items)) return null;

  const money = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  return {
    count: items.length,
    total: items.reduce(
      (sum, item) => sum + money(item.estimated_cost_parts) + money(item.estimated_cost_labor),
      0
    ),
  };
}

/** The no-motion counterpart of `Seat`: the same children, no wrapper. */
function PlainLanding({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

const miles = new Intl.NumberFormat('en-US');

/**
 * Whole dollars, for the wishlist total on the hub row.
 *
 * No cents: these are estimates built from estimates, and rendering
 * "$4,980.00" against a number the product itself calls a range would be
 * inventing two digits of precision. `advice-range.ts` carries the standing
 * argument; this is the smallest place it applies.
 */
const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** `daily_driver` → `Daily Driver`. Same reason as the garage: it shipped raw once. */
function humanise(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The slice of the knowledge base this screen reads.
 *
 * Deliberately not the whole dossier's type. `load-vehicle` returns
 * `vehicle_knowledge_base` with `select('*')`, and declaring every column here
 * would make the screen's contract a mirror of that table — the exact problem
 * `VEHICLE_COLUMNS` was written to stop on the route side.
 */
interface Knowledge {
  common_mods?: Array<{ name: string; purpose?: string; difficulty?: string }> | null;
  /*
    The research log's inputs (20 Sep): what the dossier has, in the log's
    own words — `research-milestones.ts` quotes these and nothing else.
  */
  research_status?: string | null;
  engine_type?: string | null;
  transmission_type?: string | null;
  known_issues?: unknown;
  maintenance_schedule?: unknown;
}

/** The generation plate's row, for the log's first line. `null` is no plate. */
interface Plate {
  generation?: string | null;
  year_from?: number | null;
  year_to?: number | null;
}

/**
 * The tire row's reading, from the route's rows — through core, so the hub and
 * the tire screen cannot count differently.
 */
function summariseTires(
  body: { set?: TireSetRow | null; rotations?: TireRotationRow[] },
  vehicle: { current_mileage?: number | null }
): NonNullable<HubCounts['tires']> {
  if (!body.set) return { absent: true, since: null, basis: null, overrun: false, toNext: null };
  const odometer =
    typeof vehicle.current_mileage === 'number' && vehicle.current_mileage > 0 ? vehicle.current_mileage : null;
  const reading = tireReading(
    tireSetFromRow(body.set),
    (body.rotations ?? []).map(tireRotationFromRow),
    odometer
  );
  /*
    22 Sep · `toNext`: the miles left before the owner's interval, where one
    was entered and there is something to count from — a countdown, as NEXT
    SERVICE counts (value V5: *"TIRES counts up while NEXT SERVICE counts
    down; '500 mi since' needs the owner to remember their interval"*). Null
    where either is missing; `since` still says what it can.
  */
  const toNext = reading.interval && reading.since !== null ? reading.interval.miles - reading.since : null;
  return { absent: false, since: reading.since, basis: reading.sinceBasis, overrun: reading.overrun, toNext };
}

/**
 * What the hub's rows say is behind them.
 *
 * ── ⚠ Every field is nullable, and `null` means "we could not ask" ──────────
 *
 * Not zero. `BandRow` renders nothing for a missing count and *something* for a
 * present one, and the difference is a claim: "Wishlist" with nothing beside it
 * is a place, "Wishlist 0" says the place is empty. A failed request must never
 * be able to make the second statement.
 *
 * The three come from three separate endpoints alongside the vehicle itself,
 * fetched with `allSettled`, so any one of them failing costs its own count and
 * nothing else. A hub that will not draw because a wishlist total timed out is
 * a worse screen than one with a row that does not carry a number.
 */
interface HubCounts {
  services: number | null;
  /**
   * When the most recent service record was **filed**, ISO, or `null` if the
   * count could not be read.
   *
   * ⚠ Filed rather than performed. It exists to date the health verdict against
   * what it could have seen, and a visit dated 2 Aug that was scanned on the
   * 6th was invisible to a summary generated on the 4th. `healthVerdict`
   * carries the full argument.
   */
  servicesFiledAt: string | null;
  wishlist: { count: number; total: number } | null;
  /**
   * The tire set's reading for its row (20 Sep): miles since the last
   * rotation (or the install), what that counts from, and whether the set is
   * past the interval its owner entered. `null` when the request failed or
   * the tables are not applied yet; `since: null` when there is a set with
   * nothing to count from; `absent` when the car has no set on record.
   */
  tires: { absent: boolean; since: number | null; basis: 'rotation' | 'install' | null; overrun: boolean; toNext: number | null } | null;
}

/** One of the owner's answers, as the WHAT YOU TOLD US section rows it: a label and its value in the numeral column. */
interface Answer {
  label: string;
  /** The value in the numeral column; `null` is a question not yet answered, shown as a prompt (22 Sep). */
  value: string | null;
  /** The whole answer for the reader, where the column shows its lead phrase. */
  spoken?: string;
  /** What answering buys, shown under the label while the question is open. */
  buys?: string;
}

type State =
  | { status: 'loading' }
  | {
      status: 'ok';
      vehicle: Vehicle;
      drivers: HealthDriver[];
      history: HealthReading[];
      knowledge: Knowledge | null;
      plate: Plate | null;
      counts: HubCounts;
    }
  | { status: 'missing' }
  | { status: 'error'; message: string; unauthorized: boolean };

/**
 * The HEALTH cell's dial, in points. Above `DIAL_MIN` (88) so it is an
 * instrument and not a row; the card's numeral is 60/172 of this — 42pt,
 * a hair under the plate numeral the cell used to print bare (21 Sep).
 *
 * The ink a reading takes — off-white unless the ramp calls it a warning —
 * is the gauge's own rule now (`arcInk`), named against the band rather than
 * a numeric threshold so the boundary stays owned by `@tappet/core/health-band`.
 * `WARNING_INK` lived here for the bare numeral and went with it.
 */
const CELL_DIAL = 120;

/**
 * "3 wk ago" / "5 mo ago" / "today" — how old a reading is, for an eyebrow.
 * `null` where the date is missing or unreadable: an age nobody can state is
 * not "just now".
 */
export function agoLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  const days = daysSince(iso, now);
  if (days === null) return null;
  if (days < 1) return 'today';
  if (days < 7) return `${days} d ago`;
  if (days < 60) return `${Math.round(days / 7)} wk ago`;
  if (days < 365) return `${Math.round(days / 30.4)} mo ago`;
  return `${Math.round(days / 365)} yr ago`;
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/**
 * A reading older than this asks to be set again.
 *
 * ── 22 Sep · the countdown is measured from a reading, never from a guess ──
 *
 * "in 4,500 mi" is counted from 168,400, set four weeks ago; at 500 miles a
 * month the truth is nearer 4,000. The value lens asked whether the countdown
 * should age with the odometer. David's ruling, of three: never estimate a
 * reading (§10 — an odometer the app invented would be a reading of nothing),
 * keep counting from the real one, and **once it is over a month old, make
 * its note the ask**: "6 wk ago · update ›", the plate's door landing on the
 * odometer field. A month, because the countdown's other input is the
 * owner's miles *a month*: a reading younger than the unit it is measured
 * against is not stale by that measure.
 */
export const STALE_READING_DAYS = 31;

export function readingIsStale(iso: string | null | undefined, now: Date = new Date()): boolean {
  const days = daysSince(iso, now);
  return days !== null && days > STALE_READING_DAYS;
}

/**
 * Whether the picture on the hero is the owner's photograph.
 *
 * ── 13 Sep · a plate is not a photograph ─────────────────────────────────
 *
 * Since the plates went live, a car nobody has photographed arrives with
 * `photo_url` set to its generation plate — and this screen read any
 * `photo_url` as the owner's: it graded the plate a second time and offered
 * CHANGE PHOTO over a car with no photo to change (found by the hub loop,
 * drift §6.18). The route now says which kind of picture it sent, and THIS
 * CAR reads it to know whether there is a photograph to remove. An older API
 * sends no kind, and then a `photo_url` is read as it always was. (Until 22
 * Sep the owner's picture also took a house grade here; it is drawn as shot
 * now — David's ruling, `BayRoom` carries the words.)
 */
export function isOwnerPhoto(vehicle: {
  photo_url?: string | null;
  photo_kind?: 'owner' | 'catalog' | 'plate' | null;
}): boolean {
  if (!vehicle.photo_url) return false;
  return vehicle.photo_kind === undefined || vehicle.photo_kind === null || vehicle.photo_kind === 'owner';
}

/**
 * How long the outgoing car's plate takes to leave (22 Sep, round 2).
 *
 * 300ms is the critic's figure and the right one: shorter reads as a cut,
 * longer reads as a dissolve — a transition the owner waits through rather
 * than one that carries them. It is the plate's alone; nothing else on the
 * page animates on a switch, because one moving instrument is the rule the
 * whole system is built on.
 */
const SWITCH_CROSSFADE = 300;

export function VehicleDetailScreen({
  vehicleId,
  title,
  onBack,
  onSignOut,
  onScanInvoice,
  onViewRecalls,
  onOpenWishlist,
  onOpenHistory,
  onOpenHealth,
  onOpenMilestone,
  onOpenProfile,
  onOpenTires,
  onSwitchCar,
  onAddCar,
  fromPhoto,
}: {
  vehicleId: string;
  /** The car's name from the row that opened this, so the nav is right during the fetch. */
  title?: string;
  onBack: () => void;
  onSignOut: () => void;
  /*
    3.3's entry point, as a callback for the same reason `onOpenVehicle` is one
    on the garage: this screen does not know react-navigation exists, and the
    navigator is the only file that has to change if that stops being true.
    (`onAskAdvisor` was its twin until 22 Sep; the ADVISOR tab is the way to
    the advisor from the hub now.)
  */
  onScanInvoice: () => void;
  onViewRecalls: () => void;
  onOpenWishlist: () => void;
  /*
    ── The three routes this screen gained on 23 Aug ────────────────────────

    Callbacks, like every other destination here, for the reason the header
    gives: this screen does not know react-navigation exists.

    `onOpenHealth` is where the health instrument went, and `onOpenWishlist`
    now carries the build with it — see the hub's own note on R15. They were
    cards on this screen — a dial with three drivers and a chart, and a second
    dial with a five-rung ladder — and between them they were most of why the
    IA read as cluttered. `onOpenMilestone` was already a route and simply had
    no way in from here; it took a notification to reach it.
  */
  onOpenHealth: () => void;
  onOpenMilestone: () => void;
  /** The owner's four onboarding answers, editable. */
  onOpenProfile: () => void;
  /**
   * The tire set — the fourth leaf, v1.1 (20 Sep). Optional so the hub's
   * suites, which predate it, still mount; the navigator always passes it.
   */
  onOpenTires?: () => void;
  /** Track 5.6 follow-on: the phone could write service history and not read it. */
  onOpenHistory: () => void;
  /**
   * Switching which car the app is about, and adding one — the two things the
   * garage tab did, now that there is no garage tab (23 Sep).
   *
   * ⚠ Optional only for the hub's older suites, which mount this screen
   * without a navigator. The navigator always passes both; a build that
   * reaches a multi-car account without them has no way to change cars.
   */
  onSwitchCar?: (vehicleId: string, title: string, fromPhoto?: string | null) => void;
  /** The plate of the car this page was switched *from*, for the crossfade. */
  fromPhoto?: string;
  onAddCar?: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  /*
    ── 23 Sep · the set, because this screen is the only way to it ────────────

    Three answers to "how does an owner change which car the app is about"
    were built as real screens on real rows, a design critic picked one blind
    and the loop ran it to 9/10 (`design-loop/mobile-ios/concepts/switcher/`).
    David shipped it: *"i like this much better, ship it"*. The garage tab is
    gone, so this is not an enhancement — without it a three-car account can
    reach exactly one car.

    ⚠ **It was behind `EXPO_PUBLIC_CAR_FIRST` and the flag was the defect.**
    The navigator dropped the garage tab unconditionally while this stayed
    gated, so a release build had neither the tab nor the switcher — every
    suite green, because a flag that is off in production is off in the
    tests too. CLAUDE.md §6's shape exactly: no error, no failure, one car.
  */
  const { cars } = useCarSet(true);
  /** More than one car is the only condition the switcher has. */
  const manyCars = cars.length > 1;
  /*
    ── 23 Sep · the push primer is asked from here ──────────────────────────

    This is the first screen an owner sees with a car on it, so it is where
    "alerts about this car" has something to be about. The count is at least
    the car on this page even before the set has loaded; the set only ever
    raises it, and the rule needs one. `usePushPrimer` carries the history:
    the primer lost its host when the garage left the navigator, and a fresh
    install could never be asked.
  */
  const primer = usePushPrimer(state.status === 'ok' ? Math.max(1, cars.length) : null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /*
    Round 2 · the crossfade's driver. Starts opaque so the outgoing plate is
    on screen from the first frame, and runs once on mount; `useNativeDriver`
    because opacity is a compositor property and this is the one moment the
    page is also laying itself out.
  */
  const switchFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    /*
      ⚠ On the car **landing**, not on mount — and the recording is what
      found it. Round 2 started the fade in a mount effect, and a frame walk
      of the switch (`scripts/frame-rows`, a 25fps capture decoded with
      `AVAssetReader`) showed the crossfade never appearing: the page mounts
      in its *loading* branch, which returns before the hero exists, so by
      the time the plate was on screen the 300ms had already run out. What
      the owner actually saw was sheet → graphite → new car, which is the
      flash the transition exists to remove.
    */
    if (!fromPhoto || state.status !== 'ok') return;
    const run = Animated.timing(switchFade, {
      toValue: 0,
      duration: SWITCH_CROSSFADE,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    run.start();
    /*
      ⚠ One light haptic as the new car lands, and B3's rule is the reason
      it is here rather than on the tap: the brief gives the *instrument* the
      haptic — "draws in with one haptic" — so it belongs to the arrival, not
      to the press. `Light`, not the scan's `Heavy`: a capture is a thing
      that happened to the world, a switch is a thing that happened to the
      screen.
    */
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    return () => run.stop();
  }, [fromPhoto, state.status, switchFade]);

  /*
    ⚠ Round 2 · the plate's type leaves with the sheet's rise. The critic's
    cut: *"the plate's type under the scrim — eyebrow, name, chevron, stat
    strip, THIS CAR — is a dim duplicate of row 01 sitting above it … the
    stated intent was the photograph behind the scrim, and the type is not
    the photograph."* Right, and it is the same sentence twice at two
    brightnesses, which is worse than either. So the block fades and the
    photograph stays: what is behind the sheet is the car, not a label for it.
  */
  const plateType = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const run = Animated.timing(plateType, {
      toValue: sheetOpen ? 0 : 1,
      duration: SWITCH_CROSSFADE,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [plateType, sheetOpen]);

  /* Switching is the navigator's — the hub is one car's page and stays that. */
  const switchCar = useCallback(
    (id: string) => {
      setSheetOpen(false);
      const picked = cars.find((car) => car.id === id);
      onSwitchCar?.(id, picked?.name ?? '', outgoingPhoto.current);
    },
    [cars, onSwitchCar]
  );
  /*
    The plate this page is showing, in a ref so `switchCar` can hand it to
    the page that replaces it without taking the loaded state as a dependency.
  */
  const outgoingPhoto = useRef<string | null>(null);
  useEffect(() => {
    outgoingPhoto.current = state.status === 'ok' ? (state.vehicle.photo_url ?? null) : null;
  }, [state]);
  /*
    The scroll view's own height, for the sheet's floor. The window stood in
    for it in round 42 and the tab bar's 83pt was counted into the tail twice;
    `null` until the first layout, when the window is the honest stand-in.
  */
  const [viewport, setViewport] = useState<number | null>(null);
  /*
    The identity block's measured height, for `navFadeStartFor`: the nav
    title may arrive once the sheet has covered the block, and the block's
    height is the one term of that geometry no constant knows. `null` until
    the first layout; the constant's own start stands in.
  */
  const [identityHeight, setIdentityHeight] = useState<number | null>(null);

  /*
    Two verbs, one banner. The headline names which of them failed — "not
    saved" and "not removed" are different instructions to the owner, and a
    banner that said "that photo failed" would leave them checking whether the
    picture is now on the car or off it.
  */

  /*
    ── The scroll driver ─────────────────────────────────────────────────────

    One `Animated.Value`, one `Animated.event`, `useNativeDriver: true`, and an
    `interpolate` for every derived value. Everything in this feature is
    **scroll-linked** — there is no `Animated.timing` anywhere in it, because
    the thumb is the clock.

    ⚠ Every interpolation below must feed a `transform` or an `opacity`. Those
    are exactly what the native driver supports; a `height`, a `top` or a colour
    silently forces the JS driver and the whole hero starts dropping frames
    under a finger. `VehicleDetailScreen.test.tsx` asserts it, because it is not
    visible in a screenshot and not visible on a fast simulator either.
  */
  const scrollY = useRef(new Animated.Value(0)).current;

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const heroH = detailHeroHeight(windowHeight);
  const bands = heroBands(heroH);

  const load = useCallback(
    /*
      `quiet` (20 Sep): the research runner re-reads this screen every few
      seconds while a job runs, and neither the opening dial nor the
      pull-to-refresh indicator belongs on a poll — the log is the wait's
      instrument, and a second one flashing above it would be noise.
    */
    async (isRefresh = false, quiet = false, lean = false) => {
      /*
        `quiet`: no loading UI — the focus refetch and every reload after a
        write (20 Sep; the opening dial over content the screen already had
        was a spinner on every back-navigation). `lean`: the vehicle alone,
        for the research runner's poll — three requests a poll was 72 a
        minute against a limiter of 60. Lean is always quiet.
      */
      if (quiet || lean) {
        // nothing to show: the rows arriving is the whole feedback
      } else if (isRefresh) setRefreshing(true);
      else setState({ status: 'loading' });

      try {
        /*
          `encodeURIComponent` on an id that is always a uuid today. It is not
          defensive clutter: the id arrives as a navigation param, and the day
          something else routes here with a value that is not a uuid, a raw
          interpolation is a query-string injection rather than a 400.
        */
        /*
          ── Four requests, one of which may fail the screen ──────────────────

          The vehicle is the screen. The other three fill in the numbers beside
          the hub's rows, and `allSettled` is what keeps them subordinate: a
          wishlist total that times out costs the wishlist row its count and
          nothing else. `all` would reject the set and blank a car because a
          count was slow, which is the inversion this screen exists to avoid.

          They run together rather than in sequence, so the wait is the slowest
          one rather than the sum of four.
        */
        /*
          ⚠ A quiet reload asks for the vehicle alone (20 Sep). The research
          runner polls every 2.5 s, and three requests a poll is 72 a minute
          against a `default` limiter of 60 per client — so on the first car
          the log ran for end to end, the score request arrived at the ceiling
          and the last line read "Too many requests. Please slow down." The
          counts beside the hub rows do not change while research runs; the
          poll wants the rows the log reads, which all ride on `load-vehicle`.
        */
        const [vehicleResult, servicesResult, wishlistResult, tiresResult] = await Promise.allSettled([
          apiRequest<{
            vehicle?: Vehicle;
            health_drivers?: HealthDriver[];
            health_history?: HealthReading[];
            knowledge?: Knowledge | null;
            plate?: Plate | null;
          }>(`/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`),
          lean
            ? Promise.reject(new Error('lean'))
            : apiRequest<{ maintenanceLineItems?: Array<{ created_at?: string | null }> }>(
                `/load-maintenance-data?vehicleId=${encodeURIComponent(vehicleId)}`
              ),
          lean
            ? Promise.reject(new Error('lean'))
            : apiRequest<{ wishlistItems?: Array<Record<string, unknown>> }>(
                `/wishlist?vehicleId=${encodeURIComponent(vehicleId)}`
              ),
          /* The tire set, for its row — subordinate like the other two counts. */
          lean
            ? Promise.reject(new Error('lean'))
            : apiRequest<{ set?: TireSetRow | null; rotations?: TireRotationRow[] }>(
                `/tires?vehicleId=${encodeURIComponent(vehicleId)}`
              ),
        ]);

        if (vehicleResult.status === 'rejected') throw vehicleResult.reason;
        const body = vehicleResult.value;

        if (!body.vehicle) {
          setState({ status: 'missing' });
          return;
        }

        const filedItems =
          servicesResult.status === 'fulfilled' &&
          Array.isArray(servicesResult.value.maintenanceLineItems)
            ? servicesResult.value.maintenanceLineItems
            : null;

        const counts: HubCounts = {
          services: filedItems === null ? null : filedItems.length,
          servicesFiledAt: filedItems === null ? null : newestFiledAt(filedItems),
          wishlist:
            wishlistResult.status === 'fulfilled'
              ? summariseWishlist(wishlistResult.value.wishlistItems)
              : null,
          tires: tiresResult.status === 'fulfilled' ? summariseTires(tiresResult.value, body.vehicle) : null,
        };
        /*
          `health_drivers` is top level rather than folded into `vehicle`,
          because they are derived and the vehicle object is the row — mixing
          them would let a caller believe it could write one back.

          Defaulted to empty rather than assumed present: a deployment where the
          route predates this field should render a health card without drivers,
          not a screen that throws.
        */
        const next = {
          status: 'ok' as const,
          vehicle: body.vehicle,
          drivers: Array.isArray(body.health_drivers) ? body.health_drivers : [],
          history: Array.isArray(body.health_history) ? body.health_history : [],
          knowledge: body.knowledge ?? null,
          plate: body.plate ?? null,
        };
        // A lean reload did not ask for the counts: keep the last full read's.
        setState((previous) => ({
          ...next,
          counts: lean && previous.status === 'ok' ? previous.counts : counts,
        }));
      } catch (error) {
        const apiError = error as ApiRequestError;
        // 404 is a state, not a failure — see the header.
        if (apiError.status === 404) {
          setState({ status: 'missing' });
          return;
        }
        // A quiet refetch that fails keeps what is on screen; the next open reloads.
        if (quiet || lean) return;
        setState({
          status: 'error',
          message: apiError.message,
          unauthorized: apiError.status === 401,
        });
      } finally {
        if (!quiet && !lean) setRefreshing(false);
      }
    },
    [vehicleId],
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

  /*
    ── The research, narrated (20 Sep) ─────────────────────────────────────

    A car whose knowledge base is still `pending` is researched from here —
    `useResearchRunner` posts the trigger the phone never had, polls this
    screen quietly, asks for the score once the dossier lands, and stops on
    a result or a stated failure. What it shows is assembled by
    `@tappet/core/research-milestones` from the rows below and nothing else,
    which is why the log cannot claim work that has not happened. The
    observation is rebuilt on every render; it is a handful of field reads.
  */
  const observation: ResearchObservation | null =
    state.status === 'ok'
      ? {
          vehicle: {
            year: state.vehicle.year ?? 0,
            make: state.vehicle.make ?? '',
            model: state.vehicle.model ?? '',
            current_mileage: state.vehicle.current_mileage ?? null,
            next_service_label: state.vehicle.next_service_label ?? null,
            next_service_at_miles: state.vehicle.next_service_at_miles ?? null,
          },
          plate: state.plate,
          knowledge: state.knowledge,
          nhtsa: first(state.vehicle.nhtsa_data) ?? null,
          health: first(state.vehicle.vehicle_health_summary) ?? null,
          /*
            The verdict's own question, asked here so the runner can re-read
            a score the records have overtaken (QE 1.5 / 2.15): an invoice
            filed or a job marked done stamps the score stale, and until
            20 Sep the phone showed the caveat forever.
          */
          scoreStale:
            healthVerdict({
              summary: first(state.vehicle.vehicle_health_summary)?.summary,
              generatedAt: first(state.vehicle.vehicle_health_summary)?.last_generated,
              serviceCount: state.counts.services,
              newestFiledAt: state.counts.servicesFiledAt,
              openRecalls: null,
            }).state === 'stale',
        }
      : null;
  const leanReload = useCallback(() => load(false, true, true), [load]);
  const research = useResearchRunner({ vehicleId, observation, reload: leanReload });

  /*
    ── 22 Sep · no photo control on the hub ─────────────────────────────────

    Add, change and remove lived here — the sheet over the photograph, the
    optimistic plate, the revert — because the control stood in the nav row
    over the plate. The hub's three lenses cut it from there twice: *"ADD
    PHOTO at rest — the plate is already there and THIS CAR holds the photo;
    an act slot spent on decoration"* (UX), *"a second door for a one-time
    act occupies the hero's only other slot, on both cars, forever"* (value).
    The photograph is changed on THIS CAR now, behind the plate's own door
    (`VehicleProfileScreen`), and this screen refetches on focus.
  */

  if (state.status === 'loading') {
    /*
      ── 12 Sep · the delayed full instrument, not a shaped skeleton ─────────

      This drew a hero block and two card skeletons "shaped like the dossier
      that is coming" — but the dossier is a plate and a table now, not cards,
      and a placeholder whose shape does not match what replaces it produces
      the jump it existed to prevent. The rule the phone joins: a page-level
      load takes the full wait instrument with `delay`, invisible for 350ms so
      a hold that resolves sooner never paints. This is the densest screen in
      the app and the one a recall notification opens, so it is the most
      likely to be met cold — and the one whose wait most needs to say what it
      is doing rather than pretend to be content.
    */
    /*
      ⚠ Round 3 · the switch's own wait keeps the car on screen. A page
      opened cold gets the wait instrument on graphite, which is right —
      there is nothing to show yet. A page opened by **switching** has
      something: the plate of the car you just left, handed over with the
      navigation. Drawing it here is what makes the gap between two cars a
      transition rather than a blink, and it costs nothing — the image is
      already decoded, it was on screen a frame ago.
    */
    return (
      <View style={styles.switchWait}>
        {fromPhoto ? (
          <Image
            source={{ uri: fromPhoto }}
            style={[styles.heroImage, { height: heroH }]}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
        <ScrollView contentContainerStyle={styles.body}>
          <Working delay line="Opening this car" />
        </ScrollView>
      </View>
    );
  }

  if (state.status === 'missing') {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorTitle}>This car is no longer here</Text>
        <Text style={styles.errorBody}>It may have been removed from another device.</Text>
        {/*
          "Open another car", since 23 Sep: `onBack` drops this root to
          `FirstCar`, which opens whichever car is left or offers to add one.
          It said "Back to garage" for a day after the garage was gone — a
          word for a place that did not exist, on the one state with no tab
          bar's help.
        */}
        <Button
          label="Open another car"
          variant="outline"
          onPress={onBack}
          style={styles.stateAction}
        />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorTitle}>
          {state.unauthorized ? 'Your session ended' : 'Could not load this vehicle'}
        </Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Button
          label={state.unauthorized ? 'Sign in again' : 'Try again'}
          variant="outline"
          onPress={() => (state.unauthorized ? onSignOut() : void load())}
          style={styles.stateAction}
        />
      </View>
    );
  }

  const { vehicle, counts, drivers } = state;

  /*
    The bay fills in (Pattern B, 20 Sep): while the research log is on this
    screen, a reading that arrives seats into its cell — `Seat`, a short
    ease-out to a definite stop. On an ordinary open nothing "arrives"; the
    values are rendered plain, and the wrapper is a fragment.
  */
  const Landing = research.visible ? Seat : PlainLanding;

  const health = first(vehicle.vehicle_health_summary);
  const score = typeof health?.health_score === 'number' ? health.health_score : null;
  /*
    ⚠ 22 Sep · banded against the file, not the score alone. The F-PACE's one
    record in 69,573 miles read 55 and said NEEDS ATTENTION in sodium — a
    verdict on the car, where what the app has is almost nothing to judge from
    (David's ruling; `bandForReading` in core carries it). `counts.services`
    is `null` while the count has not arrived, and then the ordinary band
    stands: a missing count may not suppress a warning.
  */
  const band = score === null ? null : bandForReading(score, counts.services);

  /*
    ── The identity line, which is where the odometer belongs ────────────────

    The spec writes it "61,240 mi · xDrive". Mileage first because it is the
    number an owner checks, and it spent this screen's whole life five rows down
    in a "Details" card under two instruments.
  */
  /*
    ⚠ 6 Sep · B2: cells, not a joined sentence. This was
    `[mileage, trim, status].join(' · ')` — three values set as prose in the body
    sans. `StatStrip` carries the reasoning; what matters here is that the
    **order is shared with `GarageScreen`**, which built its own join in the
    opposite order until the critique noticed the two screens disagreed.

    Empty cells are dropped rather than dashed: a missing value is "we cannot
    say", not a reading of nothing.
  */
  /*
    22 Sep · the odometer carries its as-of (value V1: *"every countdown is
    only as true as 168,400, and nothing says when that was set"*). A note
    under the value says how long ago — "3 wk ago ›" — where the date is
    known (an eyebrow "MILEAGE · 3 WK AGO" truncated in a third of the
    strip). The plate is the door to setting it (`onOpenProfile`), and THIS
    CAR › under the strip is its one mark — round 5's IA and value lenses
    cut the note's own chevron: two handles on one door.
  */
  const mileageAge = agoLabel(vehicle.last_mileage_update_date);
  /*
    Over a month old, the note wears the door's mark (`readingIsStale`).

    ⚠ The mark is the whole ask, and that is a measurement rather than a
    preference. It read "5 wk ago · update ›" for one build: the cell is a
    third of the strip, the mono label is 12pt, and the word truncated to a
    middot and an ellipsis — "5 WK AGO ·… ›", which says less than the age
    alone did. The chevron is this app's word for "this opens" everywhere
    else; the door it opens is named in full to a screen reader, and THIS CAR
    › under the strip says it on screen.
  */
  const mileageStale = readingIsStale(vehicle.last_mileage_update_date);
  const stats: Stat[] = (
    [
      typeof vehicle.current_mileage === 'number'
        ? {
            label: 'Mileage',
            value: `${miles.format(vehicle.current_mileage)} mi`,
            note: mileageAge ?? undefined,
            door: mileageStale,
          }
        : null,
      vehicle.trim ? { label: 'Trim', value: vehicle.trim } : null,
      /*
        USE is the owner's answer, and it lives on the strip rather than in
        WHAT YOU TOLD US so it is printed once. Unanswered, the cell used to
        drop, which hid the question on the F-PACE (IA, round 6). It is the
        ask now, in the absent ink; the plate is the door (David, 22 Sep).
      */
      vehicle.vehicle_status
        ? { label: 'Use', value: humanise(vehicle.vehicle_status) }
        : { label: 'Use', value: 'Tell us', muted: true },
    ] as Array<Stat | null>
  ).filter((cell): cell is Stat => cell !== null);

  /*
    Open recalls, which is not the same number as recalls — `verdict-inputs.ts`
    carries the rule, shared with the Health screen since 12 Sep so the two
    screens count the same campaigns.
  */
  const open = openRecalls(first(vehicle.nhtsa_data)?.recalls, vehicle.recall_actions);
  const openRecallCount = open.length;
  /*
    ⚠ Whether NHTSA was asked at all — the route's own rule (`load-vehicle`):
    an absent `recalls` is "never checked", an empty array is "asked and had
    nothing", and only one of those may print a 0. The old page hid its
    recall row at 0 and so said nothing either way (the roadmap carried that
    silence as David's call); the binnacle's cell printed `open.length`,
    which is 0 for both — a `null` dressed as a reading, the defect
    `health-claims.ts` exists to make impossible. Unchecked, the cell
    carries no numeral and says so in its name; checked and clean, it
    prints 0 in the legend's ink.
  */
  const recallsChecked = Array.isArray(first(vehicle.nhtsa_data)?.recalls);

  /*
    The banner names the defect rather than describing itself.

    The spec's line is "One is a fuel pump that can cut power" — a banner that
    says "what it means, and what to do about it" is furniture, and one that
    names the worst open component is information. `component` is NHTSA's own
    short field; the summary would be a paragraph.
  */
  /*
    ── The verdict, and why it is not `health.summary` ───────────────────────

    See `healthVerdict` in `@tappet/core/health-claims` for the defect: this
    screen read "a complete lack of documented maintenance" over a car with five
    filed services, because the stored sentence was written before they arrived
    and nothing on this path recomputes it.

    Computed here because this is the first point at which both of its inputs
    exist — the open recall count is worked out immediately above, and the
    service count came back with the load.
  */
  const verdict = healthVerdict({
    summary: health?.summary,
    generatedAt: health?.last_generated,
    serviceCount: counts.services,
    newestFiledAt: counts.servicesFiledAt,
    openRecalls: openRecallCount,
  });

  /*
    ⚠ **R28 / §6.** It printed `Worst: AIR BAGS:SIDE/WINDOW:HEAD` — NHTSA's
    taxonomy string, in caps, in the product's loudest banner. `componentPlainName`
    with `short` names the system alone, because this is one line carrying a
    component, a severity and an instruction and the qualifiers do not fit in it.

    "Worst:" is gone with it. The banner already sits under a count, so the
    superlative was doing nothing a reader could act on — it now reads as one
    sentence: *"Airbags — free to fix at a franchised dealer."*
  */
  const worstComponent = componentPlainName(open[0]?.component ?? null, { short: true });
  const worstRecall = worstComponent
    ? `${worstComponent} — free to fix at a franchised dealer.`
    : null;

  /*
    ── Next service ──────────────────────────────────────────────────────────

    ⚠ The three `next_service_*` columns reached this payload on 23 Aug, and the
    reason they were absent is worth carrying: they were **applied in the
    database and missing from the route's column list**, so every car in the
    product rendered the honest-unknown branch. `GarageBay`'s docblock said the
    migration had not been applied; the live database said otherwise. §1.

    `describeNextService` is shared with the garage bay so the two cannot word
    the same schedule differently, and `localToday()` is read at render rather
    than held — "overdue since" and "due now" turn on exactly one day.
  */
  const nextService = describeNextService(
    {
      label: vehicle.next_service_label ?? null,
      atMiles: vehicle.next_service_at_miles ?? null,
      dueOn: vehicle.next_service_due_on ?? null,
    },
    vehicle.current_mileage ?? null,
    localToday()
  );

  /*
    ── What each row says is behind it ───────────────────────────────────────

    ⚠ `null` where the count could not be fetched, and `BandRow` renders nothing
    for it. Never "0": a row reading "Wishlist 0" claims the list is empty,
    which is a statement a failed request has not earned. See `HubCounts`.
  */
  /*
    ⚠ The **timing** only, not the service name.

    It read "Engine Oil & Filter Change · in 4,000 mi", which is a sentence in a
    slot sized for a number — it squeezed the row's own label down to "Se…".
    The service is named on the screen this row opens; what belongs here is
    when.
  */
  /*
    The timing, and beside it the owner's own months where they said how far
    they drive (value V2: *"'in 4,500 mi' with no when. The answer — 500 mi
    a month — sits at the foot of the page, unused"*). Only for a distance
    still to go; "overdue by" needs no calendar.
  */
  const serviceDue = (() => {
    if (nextService.kind !== 'known') return UNKNOWN_TIMING;
    const ahead = /^in ([\d,]+) mi$/.exec(nextService.timing);
    const months = ahead ? monthsAway(Number(ahead[1].replace(/,/g, '')), vehicle.avg_miles_per_month) : null;
    return months ? `${nextService.timing} · ${months}` : nextService.timing;
  })();
  /*
    ⚠ No line under the timing for want of the owner's miles a month (22 Sep,
    David's ruling on the thin car). Rounds 5–6 printed "no date without your
    miles a month" there; it was the F-PACE's third NEXT SERVICE line, and it
    pushed the count row's legends under the tab bar at rest. An unknown date
    shows as nothing — §10's rule — and the ask lives where the answer does:
    "Tell us ›" under MILES A MONTH, with what answering buys beneath it.
  */

  /*
    The recall cell's reading: "24 / open" — open campaigns minus what the
    owner has marked. Round 2 said "to review" and the IA lens read an inbox
    that empties once looked at; open recalls do not close by being read, so
    the block's one word is "open", in the cell, in the cause line, and
    nowhere a third way (IA I5, UX U5). "None open" in the absent ink for a
    car NHTSA cleared; nothing for a car it was never asked about. Matched
    on year, make and model, never this VIN (§10): the cause line says "for
    this model", the spoken name says it, the recalls screen carries it.
  */
  const recallReading = !recallsChecked
    ? null
    : openRecallCount === 0
      ? { text: 'None open', muted: true }
      : { text: `${openRecallCount} open`, muted: false };
  const recallsSpoken = !recallsChecked
    ? 'Recalls, not checked yet. Opens the account of the score.'
    : openRecallCount === 0
      ? 'View 0 open recalls'
      : `View ${openRecallCount} open ${openRecallCount === 1 ? 'recall' : 'recalls'}, matched to this model, not this car. Opens the account of the score.`;

  /*
    ── The page's one act — in the sheet since 22 Sep, not on the plate ──────

    **What it is** is settled: the record act, always. Round 2 of the lenses
    had it chosen by state — REVIEW RECALLS while any campaign was unreviewed
    — and two of the three read that as *"a second entrance to the room the
    RECALLS cell opens a thumb-length below it"* that evicts the act the page
    exists for on a 2003 Accord *"for as long as any campaign is unreviewed,
    which … may be forever."* The △ RECALLS cell is the recall prompt; the
    act is SCAN INVOICE.

    ⚠ **Where it is changed, and the argument that put it on the plate is
    gone.** It was a pinned pill on the nav row over the photograph, and the
    case for that was UX U1's *"reachable at rest, no scroll"* — a real
    property, bought by floating a filled button over the hero. David,
    22 Sep: *"i really don't like the scan invoice button placement, on the
    plate on car tab. remove from there, put new button above 'what you told
    us' section."* So the act is a full-width primary at the head of the
    lower sheet, and the plate carries the photograph and its one door.

    What that costs, stated rather than hidden: on a tall display the act is
    **below the fold** at rest. What it buys back is a plate with nothing
    floating on it, an act at its full width in the reading order the page
    already has — the readings, then what they were read from, then the act
    — and the SERVICE tab a thumb away, which carries the same destination
    for the whole scroll.
  */
  const primaryAct = { label: 'Scan invoice', onPress: onScanInvoice, spoken: 'Scan an invoice into this car\'s history' };

  /*
    The cause beside the verdict, as a reason with its act (UX U2, value V4,
    round 3): "Held back by 2 services overdue, 1 due now — see what is due."
    Core picks the driver (`holdingBack`: an unjudged history before any
    scored one) and words the reason in its own counts; recalls take the
    hub's own open count — open minus what the owner has marked, matched to
    the model — so one number means one thing on one screen (IA I5, UX U5).
    Nothing holding the score back, nothing said.
  */
  const cause = (() => {
    const first = holdingBack(drivers);
    if (!first) return null;
    /* Recalls in the hub's own count, for this model; everything else in the driver's words. */
    const phrase = (driver: HealthDriver) =>
      driver.key === 'recalls'
        ? openRecallCount > 0
          ? `${openRecallCount} open ${openRecallCount === 1 ? 'recall' : 'recalls'} for this model`
          : null
        : driver.cause ?? null;
    const one = phrase(first);
    if (!one) return null;
    // A thin history and open recalls share the blame: both named (round 4, all three lenses).
    const second = alsoHoldingBack(drivers, first);
    const two = second ? phrase(second) : null;
    /*
      ⚠ No imperative on the line (round 5, all three lenses): "— review them"
      pointed past the cell's one door at two others, and on the F-PACE the
      comma splice read as a to-do list. The cause is the reading; SCAN
      INVOICE top-right and △ RECALLS beneath are the acts, each its own door.
    */
    return `Held back by ${two ? `${one} and ${two}` : one}.`;
  })();
  /*
    ⚠ The drivers cannot see a thin history on a mileage-driven schedule: a
    service with no record is counted from the next interval boundary above
    the odometer (`later`, not `unknown`), so the F-PACE — one record in
    69,573 miles — reads "nothing overdue" to the maintenance driver and
    names its recalls. The record count is the hub's own fact (value V1:
    *"nothing near the 55 says it rests on one record"*); under three it is
    the first reason, in its own number, with the recalls beside it.
  */
  const thinHistory =
    counts.services !== null && counts.services < 3
      ? counts.services === 0 ? 'no records on file' : counts.services === 1 ? 'one record on file' : `${counts.services} records on file`
      : null;
  const causeLine = (() => {
    if (!thinHistory) return cause;
    const recalls =
      openRecallCount > 0 ? ` and ${openRecallCount} open ${openRecallCount === 1 ? 'recall' : 'recalls'} for this model` : '';
    return `Held back by ${thinHistory}${recalls}.`;
  })();

  /* The reading's sentence, beside the dial: a current reading's lead, whole sentences. See `leadOf`. */
  const lead = verdict.state === 'current' && verdict.text ? leadOf(verdict.text) : null;

  const historyCount =
    counts.services === null ? null : `${counts.services}`;

  /*
    The tires row's figure: the reading, in the strip's own format, or nothing.
    `null` is "we cannot say" and draws no count — a set with no odometer to
    count to must not read as 0 miles since a rotation.
  */
  const tiresReading = (() => {
    if (!counts.tires || counts.tires.since === null) return null;
    // A countdown where the owner entered an interval: "rotation in 5,500 mi", or how far past it.
    if (counts.tires.toNext !== null) {
      return counts.tires.toNext > 0
        ? `rotation in ${counts.tires.toNext.toLocaleString('en-US')} mi`
        : counts.tires.toNext === 0
          ? 'rotation due now'
          : `rotation overdue by ${Math.abs(counts.tires.toNext).toLocaleString('en-US')} mi`;
    }
    const miles = `${counts.tires.since.toLocaleString('en-US')} mi`;
    const basis = sinceLabel(counts.tires.basis);
    // "500 mi since last rotation" — the caption's own words, in the timing's voice.
    return basis ? `${miles} ${basis.replace(/^Miles /, '').toLowerCase()}` : miles;
  })();
  const tiresSpoken = (() => {
    if (!counts.tires || counts.tires.absent) return 'Tires. No set on record — add one to count down to each rotation.';
    if (counts.tires.since === null) return 'Tires.';
    if (tiresReading) return `Tires, ${tiresReading}.`;
    return 'Tires.';
  })();

  const wishlistCount =
    counts.wishlist === null
      ? null
      : counts.wishlist.total > 0
        ? `${counts.wishlist.count} · ${money.format(counts.wishlist.total)}`
        : `${counts.wishlist.count}`;

  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || title || '';

  /*
    The sodium mark on the NEXT SERVICE cell. Read off core's own timing words
    rather than a number this screen worked out: `describeNextService` says
    "overdue by …", "overdue since …" or "due now" exactly when the sweep's
    reading is behind the odometer or the calendar, and a screen that compared
    the miles itself would be a second opinion about when a service is late.
  */
  const serviceOverdue = nextService.kind === 'known' && /^(overdue|due now)/.test(nextService.timing);

  /*
    The owner's answers, as rows. Each is optional and an absent one is an
    absent row — a dash under MODIFICATIONS would read as an answer of
    nothing. The values are the profile screen's own words, so the row and
    the field it opens agree.

    ⚠ Three of the four, not four. The usage answer is the strip's USE cell
    on the plate 400pt above — the pick's own note (*"USE / Daily Driver is
    already in the hero strip"*) and round 45's cut (*"USE in the stat strip
    duplicates HOW YOU USE IT in the table below; one goes"*). The strip's
    is the one that stays: it is B2's strip, shared cell for cell with the
    garage, and the reading the owner checks. Round 43 had restored the row
    on the argument that a section of what you told us should not omit the
    answer it is best known for; the answer is not omitted from the screen,
    and every row here opens the one profile where it is changed. ⚠ Two of the labels are not: the profile asks
    "What do you want from it?" (the mindedness) two blocks above a field
    labelled "What you want out of it" (the objective), and side by side in
    a table those two read as one question asked twice. Both rows take the
    web wizard's own heads for the same answers — MODIFICATIONS, and the
    OWNERSHIP step whose title is "Ownership Objectives" — which are nouns
    the width of a row's label.

    ⚠ The objective is prose in core (`OBJECTIVE_MAX` 280, *"an objective
    is prose and stays prose"*) and a value on this row. Round 44 read it
    as a caption — *"grey sans, left, under its label, while the three rows
    above carry mono values on the right"* (B1, B6) — and the row's job is
    to say there is an answer and open it, not to print it in full: the
    wizard's answers are four short phrases, a sentence truncates in the
    column (`BandRow` keeps the label whole), and the whole answer is the
    row's spoken name and one tap away on the profile.
  */
  const objective = vehicle.ownership_objective?.trim() || null;
  const answers: Answer[] = [
    {
      label: 'Miles a month',
      value: typeof vehicle.avg_miles_per_month === 'number' ? miles.format(vehicle.avg_miles_per_month) : null,
      buys: 'Dates your next service',
    },
    {
      label: 'Modifications',
      value:
        vehicle.performance_mindedness && vehicle.performance_mindedness in MINDEDNESS_LABELS
          ? MINDEDNESS_LABELS[vehicle.performance_mindedness as Mindedness]
          : null,
      buys: 'Turns the build side on or off',
    },
    {
      label: 'Ownership',
      value: objective ? leadPhrase(objective) : null,
      spoken: objective ?? undefined,
      buys: 'Tunes the advice to what you want from it',
    },
  ];

  /*
    ── The interpolations ────────────────────────────────────────────────────

    Every one is driven by `scrollY` and lands on a transform or an opacity.
    The formulas are the handoff's §3 table verbatim; the only translation is
    that a value the handoff expresses through `k` is expressed here through the
    scroll offset that produces that `k` — see `dialFlight`, which does that
    conversion once and has tests on it.
  */
  const dim = scrollY.interpolate({
    inputRange: [0, HERO_DIM_SPAN],
    outputRange: [HERO_DIM_REST, HERO_DIM_MAX],
    extrapolate: 'clamp',
  });

  /* The hero's contents drift, and the frame does not. Two planes, two rates. */
  const heroDrift = scrollY.interpolate({
    inputRange: [0, 1000],
    outputRange: [0, -1000 * HERO_PARALLAX_RATE],
    extrapolate: 'clamp',
  });

  const photoScale = scrollY.interpolate({
    inputRange: [0, HERO_DIM_SPAN],
    outputRange: [1, 1 + HERO_SCALE_GAIN],
    extrapolate: 'clamp',
  });

  /* Gone before the nav title arrives — see `HERO_TITLE_FADE_SPAN`. */
  const identityFade = scrollY.interpolate({
    inputRange: [0, HERO_TITLE_FADE_SPAN],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  /*
    The nav title's arrival — `navFadeStartFor` once the identity block has
    measured, the constant until then. Both feed an `inputRange`, which is
    the interpolation's own argument and not a style key, so the native
    driver is untouched.
  */
  const navFadeStart =
    identityHeight === null
      ? HERO_NAV_FADE_START
      : navFadeStartFor({ titleAnchor: bands.titleAnchor, identityHeight });
  const navFade = scrollY.interpolate({
    inputRange: [navFadeStart, navFadeStart + HERO_NAV_FADE_SPAN],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const sheetShadow = scrollY.interpolate({
    inputRange: [0, HERO_DIM_SPAN],
    outputRange: [0.28, 0.7],
    extrapolate: 'clamp',
  });

  return (
    /*
      ── The four planes, in render order ──────────────────────────────────────

      Hero, then the sheet, then the nav, then the dial and its chip — all
      siblings of the screen root.

      ⚠ **This is render order, not `zIndex`.** The handoff is explicit and the
      reason is Android: `zIndex` interacts with `elevation` there in ways that
      cost an afternoon. If the order is right no `zIndex` is needed, and there
      is none in this file.
    */
    <View style={styles.screen}>
      {/* ── z0 · HERO — pinned. Only its contents move. ─────────────────────── */}
      <View style={[styles.hero, { height: heroH }]} pointerEvents="box-none">
        {vehicle.photo_url ? (
          <Animated.Image
            source={{ uri: vehicle.photo_url }}
            /*
              ⚠ Over-rendered by `HERO_IMAGE_BLEED` top and bottom. RN scales
              about the centre, so at `HERO_SCALE_GAIN` the image grows ~7% each
              way — without the bleed the photograph's top edge walks into frame
              at the end of the drift.

              `cover`, focal point high. **Not** `contain`, no letterbox, no
              side gutters: that geometry is the bug being removed — at 150pt a
              3:4 phone snapshot letterboxed into purple bars.
            */
            style={[
              styles.heroImage,
              { transform: [{ translateY: heroDrift }, { scale: photoScale }] },
            ]}
            resizeMode="cover"
            accessibilityRole="image"
            accessibilityLabel={name ? `${name} photo` : 'Vehicle photo'}
          />
        ) : (
          <HeroEmpty />
        )}

        {/*
          ── ⚠ Round 2 · the switch, and the one element that must not blink ──

          The critic on round 1: *"the switch is a reload, not a switch: the
          plate hard-cuts to the next photograph, the page below rebuilds,
          and the dial's draw-in is lost in the flash."*

          The page rebuilding is not negotiable — `withCar` keys these
          screens on `vehicleId`, and the bug class that key prevents is a
          thread or an odometer confirmation surviving under the wrong car's
          name. So continuity is bought where the eye is: the outgoing car's
          plate arrives with the navigation (`fromPhoto`), is laid over the
          new one at full opacity from the first frame, and fades out over
          `SWITCH_CROSSFADE`. What the owner sees is one photograph becoming
          another; what actually happened is a new screen.

          ⚠ It fades **out**, not in. Fading the new plate in over graphite
          would darken the hero to the page for a third of a second — the
          blink, arrived by a prettier route. The old image on top, leaving,
          keeps the frame full at every moment.
        */}
        {fromPhoto && fromPhoto !== vehicle.photo_url ? (
          <Animated.Image
            source={{ uri: fromPhoto }}
            style={[styles.heroImage, { opacity: switchFade }]}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
        {/*
          ⚠ No house grade over the owner's photograph since 22 Sep — it is
          drawn as they shot it, the dim and the bed over it as over a plate.
          B9's grade made a daylight snapshot read as grey mud, and David,
          shown one: *"let owners add their images if they prefer to our
          plate."* `BayRoom` carries the ruling; `PhotoGrade` is gone.
        */}

        {/* The bay light going down as the floor comes up — shadow, not chrome. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]} />

        {/*
          Fixed. The contrast floor the name sits on. Never animates.

          ⚠ It is told **where the type ends**, and that is the whole of the
          23 Sep repair: the bed used to fall to zero at a fixed 52% of the
          hero, measured when the identity block was shorter, and the block
          has grown three times since — the stat strip, the `THIS CAR` legend,
          and the switcher's `CAR 01 OF 03`. Its top now sits at ~48%, where
          the bed was delivering 0.08, so on any photograph brighter than the
          night fixture every string on the plate was under the AA floor and
          the name was at 1.61:1. `HeroBed` carries the numbers.

          ⚠ Before the block is measured this falls back to the component's
          own default rather than to zero. A `coverTo` of 0 would clamp to
          0.1 and draw a bed that covers nothing, which is one frame of
          unreadable type on every cold open — the flicker being invisible on
          a dark photograph is exactly why it would survive review.
        */}
        <HeroBed
          coverTo={
            identityHeight === null ? undefined : (bands.titleAnchor + identityHeight) / heroH
          }
        />

        <Animated.View
          style={[
            styles.identity,
            {
              bottom: bands.titleAnchor,
              /*
                The scroll's fade, the sheet's (`plateType`) — and the
                switch's.

                ⚠ The switch's is the critic's own pass criterion, and the
                first recording failed it: *"the new name rides with the new
                photograph and never sits on the old one."* At 20396ms the
                frames showed "2015 SUBARU FORESTER" set over the Accord's
                plate, because the name belongs to the incoming page and the
                photograph beneath it was still the outgoing one. The block
                arrives on the inverse of the crossfade, so the name and the
                car it names reach full strength together.
              */
              opacity: Animated.multiply(
                Animated.multiply(identityFade, plateType),
                fromPhoto ? Animated.subtract(1, switchFade) : 1
              ),
              transform: [{ translateY: heroDrift }],
            },
          ]}
          onLayout={(event) => setIdentityHeight(event.nativeEvent.layout.height)}
          pointerEvents="none"
        >
          {/* 12 Sep: the plate says it is being drawn — see `PlateStatusLine`. */}
          {!vehicle.photo_url ? <PlateStatusLine status={vehicle.plate_status} /> : null}
          {/*
            ⚠ Round 1 · the affordance. *"Nothing at rest says there are other
            cars."* True, and it is the same gap David named on the garage on
            21 Sep — *"the '1 of 3' needs to be bigger, more obvious … it's
            not super clear what's supposed to happen"*. So the count is an
            eyebrow over the name, in the mono label.

            ⚠ The critic asked for `BAY 01`, and **bay is the garage's word**
            — a bay is a slot in a place, and this structure has no place.
            `CAR 01 OF 03` says the same thing in the vocabulary that
            survives. And it is absent on a one-car account, against the
            critic's "a one-car owner reads BAY 01 alone": `BayRail`'s R20
            rule is that a pager for a list that cannot be paged is chrome,
            and a count of a set nobody has is the same thing.
          */}
          {manyCars ? (
            <Text style={styles.carIndex}>
              {`CAR ${String(Math.max(1, cars.findIndex((car) => car.id === vehicleId) + 1)).padStart(2, '0')} OF ${String(cars.length).padStart(2, '0')}`}
            </Text>
          ) : null}
          <View style={styles.nameRow}>
            <Text style={[styles.name, { fontSize: bands.titleSize, lineHeight: bands.titleSize * 1.05 }]} numberOfLines={2}>
              {name}
            </Text>
          </View>
          <StatStrip stats={stats} onPhoto />
          {/*
            22 Sep · the door's own mark. The page teaches that a mono word
            and a chevron is a door, then left the plate — the largest door
            on it — silent (IA I7, UX U6). The legend under the strip says
            where the press lands; the press itself is the spacer's
            `detailsDoor`, since the hero is pinned under the scroll view.
          */}
          <View style={styles.plateLegend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.plateLegendWord}>This car</Text>
            <Icon name="chevron-right" size={14} color={text.primary} />
          </View>
        </Animated.View>

        {/*
          ── ⚠ 6 Sep · the photo control moved to the nav row ─────────────────

          It sat absolutely at this plate's bottom-right, where the content
          surface covered all but its top ~12pt. The critique reported a clipped
          rectangle there on two consecutive rounds — first as a fill, then as an
          outline — and never as a control, because there was not enough of it
          visible to read as one.

          The nav row is where it belongs anyway: it acts on the *photograph*,
          which is chrome over the hero rather than content in the sheet, and the
          slot beside "‹ GARAGE" came free when the score chip was cut.
        */}

      </View>

      {/* ── z2 · SHEET — the only thing that travels. ───────────────────────── */}
      <Animated.ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.scrollBody}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={text.muted}
            progressViewOffset={insets.top + 44}
          />
        }
      >
        {/*
          The gap the hero shows through. `HERO_SHEET_OVERLAP` is how far the
          sheet already rests **onto** the car at zero scroll — the floor is
          never fully down.
        */}
        <View style={{ height: heroH - HERO_SHEET_OVERLAP }} pointerEvents="box-none">
          {/*
            ── 22 Sep · the plate is the door to the car itself ─────────────

            "No door to the car itself — ADD PHOTO top, REMOVE THIS CAR
            bottom, nowhere to correct trim or mileage; the facts strip is the
            page's only non-door row" (IA I3, I7; UX U6; value V1). The name
            and the strip open the car's details — mileage, the answers, the
            removal. The hero is pinned *under* this scroll view, so a press
            on it never reaches it; the door is here, in the sheet's spacer,
            over the identity block's rest position, so a drag that starts on
            the name still scrolls (a Pressable inside the scroller yields to
            it) and a tap opens the details. The block drifts at
            `HERO_PARALLAX_RATE` on scroll and the door does not — by then
            the block is fading (`HERO_TITLE_FADE_SPAN`) and the scroll is
            the gesture in hand.
          */}
          {/*
            ⚠ 23 Sep · **this opens the car, on every account.** For one day
            it opened the *switcher* when the owner had more than one car —
            the concept's "the name is the door" — and the legend 14pt above
            it still read `This car ›` while this label still promised
            mileage, answers, photo and removal. A sighted owner was given
            the wrong word and a screen reader the wrong sentence, which is
            the half of "not obvious" that a chevron's size could not have
            fixed. The set has its own control in the nav row now.
          */}
          <Pressable
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel={`${name || 'This car'}. Opens the car's details: mileage, your answers, the photo, removal.${
              mileageStale ? ` The odometer was set ${mileageAge}; update it there.` : ''
            }`}
            style={[
              styles.detailsDoor,
              { bottom: bands.titleAnchor - HERO_SHEET_OVERLAP, height: identityHeight ?? bands.titleSize * 2 + 60 },
            ]}
          />
        </View>

        {/*
          ⚠ Tall enough for the pullback to complete — 13 Sep. The binnacle is
          short, and a sheet the height of its content could not travel to
          `HERO_NAV_FADE_START`: the hero name finished fading and the mono nav
          title never came, so the car had no name at the end of the scroll.
          `sheetMinHeight` derives the floor from the motion constants; the
          tail it leaves under the foot is the price of the title arriving,
          and it is the same tail the ledger left. Static: a `minHeight` is a
          layout key and must never be driven by `scrollY`.
        */}
        <Animated.View
          style={[
            styles.sheet,
            {
              minHeight: sheetMinHeight(viewport ?? windowHeight, heroH, { navFadeStart, navHeight: insets.top + 44 }),
              shadowOpacity: sheetShadow,
              /*
                Two fades on one surface, and they are the same argument made
                twice.

                ⚠ Round 3 · **the dossier arrives with the car, not before
                it.** The frames caught the seam: at 000ms the outgoing car's
                photograph sat over the *incoming* car's dial, counts and
                prose, because only the name had been given the crossfade's
                inverse. One reading of one car at a time is this page's
                whole claim.

                ⚠ Round 4 · **and it leaves with the sheet.** Round 2 faded
                the plate's type when the switcher opened, on the reasoning
                that the name behind a scrim is a dim duplicate of row 01.
                The dial band is the same duplicate — `88 GOOD` under the
                scrim while row 01 says GOOD 88 under the cyan rule — and the
                sheet's top rule was slicing `HEALTH ›` mid-glyph. The rule
                generalises: under the scrim, only the photograph reads. So
                the sheet takes `plateType` too, and what is behind the
                switcher is one dark plate and nothing else.
              */
              opacity: Animated.multiply(plateType, fromPhoto ? Animated.subtract(1, switchFade) : 1),
            },
          ]}
        >
          {/*
            The batten's lit hairline on the leading edge. This is a floor
            arriving, not an iOS modal — square top corners, no rounded card.
          */}
          <View style={styles.sheetEdge} pointerEvents="none" />

          {/*
            ── 13 Sep · B2: the plate's cut, where the plate meets the sheet ──

            The brief gives the plate one 45° cut, top-right; on this screen
            the plate runs under the status bar, so that corner is under the
            clock and every graded frame showed a plate with no cut while
            both buttons under it had one. Round 46 reversed the earlier
            acceptance: *"a cut nobody can see does not meet the line."*

            The plate's only corner on the page is where it meets the sheet,
            and that edge travels — the sheet rises over the pinned hero —
            so the cut is the sheet's: `cut.plate` of page colour laid back
            over the plate's bottom-right corner, above the leading edge, the
            way `MastheadPlate` and the garage plate paint theirs
            (`cornerCovers`, so `cut-geometry.test.tsx` holds the legs equal).
            ⚠ 21 Sep · the hairline follows the bevel. It used to stop where
            the bevel began, as the garage plate's does — and rounds 46, 47
            and 48 each graded the plate "no cut a user can see": 8pt of page
            graphite laid into a photograph that is near-black at that corner
            is a shape nobody can find, and the rule stopping 8pt short read
            as a broken line, not a corner. The sheet's leading rule turns 45°
            up the bevel now and ends at the screen's edge, so the geometry
            registers as line whatever the photograph does. The cut's size is
            still the brief's 8. Decorative, hidden from the reader.
          */}
          <Svg
            width={cut.plate}
            height={cut.plate}
            style={styles.sheetCut}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {cornerCovers(cut.plate, cut.plate, cut.plate, ['bottomRight']).map((d) => (
              <Path key={d} d={d} fill={surface.page} />
            ))}
            {/*
              ⚠ `border.field`, not `border.panel` — 23 Sep, and three design
              critics in a row are the evidence. Each reported this cut as
              **absent** from the frames; a pixel scan finds it exactly where
              it belongs, an 8pt diagonal between the plate at luminance 14.3
              and the panel at 15.1, stroked at 0.08 alpha. It is drawn, and
              nobody can see it.

              That is round 46's finding returning to the same surface —
              *"a cut nobody can see does not meet the line"* — and it is why
              this cut was moved here in the first place. The geometry is the
              system's signature; a hairline quiet enough to be invisible is
              not carrying it. `panel` stays the token for a seam between two
              still bands; a cut takes the step up.
            */}
            <Line
              x1={0}
              y1={cut.plate}
              x2={cut.plate}
              y2={0}
              stroke={border.field}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          </Svg>


          {/*
            ── 13 Sep · the sheet is a binnacle, not a ledger ─────────────────

            What stood here: the reading in a band with its sentence, a two-row
            table (WHAT IS DRIVING THIS SCORE · OPEN RECALLS), the hub as a
            four-row spec table under THIS CAR, the one filled primary, and a
            WHAT YOU TOLD US row — the row-list-of-links, the
            primary-at-the-bottom, hero-then-ledger. David, 13 Sep: *"i feel
            surprised this page, with these cta's/nav elements, received an
            acceptable score from the design critic."* Three concepts were
            built behind a fixtures flag and put to the critic blind with the
            shipped page as the fourth; it ranked the binnacle first and the
            shipped page last (`design-loop/mobile-ios/concepts/hub/pick.md`).
            `Binnacle` carries the design; this is its composition for the car.

            The rows, and what each cell says it is the door to:

              HEALTH (3)  · the reading, its caveat, its provenance → Health
              NEXT SERVICE (2) · the sweep's service, and when → what is due
              RECALLS · HISTORY · PLAN → the campaigns, the records, the needs
              TIRES · the miles since the set was rotated or fitted → the set

            and beneath the panel, the reading's sentence as the check-control
            line — concept A's own idiom — with `Health` carrying all of it.

            ── ⚠ 21 Sep · the sentence is under the panel, not in the cell ──

            Until today the whole of `verdict.text` sat inside the HEALTH cell:
            the critic's one reservation on the pick was a reading separated
            from the sentence that qualifies it, and the loop answered by
            moving the sentence in. Every graded frame showed the M235i, whose
            reading was *stale* — so the cell carried `short`, one line. A
            *current* reading carries the model's whole summary, and on the
            reviewer's F-PACE that was six lines in a three-fifths cell: the
            NEXT SERVICE cell beside it stretched to match with a void above
            its reading, the row the pick led with ran under the fold, and
            David called the section *"disorganized and hard to follow."*
            Core's own docblock had said it — a reading, its band word and a
            paragraph do not fit one cell.

            So the cell is the instrument the pick drew: the reading, its band
            word, the one-line caveat when the reading is stale (`short`, the
            qualification that must not be separated from the number), and
            the provenance line. A current reading's sentence — the
            assessment, not a caveat — is `leadOf(verdict.text)` beneath the
            panel: whole sentences, never an ellipsis. `verdict.text`, never
            `health.summary` (`healthVerdict` carries why).

            ⚠ The dial is still not here. It is the garage's instrument and
            David cut this screen's copy on 23 Aug because it covered the car;
            what this cell carries is the reading at the plate's numeral size,
            which is the largest thing on the sheet and still not over the
            photograph. `VehicleDetailScreen.test.tsx` holds "never over the
            car".
          */}
          {research.visible ? <ResearchLog runner={research} style={styles.researchLog} /> : null}

          <Binnacle accessibilityLabel="Readings">
            <BinnacleRow first>
              {/*
                ── 22 Sep · the cause beside the verdict ─────────────────────

                The hub's three lenses (drift §6.21) said one thing in three
                voices: UX — *"'55 ATTENTION' names no cause; the reason is an
                unlabelled paragraph two rows down that nothing ties to the
                score"*; IA — *"the only block an owner can neither tap nor
                place … make it HEALTH's caption, same door"*; value — *"a
                verdict without its cause."* So the HEALTH cell is the row:
                the dial at its start, the reading's sentence beside it, what
                it was read from beneath, and one legend for all of it. The
                sentence is `leadOf(verdict.text)` — whole sentences, never an
                ellipsis — or the stale caveat (`short`) when the records have
                overtaken the reading. NEXT SERVICE takes the row beneath,
                full width, with the owner's own months beside the miles.
              */}
              <BinnacleCell
                legend="Health"
                onPress={onOpenHealth}
                accessibilityLabel={
                  score !== null && band
                    ? `Health score ${score} out of 100 — ${band.label}.${causeLine ? ` ${causeLine}` : lead ? ` ${lead}` : ''} Opens what is driving it.`
                    : 'Health, no score yet. Opens what is driving it.'
                }
              >
                {score !== null && band ? (
                  <View style={styles.healthRow}>
                    <View style={styles.cellDial}>
                      <ClusterGauge
                        key={health?.last_generated ?? 'reading'}
                        variant="card"
                        size={CELL_DIAL}
                        score={score}
                        records={counts.services}
                      />
                    </View>
                    <View style={styles.healthText}>
                      {/*
                        ── 22 Sep · the cause, and the prose behind the door ─

                        Round 2's value lens: *"the sentence beside the score
                        does not account for the score … lead the panel with
                        one composed line — cause."* Round 3, all three: the
                        model's paragraph restated the counts in forty words
                        and pushed TIRES under the fold; the basis line told
                        the two numbers a third time. So the cell says the
                        cause as a reason with its act — core's `holdingBack`
                        in the driver's own counts, the same words the Health
                        screen's WHAT IS DRIVING IT prints — and the stale
                        caveat when the records have overtaken the reading.
                        The model's sentence and the basis line are HEALTH's,
                        one tap through this door. Never "costing N points":
                        the drivers sit under the score without summing to it
                        (§10).
                      */}
                      {causeLine ? <Text style={styles.cause}>{causeLine}</Text> : null}
                      {verdict.short ? <Text style={styles.summary}>{verdict.short}</Text> : null}
                      {!causeLine && !verdict.short && lead ? <Text style={styles.summary}>{lead}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.absent}>No score yet</Text>
                )}
              </BinnacleCell>
            </BinnacleRow>

            {/*
              ⚠ The service by name, and core's own words for when. This cell
              used to print the timing alone ("overdue by 3,000 mi"), which
              does not say what is overdue — the critic's second note on the
              pick. The name is the knowledge base's through
              `displayServiceName` — the schedule tier and the two spellings
              of "and" left behind (IA I6, UX U9); the timing is
              `describeNextService`, shared with the garage so the two cannot
              word one schedule differently, and beside it the owner's own
              months (`monthsAway`, value V2) where they said how far they
              drive. Where the sweep has not written a row the cell says
              `UNKNOWN_TIMING` under its permanent label — "No schedule yet"
              is not "nothing due", and the label never leaves
              (`garage-next-service.ts`).
            */}
            <BinnacleRow>
              <BinnacleCell
                legend="Next service"
                warning={serviceOverdue}
                onPress={onOpenMilestone}
                accessibilityLabel={`Next service, ${
                  nextService.kind === 'known' ? `${displayServiceName(nextService.service)}, ${serviceDue}` : serviceDue
                }. Opens what is due.`}
              >
                {nextService.kind === 'known' ? (
                  <Landing>
                    <Text style={styles.serviceName} numberOfLines={2}>
                      {displayServiceName(nextService.service)}
                    </Text>
                  </Landing>
                ) : null}
                <Text style={[styles.count, styles.timing]} numberOfLines={2}>
                  {serviceDue}
                </Text>
                {/*
                  Why there is no date, in the row (value V2, round 4) — as a
                  reading, not an ask (IA, round 5: an ask in a cell whose door
                  does not take the answer). The door that does is "Tell us ›"
                  under MILES A MONTH, which says what answering buys.
                */}
              </BinnacleCell>
            </BinnacleRow>

            <BinnacleRow>
              {/*
                ⚠ R16 · opens `Health`, not a recalls screen: the recalls are a
                section of it, under the dial they drive. The count is *open*
                campaigns — total minus what the owner has marked repaired —
                and since 22 Sep the cell says so: "24 open" (UX U5, IA I5,
                value V3 — *"an alarm without a verdict"*). They are matched
                on year, make and model, never this VIN (§10), which the
                spoken name says and the recalls screen carries in full.
              */}
              <BinnacleCell
                legend="Recalls"
                warning={openRecallCount !== null && openRecallCount > 0}
                onPress={onViewRecalls}
                accessibilityLabel={recallsSpoken}
              >
                {recallReading ? (
                  recallReading.muted ? (
                    <Text style={styles.absent}>{recallReading.text}</Text>
                  ) : (
                    <>
                      {/* The numeral, and its verb beneath at the timing's size: "24 to review" is two lines in a third of the row. */}
                      <Text style={styles.count} numberOfLines={1}>{openRecallCount}</Text>
                      <Text style={styles.countWord} numberOfLines={1}>open</Text>
                      {/* The match, on the count (UX U5, value V3): campaigns for the model, never this VIN (§10). */}
                      <Text style={styles.countNote} numberOfLines={1}>this model</Text>
                    </>
                  )
                ) : null}
              </BinnacleCell>
              <BinnacleCell
                legend="History"
                rule
                onPress={onOpenHistory}
                accessibilityLabel={historyCount ? `History, ${historyCount} recorded services.` : 'History.'}
              >
                {historyCount ? (
                  historyCount === '0' ? (
                    <Text style={styles.absent}>No records yet</Text>
                  ) : (
                    <>
                      <Text style={styles.count} numberOfLines={1}>{historyCount}</Text>
                      <Text style={styles.countWord} numberOfLines={1}>{historyCount === '1' ? 'record' : 'records'}</Text>
                    </>
                  )
                ) : null}
              </BinnacleCell>
              <BinnacleCell
                legend="Plan"
                rule
                onPress={onOpenWishlist}
                accessibilityLabel={wishlistCount ? `Plan, ${wishlistCount}.` : 'Plan.'}
              >
                {/*
                  A zero the screen read is a sentence, never a dimmed 0. Round
                  2 said "Nothing yet" (the UX lens: an absence that leaves the
                  owner to guess), round 3 said "Plan work" (the IA lens: a
                  command sitting on the PLAN tab — the ASK THE ADVISOR
                  pattern). PLAN is a tab, so its cell reports: "Nothing
                  planned yet", and the chevron invites. TIRES has no tab, so
                  its cell may say what adding a set gets you.
                */}
                {wishlistCount ? (
                  wishlistCount === '0' ? (
                    <Text style={styles.absent}>Nothing planned yet</Text>
                  ) : (
                    <Text style={styles.count} numberOfLines={2}>
                      {wishlistCount}
                    </Text>
                  )
                ) : null}
              </BinnacleCell>
            </BinnacleRow>

            {/*
              ── Tires — the fourth leaf, as the panel's third row (21 Sep) ──

              20 Sep put this leaf under the switches as a `BandRow` — "not a
              fifth binnacle cell", because the count row's three are at the
              width floor and a row between the readings and the switches
              pushed the switches under the tab bar on the 16 Pro Max. Seen
              whole on the F-PACE the next day, that row was the page's
              loudest thing: a section-sized word with an edge chevron, alone
              between the switches and WHAT YOU TOLD US, in an idiom nothing
              near it shared. And the fold argument was the Max's: on the 16
              Pro the loop measured for, the switches sit under the fold
              already (round 44), and whatever is at the fold on a taller
              display is sliced — before today it was this row.

              So it is a reading like the other five: a full-width cell, the
              miles to the next rotation where the owner entered an interval
              — a countdown, as NEXT SERVICE counts (value V5) — or the miles
              since the set was rotated or fitted where they did not, the
              sodium `△` only when the set is past the interval, and "No set
              yet" in the absent ink where HEALTH says "No score yet". A set
              with no odometer to count to draws nothing, never 0.
            */}
            <BinnacleRow>
              <BinnacleCell
                legend={TIRE_COPY.tires}
                warning={Boolean(counts.tires?.overrun)}
                onPress={onOpenTires ?? (() => {})}
                accessibilityLabel={`${tiresSpoken} Opens the set.`}
              >
                {tiresReading ? (
                  <Text style={[styles.count, styles.timing]} numberOfLines={1}>
                    {tiresReading}
                  </Text>
                ) : counts.tires?.absent ? (
                  <Text style={styles.absent}>Add a tire set to count down to each rotation</Text>
                ) : null}
              </BinnacleCell>
            </BinnacleRow>
          </Binnacle>

          {/*
            ── What the owner told us ────────────────────────────────────────

            A **destination**, still — David: *"why are we showing these
            details with no option to update? all should be editable."* — and
            a section with its answers in it. Round 42 demoted it to a ghost
            word at the foot, on the pick's note that HOW YOU USE IT · Daily
            Driver repeated the plate's USE cell; the critic then graded the
            word as *"a mono label floating over roughly 450pt of empty
            graphite"* (B1) and named the two honest forms: a section head in
            condensed caps with content beneath, or nothing. This is the
            first. The rows are the profile screen's own answers in its own
            order and words, each the door to editing them; the average is
            the one the strip does not carry, and the usage stays on the
            strip because a value printed twice is a question asked twice.

            ⚠ 22 Sep · every question, answered or not. "A missing answer is a
            missing row, never a dash" was the rule, and the F-PACE showed
            one row and hid the two questions its reading depends on. All
            three lenses asked for the questions as prompts (UX U7, IA I3,
            value V7): an unanswered row reads "Not yet" in the absent ink —
            a sentence, not a dash — and opens the question. The objective
            prints its lead phrase (`leadPhrase`): the row's job is to say
            there is an answer and open it, and "Keep forever - Dail…" said
            neither (UX U3, IA I4).
          */}
          <View style={styles.answers}>
            {/*
              ── The act, at the head of the lower sheet (22 Sep) ───────────

              David's placement, to the word: *"put new button above 'what
              you told us' section."* Above the header, never between the
              header and its rows — a primary inside a section reads as that
              section's act, and this one is the page's.

              It is the hub's only filled primary (`Button`'s rule); the
              error and gone states each carry an `outline`, and they replace
              this screen rather than sharing it.
            */}
            <Button
              label={primaryAct.label}
              onPress={primaryAct.onPress}
              accessibilityLabel={primaryAct.spoken}
              style={styles.act}
            />
            <SectionHeader title="What you told us" />
            {answers.map((answer, index) => (
              <BandRow
                key={answer.label}
                /*
                  No index (22 Sep). B6 gives every *record* list its 01; three
                  questions in no order are not one, and two critics read the
                  ordinals as labelling nothing. David: follow the critic.
                */
                label={answer.label}
                /* An unanswered question is the act, in the absent ink: "Tell us" (UX U7, round 2). */
                count={answer.value ?? 'Tell us'}
                countMuted={answer.value === null}
                /* What answering buys, where a reading is waiting on it (value V2, IA's parking lot). */
                detail={answer.value === null ? answer.buys : undefined}
                accessibilityLabel={
                  answer.value === null
                    ? `${answer.label}: not answered yet.${answer.buys ? ` ${answer.buys}.` : ''} Opens the question.`
                    : `${answer.label}: ${answer.spoken ?? answer.value}. Opens the answer.`
                }
                onPress={onOpenProfile}
                last={index === answers.length - 1}
              />
            ))}
          </View>
          {/*
            ⚠ No REMOVE THIS CAR on the hub since 22 Sep. The three lenses
            agreed (UX U8, IA I7, value V8): *"once per car, not daily; behind
            the edit door."* It is the foot of the car's details screen now —
            the same screen the answers open — and the hub does not end on a
            destructive act.
          */}
        </Animated.View>
      </Animated.ScrollView>

      {/* ── z6 · NAV — pills at rest, a solid plate once the sheet arrives. ─── */}
      <Animated.View
        style={[styles.navPlate, { height: insets.top + 44, opacity: navFade }]}
        pointerEvents="none"
      />

      <View style={[styles.navRow, { top: insets.top }]} pointerEvents="box-none">
        {/*
          ── ⚠ 21 Sep · no back control: this is a root ──────────────────────

          "‹ GARAGE" stood here from the first build — `BackControl`, 36pt
          drawn and 44pt tappable (R25), the same component every pushed
          screen gets as `headerLeft`. It was right while this screen was
          pushed over the garage. Since the Car tab it is a root, and round
          47's critic read the pair at once: *"CAR is the lit tab yet the
          screen opens with '< GARAGE' — two doors to the same room and a
          chevron on a root"* (B8: tab roots carry no back chevron). The
          GARAGE tab is the way back, one thumb away. `onBack` survives for
          the one state that needs a way out and has no tab bar to offer:
          the car that is no longer here.

          The title takes the row's start, as every root's collapsed title
          does. It is the only thing keeping the car from being anonymous
          once the hero is covered, so it does not share space with chrome —
          it takes the slack and truncates before the account slot.
        */}
        <Animated.Text style={[styles.navTitle, { opacity: navFade }]} numberOfLines={1}>
          {name}
        </Animated.Text>

        {/*
          ── ⚠ 23 Sep · the switcher's control, in the corner David named ────

          *"the carrot/chevron is perhaps not obvious for all users. let's
          replace w/ a more obvious cta in top right or top left."* This is
          it: a labelled, filled control in the trailing corner rather than a
          mute mark on the name.

          It does **not** take `navFade`. The title fades in as the hero
          leaves because a collapsed title is what replaces a name that has
          scrolled away; the set is reachable at every scroll position, and
          chrome that appears only once you have scrolled past the photograph
          is the affordance problem again in a second form. `CarSwitch` draws
          its own opaque ground for exactly this reason — at rest it is on
          the owner's photograph, scrolled it is on the nav plate, and it
          must be legible on both.
        */}
        {/*
          ⚠ It takes `plateType`, which is the round-4 rule applied to the one
          thing that arrived after round 4: **under the scrim, only the
          photograph reads.** The plate's eyebrow, name and stat strip already
          leave when the sheet rises, and the frames show why this must too —
          the control says YOUR CARS at the top of the screen while the
          sheet's own head says YOUR CARS at the bottom, and a scrim dims both
          without resolving which one is the live one. Measured on the device
          before the fix: the control's label at 73.2 mean luminance at rest,
          44.0 under the scrim — dimmed, and still the only type left on the
          plate.
        */}
        {manyCars ? (
          <Animated.View style={{ opacity: plateType }}>
            <CarSwitch count={cars.length} onPress={() => setSheetOpen(true)} />
          </Animated.View>
        ) : null}
      </View>

      {/*
        ── z7 · THE SCORE, in the nav ──────────────────────────────────────────

        ⚠ **The hero dial is gone, and this is what replaced it.** David,
        23 Aug: *"we can lose the dial with health score overlaying car image.
        The animation is fun but info is redundant and it might cover an
        important part of the car image people care about."*

        Both halves are right, and the second is the one that settles it. The
        photograph is the only place in the product an owner sees their own car,
        and a 160pt plinth sat in the middle of it — over the roofline on most
        3:4 phone snapshots. An instrument that obscures the subject it is
        reporting on has its priorities inverted.

        The redundancy was real too, and self-inflicted: the health card gained
        its own reading earlier the same day, so by then the score appeared
        three times. Two remain, and they do different jobs — this is chrome
        that persists, and the card's is the subject of the paragraph under it.

        What went with it: `dialFlight`, the 1.6× climb, the crossfade, and the
        layering invariant that was the hardest part of the design. There is no
        travelling instrument left to collide with the sheet, so the rule that
        governed it has nothing to govern. That is a real simplification rather
        than a deletion — logged for Design in `docs/design-system-drift.md`.
      */}
      {/*
        The switcher's sheet. Mounted at the screen's foot and shown by
        `visible`; keyed on the opening, because a Modal that lives for the
        screen's life derives anything it computes exactly once (CLAUDE.md §6
        — the mark-done sheet that carried one item's shop to the next).
        Nothing here holds state; the key makes that structural.
      */}
      <PushPrimer visible={primer.open} onAccept={primer.accept} onDecline={primer.decline} />

      {manyCars ? (
        <CarSheet
          cars={cars}
          currentId={vehicleId}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSwitch={switchCar}
          onAddCar={() => {
            setSheetOpen(false);
            onAddCar?.();
          }}
          /*
            Round 1: the sheet rises to the plate's foot, so only the
            photograph is behind it. ⚠ `heroH - HERO_SHEET_OVERLAP`, not
            `heroH`: the sheet on this page already overlaps the hero by that
            much, and using the hero's full height left a band of the panel —
            the dial's crown — showing above the sheet, which is the "edge
            slicing the dial" the critic measured.
          */
          plateFoot={heroH - HERO_SHEET_OVERLAP}
          ceiling={viewport ?? windowHeight}
        />
      ) : null}

      {/*
        ⚠ 22 Sep · **nothing floats on the plate any more.** SCAN INVOICE was
        a pinned pill on this row (and the photo control before it); David
        cut it to the sheet — *"i really don't like the scan invoice button
        placement, on the plate on car tab"* — and `primaryAct`'s own note
        carries the argument that went with it. The row holds the collapsed
        title alone; ACCOUNT does not float here either (IA I8).
      */}

      {/*
        ⚠ The score chip stood here and is cut — see the note at `DialChip`'s
        call site above. Its slot passed to the photo control, then to
        SCAN INVOICE, and is now empty: both went where the page's reading
        order already had a place for them (22 Sep).
      */}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },

  /* ── z0 · the pinned hero ─────────────────────────────────────────────── */
  /**
   * Absolutely positioned and **never moves**. Only its contents drift.
   *
   * `overflow: hidden` is what makes the bleed and the pull-back legal: the
   * image is `heroH + 120` tall and grows another 7% each way, and all of that
   * has to be clipped to this frame.
   */
  hero: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  heroImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -HERO_IMAGE_BLEED,
    bottom: -HERO_IMAGE_BLEED,
    width: '100%',
  },
  /** Flat, not a gradient. The room going dark, driven by scroll. */
  dim: { backgroundColor: hero.shadow },
  identity: { position: 'absolute', left: space.xl, right: space.xl },
  plateLegend: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingTop: space.sm },
  /* Primary, with the rest of the plate's type — see `carIndex`. */
  plateLegendWord: { ...type.monoLabel, color: text.primary, textTransform: 'uppercase' },
  /* The door over the identity block; no drawing of its own — the block beneath is what the owner sees. */
  detailsDoor: { position: 'absolute', left: 0, right: 0 },
  /**
   * The display face, on the photograph.
   *
   * ⚠ Legal here because of `HeroBed`'s guaranteed floor, not in spite of the
   * photograph — see that component for the argument. The size comes from
   * `heroBands`, because the compact branch drops it to 28.
   */
  /* Concept B's row: the name and its mark on one baseline (temporary). */
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  /**
   * The set's index over the name.
   *
   * ⚠ `text.primary`, not the `text.muted` every other label in the app
   * takes, and the reason is arithmetic rather than emphasis: this string is
   * on the **photograph**. Over a white sky, muted (white at 0.5) needs a bed
   * alpha of 0.837 to clear AA and primary needs 0.583 — the difference
   * between a scrim that keeps the car and one that loses it. The ladder of
   * inks is for flat grounds; on the plate there is one ink.
   */
  carIndex: { ...type.monoLabel, color: text.primary, ...TABULAR, marginBottom: space.xs },
  name: { ...type.display, color: text.primary },
  /*
    ⚠ 6 Sep · B1 and B2: the stat strip is mono. This read "66,000 mi · xDrive ·
    Daily Driver" in the body sans, so a line made entirely of *values* — a
    mileage, a drivetrain, a usage — was set in the one face the system reserves
    for sentences. B2 asks for the strip beneath the plate to be mono; B1 asks
    for every value to be.
  */
  /* Primary on the plate, for the reason `carIndex` gives. */
  subtitle: { ...type.mono, color: text.primary, marginTop: 4, ...TABULAR },

  photoAction: { position: 'absolute', right: space.lg, bottom: space.lg },
  /**
   * The floating controls over the photograph.
   *
   * ⚠ **No `BlurView`.** There is no glassmorphism anywhere in this product —
   * `plinth`'s own note carries the case that already tried it and the 1.09:1
   * defect it produced. A solid fill at 0.78 is measurable; a blur over an
   * unknown photograph is not.
   */
  /*
    The back control's own styles — its pressed fill, its label in `monoNav`
    and never the accent (B7) — live in `BackControl` since 12 Sep, where the
    navigator's pushed screens read the same ones.
  */

  /* ── z2 · the sheet ───────────────────────────────────────────────────── */
  scroller: { flex: 1 },
  /*
    ⚠ 24, from 40 over the section's own 40 (22 Sep, round 51): the page
    ran 80pt of graphite past its last hairline — *"the page should stop
    one band's padding below its last hairline"*. The section head enters
    under 24pt of air; the page leaves under the same.
  */
  scrollBody: { paddingBottom: space.xxl },
  /* The switch's wait: the car being left, with the instrument's line over it. */
  switchWait: { flex: 1, backgroundColor: surface.page },
  /**
   * Opaque, **square** top corners.
   *
   * This is a floor arriving, not an iOS modal — a rounded card top would make
   * it a sheet you can dismiss, which is the wrong affordance for something
   * that is simply the rest of the page.
   */
  sheet: {
    backgroundColor: surface.page,
    shadowColor: hero.sheetShadow,
    shadowOffset: { width: 0, height: -18 },
    shadowRadius: 22,
    /* `shadowOpacity` is animated; elevation is Android's own and is static. */
    elevation: 12,
  },
  /** The batten's lit hairline, on the leading edge. `environment.css`'s gradient. */
  /*
    ⚠ B7 and the critique's Cut list: this was a cyan rule under the plate with
    no state to report — decoration in the one hue the system reserves for
    meaning. A hairline still separates the sheet from the photograph; it is
    just not a signal any more.
  */
  sheetEdge: { height: StyleSheet.hairlineWidth, backgroundColor: border.panel, marginRight: cut.plate },
  /** The plate's cut: `cut.plate` square, standing on the leading edge at the right, above the plate. */
  sheetCut: { position: 'absolute', top: -cut.plate, right: 0 },

  /* ── z6 · the nav ─────────────────────────────────────────────────────── */
  /**
   * The bar the page scrolls under.
   *
   * ⚠ `border.field`, not `border.panel`, and the difference is measured.
   * Two design critics in a row reported this bar as having **no bottom edge
   * at all** — *"the clipped 'Held back…' line reads as a glitch"*, *"reads
   * as a tear, not a rule"* — and both were wrong about the cause: a pixel
   * scan of the native frame finds the rule exactly where it should be, one
   * row at luminance 32.3 between the plate's 13.6 and the content's 15.1.
   * `border.panel` at 0.08 is simply too quiet for this job.
   *
   * That is not a panel divider separating two still surfaces. It is the
   * edge a page of type is **cut off against**, mid-glyph, while it moves —
   * and an edge doing that work has to be visible or the clipping reads as
   * damage. `border.field` (0.14) is the token one step up, already in the
   * system, and it is what a surface with content pressed against it takes.
   *
   * ⚠ The same reasoning does not travel to `sheetEdge` or the hairlines
   * between bands: nothing is clipped against those.
   */
  navPlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: surface.nav,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.field,
  },
  navRow: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  /**
   * `flex: 1` and it truncates — see the ⚠ at the call site.
   *
   * ⚠ 12 Sep · B8: mono, not `type.uiStrong`. The roots collapse their
   * condensed titles into `monoNav`, and this screen's plate name is the same
   * kind of title — but its collapsed form was Inter semibold in sentence
   * case, beside a "‹ GARAGE" already set in `monoNav`. Two voices on one nav
   * row, and the only one the loop never saw because no graded frame had
   * scrolled the car. Same token as the roots and the back control now.
   */
  navTitle: { ...type.monoNav, color: text.primary, flex: 1, textAlign: 'left' },
  /*
    ── ⚠ 23 Sep · `navChipSlot` is gone, and the corner holds a real control ──

    It was `width: 150` and `pointerEvents="none"` — a spacer reserving room
    for a control beside the arriving title. Two occupants had already left
    it: ADD PHOTO went into the car's details on 22 Sep (IA I3) and ACCOUNT
    stopped floating over a car's page the same day (IA I8), so for a day the
    row reserved 150pt for nothing and the title truncated against it.

    The switcher takes the corner now, and it is a flex sibling rather than a
    reserved width: the title's `flex: 1` yields to whatever the control
    measures, so the two cannot disagree about the slot's size — which is how
    a stale reservation survives unnoticed in the first place.
  */

  /* ── The binnacle's readings ────────────────────────────────────────── */
  banner: { padding: space.lg },
  /*
    ⚠ **R7 · the condensed grotesk, because this screen's display role is the
    hero title and its serif role is nobody's.** This was `type.editorial` at
    30 once (two serif roles on one screen), then Inter at 30 as the subject
    of a paragraph. It is the plate's numeral now — `numeralPlate`, the same
    reading at the size it takes when it sits inside a plate rather than
    owning a screen — because the cell is an instrument and the reading is
    what it reads. The `Health` screen is where the 88 is spent. Tabular so it
    does not shift as the score moves between sweeps.
  */
  absent: { ...type.mono, color: text.muted },
  summary: { ...type.body, fontSize: 14, lineHeight: 20, color: text.secondary },
  /*
    The HEALTH row: the dial at the start, the sentence beside it (22 Sep).
    Top-aligned, so the sentence's first line sits with the arc's crown and
    the legend closes the row under both; `healthText` takes the slack.
  */
  healthRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  healthText: { flex: 1, gap: space.xs, paddingTop: space.xs },
  /* The cause, in the reading's ink; the model's prose beneath it in the secondary. */
  cause: { ...type.body, fontSize: 14, lineHeight: 20, color: text.primary },
  /*
    The card dial sits at the cell's start, not centred in it — `ClusterGauge`
    centres within its own box — and the arc's left extreme (x = 30 of the
    card's 14…186 window, 9.3% of the box) lands on the content edge, where
    the legend under it starts. Without the pull the arc floated 11pt in.
  */
  cellDial: { alignSelf: 'flex-start', marginLeft: -Math.round(CELL_DIAL * ((30 - 14) / 172)) },
  /* B1: the service's name is a section head in miniature — the factor label's size. */
  serviceName: { ...type.displaySection, fontSize: 15, lineHeight: 20, color: text.primary },
  /* A count: mono, tabular, at the health drivers' reading size. */
  count: {
    fontFamily: monoFace('500'), fontWeight: '500',
    fontSize: 20,
    lineHeight: 24,
    color: text.primary,
    ...TABULAR,
  },
  /* A zero the screen did read, in the legend's ink: an empty list is not a warning. */
  countEmpty: { color: text.muted },
  /* The numeral's noun or verb, beneath it in the timing's voice: "records", "open". */
  countWord: { ...type.mono, color: text.secondary },
  /* The count's scope, beneath the word in the legend's ink: "this model". */
  countNote: { ...type.monoLabel, color: text.muted, textTransform: 'lowercase' },
  /* `type.mono`'s size, from 15 (21 Sep): "overdue by 3,000 mi" on one line in half a row on the 16 Pro. */
  timing: { fontSize: type.mono.fontSize, lineHeight: type.mono.lineHeight },

  /* ── The lower sheet ──────────────────────────────────────────────────── */
  /* The answers head the lower sheet under the panel's 24pt of air (the Service root's figure). */
  answers: { paddingHorizontal: space.lg, paddingTop: space.xxl },
  /* The act sits on the panel's air above it and gives the section head its own. */
  act: { marginBottom: space.xxl },
  /* The research log, in the page gutter above the readings. */
  researchLog: { paddingHorizontal: space.lg, paddingTop: space.lg },

  body: { padding: space.lg, gap: space.md },

  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.h1,
    gap: space.sm,
  },
  errorTitle: { ...type.title, color: text.primary },
  errorBody: { ...type.body, color: text.muted, textAlign: 'center' },
  stateAction: { marginTop: space.md, paddingHorizontal: space.xxl },
});
