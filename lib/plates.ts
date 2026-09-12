/**
 * The generation-plate library — the server half.
 *
 * ── The shape (11 Sep) ──────────────────────────────────────────────────────
 *
 *   VIN decode ──▶ ensurePlate()            names the generation, finds or
 *                     │                      inserts the library row
 *                     ├─▶ attachPlateToVehicle()   at createVehicle, once the row exists
 *                     └─▶ triggerPlateJob()        202 from the background function
 *                                │
 *     plate-generate-background ─┤   claim ──▶ image model ──▶ two JPEGs ──▶ store
 *                                │   (this file, through two secret-guarded routes)
 *   garage / dashboard ◀── vehicle_plates.status, read anonymously ──▶ the card
 *
 * The decisions — key, prompt, sizes, cap, validation — are in
 * `packages/core/src/plates.ts` and tested there. This file is the I/O:
 * Supabase rows and storage, one small text call, and one HTTP trigger.
 *
 * ── ⚠ Nothing here may slow onboarding or break a page ──────────────────────
 *
 * `ensurePlate` is called from the VIN step, ahead of the form. It makes one
 * short model call (the generation name) and one upsert, and everything it
 * cannot do it logs and returns from: a plate is a default photograph, and
 * the house plate is what renders in its absence. No caller awaits the image.
 *
 * ── ⚠ The cap is enforced at the claim, which is the last moment before the
 * money is spent. A row beyond it stays `pending`; the next day's first claim
 * takes it. CLAUDE.md §9.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@tappet/core/logger';
import { FLASH_MODEL } from '@tappet/core/ai/models';
import {
  PLATE_ASPECT,
  PLATE_BUCKET,
  PLATE_COST_USD_ESTIMATE,
  PLATE_DERIVATIVES,
  PLATE_IMAGE_MODEL,
  PLATE_IMAGE_SIZE,
  generationPrompt,
  plateCapReached,
  plateCoversYear,
  plateKey,
  plateNeedsGeneration,
  plateObjectPaths,
  platePrompt,
  plateSlug,
  readGenerationClassification,
  singleYearClassification,
  type GenerationClassification,
  type PlateRow,
  type PlateStatus,
} from '@tappet/core/plates';
import { derivePlateJpegs, generatePlateFrame } from './plate-image';

const LOG = 'PLATES';

/** Service role, built here so this file has no Next-shaped import. */
function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('plates: Supabase service credentials are not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface EnsurePlateInput {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}

export interface EnsurePlateResult {
  key: string | null;
  status: PlateStatus | null;
  /** Why there is no key, when there is none. */
  reason?: string;
}

/**
 * Name the generation with the text model, validated; fall back to the one
 * year the decode already knows. Never throws.
 */
async function classifyGeneration(input: EnsurePlateInput): Promise<GenerationClassification> {
  const fallback = singleYearClassification(input);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${FLASH_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: generationPrompt({ ...input, trim: input.trim ?? undefined }) }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      },
    ).finally(() => clearTimeout(timer));
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const parsed = JSON.parse(text.replace(/^```json\s*|```\s*$/g, ''));
    const read = readGenerationClassification(parsed, input.year);
    if (!read) {
      logger.warn(`${LOG}:CLASSIFY_REFUSED`, 'Generation answer refused, using the single year', {
        make: input.make,
        model: input.model,
        year: input.year,
      });
      return fallback;
    }
    return read;
  } catch (error) {
    logger.warn(`${LOG}:CLASSIFY_FAILED`, 'Generation call failed, using the single year', {
      make: input.make,
      model: input.model,
      error: (error as Error).message,
    });
    return fallback;
  }
}

/**
 * Find the row that already stands for this car, before asking the model:
 * same make, family spelled as the decoded model, covering the year. Catches
 * every fallback-keyed row and every family whose name is its model's.
 */
async function findExistingPlate(client: SupabaseClient, input: EnsurePlateInput): Promise<PlateRow | null> {
  const { data } = await client
    .from('vehicle_plates')
    .select('*')
    .eq('make', plateSlug(input.make))
    .eq('family', plateSlug(input.model))
    .lte('year_from', input.year)
    .gte('year_to', input.year)
    .limit(1);
  const row = (data?.[0] as PlateRow | undefined) ?? null;
  return row && plateCoversYear(row, input.year) ? row : null;
}

/**
 * Find or create the library row for this car's generation, and start its
 * generation if it needs one. Safe to call twice; cheap when the row exists.
 */
export async function ensurePlate(input: EnsurePlateInput, deps: { client?: SupabaseClient } = {}): Promise<EnsurePlateResult> {
  const year = Number(input.year);
  const thisYear = new Date().getFullYear();
  if (!input.make?.trim() || !input.model?.trim() || !Number.isInteger(year) || year < 1950 || year > thisYear + 2) {
    return { key: null, status: null, reason: 'not enough of a car to draw' };
  }
  let client: SupabaseClient;
  try {
    client = deps.client ?? serviceClient();
  } catch (error) {
    return { key: null, status: null, reason: (error as Error).message };
  }

  try {
    const existing = await findExistingPlate(client, { ...input, year });
    let row = existing;
    if (!row) {
      const generation = await classifyGeneration({ ...input, year });
      const key = plateKey({ make: input.make, family: generation.family, generation: generation.generation });
      const prompt = platePrompt({ year, make: input.make.trim(), family: generation.family, body: generation.body });
      const { error: upsertError } = await client.from('vehicle_plates').upsert(
        {
          key,
          make: plateSlug(input.make),
          family: plateSlug(generation.family),
          generation: plateSlug(generation.generation),
          year_from: generation.year_from,
          year_to: generation.year_to,
          status: 'pending',
          prompt,
          model: PLATE_IMAGE_MODEL,
        },
        { onConflict: 'key', ignoreDuplicates: true },
      );
      if (upsertError) throw upsertError;
      const { data } = await client.from('vehicle_plates').select('*').eq('key', key).maybeSingle();
      row = (data as PlateRow | null) ?? null;
    }
    if (!row) return { key: null, status: null, reason: 'row did not land' };

    if (plateNeedsGeneration(row)) {
      await triggerPlateJob(row.key);
    }
    return { key: row.key, status: row.status };
  } catch (error) {
    logger.error(`${LOG}:ENSURE_FAILED`, error as Error, { make: input.make, model: input.model, year });
    return { key: null, status: null, reason: (error as Error).message };
  }
}

/**
 * Point a vehicle at its plate, once, and only if it has none. Never
 * overrides an owner photograph — `useVehicleImage` ranks those first
 * regardless — and never re-points a car that already stands on a plate.
 */
export async function attachPlateToVehicle(vehicleId: string, key: string, deps: { client?: SupabaseClient } = {}): Promise<boolean> {
  try {
    const client = deps.client ?? serviceClient();
    const { error } = await client
      .from('vehicles')
      .update({ plate_key: key })
      .eq('id', vehicleId)
      .is('plate_key', null);
    if (error) throw error;
    return true;
  } catch (error) {
    logger.warn(`${LOG}:ATTACH_FAILED`, 'Could not attach the plate to the vehicle', {
      vehicleId,
      key,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Start the background job.
 *
 * On Netlify: POST to the background function, which answers 202 at once and
 * runs for up to fifteen minutes — the app's own routes are capped at a few
 * seconds and the image call is not. `URL` is Netlify's deploy-time variable
 * for the site's address (see `notify-sweep.mts` for why it is safe), and
 * `CRON_SECRET` is the shared secret the internal routes already check.
 *
 * Locally there is no function server, so the job runs in this process,
 * un-awaited — `next dev` is a long-lived node process and finishes it.
 */
export async function triggerPlateJob(key: string): Promise<void> {
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (site && secret) {
    try {
      const res = await fetch(`${site}/.netlify/functions/plate-generate-background`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
        body: JSON.stringify({ key }),
      });
      if (res.status !== 202 && !res.ok) {
        logger.warn(`${LOG}:TRIGGER_REFUSED`, 'Background function did not accept the job', { key, status: res.status });
      }
    } catch (error) {
      logger.warn(`${LOG}:TRIGGER_FAILED`, 'Could not reach the background function', { key, error: (error as Error).message });
    }
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    void runPlateJob(key).catch((error) => {
      logger.warn(`${LOG}:LOCAL_JOB_FAILED`, 'Local plate job failed', { key, error: (error as Error).message });
    });
    return;
  }
  logger.warn(`${LOG}:NO_TRIGGER`, 'No URL/CRON_SECRET; the plate stays pending', { key });
}

/** Rows generated in the rolling last day — the cap's input. */
export async function countGeneratedLastDay(client: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count } = await client
    .from('vehicle_plates')
    .select('key', { count: 'exact', head: true })
    .gte('generated_at', since);
  return count ?? 0;
}

export type ClaimResult =
  | { claimed: true; row: PlateRow }
  | { claimed: false; reason: 'ready' | 'busy' | 'capped' | 'missing' };

/**
 * Take the row for generation. Refuses when it is ready, freshly claimed by
 * another job, or the day's cap is spent — in which case it stays `pending`.
 */
export async function claimPlate(key: string, deps: { client?: SupabaseClient; now?: number } = {}): Promise<ClaimResult> {
  const client = deps.client ?? serviceClient();
  const { data } = await client.from('vehicle_plates').select('*').eq('key', key).maybeSingle();
  const row = data as PlateRow | null;
  if (!row) return { claimed: false, reason: 'missing' };
  if (row.status === 'ready') return { claimed: false, reason: 'ready' };
  if (!plateNeedsGeneration(row, deps.now)) return { claimed: false, reason: 'busy' };
  if (plateCapReached(await countGeneratedLastDay(client))) {
    logger.warn(`${LOG}:CAPPED`, 'Daily plate cap reached; the row stays pending', { key });
    return { claimed: false, reason: 'capped' };
  }
  const claimedAt = new Date(deps.now ?? Date.now()).toISOString();
  const { data: updated, error } = await client
    .from('vehicle_plates')
    .update({ status: 'generating', claimed_at: claimedAt, updated_at: claimedAt })
    .eq('key', key)
    .eq('status', row.status)
    .select('*')
    .maybeSingle();
  if (error || !updated) return { claimed: false, reason: 'busy' };
  return { claimed: true, row: updated as PlateRow };
}

/** Write the two derivatives to the public bucket and mark the row ready. */
export async function storePlate(
  input: { key: string; hero: Buffer; card: Buffer; model?: string | null },
  deps: { client?: SupabaseClient } = {},
): Promise<void> {
  const client = deps.client ?? serviceClient();
  const paths = plateObjectPaths(input.key);
  const upload = async (path: string, body: Buffer) => {
    const { error } = await client.storage.from(PLATE_BUCKET).upload(path, body, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
  };
  await upload(paths.hero, input.hero);
  await upload(paths.card, input.card);
  const now = new Date().toISOString();
  const { data: current } = await client.from('vehicle_plates').select('attempts').eq('key', input.key).maybeSingle();
  const { error } = await client
    .from('vehicle_plates')
    .update({
      status: 'ready',
      hero_path: paths.hero,
      card_path: paths.card,
      model: input.model ?? PLATE_IMAGE_MODEL,
      generated_at: now,
      updated_at: now,
      error: null,
      attempts: ((current as { attempts?: number } | null)?.attempts ?? 0) + 1,
      cost_usd_estimate: PLATE_COST_USD_ESTIMATE,
    })
    .eq('key', input.key);
  if (error) throw new Error(`mark ready ${input.key}: ${error.message}`);
  logger.info(`${LOG}:READY`, 'Plate generated', { key: input.key });
}

/** Record a failed attempt; the next request for the key retries. */
export async function failPlate(key: string, message: string, deps: { client?: SupabaseClient } = {}): Promise<void> {
  const client = deps.client ?? serviceClient();
  const { data: current } = await client.from('vehicle_plates').select('attempts').eq('key', key).maybeSingle();
  const now = new Date().toISOString();
  await client
    .from('vehicle_plates')
    .update({
      status: 'failed',
      error: message.slice(0, 500),
      attempts: ((current as { attempts?: number } | null)?.attempts ?? 0) + 1,
      updated_at: now,
    })
    .eq('key', key);
  logger.error(`${LOG}:FAILED`, new Error(message), { key });
}

/**
 * The whole job in one process — what the background function does over
 * HTTP, and what `next dev` does in-process. Claim, generate, derive, store;
 * any failure after the claim is recorded on the row.
 */
export async function runPlateJob(key: string, deps: { client?: SupabaseClient } = {}): Promise<ClaimResult | { claimed: true; stored: true }> {
  const client = deps.client ?? serviceClient();
  const claim = await claimPlate(key, { client });
  if (!claim.claimed) return claim;
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    if (!claim.row.prompt) throw new Error('row has no prompt');
    const frame = await generatePlateFrame({
      apiKey,
      model: claim.row.model ?? PLATE_IMAGE_MODEL,
      prompt: claim.row.prompt,
      aspectRatio: PLATE_ASPECT,
      imageSize: PLATE_IMAGE_SIZE,
    });
    const jpegs = await derivePlateJpegs(frame.png, PLATE_DERIVATIVES);
    await storePlate({ key, hero: jpegs.hero, card: jpegs.card, model: claim.row.model }, { client });
    return { claimed: true, stored: true };
  } catch (error) {
    await failPlate(key, (error as Error).message, { client });
    throw error;
  }
}
