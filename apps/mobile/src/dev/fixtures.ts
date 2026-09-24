/**
 * Canned API responses, so the product screens can be driven with no server.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * The design loop grades screenshots of real screens. Twice now that has been
 * called blocked — once when the simulator's disk filled, once when its auth
 * path to Supabase wedged — and both times the reasoning was the same and wrong:
 * *the screens need data, not a session.* Auth is only the gate in front of the
 * data.
 *
 * The suite has always known this. `GarageScreen.test.tsx` and its siblings
 * render these exact screens against a mocked `apiRequest` and assert what they
 * draw. The capability existed; it was reachable only from jest.
 *
 * ⚠ **The shapes are lifted from those tests, not invented.** That matters more
 * than it sounds: `GarageScreen.test.tsx` carries a note about a fixture whose
 * recalls were `{ id: 1 }` — a shape NHTSA could never return — which passed
 * while the chip counted the raw array and stopped passing when it counted what
 * the recall screen would actually draw. A fixture that lies produces a
 * screenshot that lies, and a design critique of a screenshot that lies is worse
 * than no critique.
 *
 * ── Gating ──────────────────────────────────────────────────────────────────
 *
 * Read only by `api/client.ts`, behind `__DEV__` **and**
 * `EXPO_PUBLIC_DESIGN_FIXTURES=1`. Never in a release bundle, and never when the
 * flag is off — a build that quietly serves fixtures instead of the API is the
 * worst failure this file could have, because every screen would look perfect.
 */

import { driversForVehicle } from '@tappet/core/health-drivers';
import { platePublicUrl, type PlateStatus } from '@tappet/core/plates';
import { SUPABASE_URL } from '../config';

/**
 * The plate's status on the fixture car, from the environment.
 *
 * ── 12 Sep · so the loop can shoot the plate being drawn ────────────────────
 *
 * Both mobile routes carry `plate_status` beside `photo_url` — `pending` |
 * `generating` | `ready` | `failed` | `null` — and the empty plate says
 * "Drawing this car's plate" on the first two (`PlateStatusLine`). That state
 * lasts as long as a generation does, which is not a thing to sit and wait
 * for with a simulator, so the fixture reads it from
 * `EXPO_PUBLIC_DESIGN_PLATE_STATUS`: unset or anything the API would never
 * send is `null`, which is the route's own "nothing to say". The shape is the
 * route's; only the value is chosen.
 *
 * ⚠ 13 Sep: unset (and `ready`) now stands the car on its **ready plate**
 * — see `designCar`. Only `pending`, `generating` and `failed` show the
 * house plate, and they show it with the line that explains it.
 */
const PLATE_STATUSES: readonly PlateStatus[] = ['pending', 'generating', 'ready', 'failed'];
const DESIGN_PLATE_STATUS: PlateStatus | null = (() => {
  const raw = process.env.EXPO_PUBLIC_DESIGN_PLATE_STATUS;
  return PLATE_STATUSES.find((status) => status === raw) ?? null;
})();

/**
 * The reading on the design car, from the environment.
 *
 * ── 21 Sep · the loop had only ever seen a stale reading ────────────────────
 *
 * Every graded frame of the hub (rounds 42–46) carried the pair below as it
 * was: a sentence written on 30 Jul, records filed 6 Aug, so `healthVerdict`
 * said *stale* and the HEALTH cell printed its one-line `short`. A current
 * reading prints the model's whole summary, and the first one anybody looked
 * at — the reviewer's F-PACE — was six lines in the cell, a void beside it,
 * the counts under the fold (drift §6.19). The fixture could not show that
 * state, so the loop could not grade it.
 *
 * `EXPO_PUBLIC_DESIGN_VERDICT=current` writes the reading after the records
 * — the same 70, a sentence in the prompt's post-preamble voice over the
 * fixture's own facts (five services, two open recalls), the length a real
 * one has. Unset, the stale pair `health-claims.test.ts` was written around.
 *
 * 21 Sep: neither sentence opens with "Based on your provided service
 * history" — that was the prompt's mandated preamble, on every line of every
 * real car, and the fixture kept rendering it in the design loop after the
 * prompt stopped asking for it (`health-recommendations.ts`).
 */
function designVerdict() {
  if (process.env.EXPO_PUBLIC_DESIGN_VERDICT === 'current') {
    return {
      health_score: 70,
      /*
        Round 47's cut: a first sentence that restated "Based on 5 recorded
        services" and HISTORY 5. The lead is the assessment now — and it
        agrees with the schedule the sweep wrote (the drive belt is what
        NEXT SERVICE says is overdue), because a fixture that contradicts its
        own rows produces a frame that lies.
      */
      summary:
        'The oil, brakes and coolant are inside their intervals; the drive belt inspection is 3,000 miles past due. ' +
        'Two open recalls — the air bag inflator and the fuel pump — are what keep this car at fair rather than good, and both are free to have done.',
      last_generated: '2026-09-20T09:12:00.000+00:00',
    };
  }
  return {
    health_score: 70,
    summary:
      "With no service records on file, the vehicle's health is highly uncertain — a complete lack of documented maintenance.",
    last_generated: '2026-07-30T01:05:47.583+00:00',
  };
}

/** The car the design loop has been grading since the first iteration. */
const M235I = {
  id: 'db143cdc-e68c-46f0-849e-69f7a1873f58',
  year: 2015,
  make: 'BMW',
  model: 'M235i',
  trim: 'xDrive',
  current_mileage: 66_000,
  /*
    13 Sep: the odometer is asked for monthly, with a figure worked out from
    these two (`mileageCheckIn`). Forty-five days at 500 a month puts the
    gate on screen offering "About 66,700 miles by now?" — the state the
    loop photographs. Ten days would hide it; that is a test, not a frame.
  */
  avg_miles_per_month: 500,
  last_mileage_update_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  vehicle_status: 'daily_driver',
  /*
    ── 13 Sep · the other two answers, as the row holds them ───────────────

    The hub's WHAT YOU TOLD US section rows all four onboarding answers,
    and the fixture carried two, so the section was shot at half its
    length. These are what PostgREST returned for the M235i on 13 Sep —
    not invented, and `stock` is the honest one: it is the answer that
    hides the Build ladder (`showsModifications`), so a loop shooting Mods
    from these fixtures sees the ladder's off state, which is the state
    this car is in.
  */
  performance_mindedness: 'stock',
  ownership_objective: 'Keep forever',
  /*
    ── 12 Sep · what the nightly sweep would have written ──────────────────

    The garage's NEXT SERVICE row and the hub's SERVICE row read the three
    `next_service_*` columns the sweep stores (`notify-sweep/route.ts`:
    `nextService(services)` — the most urgent bookable service and the
    reading it is due at), not the schedule. Without them both rows said "No
    schedule yet" beside a Due segment listing eight services — the
    two-screens-disagree shape. These are what that sweep computes from
    `SCHEDULE` and `MAINTENANCE` below: the drive-belt check, counted from
    the recollection at 48,000, due at 63,000. `GarageScreen.test.tsx` drives
    the row with the same two fields.
  */
  next_service_label: 'Drive belt and tensioner, inspect',
  next_service_at_miles: 63_000,
  /**
   * ⚠ Read from the environment, not hard-coded.
   *
   * A vehicle photo lives in a **private** bucket, so the only URL that renders
   * one is a signed URL — and a signed URL is a bearer token with an expiry.
   * Committing one would put a read credential for a real owner's photograph in
   * the repository, which is not a thing a fixture file should carry however
   * short-lived it is.
   *
   * `EXPO_PUBLIC_DESIGN_PHOTO_URL` in `apps/mobile/.env` (gitignored). Absent,
   * the plate renders its placeholder, which is the honest empty state anyway.
   * Refresh it by signing the object again — it expires.
   */
  /*
    `photo_url` and `plate_status` are not written here: they are read at
    answer time by `designCar()` below, because a photograph can also arrive
    through the app's own ADD PHOTO control during a session (12 Sep) and the
    car has to answer with it from then on.
  */
  /*
    ── ⚠ 11 Sep · the reading is genuinely stale, not a sentence pretending ──

    This carried the app's own *stale* sentence — "This reading was taken
    before your 5 service records were filed…" — as if the model had written
    it. It had not: that sentence is what `healthVerdict` composes when a
    stored summary predates the record, and storing it here as the summary
    meant the verdict came out `current`, and printed "Based on 5 recorded
    services" under a sentence saying the opposite. The critique caught the
    contradiction twice before anyone noticed the fixture was the liar.

    So the fixture now holds what the table holds: the model's sentence and
    the moment it was written — the M235i pair `health-claims.test.ts` was
    written around — and the rows below carry `created_at` after it, so the
    verdict is stale for the reason a real one is.
  */
  vehicle_health_summary: designVerdict(),
  /*
    ⚠ Real NHTSA field names. The same note in `GarageScreen.test.tsx` explains
    what a bare `{ id: 1 }` costs: `normaliseRecall` drops it, and an entry that
    renders as a blank card is not information.
  */
  nhtsa_data: {
    recalls: [
      /*
        ⚠ Real taxonomy strings, not tidy ones. NHTSA returns
        `FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP`, and the recall card
        deliberately shows the *mapped* name at its head and the *raw* string at
        its foot — one is readable, the other is what a service desk recognises.

        A fixture that says `'FUEL SYSTEM'` collapses those two into the same
        text, which made a design critique report "printed twice per recall" and
        very nearly cost the raw string its place. A fixture that cannot tell two
        fields apart is a fixture that hides the reason they are both there.
      */
      {
        NHTSACampaignNumber: '23V-441',
        Component: 'FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP',
        Summary: 'The fuel pump may fail without warning, causing an engine stall.',
      },
      {
        NHTSACampaignNumber: '21V-100',
        Component: 'AIR BAGS:SIDE/WINDOW:HEAD',
        Summary: 'The inflator may rupture, propelling metal fragments into the cabin.',
      },
    ],
  },
};

const MAINTENANCE = [
  {
    id: 'm1',
    item_description: 'Front brake pads & rotors, replace',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 678,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm2',
    item_description: 'Oil change — Motul 5W-30, OEM filter',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 152,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm3',
    item_description: 'Spark plugs (6), NGK — replace',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 294,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm4',
    item_description: 'Coolant flush & refill',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 189,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm5',
    item_description: 'Timing belt',
    service_date: '2024-05-01',
    total_cost: null,
    mileage_at_service: 48_000,
    source: 'owner-onboarding',
    created_at: '2026-08-01T15:02:00.000+00:00',
  },
];

/**
 * The typical schedule the knowledge base holds for this car.
 *
 * ── 12 Sep · so the Due segment can be shot with something to compute ───────
 *
 * `/load-vehicle` answered with the vehicle alone, so `ServiceMilestoneScreen`
 * opened on "no structured service schedule yet" and the loop graded a Due
 * segment that had never drawn a row. The shape is `ScheduleEntry`'s — the one
 * `service-due.test.ts` and `ServiceMilestoneScreen.test.tsx` drive
 * `evaluateSchedule` with: `service`, `interval_miles` and/or
 * `interval_months`, `description`, `priority` — and the intervals are what a
 * "typical schedule" for a turbocharged BMW would say, not what makes a good
 * frame.
 *
 * ⚠ The positions are computed, never written. Against `MAINTENANCE` above
 * and the 66,000 on the odometer: the oil and the brake inspection count
 * from the invoice at 61,400 and come due at 66,400; the drive-belt check
 * counts from the *recollection* at 48,000 — `categoryFor` puts "Timing belt"
 * and "drive belt" in one category, which is the product's own matching rule
 * — and is 3,000 miles past, so the frame carries one genuine warning resting
 * on "what you told us at sign-up", which is exactly the claim the provenance
 * line exists to qualify; the brake fluid has no date to count from and says
 * so. Every sentence on the frame is one the product would write.
 *
 * ⚠ Fed to `driversForVehicle` as well, because the route feeds the same
 * schedule to both: a fixture whose Health said "no schedule on record" while
 * its Service listed eight rows would be two screens disagreeing about one
 * car, which is the lie a fixture must not tell.
 */
const SCHEDULE = [
  {
    service: 'Engine oil and filter',
    interval_miles: 5_000,
    interval_months: 12,
    description: 'Drain the oil, replace the filter, reset the service counter.',
    priority: 'Critical',
  },
  {
    service: 'Brake pads and rotors, inspect',
    interval_miles: 5_000,
    description: 'Measure pad depth and rotor thickness at all four corners.',
    priority: 'Recommended',
  },
  {
    service: 'Tire rotation',
    interval_miles: 7_500,
    description: 'Even out the wear, and check the pressures while it is up.',
    priority: 'Recommended',
  },
  {
    service: 'Drive belt and tensioner, inspect',
    interval_miles: 15_000,
    description: 'Look for cracks and glazing; a failed belt on this engine can be drawn into the crank seal.',
    priority: 'Recommended',
  },
  {
    service: 'Cabin air filter',
    interval_miles: 15_000,
    interval_months: 12,
    description: 'Replace the pollen filter behind the glovebox.',
    priority: 'Optional',
  },
  {
    service: 'Spark plugs',
    interval_miles: 30_000,
    description: 'Six plugs; the turbocharged engine is hard on them.',
    priority: 'Recommended',
  },
  {
    service: 'Coolant flush',
    interval_miles: 60_000,
    interval_months: 48,
    description: 'Drain, flush and refill with the BMW-spec coolant.',
    priority: 'Recommended',
  },
  {
    service: 'Brake fluid replacement',
    interval_months: 24,
    description: 'Bleed and replace; the fluid absorbs water whether the car is driven or not.',
    priority: 'Critical',
  },
];

/**
 * What the research found on this car, and what people do to it.
 *
 * ── 13 Sep · the catalogue's other two sources ──────────────────────────────
 *
 * `suggestionsFor` reads three arrays off the knowledge base and maps each
 * onto one wishlist type — `known_issues` → issue, `maintenance_schedule` →
 * maintenance, `common_mods` → modification. The fixture carried only the
 * schedule, so WHAT THIS CAR NEEDS listed eight services and nothing else,
 * and the Build ladder (which reads `common_mods`) drew no rungs at all —
 * and the loop over the catalogue would have graded a list with one of its
 * three kinds.
 *
 * ⚠ **Read off the live row, not written.** These are the M235i's own
 * `vehicle_knowledge_base` rows as PostgREST returned them on 13 Sep
 * (`known_issues` and `common_mods`, verbatim — the model's part names, its
 * severities, its sentences), which is the one way a fixture can be sure
 * every sentence on the frame is one the product would write. The shapes are
 * the ones `wishlist-suggestions.test.ts` drives: `{ part, severity,
 * description, mileage_range }` and `{ name, purpose, difficulty }`. One
 * `High` severity — the water pump — so the catalogue's DO FIRST section has
 * an issue in it beside the two Critical services, and every other chip is
 * neutral, which is the rule the row's chip exists to keep.
 */
const KNOWN_ISSUES = [
  {
    part: 'Charge Pipe',
    severity: 'Medium',
    description:
      'The factory plastic charge pipe is prone to cracking or bursting under boost pressure, especially with aftermarket tunes. Leads to boost leaks and limp mode.',
    mileage_range: '40,000 - 80,000 miles',
  },
  {
    part: 'Valve Cover Gasket (VCG) / Valve Cover',
    severity: 'Medium',
    description:
      'The plastic valve cover can warp, and its gasket can fail, leading to oil leaks, burning oil smell, and potential vacuum leaks affecting engine performance.',
    mileage_range: '60,000 - 100,000 miles',
  },
  {
    part: 'Oil Filter Housing Gasket (OFHG)',
    severity: 'Medium',
    description:
      'Common failure point leading to oil leaks visible on the passenger side of the engine, potentially contaminating the serpentine belt and causing its failure.',
    mileage_range: '50,000 - 90,000 miles',
  },
  {
    part: 'Electric Water Pump / Thermostat',
    severity: 'High',
    description:
      'The electric water pump and thermostat are known to fail, leading to engine overheating, coolant loss, and potential stranding of the vehicle.',
    mileage_range: '60,000 - 100,000 miles',
  },
  {
    part: 'VANOS Solenoids',
    severity: 'Medium',
    description:
      'Can become clogged or fail, affecting variable valve timing. Symptoms include rough idle, reduced power, and check engine light with VANOS-related fault codes.',
    mileage_range: '50,000 - 90,000 miles',
  },
  {
    part: 'Ignition Coils / Spark Plugs',
    severity: 'Low',
    description:
      'Spark plugs are wear items, but ignition coils can fail prematurely, leading to engine misfires, rough running, and a check engine light.',
    mileage_range: '30,000 - 60,000 miles (plugs), 60,000 - 100,000 miles (coils)',
  },
];

const COMMON_MODS = [
  {
    name: 'ECU Tune (e.g., Bootmod3, MHD)',
    purpose: 'Performance (increased horsepower and torque)',
    difficulty: 'Moderate',
  },
  {
    name: 'Upgraded Charge Pipe',
    purpose: 'Reliability (replaces failure-prone OEM plastic part), Performance',
    difficulty: 'Easy',
  },
  {
    name: 'Upgraded Intercooler',
    purpose: 'Performance (reduces intake air temperatures for consistent power)',
    difficulty: 'Moderate',
  },
  {
    name: 'Cat-back Exhaust System',
    purpose: 'Performance (minor gains), Sound (enhanced exhaust note)',
    difficulty: 'Moderate',
  },
  {
    name: 'Lowering Springs or Coilovers',
    purpose: 'Performance (improved handling), Aesthetics (lower ride height)',
    difficulty: 'Hard',
  },
  {
    name: 'Performance Air Intake',
    purpose: 'Performance (minor gains), Sound (enhanced induction noise)',
    difficulty: 'Easy',
  },
];

/**
 * Whether a path should be held open forever, so its wait can be seen.
 *
 * ── 12 Sep · the only way to photograph a wait without spending the call ────
 *
 * Web's `/dev/working` exists because the only other way to see a loading
 * state is to make the request it waits on and watch. The phone's fixtures
 * answer in the same frame — which is right for every graded screen and
 * useless for the one state this pass adds to all of them. So
 * `EXPO_PUBLIC_DESIGN_HOLD` names path prefixes, comma-separated, whose
 * requests never resolve: `/consultant` holds the advisor on ANSWERING,
 * `/upload-document` holds the scanner on READING THE INVOICE, `/vehicles`
 * holds the garage on its page load. The screen draws exactly what it would
 * draw for a slow network, and no model is called.
 *
 * Same double gate as everything in this file, read by `api/client.ts` after
 * `fixtureFor` — a held path is held whether or not it has a canned answer.
 */
/**
 * ── 12 Sep · a photograph added through the control, kept for the session ──
 *
 * Claude Design's most specific request was the vehicle detail with a *real
 * owner photograph* under the house grade — a frame nobody had shot, because
 * every captured round showed the plate. `EXPO_PUBLIC_DESIGN_PHOTO_URL` can
 * put a photograph on the car, but it bypasses the control, and the control
 * is what the product runs: the action sheet, the picker and its encode at
 * `VEHICLE_QUALITY`, the upload, the reload. The dev account's password is
 * stale (400) and the demo's cars refuse writes, so the real route cannot be
 * driven from a simulator at all.
 *
 * So the fixture answers the upload. `POST /upload-photo` is answered with
 * the picked file's own `uri` — read off React Native's `FormData` parts, the
 * shape `api/photos.ts` sends — and the car answers with that `uri` as its
 * `photo_url` from then on; `DELETE` takes it away again. Everything the
 * product does to the pixels still happens: the encode is the picker's, and
 * the server stores what it is sent byte for byte (`uploadVehiclePhoto` in
 * `app/actions.ts` — `Buffer.from(arrayBuffer)`, no resize, no re-encode), so
 * a frame shot this way is the frame the product would draw. The one thing it
 * cannot exercise is the network hop, and a capture that leans on this says
 * so.
 *
 * ⚠ Session-scoped on purpose — a reload of the bundle forgets it, the same
 * way it forgets everything else here. A fixture that persisted a
 * photograph would be a second place the car's state lives.
 */
let addedPhotoUri: string | null = null;

/** The `file` part's `uri` off a React Native `FormData`, or `null`. */
function filePartUri(body: unknown): string | null {
  const form = body as { getParts?: () => Array<{ fieldName?: string; uri?: string }> } | undefined;
  if (typeof form?.getParts !== 'function') return null;
  const part = form.getParts().find((p) => p.fieldName === 'file' && typeof p.uri === 'string');
  return part?.uri ?? null;
}

/**
 * The photograph the fixture car currently answers with, if any.
 *
 * ⚠ `||`, not `??`, on the variable: `apps/mobile/.env` carries the key with
 * an empty value, and an empty string is not a photograph. It passed as one
 * for a day without showing — `''` and `null` both drew the house plate —
 * until the car had a plate to fall back to (13 Sep) and the empty string
 * stood in front of it.
 */
export function designPhotoUrl(): string | null {
  return addedPhotoUri ?? (process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL || null);
}

/**
 * ── 13 Sep · what has been added to Needs through the control, for the session ──
 *
 * `POST /wishlist` was answered with the GET's `{ wishlistItems: [] }` — any
 * body, any path under `/wishlist` — so an ADD on the catalogue "succeeded"
 * into nothing: the row flipped on the screen's own state, and the Plan root
 * behind it went on counting 0. The loop over the catalogue needs the added
 * state as the product draws it, which is a row on Needs as well as a word
 * on the catalogue, so the fixture keeps what is added the way it keeps the
 * photograph: session-scoped, forgotten on reload.
 *
 * The shapes are the route's (`app/api/v1/wishlist/route.ts`): the POST
 * answers `{ wishlistItem }` with the row it inserted; the GET lists rows
 * newest first; `DELETE ?itemId=` removes one. The catalogue's identifier
 * (`wishlistItemIdentifier`) is the dedupe key, as it is in the table — a
 * second add of one identifier answers with the row already there rather
 * than growing a duplicate the product cannot have. A body that is not an
 * add (no identifier, no name) falls through to the network, the way every
 * unmapped request here does.
 */
interface FixtureWishlistItem {
  id: string;
  vehicle_id: string;
  item_type: string;
  item_name: string;
  item_identifier: string;
  description: string | null;
  category: null;
  estimated_cost_parts: 0;
  estimated_cost_labor: 0;
  source: string;
  /** The route's `jsonb` passthrough — the catalogue's note travels here. */
  source_data: Record<string, unknown>;
  created_at: string;
}

const addedNeeds: FixtureWishlistItem[] = [];

/** The add's body, as `WishlistAddScreen` and the Build ladder send it — or `null`. */
function wishlistAdd(body: unknown): Omit<FixtureWishlistItem, 'id' | 'created_at'> | null {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!record) return null;
  const { vehicleId, itemType, itemName, itemIdentifier, description, source, sourceData } = record;
  if (typeof itemIdentifier !== 'string' || typeof itemName !== 'string' || typeof itemType !== 'string') {
    return null;
  }
  return {
    vehicle_id: typeof vehicleId === 'string' ? vehicleId : M235I.id,
    item_type: itemType,
    item_name: itemName,
    item_identifier: itemIdentifier,
    description: typeof description === 'string' && description ? description : null,
    category: null,
    estimated_cost_parts: 0,
    estimated_cost_labor: 0,
    source: typeof source === 'string' ? source : 'manual',
    source_data:
      sourceData && typeof sourceData === 'object' ? (sourceData as Record<string, unknown>) : {},
  };
}

function answerWishlist(path: string, request: { method?: string; body?: unknown }): unknown | undefined {
  if (request.method === 'DELETE') {
    /*
      A regex rather than `URLSearchParams`: React Native's own polyfill of
      that class implements `append` and `toString` and throws on `get`, and
      whether Expo's runtime replaces it is not a thing a fixture should rest on.
    */
    const itemId = decodeURIComponent(/[?&]itemId=([^&]*)/.exec(path)?.[1] ?? '');
    const at = addedNeeds.findIndex((item) => item.id === itemId);
    if (at >= 0) addedNeeds.splice(at, 1);
    return { success: true };
  }
  if (request.method === 'POST') {
    const add = wishlistAdd(request.body);
    if (!add) return undefined;
    const existing = addedNeeds.find((item) => item.item_identifier === add.item_identifier);
    if (existing) return { wishlistItem: existing };
    const item: FixtureWishlistItem = {
      ...add,
      id: `needs-${addedNeeds.length + 1}-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    addedNeeds.unshift(item);
    return { wishlistItem: item };
  }
  /*
    ⚠ `wishlistItems`, the route's own field (12 Sep). This answered `{ items:
    [] }`, a key no consumer reads, so the vehicle hub's PLAN row carried
    nothing where the real API's empty list gives it a 0 — and the critique
    called the row "valueless" on the strength of the fixture's lie.
  */
  return { wishlistItems: [...addedNeeds] };
}

/**
 * The M235i's own generation plate — `vehicle_plates` has held it `ready`
 * since 12 Sep 09:26, and the car's `plate_key` names it.
 *
 * ── 13 Sep · the car's page opened on a street with no car on it ──────────
 *
 * The fixture answered `photo_url: null` at rest, so every graded frame of
 * the hub and the garage stood the car on the *house* plate — the state a
 * real car is in only before its plate is drawn or after the drawing
 * failed. Round 44's first gap: *"'drawn' is indistinguishable from
 * 'drawing', so the user never sees anything arrive, and the top half of
 * the car's own page holds no car."* The product had already answered
 * that; the fixture had not caught up with it.
 *
 * The route's own precedence (`lib/vehicle-photo.ts`): the owner's
 * photograph, else the stock image, else the ready plate — served as
 * `photo_url`, with `plate_status` nulled because the plate is showing. A
 * ready plate is a **public** object (`platePublicUrl`, the `garage-images`
 * bucket), so unlike the owner photograph it is not a credential and can
 * be named here. The origin is `config.ts`'s `SUPABASE_URL` — `app.json`'s
 * `extra.supabaseUrl`, the one the auth client reads — and ⚠ it is read
 * through `config` rather than from `expo-constants`, because this file is
 * loaded for real by two root suites that cannot parse that package
 * (`config.ts` carries the note). Missing, the car falls back to the house
 * plate rather than a broken image.
 */
const M235I_PLATE_KEY = 'bmw/2-series/f22';
const M235I_PLATE_HERO = 'plates/bmw/2-series/f22/hero-3x2.jpg';
function readyPlateUrl(): string | null {
  return SUPABASE_URL ? platePublicUrl(SUPABASE_URL, M235I_PLATE_HERO) : null;
}

/** The fixture car as the routes answer it — `photo_url` decided now, not at import. */
function designCar() {
  /*
    The owner's photograph first, as the route ranks it. Then the plate —
    but only when it is ready: `EXPO_PUBLIC_DESIGN_PLATE_STATUS` names a
    plate still drawing or failed, and a car in either state stands on the
    house plate with the status line saying why (`PlateStatusLine`). `ready`
    and unset are the same answer, as they are from the route: the plate
    shows and the status is nulled under it.
  */
  const photo = designPhotoUrl();
  const plateReady = DESIGN_PLATE_STATUS === null || DESIGN_PLATE_STATUS === 'ready';
  const photo_url = photo ?? (plateReady ? readyPlateUrl() : null);
  return {
    ...M235I,
    plate_key: M235I_PLATE_KEY,
    photo_url,
    /*
      What the image is, as both routes say it since 13 Sep (`vehiclePhotoKind`):
      the owner's photograph, or the plate. Absent, the phone reads an older
      API's answer as the owner's — and drew CHANGE PHOTO over a plate in the
      first frame of round 47 (21 Sep), the fixture lying by omission.
    */
    photo_kind: photo ? 'owner' : photo_url ? 'plate' : null,
    /* `null` under a photograph or a plate, as the route does it — the empty plate is not showing. */
    plate_status: photo_url ? null : DESIGN_PLATE_STATUS,
  };
}

export function fixtureHolds(path: string): boolean {
  const raw = process.env.EXPO_PUBLIC_DESIGN_HOLD;
  if (!raw) return false;
  /*
    A name holds its own route — `/consultant` holds the ask and its query
    string — and not the routes beneath it: `/consultant/conversations` is
    the thread list, which a frame of the advisor answering still wants to
    open (13 Sep). To hold a whole subtree, name it with a trailing slash.
  */
  const route = path.split('?')[0];
  return raw
    .split(',')
    .map((prefix: string) => prefix.trim())
    .filter(Boolean)
    .some((prefix: string) =>
      prefix.endsWith('/') ? route.startsWith(prefix) : route === prefix
    );
}

/**
 * Which stores the fixture car should answer *empty* for, from the environment.
 *
 * ── 12 Sep · the empty states are states too ────────────────────────────────
 *
 * The Service tab has two empties the loop grades — a history with nothing
 * filed, a car with no schedule — and the only way to photograph them had
 * been to edit this file and remember to put it back. `EXPO_PUBLIC_DESIGN_
 * EMPTY` names them instead, comma-separated: `history` answers
 * `/load-maintenance-data` with no rows, `schedule` answers `/load-vehicle`
 * with no `maintenance_schedule` — each the shape the screens' own suites
 * drive them with (`respondWith([])`; a `VEHICLE` without a schedule), so the
 * frame is one the product would draw. Anything else in the list is ignored
 * rather than guessed at, the way `DESIGN_PLATE_STATUS` treats a value the
 * API would never send.
 *
 * The drivers are recomputed from the same emptiness, for the reason
 * `SCHEDULE` gives: two screens must not disagree about one car.
 */
const DESIGN_EMPTY = new Set(
  (process.env.EXPO_PUBLIC_DESIGN_EMPTY ?? '')
    .split(',')
    .map((store: string) => store.trim())
    .filter(Boolean)
);

/**
 * The canned response for a path, or `undefined` when nothing matches.
 *
 * ⚠ Returning `undefined` rather than an empty object is deliberate: the caller
 * falls through to the real network for anything unmapped, so a screen this file
 * does not cover behaves normally instead of silently rendering as empty. An
 * un-fixtured screen should look broken, not finished.
 */
const THREADS = [
  {
    id: 'thread-modes',
    title: 'Sport mode vs sport transmission',
    created_at: '2026-09-12T14:10:00Z',
    updated_at: '2026-09-13T14:42:00Z',
  },
  { id: 'thread-pump', title: null, created_at: '2026-09-11T16:00:00Z', updated_at: '2026-09-11T16:04:00Z' },
];

const THREAD_MESSAGES: Record<string, Array<{ role: 'user' | 'assistant'; content: string }>> = {
  'thread-modes': [
    { role: 'user', content: "What's the difference between the sport driving mode and sport transmission mode?" },
    {
      role: 'assistant',
      content:
        'Sport on the rocker changes the whole car — throttle map, steering weight, the adaptive dampers and the shift schedule. Sport on the shifter changes the gearbox alone: it holds gears longer and shifts harder, and leaves the rest as it was.',
    },
  ],
  'thread-pump': [
    { role: 'user', content: 'Tell me about the electric water pump on my 2015 BMW M235i.' },
    {
      role: 'assistant',
      content:
        'The N55 uses an electric coolant pump that fails without much warning, usually between 60,000 and 90,000 miles. Budget for it with the thermostat; the labour overlaps.',
    },
  ],
};

/**
 * The design car's tire set — §0.8 of the tire loop's shared frame, transposed
 * onto the M235i's odometer (20 Sep).
 *
 * The worked example is a 2019 Golf R at 78,412 miles; the design car reads
 * 66,000. Every figure below is the example's, shifted by that difference, so
 * the frame the loop graded — `ON THIS SET 24,180 MI`, `11,400` since,
 * `PAST 5,400 MI`, a run of 78.83pt on a 353pt axis — is what the simulator
 * shows on the car every other fixture already draws. Rows are the route's
 * shape (`app/api/v1/tires/route.ts`); `EXPO_PUBLIC_DESIGN_EMPTY=tires` shows
 * the no-set state, and `=interval` the set with no interval entered.
 */
const TIRE_SET = {
  id: 'set-design',
  vehicle_id: M235I.id,
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  size_front: '245/35R19',
  size_rear: '245/35R19',
  installed_on: '2025-03-12',
  install_odometer: M235I.current_mileage - 24_180,
  purchase_place: 'Discount Tire',
  rotation_interval_miles: 6_000,
  interval_source: 'owner',
  treadwear_miles_entered: 45_000,
  provenance: 'invoice',
  retired_at: null,
};
const TIRE_ROTATIONS = [
  { id: 'rot-1', set_id: TIRE_SET.id, rotated_on: '2025-06-28', odometer: M235I.current_mileage - 18_272, provenance: 'invoice' },
  { id: 'rot-2', set_id: TIRE_SET.id, rotated_on: '2025-11-09', odometer: M235I.current_mileage - 11_400, provenance: 'typed' },
];

export function fixtureFor(
  path: string,
  request: { method?: string; body?: unknown } = {}
): unknown | undefined {
  if (path.startsWith('/tires')) {
    /* Writes fall through to the network — a canned "saved" would be a screenshot that lies. */
    if (request.method && request.method !== 'GET') return undefined;
    if (DESIGN_EMPTY.has('tires')) return { set: null, rotations: [] };
    if (DESIGN_EMPTY.has('interval')) {
      return { set: { ...TIRE_SET, rotation_interval_miles: null, interval_source: null }, rotations: TIRE_ROTATIONS };
    }
    return { set: TIRE_SET, rotations: TIRE_ROTATIONS };
  }
  if (path.startsWith('/upload-photo')) {
    if (request.method === 'DELETE') {
      addedPhotoUri = null;
      return { success: true };
    }
    const uri = filePartUri(request.body);
    // Not the shape the app sends: fall through to the network rather than
    // answer a request this file does not understand.
    if (!uri) return undefined;
    addedPhotoUri = uri;
    return { success: true, photoUrl: uri };
  }
  if (path.startsWith('/vehicles')) return { vehicles: [designCar()] };
  if (path.startsWith('/load-vehicle')) {
    /*
      ── 12 Sep · the drivers, computed rather than written ───────────────────

      The loop could never show the factors table: this returned the vehicle
      alone, so `HealthScreen` opened on a dial with nothing under it and the
      critique marked B6 unconfirmed for want of a frame. The route derives
      `health_drivers` at read from facts already on the response
      (`load-vehicle/route.ts`, D10), and `driversForVehicle` is pure — so the
      fixture calls the same function on its own facts. The schedule is
      `SCHEDULE` above (12 Sep; it was `undefined`, so Maintenance reported
      no schedule and scored nothing); two recalls score the recalls driver
      low; 66,000 miles on a 2015 car is a light load. Every sentence on the
      frame is one the product would write.
    */
    const schedule = DESIGN_EMPTY.has('schedule') ? [] : SCHEDULE;
    return {
      vehicle: designCar(),
      /*
        ⚠ A top-level sibling of `vehicle`, as the route returns it — the
        screen's own docblock records that reading it off the vehicle is
        `undefined` forever with no error anywhere.
      */
      knowledge: { known_issues: KNOWN_ISSUES, maintenance_schedule: schedule, common_mods: COMMON_MODS },
      health_drivers: driversForVehicle({
        schedule,
        historyRows: DESIGN_EMPTY.has('history') ? [] : MAINTENANCE,
        recalls: M235I.nhtsa_data.recalls,
        currentMileage: M235I.current_mileage,
        year: M235I.year,
      }),
    };
  }
  if (path.startsWith('/load-maintenance-data')) {
    return {
      lineItems: [],
      maintenanceLineItems: DESIGN_EMPTY.has('history') ? [] : MAINTENANCE,
    };
  }
  /* Needs — what has been added this session. See `answerWishlist`. */
  if (path.startsWith('/wishlist')) return answerWishlist(path, request);
  /*
    ── 13 Sep · the advisor's threads, so the sheet can be photographed ─────
    Two threads the shape the routes send — `conversations` newest first, one
    without a server title so the fallback row is in frame — and each one's
    messages. `/consultant` itself stays unanswered (held or real), because a
    canned answer would put words in the model's mouth on a frame.
  */
  if (path.startsWith('/consultant/conversations/')) {
    const id = path.slice('/consultant/conversations/'.length);
    return {
      conversation: {
        id,
        title: THREADS.find((t) => t.id === id)?.title ?? null,
        messages: THREAD_MESSAGES[id] ?? [],
      },
    };
  }
  if (path.startsWith('/consultant/conversations')) return { conversations: THREADS };
  return undefined;
}
