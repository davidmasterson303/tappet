/**
 * The long half of a generation plate, run where it is allowed to be long.
 *
 * ── Why a background function ───────────────────────────────────────────────
 *
 * The image model takes ten to forty seconds. The app's own routes run inside
 * Netlify's function limit for synchronous requests, which is a few seconds,
 * so the call cannot live in a route. A `*-background` function answers 202
 * the moment it is invoked and may run for fifteen minutes — the app's
 * `triggerPlateJob` in `lib/plates.ts` posts here and returns.
 *
 * ── Deliberately the thinnest thing that could work ─────────────────────────
 *
 * Same doctrine as `notify-sweep.mts`: nothing here decides anything. The row
 * is claimed and stored through two secret-guarded routes in the app, where
 * the logic lives and is tested; this file is the one place the image call
 * and the resize can run, and it imports only `lib/plate-image.ts`, which has
 * no repo aliases so esbuild can bundle it here.
 *
 * ── ⚠ Secrets, in two places (CLAUDE.md §7) ─────────────────────────────────
 *
 * `CRON_SECRET` (already set for the sweep) and `GEMINI_API_KEY` (already
 * set for the advisor) must both be present on the Netlify site — and on
 * **both** sites, since each deploys this function. `URL` is Netlify's own.
 */
import { generatePlateFrame, derivePlateJpegs } from '../../lib/plate-image';

const IMAGE_MODEL = 'gemini-3-pro-image-preview';
const ASPECT = '3:2';
const IMAGE_SIZE = '2K';
const DERIVATIVES = {
  hero: { width: 1600, height: 1067, quality: 82 },
  card: { width: 800, height: 533, quality: 80 },
} as const;

function timingSafeMatch(a: string | null, b: string): boolean {
  if (a === null || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const site = process.env.URL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!secret || !site || !apiKey) {
    console.error('[plate-generate] CRON_SECRET, URL or GEMINI_API_KEY is not set — refusing');
    return new Response('Not configured', { status: 503 });
  }
  if (!timingSafeMatch(request.headers.get('x-cron-secret'), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let key = '';
  try {
    key = String(((await request.json()) as { key?: unknown }).key ?? '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!key) return new Response('Missing key', { status: 400 });

  const headers = { 'content-type': 'application/json', 'x-cron-secret': secret };
  const claim = await fetch(`${site}/api/internal/plates/claim`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ key }),
  });
  if (claim.status === 204) {
    console.log(`[plate-generate] ${key}: nothing to do`);
    return new Response(null, { status: 202 });
  }
  if (!claim.ok) {
    console.warn(`[plate-generate] ${key}: claim refused ${claim.status}`);
    return new Response(null, { status: 202 });
  }
  const { prompt, model } = (await claim.json()) as { prompt: string; model?: string | null };

  try {
    const frame = await generatePlateFrame({
      apiKey,
      model: model ?? IMAGE_MODEL,
      prompt,
      aspectRatio: ASPECT,
      imageSize: IMAGE_SIZE,
    });
    const jpegs = await derivePlateJpegs(frame.png, DERIVATIVES);
    const store = await fetch(`${site}/api/internal/plates/store`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        model: model ?? IMAGE_MODEL,
        hero: jpegs.hero.toString('base64'),
        card: jpegs.card.toString('base64'),
      }),
    });
    if (!store.ok) throw new Error(`store ${store.status}: ${await store.text()}`);
    console.log(`[plate-generate] ${key}: ready`);
  } catch (error) {
    const message = (error as Error).message;
    console.error(`[plate-generate] ${key}: ${message}`);
    await fetch(`${site}/api/internal/plates/fail`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key, error: message }),
    }).catch(() => undefined);
  }
  return new Response(null, { status: 202 });
};
