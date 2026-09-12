/**
 * Generation plates — the night photograph a car stands on when its owner has
 * not photographed it.
 *
 * ── The decision (David, 11 Sep) ────────────────────────────────────────────
 *
 * The three demo cars stand on generated night plates and David wants every
 * car to: *"these images look great, they perfectly fit the aesthetic of the
 * site. I want to use such images for all cars as default image."* With three
 * limits he set himself, each of which shapes this file:
 *
 * - **Per model generation, not per year** — *"they don't always change much
 *   year to year and these stylized images are forgiving to super minor
 *   differences."* The key is make + family + generation; the row carries the
 *   year range it stands for.
 * - **A library** — *"so we don't create new for two users who have the same
 *   model generation."* One row per key, found before anything is generated.
 * - **Colour is not honoured** — *"that's exponentially more."* Every plate is
 *   the same dark graphite. It reads as the product's colour, not as a claim
 *   about the owner's car, which is the honest reading of a plate anyway.
 *
 * And the rights posture he accepted: usable, not ours to claim. Nothing here
 * says otherwise; `public/vehicles/CREDITS.md` carries the full argument.
 *
 * ── What lives here and what does not ───────────────────────────────────────
 *
 * Everything decidable without a network: the key, the storage paths, the
 * derivative sizes, the prompt, the validator for the generation answer, the
 * cap. `lib/plates.ts` does the I/O; `netlify/functions/plate-generate-
 * background.mts` does the long call. Both import from here so the three
 * agree on the spelling of a key, and so all of this is tested by
 * `plates.test.ts` without a model or a database in the loop.
 *
 * Portable: pure string and date work, no I/O, no browser globals.
 */

/** The public bucket the plates live in — it already exists; no new bucket. */
export const PLATE_BUCKET = 'garage-images';

/** The image model, pinned. The kit's estimate at the 2K size is US$0.134. */
export const PLATE_IMAGE_MODEL = 'gemini-3-pro-image-preview';
export const PLATE_COST_USD_ESTIMATE = 0.134;

/**
 * Generations allowed per rolling day, across every user.
 *
 * ⚠ CLAUDE.md §9: cap every spending path, and make exhaustion degrade the
 * feature rather than break it. At the cap a new generation stays `pending`
 * and the car stands on the house plate — nothing an owner sees is broken,
 * and the next day's first request picks it up. 25 × US$0.134 ≈ US$3.35 a
 * day at most, which is a bad day and not a bad month.
 */
export const PLATE_DAILY_CAP = 25;

/** A `generating` claim older than this is treated as abandoned. */
export const PLATE_CLAIM_STALE_MS = 10 * 60_000;

export type PlateStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface PlateRow {
  key: string;
  make: string;
  family: string;
  generation: string;
  year_from: number;
  year_to: number;
  status: PlateStatus;
  hero_path: string | null;
  card_path: string | null;
  prompt: string | null;
  model: string | null;
  attempts: number;
  error: string | null;
  claimed_at: string | null;
  generated_at: string | null;
  cost_usd_estimate: number | null;
  created_at: string;
  updated_at: string;
}

/** Lower-case, ASCII, hyphen-separated; `M235i xDrive` → `m235i-xdrive`. */
export function plateSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * `<make>/<family>/<generation>`, e.g. `bmw/2-series/f22`.
 *
 * Three segments so a key is legible in a bucket listing and so a whole
 * family's plates sit together. Derived here and nowhere else: the trigger,
 * the job and the reader must agree on it byte for byte.
 */
export function plateKey(parts: { make: string; family: string; generation: string }): string {
  const make = plateSlug(parts.make);
  const family = plateSlug(parts.family);
  const generation = plateSlug(parts.generation);
  if (!make || !family || !generation) {
    throw new Error('plateKey needs a make, a family and a generation');
  }
  return `${make}/${family}/${generation}`;
}

/**
 * Where a plate's two derivatives live inside the bucket.
 *
 * The names are the ones `cardSlotSource` already understands for the demo
 * cars — `hero-3x2` for a band, `card-800` for a card — so the reader needs
 * no new rule to pick the small file for the small slot.
 */
export function plateObjectPaths(key: string): { hero: string; card: string } {
  return { hero: `plates/${key}/hero-3x2.jpg`, card: `plates/${key}/card-800.jpg` };
}

/** The public URL for an object in the plate bucket. */
export function platePublicUrl(supabaseUrl: string, objectPath: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${PLATE_BUCKET}/${objectPath}`;
}

/**
 * The two files derived from one generated frame, in pixels and JPEG quality.
 *
 * Sized to the demo cars' derivatives (2400-wide heroes proved more than a
 * band needs; 1600 keeps the file under ~250 KB) and encoded as JPEG only:
 * there is no AVIF/WebP encoder in the background job, and `photoFormats`
 * already offers siblings only for `/vehicles/` paths.
 */
export const PLATE_DERIVATIVES = {
  hero: { width: 1600, height: 1067, quality: 82 },
  card: { width: 800, height: 533, quality: 80 },
} as const;

/** The frame the image model is asked for. 3:2 matches every derivative. */
export const PLATE_ASPECT = '3:2';
export const PLATE_IMAGE_SIZE = '2K';

export interface PlateSubject {
  year: number;
  make: string;
  family: string;
  /** e.g. "sedan", "coupe", "hatchback", "wagon", "SUV", "pickup truck". */
  body: string;
}

/**
 * The house prompt, varying only the car.
 *
 * It is the prompt that made the three demo plates (recorded verbatim in
 * `public/vehicles/CREDITS.md`) with three deliberate changes: the colour is
 * fixed to dark graphite, because colour is not honoured; the car is "stock
 * and unmodified", because a plate must not put a wing on somebody's daily
 * driver; and badges are asked away, because a marque's badge is the one part
 * of a car a trademark reaches and the plate reads as the same car without it.
 */
export function platePrompt(subject: PlateSubject): string {
  const car = `${subject.year} ${subject.make} ${subject.family} ${subject.body}`.replace(/\s+/g, ' ').trim();
  return [
    'Hero plate for a vehicle\'s page in a car-ownership app. Role: product-in-context — a wide band across the top of the page, the car identified and centred.',
    '',
    `Subject: a ${car}, stock and unmodified, painted a dark graphite metallic, three-quarter front view, stationary on wet asphalt at night in a quiet industrial street. No legible badges, emblems or lettering anywhere on the car.`,
    '',
    'Composition: the car fills the middle of a wide frame with room either side; camera at bumper height; the road surface runs to both edges. Nothing crops the car.',
    '',
    'Lighting: a warm sodium streetlamp above and to the left throwing an orange reflection across the wet road; a cold cyan light from the right raking the flank and pooling on the tarmac. Deep black shadows. Both temperatures clearly present.',
    '',
    'Anamorphic, shallow depth of field, fine film grain, filmic teal-and-orange grade held restrained. No text, no logos, no people, no neon signage, no underglow, no light trails.',
  ].join('\n');
}

/**
 * What the generation classifier is asked, and the shape it must answer in.
 *
 * A text model names the family, the generation and its year range; the key
 * is built from the first two. Asked at VIN decode, once per generation.
 */
export function generationPrompt(input: { year: number; make: string; model: string; trim?: string }): string {
  const car = `${input.year} ${input.make} ${input.model}${input.trim ? ` ${input.trim}` : ''}`;
  return [
    `Identify the model generation of this car: ${car}.`,
    '',
    'Answer with JSON only, exactly these keys:',
    '{"family": "the model line as sold, e.g. \\"2 Series\\", \\"Accord\\", \\"F-150\\"",',
    ' "generation": "the generation\'s common code or ordinal, e.g. \\"F22\\", \\"10th generation\\", \\"Mk7\\"",',
    ' "label": "a short human label, e.g. \\"F22 (2014–2021)\\"",',
    ' "year_from": first model year of this generation as a number,',
    ' "year_to": last model year as a number (use the current year if still in production),',
    ' "body": "one of: sedan, coupe, convertible, hatchback, wagon, SUV, crossover, pickup truck, van, minivan, sports car"}',
    '',
    'Rules: the year range must include the car\'s model year; the family is the line, never the trim (\\"M235i\\" is a trim of the 2 Series); if you are not confident of the generation, set generation to "unknown".',
  ].join('\n');
}

export interface GenerationClassification {
  family: string;
  generation: string;
  label: string;
  year_from: number;
  year_to: number;
  body: string;
}

const BODIES = new Set([
  'sedan', 'coupe', 'convertible', 'hatchback', 'wagon', 'suv', 'crossover',
  'pickup truck', 'van', 'minivan', 'sports car',
]);

/** The longest run any one generation is allowed to claim. */
const MAX_GENERATION_SPAN = 15;

/**
 * Validate the classifier's answer against the car it was asked about.
 *
 * ⚠ CLAUDE.md §10: `unknown` over a guessed default. Anything that fails —
 * a range that does not include the car's year, a span no generation has, a
 * missing family, an unknown generation — returns `null`, and the caller
 * falls back to `singleYearClassification`, which claims exactly the one year
 * it knows. A wrong range would put a 2024 on a 2009's plate and call it the
 * same car.
 */
export function readGenerationClassification(
  raw: unknown,
  year: number,
  now: Date = new Date(),
): GenerationClassification | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const family = typeof r.family === 'string' ? r.family.trim() : '';
  const generation = typeof r.generation === 'string' ? r.generation.trim() : '';
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  const body = typeof r.body === 'string' ? r.body.trim().toLowerCase() : '';
  const from = Number(r.year_from);
  const to = Number(r.year_to);
  if (!family || !generation || generation.toLowerCase() === 'unknown') return null;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from > to || year < from || year > to) return null;
  if (to - from + 1 > MAX_GENERATION_SPAN) return null;
  // A generation can run on past the car's year, but not past next year's
  // showroom — compared to today, not to the car.
  if (from < 1950 || to > now.getFullYear() + 2) return null;
  return {
    family,
    generation,
    label: label || `${generation} (${from}–${to})`,
    year_from: from,
    year_to: to,
    body: BODIES.has(body) ? body : 'sedan',
  };
}

/**
 * The honest fallback: a plate that stands for this one model year only.
 * Family is the model as decoded, generation is the year — so a second car of
 * the same model and year still shares it, and nothing is claimed about any
 * other year.
 */
export function singleYearClassification(input: { year: number; make: string; model: string }): GenerationClassification {
  return {
    family: input.model,
    generation: `${input.year}`,
    label: `${input.year}`,
    year_from: input.year,
    year_to: input.year,
    body: 'sedan',
  };
}

/** Whether a library row stands for a given model year of its make/family. */
export function plateCoversYear(row: Pick<PlateRow, 'year_from' | 'year_to'>, year: number): boolean {
  return year >= row.year_from && year <= row.year_to;
}

/** A claim the job never finished — the next request may take it over. */
export function isClaimStale(row: Pick<PlateRow, 'status' | 'claimed_at'>, now = Date.now()): boolean {
  if (row.status !== 'generating') return false;
  if (!row.claimed_at) return true;
  return now - Date.parse(row.claimed_at) > PLATE_CLAIM_STALE_MS;
}

/**
 * Whether a row still needs a generation run. `ready` never does; a fresh
 * `generating` claim is somebody else's; everything else — pending, failed,
 * or a stale claim — is work.
 */
export function plateNeedsGeneration(row: Pick<PlateRow, 'status' | 'claimed_at'>, now = Date.now()): boolean {
  if (row.status === 'ready') return false;
  if (row.status === 'generating') return isClaimStale(row, now);
  return true;
}

/** The cap, as a pure question: has the last day already spent its allowance? */
export function plateCapReached(generatedInLastDay: number, cap = PLATE_DAILY_CAP): boolean {
  return generatedInLastDay >= cap;
}

/**
 * The card's copy for a car standing on the house plate, by plate state.
 * Returns null when there is nothing to say — no plate asked for, or ready
 * (the photograph speaks). Mono, short, and never a percentage.
 */
export function plateStatusLine(status: PlateStatus | null | undefined): string | null {
  switch (status) {
    case 'pending':
    case 'generating':
      return 'Drawing this car\'s plate';
    case 'failed':
      return 'Plate not drawn yet';
    default:
      return null;
  }
}
