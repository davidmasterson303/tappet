/**
 * A car's research, run where it is allowed to take a minute.
 *
 * ── Why a background function ───────────────────────────────────────────────
 *
 * The dossier is 23–60 s of a Pro model. The app's own routes are not where
 * that belongs: this site's Next routes have been seen running past thirty
 * seconds, but 22 Aug also saw the *response* cut at about thirty while the
 * work carried on — undocumented behaviour, and CLAUDE.md §8 is about not
 * designing on that. A `*-background` function answers 202 the moment it is
 * invoked and may run for fifteen minutes; `triggerResearchJob` in
 * `lib/research-job.ts` posts here and returns.
 *
 * ── Deliberately the thinnest thing that could work ─────────────────────────
 *
 * Same doctrine as `plate-generate-background.mts`: nothing here decides
 * anything. The claim, the NHTSA fetch, the parse and the write happen in
 * four secret-guarded routes in the app, where the logic lives and is
 * tested; this file is the one place the Pro call can run for as long as it
 * takes, and it imports nothing at all — esbuild bundles it here without a
 * repo alias in sight.
 *
 * ── NHTSA first ─────────────────────────────────────────────────────────────
 *
 * The recall fetch answers in seconds and the phone's research log turns it
 * into two true lines about the person's car while the long call runs. So it
 * runs before the model, not after as the in-process path does; a failure
 * there is logged and the job continues — the row says NHTSA did not answer,
 * and the sweep asks again overnight.
 *
 * ── The retry policy, in one place ──────────────────────────────────────────
 *
 * Up to three model calls; a parse or validation failure (`store` answers
 * 422 `retry: true`) is worth a second pass, silence is not — a call that
 * did not answer in sixty seconds ends the loop, as `researchVehicleDossier`
 * does in-process. Exhaustion posts `fail`, which is the only exit that
 * leaves the row in a state the phone can name.
 *
 * ── ⚠ Secrets, in two places (CLAUDE.md §7) ─────────────────────────────────
 *
 * `CRON_SECRET` and `GEMINI_API_KEY` must both be present on the Netlify
 * site — on **both** sites, since each deploys this function. `URL` is
 * Netlify's own.
 */

const ATTEMPTS = 3;
const MODEL_TIMEOUT_MS = 60_000;

function timingSafeMatch(a: string | null, b: string): boolean {
  if (a === null || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface ModelAnswer {
  text: string;
  usageMetadata: unknown;
}

/** One Pro call over REST: the SDK's `config` is the REST `generationConfig`, same keys. */
async function askModel(
  apiKey: string,
  model: string,
  prompt: string,
  generationConfig: Record<string, unknown>
): Promise<ModelAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = (json.error as { message?: string } | undefined)?.message ?? res.statusText;
      throw new Error(`model ${res.status}: ${message}`);
    }
    const candidates = json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const text = (candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    return { text, usageMetadata: json.usageMetadata ?? null };
  } finally {
    clearTimeout(timer);
  }
}

export default async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const site = process.env.URL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!secret || !site || !apiKey) {
    console.error('[research] CRON_SECRET, URL or GEMINI_API_KEY is not set — refusing');
    return new Response('Not configured', { status: 503 });
  }
  if (!timingSafeMatch(request.headers.get('x-cron-secret'), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let vehicleId = '';
  try {
    vehicleId = String(((await request.json()) as { vehicleId?: unknown }).vehicleId ?? '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!vehicleId) return new Response('Missing vehicleId', { status: 400 });

  const headers = { 'content-type': 'application/json', 'x-cron-secret': secret };
  const post = (path: string, body: Record<string, unknown>) =>
    fetch(`${site}/api/internal/research/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

  const claim = await post('claim', { vehicleId });
  if (claim.status === 204) {
    console.log(`[research] ${vehicleId}: nothing to do`);
    return new Response(null, { status: 202 });
  }
  if (!claim.ok) {
    console.warn(`[research] ${vehicleId}: claim refused ${claim.status}`);
    return new Response(null, { status: 202 });
  }
  const { prompt, model, generationConfig } = (await claim.json()) as {
    prompt: string;
    model: string;
    generationConfig: Record<string, unknown>;
  };

  // NHTSA first — seconds, and the log's first two lines. Never fatal here.
  try {
    const recalls = await post('recalls', { vehicleId });
    const body = (await recalls.json().catch(() => ({}))) as { lookup_status?: string; recalls?: number };
    console.log(`[research] ${vehicleId}: NHTSA ${body.lookup_status ?? recalls.status}, ${body.recalls ?? 0} on file`);
  } catch (error) {
    console.warn(`[research] ${vehicleId}: NHTSA step failed: ${(error as Error).message}`);
  }

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    try {
      const answer = await askModel(apiKey, model, prompt, generationConfig);
      const store = await post('store', {
        vehicleId,
        text: answer.text,
        usageMetadata: answer.usageMetadata,
        model,
        attempt,
      });
      if (store.ok) {
        console.log(`[research] ${vehicleId}: written on attempt ${attempt}`);
        return new Response(null, { status: 202 });
      }
      const body = (await store.json().catch(() => ({}))) as { retry?: boolean; error?: string };
      lastError = body.error ?? `store ${store.status}`;
      if (store.status !== 422 || !body.retry) break;
      console.warn(`[research] ${vehicleId}: attempt ${attempt} did not parse — ${lastError}`);
    } catch (error) {
      lastError = (error as Error).message;
      console.warn(`[research] ${vehicleId}: attempt ${attempt} failed — ${lastError}`);
      // Silence is not retried: a model that did not answer in a minute is
      // unlikely to answer in the next one.
      if ((error as Error).name === 'AbortError') break;
    }
  }

  console.error(`[research] ${vehicleId}: giving up — ${lastError}`);
  await post('fail', { vehicleId, error: lastError }).catch(() => undefined);
  return new Response(null, { status: 202 });
};
