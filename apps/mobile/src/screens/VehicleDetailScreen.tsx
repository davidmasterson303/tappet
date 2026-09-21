import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import {
  ActionSheetIOS,
  Platform,
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiRequest, ApiRequestError } from '../api/client';
import Working from '../components/Working';
import { removeVehiclePhoto, uploadVehiclePhoto } from '../api/photos';
import type { InvoiceFile } from '../api/documents';
import type { HealthDriver } from '@tappet/core/health-drivers';
import { buildPosition } from '@tappet/core/build-progress';
import { showsModifications } from '@tappet/core/mod-progression';
import { UNKNOWN_TIMING, describeNextService, localToday } from '@tappet/core/garage-next-service';
import { componentPlainName } from '@tappet/core/recalls';
import { MINDEDNESS_LABELS, type Mindedness } from '@tappet/core/vehicle-profile';
import { newestFiledAt, openRecalls } from './verdict-inputs';
import { healthVerdict } from '@tappet/core/health-claims';
import { TIRE_COPY, sinceLabel, tireReading, tireRotationFromRow, tireSetFromRow, type TireRotationRow, type TireSetRow } from '@tappet/core/tires';
import AlertBanner from '../components/AlertBanner';
import BackControl from '../components/BackControl';
import BandRow from '../components/BandRow';
import Binnacle, { BinnacleCell, BinnacleRow } from '../components/Binnacle';
import Button from '../components/Button';
import DialChip, { DIAL_CHIP_SLOT } from '../components/DialChip';
import { HeroBed, HeroEmpty } from '../components/HeroBed';
import PhotoGrade from '../components/PhotoGrade';
import PlateStatusLine from '../components/PlateStatusLine';
import type { PlateStatus } from '@tappet/core/plates';
import { type HealthReading } from '../components/HealthHistory';
import ProvenanceRow from '../components/ProvenanceRow';
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
import Svg, { Path } from 'react-native-svg';
import { TABULAR, border, brand, cut, hero, plinth, radius, space, status, surface, text, type } from '../theme';
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
  if (!body.set) return { absent: true, since: null, basis: null, overrun: false };
  const odometer =
    typeof vehicle.current_mileage === 'number' && vehicle.current_mileage > 0 ? vehicle.current_mileage : null;
  const reading = tireReading(
    tireSetFromRow(body.set),
    (body.rotations ?? []).map(tireRotationFromRow),
    odometer
  );
  return { absent: false, since: reading.since, basis: reading.sinceBasis, overrun: reading.overrun };
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
  tires: { absent: boolean; since: number | null; basis: 'rotation' | 'install' | null; overrun: boolean } | null;
}

/** One of the owner's answers, as the WHAT YOU TOLD US section rows it: a label and its value in the numeral column. */
interface Answer {
  label: string;
  value: string;
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
 * The ink a reading takes: off-white unless the ramp calls it a warning.
 *
 * ⚠ Named against the band rather than a numeric threshold, so the boundary
 * stays owned by `@tappet/core/health-band`. A `score < 60` written here
 * would be the phone holding a second opinion about where "Fair" ends — the
 * drift that module exists to prevent.
 */
const WARNING_INK = (band: { name: string }) => ({
  color: band.name === 'warn' || band.name === 'bad' ? status.attention : text.primary,
});

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
  onAskAdvisor,
  onScanInvoice,
  onViewRecalls,
  onOpenWishlist,
  onOpenHistory,
  onOpenHealth,
  onOpenMilestone,
  onOpenProfile,
  onOpenTires,
  onRemove,
  pickPhoto,
}: {
  vehicleId: string;
  /** The car's name from the row that opened this, so the nav is right during the fetch. */
  title?: string;
  onBack: () => void;
  onSignOut: () => void;
  /*
    3.4's entry point, as a callback for the same reason `onOpenVehicle` is one
    on the garage: this screen does not know react-navigation exists, and the
    navigator is the only file that has to change if that stops being true.
  */
  onAskAdvisor: () => void;
  /** 3.3's entry point, a callback for the same reason `onAskAdvisor` is one. */
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
  /** The removal confirmation (20 Sep). */
  onRemove: () => void;
  /**
   * The picker seam — this screen never imports `expo-image-picker`.
   *
   * Same reasoning as `GarageScreen` and `InvoiceScanScreen`: it is a native
   * module, a build that lacks it crashes on launch the moment anything in the
   * graph imports it, and taking it as a prop is what lets this screen mount in
   * a test. Omitted means the plate has no control rather than a broken one.
   */
  pickPhoto?: () => Promise<InvoiceFile | null>;
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

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  /*
    Two verbs, one banner. The headline names which of them failed — "not
    saved" and "not removed" are different instructions to the owner, and a
    banner that said "that photo failed" would leave them checking whether the
    picture is now on the car or off it.
  */
  const [photoError, setPhotoError] = useState<{ headline: string; body: string } | null>(null);

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

      // A photo error does not survive a reload — `AlertBanner` is an alert
      // rather than a dialog, so refresh is what dismisses it.
      setPhotoError(null);

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

  /**
   * Add or replace this car's photograph.
   *
   * The same three outcomes the garage handles, and the same rule about which
   * of them is an error: **dismissal is not one.** The picker resolving `null`
   * returns the screen to idle silently — showing "cancelled" after a
   * deliberate tap on Cancel is how an app feels accusatory.
   *
   * Reloads rather than patching `photo_url` in place. The upload returns a
   * signed URL and the payload carries one the server signed its own way;
   * writing one into state the next refresh overwrites is the disagreement that
   * reads as a photo flickering back to the plate.
   */
  const onAddPhoto = useCallback(async () => {
    if (!pickPhoto) return;
    setPhotoError(null);

    try {
      const file = await pickPhoto();
      if (!file) return;

      setUploading(true);
      await uploadVehiclePhoto(vehicleId, file);
      await load(false, true); // quiet: the photo swaps in place (20 Sep)
    } catch (error) {
      setPhotoError({
        headline: 'That photo was not saved',
        body: error instanceof Error ? error.message : 'That photo could not be saved.',
      });
    } finally {
      setUploading(false);
    }
  }, [pickPhoto, vehicleId, load]);

  /**
   * Take the photograph off the car.
   *
   * ── ⚠ Why this exists (11 Sep) ──────────────────────────────────────────
   *
   * David, on the phone: *"i can't delete the image i uploaded on the app, so
   * i can't revert to seeing the new default images for my car."* The web has
   * had Remove in its photo dialog for weeks; this screen could add a
   * photograph and never take one away, so a car with an upload could not fall
   * back to its plate. `removeVehiclePhoto` is the route built for it.
   *
   * ── Optimistic, with the revert written first ─────────────────────────────
   *
   * The plate is shown the moment the owner confirms, because what they are
   * asking for is to *see* the plate — a spinner over the photograph they just
   * asked to lose would answer the wrong question. The previous URL is held so
   * a failure puts the picture back exactly as it was, with the banner naming
   * the failure; the state the owner is left in is then the honest one on both
   * paths. `clearVehiclePhoto` on the server keeps the same discipline (the
   * row is cleared last, so a failed delete still shows the photograph).
   *
   * Reloads on success rather than trusting the null it just wrote, for the
   * reason `onAddPhoto` gives: what stands on the car now — the stock image,
   * the generation plate, or the house plate — is the API's decision, and a
   * local guess is the disagreement `lib/vehicle-photo.ts` exists to prevent.
   */
  const onRemovePhoto = useCallback(async () => {
    if (state.status !== 'ok') return;
    /*
      ⚠ Read from the closure, not inside the updater. An updater runs when
      React renders, and a request that fails in a microtask — a mocked one, or
      a refused one — reaches the `catch` before that render, which would
      revert to a `previous` nobody had set yet.
    */
    const previous = state.vehicle.photo_url ?? null;
    setPhotoError(null);
    setState((current) =>
      current.status === 'ok'
        ? { ...current, vehicle: { ...current.vehicle, photo_url: null } }
        : current,
    );
    setRemoving(true);

    try {
      await removeVehiclePhoto(vehicleId);
      await load(false, true); // quiet: the photo swaps in place (20 Sep)
    } catch (error) {
      setState((current) =>
        current.status === 'ok'
          ? { ...current, vehicle: { ...current.vehicle, photo_url: previous } }
          : current,
      );
      /*
        ⚠ **MOB-08.** `isLocallySignedOut`, not any 401 — the device decided it
        had no session and sent nothing, which is the one case where clearing
        the session is right. A server 401 is shown, not acted on.
      */
      if (error instanceof ApiRequestError && error.isLocallySignedOut) {
        onSignOut();
        return;
      }
      setPhotoError({
        headline: 'That photo was not removed',
        body: error instanceof Error ? error.message : 'That photo could not be removed.',
      });
    } finally {
      setRemoving(false);
    }
  }, [state, vehicleId, load, onSignOut]);

  /**
   * The photo control's one tap.
   *
   * ── ⚠ Why a sheet, not a second control ───────────────────────────────────
   *
   * The nav row over the photograph holds one control, and that is a decision
   * with a history: the score chip was cut from this exact slot because chrome
   * over the car crowds the title, and every round of the critique has read
   * the row as *one* control beside "‹ GARAGE". A standing REMOVE beside it
   * would put a second photo verb on the hero of a screen that is about the
   * car — and if it took the system's destructive treatment it would spend
   * sodium, which B7 reserves for genuine warnings, on a control that is
   * present every time the car has a picture.
   *
   * So the control keeps its name and its place, and iOS does what iOS does
   * for one control with two actions: an action sheet. It is also the web's
   * own structure — its "Change Vehicle Photo" dialog holds Remove *inside*
   * it — so the two clients agree on where Remove lives. The sheet and the
   * confirm are UIKit's surfaces, like every `Alert.alert` in this app; the
   * brief has nothing to grade there and the system spends no hue.
   *
   * ⚠ `ActionSheetIOS` is iOS-only and fails loudly where it is absent
   * (`invariant` in RN). This is the iOS app — every EAS profile is iOS — and
   * a silent `Alert` fallback for a platform nothing builds would be a branch
   * nothing exercises.
   *
   * With no photograph there is one action, so there is no sheet: "Add photo"
   * goes straight to the picker, as it always has.
   */
  const onPhotoControl = useCallback(() => {
    const hasPhoto = state.status === 'ok' && isOwnerPhoto(state.vehicle);
    if (!hasPhoto) {
      void onAddPhoto();
      return;
    }

    /*
      One confirm, and it says what the owner gets rather than asking
      "are you sure?". The car does not go blank — it stands on its
      plate, which is the thing David wanted to see and could not.
    */
    const confirmRemove = () =>
      Alert.alert('Remove this photo?', 'The car will stand on its plate.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void onRemovePhoto() },
      ]);

    /*
      ⚠ `ActionSheetIOS` is iOS only (QE 2.10): on Android it is undefined
      and "Change photo" would throw on the tap. Android is not a launch
      target, and the day it is, this is the one line that would have
      crashed it. The same three choices as an alert elsewhere.
    */
    if (Platform.OS !== 'ios') {
      Alert.alert('Photo', undefined, [
        { text: 'Change photo', onPress: () => void onAddPhoto() },
        { text: 'Remove photo', style: 'destructive', onPress: confirmRemove },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Change photo', 'Remove photo', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
        userInterfaceStyle: 'dark',
      },
      (index) => {
        if (index === 0) void onAddPhoto();
        if (index === 1) confirmRemove();
      },
    );
  }, [state, onAddPhoto, onRemovePhoto]);

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

  const { vehicle, counts } = state;

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
  const stats: Stat[] = [
    typeof vehicle.current_mileage === 'number'
      ? { label: 'Mileage', value: `${miles.format(vehicle.current_mileage)} mi` }
      : null,
    vehicle.trim ? { label: 'Trim', value: vehicle.trim } : null,
    vehicle.vehicle_status
      ? { label: 'Use', value: humanise(vehicle.vehicle_status) }
      : null,
  ].filter((cell): cell is Stat => cell !== null);

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
  const serviceDue = nextService.kind === 'known' ? nextService.timing : UNKNOWN_TIMING;

  const historyCount =
    counts.services === null ? null : `${counts.services}`;

  /*
    The tires row's figure: the reading, in the strip's own format, or nothing.
    `null` is "we cannot say" and draws no count — a set with no odometer to
    count to must not read as 0 miles since a rotation.
  */
  const tiresCount =
    counts.tires && counts.tires.since !== null ? `${counts.tires.since.toLocaleString('en-US')} MI` : null;
  const tiresSpoken = (() => {
    if (!counts.tires || counts.tires.absent) return 'Tires. No set on record.';
    if (counts.tires.since === null) return 'Tires.';
    const label = sinceLabel(counts.tires.basis)?.toLowerCase() ?? 'miles';
    return `Tires, ${counts.tires.since.toLocaleString('en-US')} ${label}${counts.tires.overrun ? ', past your interval' : ''}.`;
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
  const answers: Answer[] = [];
  if (typeof vehicle.avg_miles_per_month === 'number') {
    answers.push({ label: 'Miles a month', value: miles.format(vehicle.avg_miles_per_month) });
  }
  if (vehicle.performance_mindedness && vehicle.performance_mindedness in MINDEDNESS_LABELS) {
    answers.push({
      label: 'Modifications',
      value: MINDEDNESS_LABELS[vehicle.performance_mindedness as Mindedness],
    });
  }
  if (vehicle.ownership_objective?.trim()) {
    answers.push({ label: 'Ownership', value: vehicle.ownership_objective.trim() });
  }

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
        <View style={{ height: heroH - HERO_SHEET_OVERLAP }} pointerEvents="none" />

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
            The hairline stops where the bevel begins; the garage plate's cut
            carries no rule either. Decorative, hidden from the reader.
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
          </Svg>

          {photoError && (
            <View style={styles.banner}>
              <AlertBanner tone="critical" headline={photoError.headline} body={photoError.body} />
            </View>
          )}

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

              HEALTH (3)  · the reading, its sentence, its provenance → Health
              NEXT SERVICE (2) · the sweep's service, and when → what is due
              RECALLS · HISTORY · PLAN → the campaigns, the records, the needs

            The verdict sentence lives **inside** the HEALTH cell — the critic's
            one reservation on the pick was a reading separated from the
            sentence that qualifies it, and David's 23 Aug point was the same:
            a paragraph explaining a reading you have to look away to find is
            a paragraph about nothing. `verdict.text`, never `health.summary`
            (`healthVerdict` carries why), and the provenance line beneath it.

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
              <BinnacleCell
                legend="Health"
                flex={3}
                onPress={onOpenHealth}
                accessibilityLabel={
                  score !== null && band
                    ? `Health score ${score} out of 100 — ${band.label}. Opens what is driving it.`
                    : 'Health, no score yet. Opens what is driving it.'
                }
              >
                {score !== null && band ? (
                  <>
                    {/* Keyed on the reading's time, so a re-read seats in like a first one. */}
                    <Landing key={health?.last_generated ?? 'reading'}>
                    <View style={styles.reading}>
                      {/*
                        ⚠ 6 Sep · B3 and B7: the reading stopped wearing the
                        band. `WARNING_INK` spends sodium only where the ramp
                        says there is a genuine warning; a sound reading is
                        ink. The band table is untouched and still consulted.
                      */}
                      <Text style={[styles.scoreValue, WARNING_INK(band)]}>{score}</Text>
                      <Text style={[styles.scoreBand, WARNING_INK(band)]}>{band.label}</Text>
                    </View>
                    </Landing>
                    {/*
                      13 Sep: the stale caveat in a cell's worth of words —
                      the critic's most repeated cut across three rounds was
                      the four-line sentence here. `short` is core's, the same
                      claim; a current reading's own sentence stays as it is.
                    */}
                    {(verdict.short ?? verdict.text) ? (
                      <Text style={styles.summary}>{verdict.short ?? verdict.text}</Text>
                    ) : null}
                    <ProvenanceRow kinds={verdict.inputs} />
                  </>
                ) : (
                  <Text style={styles.absent}>No score yet</Text>
                )}
              </BinnacleCell>

              {/*
                ⚠ The service by name, and core's own words for when. This cell
                used to print the timing alone ("overdue by 3,000 mi"), which
                does not say what is overdue — the critic's second note on the
                pick. The name is the knowledge base's; the timing is
                `describeNextService`, shared with the garage so the two cannot
                word one schedule differently. Where the sweep has not written
                a row the cell says `UNKNOWN_TIMING` under its permanent label —
                "No schedule yet" is not "nothing due", and the label never
                leaves (`garage-next-service.ts`).
              */}
              <BinnacleCell
                legend="Next service"
                flex={2}
                rule
                warning={serviceOverdue}
                onPress={onOpenMilestone}
                accessibilityLabel={`Next service, ${
                  nextService.kind === 'known' ? `${nextService.service}, ${nextService.timing}` : serviceDue
                }. Opens what is due.`}
              >
                {nextService.kind === 'known' ? (
                  <Landing>
                    <Text style={styles.serviceName} numberOfLines={3}>
                      {nextService.service}
                    </Text>
                  </Landing>
                ) : null}
                <Text style={[styles.count, styles.timing]} numberOfLines={3}>
                  {serviceDue}
                </Text>
              </BinnacleCell>
            </BinnacleRow>

            <BinnacleRow>
              {/*
                ⚠ R16 · opens `Health`, not a recalls screen: the recalls are a
                section of it, under the dial they drive. The count is *open*
                recalls — `verdict-inputs.ts`. The worst open campaign is in
                the reader's sentence and nowhere on the cell: round 42 put
                its system under the count and the three numerals of the row
                landed on three baselines (B6, gap 3). A count says there is
                something to read; the name of it is one tap away, on the
                screen this opens.
              */}
              <BinnacleCell
                legend="Recalls"
                warning={openRecallCount > 0}
                onPress={onViewRecalls}
                accessibilityLabel={
                  recallsChecked
                    ? `View ${openRecallCount} open ${openRecallCount === 1 ? 'recall' : 'recalls'}${
                        worstRecall ? `. ${worstRecall}` : ''
                      }`
                    : 'Recalls, not checked yet. Opens the account of the score.'
                }
              >
                {recallsChecked ? (
                  <Landing>
                    <Text style={[styles.count, openRecallCount === 0 && styles.countEmpty]}>{openRecallCount}</Text>
                  </Landing>
                ) : null}
              </BinnacleCell>
              <BinnacleCell
                legend="History"
                rule
                onPress={onOpenHistory}
                accessibilityLabel={historyCount ? `History, ${historyCount} recorded services.` : 'History.'}
              >
                {historyCount ? (
                  <Text style={[styles.count, historyCount === '0' && styles.countEmpty]}>{historyCount}</Text>
                ) : null}
              </BinnacleCell>
              <BinnacleCell
                legend="Plan"
                rule
                onPress={onOpenWishlist}
                accessibilityLabel={wishlistCount ? `Plan, ${wishlistCount}.` : 'Plan.'}
              >
                {wishlistCount ? (
                  <Text style={[styles.count, wishlistCount === '0' && styles.countEmpty]} numberOfLines={2}>
                    {wishlistCount}
                  </Text>
                ) : null}
              </BinnacleCell>
            </BinnacleRow>
          </Binnacle>

          {/*
            ── Tires — the fourth leaf, as a row of the spec table (20 Sep) ─

            Not a fifth binnacle cell: `BINNACLE_CELL_MIN` is 96 and the
            second row already holds three, so a fourth would be under the
            floor on every phone. A `BandRow` is the system's destination row
            — the same door WHAT YOU TOLD US uses below — and it carries what
            is behind it the way the cells do: the miles since the last
            rotation, and the sodium `△` only when the set is past the
            interval its owner entered. No set, no reading: the row is the
            door and nothing else, never a dash.
          */}
          <View style={styles.tiresRow}>
            <BandRow
              label={TIRE_COPY.tires}
              count={tiresCount}
              warning={Boolean(counts.tires?.overrun)}
              onPress={onOpenTires ?? (() => {})}
              accessibilityLabel={tiresSpoken}
              last
            />
          </View>

          {/*
            ── The switches ─────────────────────────────────────────────────

            Two acts at the panel's foot, and the scan is the one primary.
            The advisor was *"the verb this screen exists to lead to"* in the
            spec, and the critic's reading of the four candidates was that a
            verb outranking the car's readings is the wrong hierarchy for a
            hub — *"the two actions recede to the bottom, where actions
            belong."* Round 42 had them as two equal hairlines; the critic
            graded that against B9 — *"the phone's headline act is a
            below-the-fold secondary twinned with the advisor"* — so the scan
            takes the off-white fill and the advisor keeps the hairline. The
            tab bar already carries the advisor as a root; nothing carries
            the scan but Service's primary and this.

            ⚠ 24pt of air between the panel's closing rule and the switches —
            the Service root's own figure between its primary and the first
            rule (round 33: 24, not 32). Round 44 measured the cost of 16: on
            the 16 Pro the panel's two rows end 7pt short of the fold, so a
            7pt band of off-white showed over the tab bar at rest — *"a white
            sliver … reading as a stray band"* (B9). At 24 the rows end on
            the fold; what meets the tab bar's rule is the panel's air. The
            critic's alternative — the switches above the count row — would
            put the readings the pick led with under the fold instead, with
            the count row's numerals sliced where the button was.
          */}
          <View style={styles.switches}>
            <Button label="Scan invoice" size="small" onPress={onScanInvoice} style={styles.switch} />
            <Button label="Ask the advisor" variant="outline" size="small" onPress={onAskAdvisor} style={styles.switch} />
          </View>

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
            first. The rows are the profile screen's own four answers in its
            own order and words, each the door to editing them; the average is
            the one the strip does not carry, and the usage stays because a
            section of "what you told us" that omitted the answer it is best
            known for would be lying by omission. A missing answer is a
            missing row, never a dash.
          */}
          <View style={styles.answers}>
            {answers.length > 0 ? <SectionHeader title="What you told us" /> : null}
            {answers.length > 0 ? (
              answers.map((answer, index) => (
                <BandRow
                  key={answer.label}
                  /* B6: a list of like rows carries the spec table's index. */
                  index={String(index + 1).padStart(2, '0')}
                  label={answer.label}
                  count={answer.value}
                  onPress={onOpenProfile}
                  last={index === answers.length - 1}
                />
              ))
            ) : (
              <BandRow label="What you told us" onPress={onOpenProfile} last />
            )}
          </View>
          {/*
            ── Remove this car (20 Sep) ─────────────────────────────────────

            The phone could not remove a car until today — no route, and the
            web's own delete left the receipt photographs in the bucket. The
            control is last on the sheet, in the delete variant, and it opens
            a confirmation that quotes what would go rather than asking "are
            you sure?" — `RemoveVehicleScreen`.
          */}
          <View style={styles.remove}>
            <Button
              label="Remove this car"
              variant="delete"
              size="small"
              onPress={onRemove}
              accessibilityLabel="Remove this car from your garage. Asks first."
            />
          </View>
        </Animated.View>
      </Animated.ScrollView>

      {/* ── z6 · NAV — pills at rest, a solid plate once the sheet arrives. ─── */}
      <Animated.View
        style={[styles.navPlate, { height: insets.top + 44, opacity: navFade }]}
        pointerEvents="none"
      />

      <View style={[styles.navRow, { top: insets.top }]} pointerEvents="box-none">
        {/*
          ── ⚠ R25 · 36pt drawn, 44pt tappable — and, 12 Sep, one component ──

          The control is 36 tall because that is what reads correctly over a
          photograph — a 44pt slab is a bar. `BackControl` carries the
          `hitSlop` that grows the target to the floor (legal here because it
          stands alone at the row's end), and it is the same component the
          navigator hands every pushed screen as `headerLeft`, so the way back
          reads identically on this screen and on the ones it opens.
        */}
        <BackControl label="Garage" onPress={onBack} accessibilityLabel="Back to the garage" />

        {/*
          ⚠ The title is laid out in the flow, not absolutely centred.

          Centred across the full width, "2015 BMW M235i" sits under the chip by
          8pt and "2019 Mercedes-AMG C63 S" runs under both it and the controls
          to its right. The title is the only thing keeping the car from being
          anonymous once the hero is covered, so it does not share space with
          chrome — it takes the slack and truncates.
        */}
        <Animated.Text style={[styles.navTitle, { opacity: navFade }]} numberOfLines={1}>
          {name}
        </Animated.Text>

        {/* The slot the chip occupies. Reserved in the flow so the title clears it. */}
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
      <View style={[styles.dialChip, { top: insets.top + 6 }]} pointerEvents="box-none">
        <Animated.View style={{ opacity: identityFade }}>
          {/*
            One control, two verbs once a photograph exists — `onPhotoControl`
            carries why the second verb is a sheet rather than a neighbour.
            The label stays "Change photo": removing is a change, it is the
            web dialog's own title, and it is the control anyone looking for
            Remove will tap.
          */}
          <Button
            label={isOwnerPhoto(vehicle) ? 'Change photo' : 'Add photo'}
            variant="outline"
            size="small"
            busy={uploading || removing}
            busyLabel={removing ? 'Removing' : 'Uploading'}

            onPress={onPhotoControl}
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
  navTitle: { ...type.monoNav, color: text.primary, flex: 1, textAlign: 'center' },
  navChipSlot: { width: DIAL_CHIP_SLOT },

  /* ── z7 · the score chip ──────────────────────────────────────────────── */
  dialChip: { position: 'absolute', right: space.lg, alignItems: 'flex-end' },

  /* ── The binnacle's readings ────────────────────────────────────────── */
  banner: { padding: space.lg },
  reading: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
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
  scoreValue: { ...type.numeralPlate, color: text.primary, ...TABULAR },
  scoreBand: { ...type.monoNav, color: text.primary },
  absent: { ...type.mono, color: text.muted },
  summary: { ...type.body, fontSize: 14, lineHeight: 20, color: text.secondary },
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
  timing: { fontSize: 15, lineHeight: 20 },

  /* ── The switches, and the foot ─────────────────────────────────────── */
  /* The tire row sits between the readings and the switches, on the page's gutter like the answers below. */
  tiresRow: { paddingHorizontal: space.lg, marginTop: space.md },
  switches: { flexDirection: 'row', gap: space.sm, padding: space.lg, paddingTop: space.xxl },
  switch: { flex: 1 },
  answers: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  remove: { paddingHorizontal: space.lg, paddingBottom: space.h2, alignItems: 'flex-start' },
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
