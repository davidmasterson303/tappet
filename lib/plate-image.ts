/**
 * The long half of a generation plate: ask the image model for the frame,
 * cut the two derivatives.
 *
 * ── ⚠ No repo imports, deliberately ─────────────────────────────────────────
 *
 * `netlify/functions/plate-generate-background.mts` bundles this file with
 * esbuild, which does not know the app's `@/` and `@tappet/core/*` aliases.
 * Everything here reaches only `fetch`, `Buffer` and `jimp`, so the function
 * and `lib/plates.ts` (which the app uses locally, where there is no function
 * server) run the same code. The prompt, the sizes and the model name arrive
 * as arguments; the decisions live in `packages/core/src/plates.ts`.
 *
 * Why the model is called over REST rather than through `lib/gemini.ts`: that
 * module builds its client at import time from a server-side key and is
 * shaped for Next; a background function wants one request and one response.
 * The request body is the one `~/Developer/design-loop/scripts/gen-image.mjs`
 * sends, which is what made the demo plates.
 */
import { Jimp, JimpMime } from 'jimp';

export interface GeneratedFrame {
  /** The frame as the model returned it — PNG, kept for the archive path. */
  png: Buffer;
  mimeType: string;
  /** `usageMetadata` off the response, opaque; the caller meters it. */
  usage: unknown;
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  /** Milliseconds before the call is abandoned. Image calls run 10–40 s. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * One image call. Throws with a legible message on every failure path — a
 * refused key, a blocked prompt, a response with no image — so the row's
 * `error` column says something a person can act on.
 */
export async function generatePlateFrame(options: GenerateOptions): Promise<GeneratedFrame> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
  try {
    const res = await doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: options.prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: options.aspectRatio, imageSize: options.imageSize },
          },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = (json.error as { message?: string } | undefined)?.message ?? res.statusText;
      throw new Error(`image model ${res.status}: ${message}`);
    }
    const candidates = json.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> }; finishReason?: string }> | undefined;
    const parts = candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((p) => p.inlineData || p.inline_data) as
      | { inlineData?: { data: string; mimeType?: string }; inline_data?: { data: string; mime_type?: string } }
      | undefined;
    const inline = image?.inlineData ?? image?.inline_data;
    if (!inline?.data) {
      const reason = candidates?.[0]?.finishReason ?? (json.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
      throw new Error(`image model returned no image${reason ? ` (${reason})` : ''}`);
    }
    return {
      png: Buffer.from(inline.data, 'base64'),
      mimeType: (image?.inlineData?.mimeType ?? image?.inline_data?.mime_type ?? 'image/png') as string,
      usage: json.usageMetadata ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface DerivativeSpec {
  width: number;
  height: number;
  quality: number;
}

/**
 * Cover-crop the frame to each spec's exact geometry and encode as JPEG.
 *
 * `cover` rather than `resize` so a frame that came back at a slightly
 * different ratio still fills the slot edge to edge — the plate is a band,
 * and a letterboxed band is the thing the whole design pass removed.
 */
export async function derivePlateJpegs<K extends string>(
  png: Buffer,
  specs: Record<K, DerivativeSpec>,
): Promise<Record<K, Buffer>> {
  const source = await Jimp.read(png);
  const out = {} as Record<K, Buffer>;
  for (const name of Object.keys(specs) as K[]) {
    const spec = specs[name];
    const image = source.clone();
    image.cover({ w: spec.width, h: spec.height });
    out[name] = await image.getBuffer(JimpMime.jpeg, { quality: spec.quality });
  }
  return out;
}
