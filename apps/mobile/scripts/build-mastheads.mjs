/**
 * Cuts the three masthead plates — the night behind SERVICE, PLAN and ADVISOR
 * — to `apps/mobile/assets/masthead-{service,plan,advisor}.jpg`.
 *
 *   node apps/mobile/scripts/build-mastheads.mjs [--preview <dir>]
 *
 * ── What the JPEGs are, and where they came from ────────────────────────────
 *
 * Three frames made on 11 Sep 2026 by `gemini-3-pro-image-preview` through
 * `~/Developer/design-loop/scripts/gen-image.mjs`, at 21:9, 2K, with the
 * mobile loop's north star as the style reference and one shared prompt: a
 * masthead plate for one tab of a car-ownership app, the screen's title set in
 * condensed capitals over its lower left and a small label at its lower right,
 * so the lower half must fall to near-black wet ground; one sodium streetlamp
 * and one cold cyan source held apart; anamorphic, shallow focus, fine grain,
 * restrained teal-and-orange grade; no people, text, signage, numbers, logos,
 * neon, underglow or light trails. Then one subject each:
 *
 *   service  the wet concrete apron outside a workshop at night, seen low from
 *            the kerb — a sodium work lamp over a closed ribbed roller shutter,
 *            a cold cyan street lamp beyond; no car, the bay closed.
 *   plan     the road ahead, entering a low concrete underpass at night from
 *            kerb height — one sodium lamp on the underpass wall across the
 *            wet asphalt, the far exit a faint cold cyan haze, a dashed
 *            centre line running away; no car. (A second prompt, after
 *            round 24 — see the `PLATES` note; the first was an open road
 *            with lamps down both sides.)
 *   advisor  the driver's seat of a parked car at night, looking out through a
 *            rain-covered windscreen — the street out of focus, a sodium bloom
 *            one side and a cyan bloom the other, the dark unlit dash below;
 *            no dashboard lights, gauges, screens or hands.
 *
 * Two candidates per subject, plus two for the second Plan prompt — US$1.07 in
 * all, logged in `design-loop/cost-log.jsonl`. None of the eight holds a car,
 * a badge, a person or a word, so the trademark question
 * `public/vehicles/CREDITS.md` raises about the demo cars does not arise here. The frames themselves live in
 * `design-loop/mobile-ios/img/`, which is gitignored like the rest of the
 * loop; **the committed JPEG is the artefact**, and this script is the record
 * of how it was cut. It re-cuts when the frames are present and says so when
 * they are not, rather than pretending the derivatives are reproducible from
 * nothing — `CREDITS.md` records what a claim like that costs.
 *
 * ── The cut ─────────────────────────────────────────────────────────────────
 *
 * The band the plate fills is the root's title band: the status-bar inset
 * plus `TITLE_BAND`, which on the iPhone 16 Pro the loop grades against is
 * 59 + 58 = 117pt over 402pt — 1206 × 351 at 3×, the one aspect every device
 * gets a centred `cover` crop of. A 21:9 frame is 1344 rows tall at this
 * width and the band takes 921 of them, so each plate names the row its cut
 * starts on: high enough to keep the lamps under the status bar, low enough
 * that the ground under the title is ground.
 *
 * ── The bed, and why it is in the file rather than on the screen ────────────
 *
 * The title is printed straight onto the plate — no scrim, because a scrim
 * would dissolve the plate's edge and the 45° cut B2 asks to see. What makes
 * that legal is `HeroBed`'s reading of the rule: *no type whose contrast
 * depends on the photograph*. So the photograph is made to carry the floor
 * itself: a multiply ramp darkens the lower part of every plate, the same
 * falling-off-to-black the render script's vignette does on the house plate
 * and the north star does under its own headline. It is baked here so the
 * shipped pixels are the measured pixels —
 * `lib/__tests__/mobile-masthead-plates.test.ts` reads the JPEG under the
 * title and under ACCOUNT and measures the ink against them. The 45° cut then
 * lands on textured, tinted asphalt rather than on a fade, which is what keeps
 * it visible.
 *
 * Grain last, as on the house plate: the frames carry their own, and this adds
 * the plate's monochrome grain over the bed so a darkened region does not
 * read as a flat wash.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
/* From the workspace root, like `render-night-plate.mjs`. */
const sharp = require(join(here, '..', '..', '..', 'node_modules', 'sharp'));

const ROOT = join(here, '..', '..', '..');
const FRAMES = join(ROOT, 'design-loop', 'mobile-ios', 'img');
const ASSETS = join(here, '..', 'assets');

/** The band at 3× on the device the loop grades against. */
const W = 1206;
const H = 351;

/**
 * Which frame each plate is cut from, and where the cut starts.
 *
 * `top` is the first source row of the 921-row band, chosen by eye against the
 * lamps and by measurement against the ground under the title. `bedFrom` is
 * where the multiply ramp begins as a fraction of the band's height, and
 * `bedFloor` how much of the image survives at the bottom edge — 1 would be no
 * bed, 0 black.
 */
const PLATES = {
  /* The top of the frame: both lamps and both shutters, the ground under the name. */
  service: { frame: 'masthead-service-1.png', top: 0, bedFrom: 0.42, bedFloor: 0.34 },
  /*
    Just under the top edge, so the lamp on the wall stays and the near
    asphalt is the floor. ⚠ Round 24's frame was `masthead-plan-2.png` — an
    open road with sodium lamps down one side and cyan down the other — and
    the critique named it the one AI tell left: *"splits sodium-left /
    cyan-right so evenly it reads as a grade swatch, not a place"*, asking for
    *"one night place with one light source (underpass, forecourt canopy)"*.
    The underpass frame is that: one sodium lamp on the wall, the exit a cyan
    haze, and the road still the subject.
  */
  plan: { frame: 'masthead-plan-underpass-2.png', top: 60, bedFrom: 0.42, bedFloor: 0.34 },
  /*
    The foot of the frame: the street's bokeh under the status bar, the wet
    bonnet across the middle, and the unlit dash — the darkest ground of the
    six — under the name. The two big blooms are above the cut; their bottoms
    still show.
  */
  advisor: { frame: 'masthead-advisor-1.png', top: 420, bedFrom: 0.42, bedFloor: 0.34 },
};

function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

const previewDir = process.argv.indexOf('--preview') >= 0 ? process.argv[process.argv.indexOf('--preview') + 1] : null;

let missing = 0;
for (const [key, spec] of Object.entries(PLATES)) {
  const source = join(FRAMES, spec.frame);
  if (!existsSync(source)) {
    missing += 1;
    console.log(`${key}: ${spec.frame} is not on this machine — the committed JPEG stands`);
    continue;
  }

  const meta = await sharp(source).metadata();
  const bandHeight = Math.round((meta.width * H) / W);
  const top = Math.max(0, Math.min(meta.height - bandHeight, spec.top));

  const raw = await sharp(source)
    .extract({ left: 0, top, width: meta.width, height: bandHeight })
    .resize(W, H, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const out = Buffer.alloc(W * H * 3);
  for (let py = 0; py < H; py += 1) {
    const v = py / H;
    /* The bed: 1 above `bedFrom`, easing down to `bedFloor` at the bottom edge. */
    const t = v <= spec.bedFrom ? 0 : (v - spec.bedFrom) / (1 - spec.bedFrom);
    const bed = 1 - (1 - spec.bedFloor) * smooth(t);
    for (let px = 0; px < W; px += 1) {
      const i = (py * W + px) * 3;
      /* Grain: monochrome, three uniforms summed, the house plate's recipe at a lighter hand. */
      const gn = (hash(px, py, 41) + hash(px, py, 43) + hash(px, py, 47)) / 3 - 0.5;
      const grain = gn * 0.045 * 255;
      for (let c = 0; c < 3; c += 1) {
        out[i + c] = Math.max(0, Math.min(255, Math.round(raw[i + c] * bed + grain)));
      }
    }
  }

  const image = sharp(out, { raw: { width: W, height: H, channels: 3 } });
  const jpeg = await image.clone().jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  mkdirSync(ASSETS, { recursive: true });
  writeFileSync(join(ASSETS, `masthead-${key}.jpg`), jpeg);
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    writeFileSync(join(previewDir, `masthead-${key}.png`), await image.clone().png().toBuffer());
  }
  console.log(`masthead-${key}.jpg ${W}×${H} from ${spec.frame} rows ${top}–${top + bandHeight}, ${(jpeg.length / 1024).toFixed(0)} KB`);
}

if (missing === Object.keys(PLATES).length) {
  console.log('no frames found under design-loop/mobile-ios/img — nothing re-cut');
}
