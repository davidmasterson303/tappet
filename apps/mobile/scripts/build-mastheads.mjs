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
 * The band the plate fills is the root's title band plus that plate's
 * `MASTHEAD_DROP`: on the iPhone 16 Pro the loop grades against, 59 + 58 = 117pt
 * over 402pt for the advisor — 1206 × 351 at 3× — and 117 + 53 = 170pt for
 * service and plan — 1206 × 511. Every device gets a centred `cover` crop of
 * the one file.
 *
 * ⚠ 22 Sep · **two of the three are the whole frame now.** All three were
 * 117pt — 921 of the source's 1344 rows — so a 2.36:1 photograph shipped as a
 * 3.4:1 strip with its foreground cut away. David: *"it's a cool image, make
 * it a bit more visible."* At 402pt wide the source lands at 7.88 rows a
 * point whatever the band's height, so taking all 1344 rows rescales nothing:
 * every row that was on screen is in the same place, the title and ACCOUNT
 * are printed on the same pixels they were, and the extra 53pt is the apron
 * the old cut dropped. `top` goes to 0 on those two — there is nothing left
 * to choose.
 *
 * ⚠ **The advisor is unchanged**, frame, rows and all. The air goes *under*
 * the title (ACCOUNT cannot leave the nav row), so a taller band puts the
 * name two-thirds up the plate — where service and plan have wet ground and
 * the advisor has its two blooms. Measured at the tall cut it reads 1.8:1
 * against AA's 4.5, and reaches 4.5 only with a bed heavy enough to crush the
 * blooms the frame exists for; `masthead-advisor-2.png` fails the other way,
 * on a cyan sign under ACCOUNT. `MastheadPlate` carries the ruling.
 *
 * ── ⚠ On a tall band the bed reaches its floor before the bottom edge ──────
 *
 * It used to reach it there, because the title sat on the bottom edge. On a
 * tall band the title is two-thirds up, so the ramp reaches the floor at the
 * row the old band ended on and **holds** it to the foot. That keeps the
 * ground under the title exactly as dark as in the plate it replaces, which
 * is the point: the contrast suite's numbers must not move because the band
 * grew. On the short band the two rows coincide and this is the original
 * ramp exactly.
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
/** The title band alone — 59 + 58 at 3×, and still the advisor's whole plate. */
const TITLE_BAND = 351;
/** With `MASTHEAD_DROP`'s 53pt under the title: the frame's own aspect at this width. */
const TALL_BAND = 511;

/**
 * Which frame each plate is cut from, and where the cut starts.
 *
 * `height` is the plate's band at 3× — `TALL_BAND` where the frame can carry
 * the name two-thirds up it, `TITLE_BAND` where it cannot. `top` is the first
 * source row: 0 on a tall band, where the band *is* the frame and there is no
 * row left to choose. `bedFloor` is how much of the image survives under the
 * name — 1 would be no bed, 0 black; where the ramp runs is derived from the
 * band above.
 */
const PLATES = {
  /* The top of the frame: both lamps and both shutters, the ground under the name. */
  service: { frame: 'masthead-service-1.png', height: TALL_BAND, top: 0, bedFloor: 0.34 },
  /*
    ⚠ Was `top: 60` — just under the top edge, so the lamp on the wall stayed
    and the near asphalt was the floor; the full frame keeps both and adds the
    60 rows back. Round 24's frame was `masthead-plan-2.png` — an
    open road with sodium lamps down one side and cyan down the other — and
    the critique named it the one AI tell left: *"splits sodium-left /
    cyan-right so evenly it reads as a grade swatch, not a place"*, asking for
    *"one night place with one light source (underpass, forecourt canopy)"*.
    The underpass frame is that: one sodium lamp on the wall, the exit a cyan
    haze, and the road still the subject.
  */
  plan: { frame: 'masthead-plan-underpass-2.png', height: TALL_BAND, top: 0, bedFloor: 0.34 },
  /*
    The foot of the frame: the street's bokeh under the status bar, the wet
    bonnet across the middle, and the unlit dash — the darkest ground of the
    six — under the name. The two big blooms are above the cut; their bottoms
    still show.

    ⚠ And the one plate that kept the short band on 22 Sep. Taking the whole
    frame would put the name across those blooms: measured, 1.8:1 against AA's
    4.5. It is the composition doing that, not the cut — the dark third of
    this frame is the dash at its foot, which only sits under the name while
    the band ends there.
  */
  advisor: { frame: 'masthead-advisor-1.png', height: TITLE_BAND, top: 420, bedFloor: 0.34 },
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

  const H = spec.height;
  /*
    The bed in the band's own fractions. Both numbers are the short band's —
    the ramp starts 42% down a 351-row plate and reaches the floor where that
    plate ended — so a tall plate darkens the same rows as the short one it
    replaced and the ground under the title is unchanged. On the short band
    `bedTo` is 1 and this is the original ramp exactly.
  */
  const bedFrom = (0.42 * TITLE_BAND) / H;
  const bedTo = TITLE_BAND / H;

  const meta = await sharp(source).metadata();
  /*
    ⚠ Clamped to the frame. At the full-frame aspect the rounding lands a row
    past the source — `extract` answers "bad extract area", which is a loud
    failure and was, but a band taller than its frame is the kind of thing a
    later re-cut would reach for by hand.
  */
  const bandHeight = Math.min(meta.height, Math.round((meta.width * H) / W));
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
    /* The bed: 1 above `bedFrom`, easing down to `bedFloor` by `bedTo`, held from there. */
    const t = v <= bedFrom ? 0 : Math.min(1, (v - bedFrom) / (bedTo - bedFrom));
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
