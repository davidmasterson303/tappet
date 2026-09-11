/**
 * Renders the house plate — the night, wet-asphalt image a car stands on when
 * its owner has not photographed it — to `apps/mobile/assets/night-plate.jpg`.
 *
 *   node apps/mobile/scripts/render-night-plate.mjs
 *
 * ── Why it is rendered rather than photographed ─────────────────────────────
 *
 * Locked iOS brief B2: *"Plate is a night, wet-asphalt, sodium/cyan image,
 * full-bleed with one 45° cut."* The owner's photograph is missing far more
 * often than not — no upload yet, a format iOS cannot decode, a signed URL
 * expired — and until 11 Sep the no-photo plate was a graphite gradient with
 * the make's name centred in it in the sans: a wordmark doing an image's job,
 * which the critique named as the one AI tell left on the phone.
 *
 * There is no photograph to bundle. Nothing in this repository is licensed for
 * it, and a stock frame would carry somebody else's car. So the plate is built
 * from the direction's own vocabulary — night, wet asphalt, a sodium streetlight
 * against a cold cyan gel, lifted blacks, anamorphic grain — and it contains no
 * car at all, which is the honest empty state: the room is lit and the bay is
 * empty.
 *
 * ── Why a script and a committed file, not a runtime drawing ────────────────
 *
 * `react-native-svg` can draw the gradients but not the grain, the broken wet
 * reflections or the bokeh, and drawing 1.7 million pixels in JS on every mount
 * is the wrong place to spend a phone. The asset is a JPEG at quality 90 —
 * grain survives that; a PNG would be ~2 MB in git for no visible gain — and
 * it is 1206 × 1400, three times the plate's width on the phone it is composed
 * for, tall enough that the vehicle hero's `cover` crop keeps the whole scene
 * and the garage's shorter band keeps the horizon and the reflections.
 *
 * `sharp` is the root's own image dependency (`scripts/build-image-derivatives`
 * uses it); this resolves it from the workspace root and adds nothing.
 *
 * ── The composition, so it can be re-tuned deliberately ─────────────────────
 *
 * Horizon at 42% from the top. A sodium source upper-left with a wide warm
 * bloom and its reflection running down the wet ground; a cyan source off the
 * right edge, cooler and dimmer, with its own reflection; a run of distant
 * bokeh along the horizon; asphalt as perspective-stretched value noise that
 * breaks the reflections up; a thin anamorphic streak through the sodium
 * source; a split-tone curve that cools the shadows and warms the highlights;
 * a vignette; and monochrome grain last, so it sits on top of everything the
 * way film grain does.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
/* From the workspace root — see the docblock. */
const sharp = require(join(here, '..', '..', '..', 'node_modules', 'sharp'));

const W = 1206;
const H = 1400;
const HORIZON = 0.42;

/* Palette, in linear-ish 0..1 RGB. Sodium and cyan are the app's own tokens. */
const SODIUM = [0xfb / 255, 0x92 / 255, 0x3c / 255];
const CYAN = [0x22 / 255, 0xd3 / 255, 0xee / 255];
const OFFWHITE = [0.96, 0.95, 0.93];

/* ── Deterministic noise ──────────────────────────────────────────────────── */

function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Value noise in [0, 1]. */
function noise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal sum, three octaves, in [0, 1]. */
function fbm(x, y, seed = 0) {
  return (
    (noise(x, y, seed) * 0.5 + noise(x * 2.1, y * 2.1, seed + 1) * 0.3 + noise(x * 4.3, y * 4.3, seed + 2) * 0.2)
  );
}

/** A seeded uniform for the bokeh placement, so the render is reproducible. */
function uniform(i) {
  return hash(i, 977, 31);
}

/**
 * A skyline: flat-topped blocks of random height, in [0, 1], with random
 * widths around `width`. Buildings step; hills roll — smooth noise here read
 * as a range of mountains behind a lake.
 */
function blocks(u, width, seed) {
  const cell = Math.floor(u / width);
  const jitter = (hash(cell, 1, seed) - 0.5) * width * 0.8;
  const index = Math.floor((u + jitter) / width);
  const h = hash(index, 2, seed);
  /* Mostly low, a few tall — a skyline is not a picket fence. */
  return Math.pow(h, 2.2);
}

/* ── The lights ───────────────────────────────────────────────────────────── */

/**
 * Each light: position in unit coordinates, colour, bloom radius (fraction of
 * width), intensity, and how strongly its reflection runs down the ground.
 */
const LIGHTS = [
  { x: 0.16, y: 0.29, color: SODIUM, radius: 0.19, core: 0.016, intensity: 1.05, reflect: 1.25 },
  { x: 0.9, y: 0.2, color: CYAN, radius: 0.2, core: 0.014, intensity: 0.45, reflect: 0.75 },
  { x: 0.72, y: 0.335, color: OFFWHITE, radius: 0.07, core: 0.006, intensity: 0.28, reflect: 0.5 },
];

/* Distant lights along the horizon: sodium, off-white and cyan, blurred. */
const BOKEH = Array.from({ length: 18 }, (_, i) => {
  const t = uniform(i);
  const kind = uniform(i + 100);
  const color = kind < 0.55 ? SODIUM : kind < 0.85 ? OFFWHITE : CYAN;
  const depth = Math.pow(uniform(i + 200), 1.8); // most are far; a few are near and large
  return {
    x: 0.3 + t * 0.72,
    y: HORIZON - 0.01 - depth * 0.16,
    r: 0.0035 + depth * 0.03,
    color,
    intensity: 0.25 + uniform(i + 400) * 0.45,
  };
});

/* ── Render ───────────────────────────────────────────────────────────────── */

const buffer = new Float32Array(W * H * 3);

function at(x, y) {
  return (y * W + x) * 3;
}

for (let py = 0; py < H; py += 1) {
  const v = py / H;
  for (let px = 0; px < W; px += 1) {
    const u = px / W;
    const i = at(px, py);

    let r;
    let g;
    let b;

    /* City glow: the sky brightens into the horizon, warm toward the sodium side. */
    const glow = Math.exp(-Math.max(0, HORIZON - v) / 0.1);
    const glowWarm = Math.exp(-Math.abs(u - 0.2) / 0.45);

    if (v < HORIZON) {
      /* Sky: cold, near-black, fogging toward the horizon. */
      const haze = Math.pow(v / HORIZON, 3);
      r = 0.035 + haze * 0.04;
      g = 0.04 + haze * 0.05;
      b = 0.055 + haze * 0.07;
      /* Fog texture, low and slow. */
      const f = fbm(u * 2.5 + 3, v * 4, 7) - 0.5;
      r += f * 0.02;
      g += f * 0.022;
      b += f * 0.028;
      r += glow * (0.04 + glowWarm * 0.06);
      g += glow * (0.04 + glowWarm * 0.035);
      b += glow * (0.05 + glowWarm * 0.01);

      /*
        A street, not a shore: two ranks of building mass stand on the horizon,
        stepped, soft-edged in the fog. The far rank is hazier and taller; the
        near rank darker and lower. Neither has a window — the bokeh in front
        of them is all the detail the fog allows.
      */
      const far = HORIZON - 0.03 - blocks(u, 0.055, 61) * 0.15;
      const nearRank = HORIZON - 0.004 - blocks(u, 0.09, 67) * 0.07;
      const farMass = smooth(Math.min(1, Math.max(0, (v - far) / 0.02)));
      const nearMass = smooth(Math.min(1, Math.max(0, (v - nearRank) / 0.012)));
      const fogFade = 0.55; // the far rank never goes fully dark
      r = r * (1 - farMass * fogFade) + 0.045 * farMass * fogFade;
      g = g * (1 - farMass * fogFade) + 0.05 * farMass * fogFade;
      b = b * (1 - farMass * fogFade) + 0.065 * farMass * fogFade;
      r = r * (1 - nearMass * 0.85) + 0.035 * nearMass * 0.85;
      g = g * (1 - nearMass * 0.85) + 0.038 * nearMass * 0.85;
      b = b * (1 - nearMass * 0.85) + 0.048 * nearMass * 0.85;
    } else {
      /* Ground: wet asphalt — dark at the far edge, blotchy, finely grained. */
      const d = (v - HORIZON) / (1 - HORIZON); // 0 at the horizon, 1 at the bottom
      const persp = 1 / (d + 0.09);
      const tx = (u - 0.5) * persp * 7;
      const ty = persp * 11;
      const field = fbm(tx, ty, 3); // damp and drier tarmac, faint
      const fine = noise(px * 0.7, py * 0.7, 11);
      const grit = noise(px * 2.3, py * 2.3, 13);
      const near = smooth(Math.min(1, d * 1.6)); // the foreground reads as surface, the far road as dark
      const base = 0.04 + near * 0.018;
      const texture = (fine - 0.5) * 0.024 + (grit - 0.5) * 0.02 + (field - 0.5) * 0.01 * near;
      r = base + texture;
      g = base + 0.004 + texture;
      b = base + 0.014 + texture;
    }

    buffer[i] = r;
    buffer[i + 1] = g;
    buffer[i + 2] = b;
  }
}

/* Bloom from the two sources, and their reflections in the ground. */
for (let py = 0; py < H; py += 1) {
  const v = py / H;
  for (let px = 0; px < W; px += 1) {
    const u = px / W;
    const i = at(px, py);
    let ar = 0;
    let ag = 0;
    let ab = 0;

    for (const light of LIGHTS) {
      const dx = (u - light.x) * 1.0;
      const dy = (v - light.y) * (H / W);
      const dist = Math.sqrt(dx * dx + dy * dy);

      /* Wide bloom: exponential falloff; a small hot core. */
      const bloom = Math.exp(-dist / light.radius) * 0.55 + Math.exp(-(dist * dist) / (2 * light.core * light.core)) * 1.4;
      const strength = bloom * light.intensity;
      /* Highlights go toward off-white in the core, the colour in the bloom. */
      const whiten = Math.min(1, Math.exp(-(dist * dist) / (2 * light.core * light.core * 2.2)));
      ar += strength * (light.color[0] * (1 - whiten * 0.7) + whiten * 0.7);
      ag += strength * (light.color[1] * (1 - whiten * 0.7) + whiten * 0.7);
      ab += strength * (light.color[2] * (1 - whiten * 0.7) + whiten * 0.7);

      /* Reflection: below the horizon, mirrored under the light, broken by wet texture. */
      if (v > HORIZON) {
        const d = (v - HORIZON) / (1 - HORIZON);
        const persp = 1 / (d + 0.09);
        const width = 0.035 + d * 0.19; // the streak widens as it nears the viewer
        const lateral = Math.exp(-((u - light.x) * (u - light.x)) / (2 * width * width));
        const fall = Math.exp(-d * 1.7) * smooth(Math.min(1, d * 12)); // ramps in off the far edge
        /*
          A rain-slicked road is a stretched mirror: a point light becomes a
          tall streak, broken by the tarmac's own texture and sparked by the
          wet grit. Large standing water is deliberately absent — every
          version that had it read as a harbour, not a street.
        */
        const field = fbm((u - 0.5) * persp * 7, persp * 11, 3);
        const wet = 0.7 + field * 0.5;
        const smear = 0.65 + 0.35 * noise(px * 0.22, py * 0.035, 17); // vertical rain smear
        const sparkle = Math.pow(noise(px * 0.9, py * 0.16, 19), 10) * 3.2 * (0.4 + field); // sparse wet grit catching the light, clustered where it is wetter
        const ripple = smear + sparkle;
        const refl = lateral * fall * wet * ripple * light.reflect * light.intensity * 0.9;
        ar += refl * light.color[0];
        ag += refl * light.color[1];
        ab += refl * light.color[2];
      }
    }

    /* The anamorphic streak through the sodium source: thin, wide, slightly cool. */
    {
      const light = LIGHTS[0];
      const dy = (v - light.y) * (H / W);
      const dx = u - light.x;
      const line = Math.exp(-(dy * dy) / (2 * 0.0045 * 0.0045)) * Math.exp(-Math.abs(dx) / 0.3) * 0.14;
      ar += line * 0.6;
      ag += line * 0.85;
      ab += line * 1.0;
    }

    buffer[i] += ar;
    buffer[i + 1] += ag;
    buffer[i + 2] += ab;
  }
}

/* Bokeh: soft discs along the horizon, each with a faint reflection. */
for (const spot of BOKEH) {
  const cx = spot.x * W;
  const cy = spot.y * H;
  const rad = spot.r * W;
  const x0 = Math.max(0, Math.floor(cx - rad * 2.5));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad * 2.5));
  const y0 = Math.max(0, Math.floor(cy - rad * 2.5));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad * 2.5));
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const dx = (px - cx) / rad;
      const dy = (py - cy) / rad;
      const dist = Math.sqrt(dx * dx + dy * dy);
      /* A soft-edged disc with a halo. */
      const disc = dist < 1 ? 1 - smooth(Math.max(0, dist - 0.55) / 0.45) : 0;
      const halo = Math.exp(-dist / 1.1) * 0.35;
      const s = (disc * 0.8 + halo) * spot.intensity * 0.9;
      const i = at(px, py);
      buffer[i] += s * spot.color[0];
      buffer[i + 1] += s * spot.color[1];
      buffer[i + 2] += s * spot.color[2];
    }
  }
  /* Its reflection: a short vertical smear under the horizon. */
  const ry0 = Math.floor(HORIZON * H);
  const ry1 = Math.min(H - 1, ry0 + Math.floor(rad * 26));
  for (let py = ry0; py <= ry1; py += 1) {
    const d = (py - ry0) / Math.max(1, ry1 - ry0);
    const fall = Math.exp(-d * 3.2) * 0.22 * spot.intensity;
    const width = rad * (0.9 + d * 4);
    const x0r = Math.max(0, Math.floor(cx - width * 2));
    const x1r = Math.min(W - 1, Math.ceil(cx + width * 2));
    for (let px = x0r; px <= x1r; px += 1) {
      const dx = (px - cx) / width;
      const lateral = Math.exp(-(dx * dx) / 2);
      const wet = 0.6 + 0.4 * noise(px * 0.08, py * 0.5, 23);
      const s = fall * lateral * wet;
      const i = at(px, py);
      buffer[i] += s * spot.color[0];
      buffer[i + 1] += s * spot.color[1];
      buffer[i + 2] += s * spot.color[2];
    }
  }
}

/* Split tone, vignette, lifted blacks, grain — then to bytes. */
const out = Buffer.alloc(W * H * 3);

function tonemap(x) {
  /* A soft shoulder so the sodium core does not clip to a flat disc. */
  return x / (1 + x * 0.55);
}

for (let py = 0; py < H; py += 1) {
  const v = py / H;
  for (let px = 0; px < W; px += 1) {
    const u = px / W;
    const i = at(px, py);

    let r = tonemap(buffer[i]);
    let g = tonemap(buffer[i + 1]);
    let b = tonemap(buffer[i + 2]);

    /* Vignette: gentle, wider than tall. */
    const vx = (u - 0.5) * 1.6;
    const vy = (v - 0.5) * 1.15;
    const vig = 1 - 0.38 * Math.min(1, vx * vx + vy * vy);
    r *= vig;
    g *= vig;
    b *= vig;

    /* Split tone: cool the shadows, warm the highlights. */
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadow = Math.max(0, 1 - lum * 3);
    const high = Math.max(0, lum - 0.35);
    r += -0.008 * shadow + 0.05 * high;
    g += 0.006 * shadow + 0.02 * high;
    b += 0.02 * shadow - 0.03 * high;

    /* Lifted blacks: the floor is not zero. */
    r = 0.06 + r * 0.94;
    g = 0.062 + g * 0.94;
    b = 0.07 + b * 0.94;

    /* Grain: monochrome, gaussian-ish (sum of three uniforms), last. */
    const gn = (hash(px, py, 41) + hash(px, py, 43) + hash(px, py, 47)) / 3 - 0.5;
    const grain = gn * 0.075;
    r += grain;
    g += grain;
    b += grain;

    out[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
}

const assets = join(here, '..', 'assets');
mkdirSync(assets, { recursive: true });

const image = sharp(out, { raw: { width: W, height: H, channels: 3 } });
const jpeg = await image.clone().jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
writeFileSync(join(assets, 'night-plate.jpg'), jpeg);

/*
  ── The grain tile, for `PhotoGrade` ────────────────────────────────────────

  The plate carries its own grain; an owner's photograph needs it laid over.
  A 256 px tile of the same monochrome grain, mid-grey so an `overlay` blend
  leaves the average tone alone and only adds the texture. Tiled by `Image`'s
  `repeat`, so the file stays small whatever the plate's size.
*/
const GRAIN = 256;
const grain = Buffer.alloc(GRAIN * GRAIN);
for (let py = 0; py < GRAIN; py += 1) {
  for (let px = 0; px < GRAIN; px += 1) {
    const gn = (hash(px, py, 71) + hash(px, py, 73) + hash(px, py, 79)) / 3 - 0.5;
    grain[py * GRAIN + px] = Math.max(0, Math.min(255, Math.round(128 + gn * 110)));
  }
}
const grainPng = await sharp(grain, { raw: { width: GRAIN, height: GRAIN, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(join(assets, 'grain.png'), grainPng);

const previewPath = process.argv[2];
if (previewPath) {
  const preview = await image.clone().resize({ width: 402 }).png().toBuffer();
  writeFileSync(previewPath, preview);
}

console.log(
  `night-plate.jpg ${W}×${H}, ${(jpeg.length / 1024).toFixed(0)} KB · grain.png ${GRAIN}×${GRAIN}, ${(grainPng.length / 1024).toFixed(0)} KB`
);
