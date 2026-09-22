import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import {
  Platform,
  Alert,
  Animated,
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
import { NAV_BAND } from '../components/RootScreen';
import { HeroBed, HeroEmpty } from '../components/HeroBed';
import PhotoGrade from '../components/PhotoGrade';
import PlateStatusLine from '../components/PlateStatusLine';
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
import { CONTROL_HEIGHT, TABULAR, border, brand, cut, hero, plinth, radius, space, status, surface, text, type } from '../theme';
import { cornerCovers } from '../components/CutSurface';
import { getHealthBandJudgement, healthBandHex } from '@tappet/core/health-band';
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
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
  if (days < 1) return 'today';
  if (days < 7) return `${days} d ago`;
  if (days < 60) return `${Math.round(days / 7)} wk ago`;
  if (days < 365) return `${Math.round(days / 30.4)} mo ago`;
  return `${Math.round(days / 365)} yr ago`;
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
 * drift §6.18). The route now says which kind of picture it sent; only the
 * owner's takes the grade and the two-verb control. An older API sends no
 * kind, and then a `photo_url` is read as it always was.
 */
export function isOwnerPhoto(vehicle: {
  photo_url?: string | null;
  photo_kind?: 'owner' | 'catalog' | 'plate' | null;
}): boolean {
  if (!vehicle.photo_url) return false;
  return vehicle.photo_kind === undefined || vehicle.photo_kind === null || vehicle.photo_kind === 'owner';
}

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
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
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
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Opening this car" />
      </ScrollView>
    );
  }

  if (state.status === 'missing') {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorTitle}>This vehicle is no longer here</Text>
        <Text style={styles.errorBody}>It may have been removed from another device.</Text>
        <Button
          label="Back to garage"
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
  const band = score === null ? null : getHealthBandJudgement(score);

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
    strip, and "set 3 wk ago ›" with the door's mark did too); the plate is
    the door to setting it (`onOpenProfile`).
  */
  const mileageAge = agoLabel(vehicle.last_mileage_update_date);
  const stats: Stat[] = (
    [
      typeof vehicle.current_mileage === 'number'
        ? { label: 'Mileage', value: `${miles.format(vehicle.current_mileage)} mi`, note: mileageAge ?? undefined, door: true }
        : null,
      vehicle.trim ? { label: 'Trim', value: vehicle.trim } : null,
      vehicle.vehicle_status ? { label: 'Use', value: humanise(vehicle.vehicle_status) } : null,
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
  /* A distance to go with no date for want of the owner's miles a month: say so where the date would be. */
  const serviceAsk =
    nextService.kind === 'known' && /^in [\d,]+ mi$/.test(nextService.timing) && typeof vehicle.avg_miles_per_month !== 'number'
      ? 'tell us miles a month for a date'
      : null;

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
    The one act in the prime slot: the record act, always. Round 2 of the
    lenses had it chosen by state — REVIEW RECALLS while any campaign was
    unreviewed — and two of the three read that as *"a second entrance to
    the room the RECALLS cell opens a thumb-length below it"* that evicts
    the act the page exists for on a 2003 Accord *"for as long as any
    campaign is unreviewed, which … may be forever."* The △ RECALLS cell is
    the recall prompt; the slot is SCAN INVOICE.
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
          ? { reason: `${openRecallCount} open ${openRecallCount === 1 ? 'recall' : 'recalls'} for this model`, act: 'review them' }
          : null
        : driver.cause
          ? { reason: driver.cause, act: driver.act }
          : null;
    const one = phrase(first);
    if (!one) return null;
    // A thin history and open recalls share the blame: both named, both acts (round 4, all three lenses).
    const second = alsoHoldingBack(drivers, first);
    const two = second ? phrase(second) : null;
    const reasons = two ? `${one.reason} and ${two.reason}` : one.reason;
    const acts = [one.act, two?.act].filter((a): a is string => Boolean(a));
    return `Held back by ${reasons}${acts.length ? ` — ${acts.join(', ')}` : ''}.`;
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
    const acts = openRecallCount > 0 ? 'scan an invoice, review them' : 'scan an invoice';
    return `Held back by ${thinHistory}${recalls} — ${acts}.`;
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
          B9: the owner's photograph passes through the house grade. Over the
          image and under the dim and the bed, so the grade is the photograph's
          and the contrast floor stays the floor.
        */}
        {isOwnerPhoto(vehicle) ? <PhotoGrade /> : null}

        {/* The bay light going down as the floor comes up — shadow, not chrome. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]} />

        {/* Fixed. The contrast floor the name sits on. Never animates. */}
        <HeroBed />

        <Animated.View
          style={[
            styles.identity,
            { bottom: bands.titleAnchor, opacity: identityFade, transform: [{ translateY: heroDrift }] },
          ]}
          onLayout={(event) => setIdentityHeight(event.nativeEvent.layout.height)}
          pointerEvents="none"
        >
          {/* 12 Sep: the plate says it is being drawn — see `PlateStatusLine`. */}
          {!vehicle.photo_url ? <PlateStatusLine status={vehicle.plate_status} /> : null}
          <Text style={[styles.name, { fontSize: bands.titleSize, lineHeight: bands.titleSize * 1.05 }]} numberOfLines={2}>
            {name}
          </Text>
          <StatStrip stats={stats} />
          {/*
            22 Sep · the door's own mark. The page teaches that a mono word
            and a chevron is a door, then left the plate — the largest door
            on it — silent (IA I7, UX U6). The legend under the strip says
            where the press lands; the press itself is the spacer's
            `detailsDoor`, since the hero is pinned under the scroll view.
          */}
          <View style={styles.plateLegend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.plateLegendWord}>This car</Text>
            <Icon name="chevron-right" size={14} color={text.muted} />
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
          <Pressable
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel={`${name || 'This car'}. Opens the car's details: mileage, your answers, the photo, removal.`}
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
            <Line
              x1={0}
              y1={cut.plate}
              x2={cut.plate}
              y2={0}
              stroke={border.panel}
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
                  The ask, in the row that needs the answer (value V2, round
                  4): a distance with no date because the owner never said how
                  far they drive. The door beneath — "Tell us ›" under MILES A
                  MONTH — is where it is answered; this says why it is asked.
                */}
                {serviceAsk ? <Text style={styles.countNote}>{serviceAsk}</Text> : null}
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
            <SectionHeader title="What you told us" />
            {answers.map((answer, index) => (
              <BandRow
                key={answer.label}
                /* B6: a list of like rows carries the spec table's index. */
                index={String(index + 1).padStart(2, '0')}
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

        {/* The slot the act occupies. Reserved in the flow so the title clears it. */}
        <View style={styles.navChipSlot} pointerEvents="none" />
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
        ⚠ 21 Sep: centred on the nav row, not 6pt under its top. The `+ 6` dates
        from a 36pt pill; `Button`'s small size has been `CONTROL_HEIGHT` since
        12 Sep, so the pill sat 8pt below "‹ GARAGE" — invisible while it stood
        alone, and plain once ACCOUNT floated beside it on the same row.
      */}
      {/*
        ── 22 Sep · the page's one act, in the prime slot ───────────────────

        Chosen by state (value V6): unreviewed recalls first — the one thing
        on the page that can be a safety defect — and otherwise the act an
        owner repeats for years, SCAN INVOICE. Reachable at rest, no scroll
        (UX U1); it fades with the identity block as the photo control did,
        and the tab bar carries both destinations for the rest of the scroll.
        ASK THE ADVISOR is gone from the hub with it — the ADVISOR tab is
        directly beneath it (IA I2, value V8, the design critic's cut).
      */}
      <View style={[styles.dialChip, { top: insets.top + (NAV_BAND - CONTROL_HEIGHT) / 2 }]} pointerEvents="box-none">
        <Animated.View style={{ opacity: identityFade }}>
          <Button
            label={primaryAct.label}
            size="small"
            onPress={primaryAct.onPress}
            accessibilityLabel={primaryAct.spoken}
            style={styles.pill}
          />
        </Animated.View>
      </View>

      {/*
        ⚠ The score chip stood here and is cut — see the note at `DialChip`'s
        call site above. Its slot now carries the photo control, which needed a
        home that the content surface does not cover.
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
  plateLegendWord: { ...type.monoLabel, color: text.muted, textTransform: 'uppercase' },
  /* The door over the identity block; no drawing of its own — the block beneath is what the owner sees. */
  detailsDoor: { position: 'absolute', left: 0, right: 0 },
  /**
   * The display face, on the photograph.
   *
   * ⚠ Legal here because of `HeroBed`'s guaranteed floor, not in spite of the
   * photograph — see that component for the argument. The size comes from
   * `heroBands`, because the compact branch drops it to 28.
   */
  name: { ...type.display, color: text.primary },
  /*
    ⚠ 6 Sep · B1 and B2: the stat strip is mono. This read "66,000 mi · xDrive ·
    Daily Driver" in the body sans, so a line made entirely of *values* — a
    mileage, a drivetrain, a usage — was set in the one face the system reserves
    for sentences. B2 asks for the strip beneath the plate to be mono; B1 asks
    for every value to be.
  */
  subtitle: { ...type.mono, color: text.secondary, marginTop: 4, ...TABULAR },

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
    ⚠ Geometry only. The ground and the corner belong to `Button`'s own
    `CutSurface`; a `backgroundColor` here would square off the cut, and a
    `borderRadius` would round it.
  */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 36,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  /*
    The back control's own styles — its pressed fill, its label in `monoNav`
    and never the accent (B7) — live in `BackControl` since 12 Sep, where the
    navigator's pushed screens read the same ones.
  */

  /* ── z2 · the sheet ───────────────────────────────────────────────────── */
  scroller: { flex: 1 },
  scrollBody: { paddingBottom: space.h2 },
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
  navPlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: surface.nav,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
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
  /**
   * ⚠ 21 Sep · the car is a tab root now, and a root has a floating ACCOUNT.
   *
   * `AccountControl` is a sibling of the navigator and draws the word at
   * this corner on every root — the guarantee 5.1.1(v) rests on. The first
   * build of the Car tab put ADD PHOTO directly under it. So the photo
   * control pads by the control's own slot, as the garage pads its `+`, and
   * the title reserves the same width: by the time the title arrives the
   * photo control has faded out (`HERO_TITLE_FADE_SPAN`), and the word is
   * what remains at the row's end.
   */
  /*
    22 Sep: the act's width, not the account word's — ACCOUNT no longer floats
    over a car's page (IA I8; three critics). The slot is what the small
    button measures at its widest label, so the arriving title clears it
    while the button is still fading.
  */
  navChipSlot: { width: 150 },

  /* ── z7 · the photo control, in the score chip's old slot ─────────────── */
  dialChip: { position: 'absolute', right: space.lg, alignItems: 'flex-end' },

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
  answers: { paddingHorizontal: space.lg, paddingTop: space.xxl, paddingBottom: space.h2 },
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
