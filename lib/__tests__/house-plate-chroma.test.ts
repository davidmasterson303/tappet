/**
 * The house frames carry the product's colour, so they have to stay coloured.
 *
 * @jest-environment node
 *
 * ── Why this suite exists ───────────────────────────────────────────────────
 *
 * The locked brief puts Tappet's colour in one place and says so plainly:
 * *"two hues only, used as light rather than as fill… the two hues are light,
 * and light belongs to the environment — the photograph."* `MastheadPlate`
 * states the mechanism — the film is *"carried by imagery and colour grade
 * while the interface itself stays flat"* — and draws the conclusion that
 * *"a root with no imagery has nothing carrying it."*
 *
 * A 22 Sep audit put numbers on what that means when the imagery thins out:
 * across the mobile app, **12% of colour references were chromatic and 14
 * screens used no chromatic token at all**. That is the correct and intended
 * state for the *interface*. It makes the frames load-bearing — they are not
 * decoration on top of a colourful app, they are the colour.
 *
 * Which makes a flat frame a silent defect of exactly the shape `CLAUDE.md`
 * §6 collects. Swap a washed-out cut of `night-plate.jpg` in later and nothing
 * errors, no contrast check moves (`mobile-masthead-plates.test.ts` measures
 * *luminance* under the titles, and a desaturated frame can hold its
 * luminance exactly), and the app just quietly becomes the greyscale product
 * David described. This suite is the thing that fails instead.
 *
 * ⚠ It measures **saturation**, which is the one property nothing else here
 * looks at. The masthead suite's job is legibility and it is unaffected by
 * hue; this one's job is hue and it is unaffected by legibility. Both have to
 * pass, and neither substitutes for the other.
 *
 * ── The floors, and where they come from ────────────────────────────────────
 *
 * Measured off the shipped files on 22 Sep, not chosen:
 *
 *   masthead-plan     0.624    masthead-service  0.540
 *   masthead-advisor  0.368    night-plate       0.268 → 0.428 graded
 *
 * The floors sit under the measured values with room for a re-cut, because a
 * guard that cries wolf gets made to pass (§5). They are a floor on *chroma*
 * only — a new frame may be brighter, darker, or composed differently.
 *
 * ⚠ `sharp`, not `jimp`, and `@jest-environment node`, for the reasons
 * `mobile-masthead-plates.test.ts` sets out at length: `jimp` detects file
 * types through a dynamic `import()` this runner cannot execute, and the
 * mobile theme cannot be loaded under jsdom.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import { brand, grade, status } from '../../apps/mobile/src/theme';

const MOBILE = join(__dirname, '..', '..', 'apps', 'mobile');
const ASSETS = join(MOBILE, 'assets');
const COMPONENTS = join(MOBILE, 'src', 'components');

/**
 * Every frame the app ships as environment, with the floor it must clear.
 *
 * `night-plate` is listed at its **ungraded** floor: the split tone is applied
 * at render, so the file on disk is the flatter of the two numbers. The graded
 * case below is what the owner actually sees.
 */
const FRAMES: ReadonlyArray<{ file: string; floor: number; measured: number }> = [
  { file: 'masthead-service.jpg', floor: 0.42, measured: 0.54 },
  { file: 'masthead-plan.jpg', floor: 0.46, measured: 0.624 },
  { file: 'masthead-advisor.jpg', floor: 0.28, measured: 0.368 },
  { file: 'night-plate.jpg', floor: 0.2, measured: 0.268 },
];

/**
 * Where the graded house plate has to land.
 *
 * The bottom is `masthead-advisor`'s floor — the plate must not be the least
 * chromatic frame in the set once graded, which is the defect this fixes. The
 * top stops the grade turning an instrument into a poster; `PhotoGrade`'s note
 * has the argument.
 */
const GRADED_PLATE = { min: 0.36, max: 0.56 };

/** HSV saturation. Chroma without luminance, which is the whole point here. */
function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

type Decoded = { width: number; height: number; data: Buffer | Uint8Array };

/**
 * Decode at a fixed small size.
 *
 * ⚠ `fill`, not `inside`: the frames have different aspect ratios and the
 * measurement must weight every one the same way, or a tall file is compared
 * against a band on a different sample count.
 */
async function decode(file: string): Promise<Decoded> {
  const { data, info } = await sharp(join(ASSETS, file))
    .resize(140, 140, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(3);
  return { width: info.width, height: info.height, data };
}

function meanSaturation(image: Decoded): number {
  let total = 0;
  let n = 0;
  for (let i = 0; i < image.data.length; i += 3) {
    total += saturation(image.data[i], image.data[i + 1], image.data[i + 2]);
    n += 1;
  }
  expect(n).toBeGreaterThan(0);
  return total / n;
}

/* ── The split tone, simulated ──────────────────────────────────────────────
 *
 * `PhotoGrade` draws it as an SVG gradient under `mixBlendMode: 'soft-light'`,
 * which no decoder here can run, so the layer is reproduced in arithmetic:
 * the W3C soft-light formula over the same three stops, at the opacity the
 * component actually ships.
 *
 * ⚠ Neither the stops nor the opacity are retyped here. The stops are
 * **imported from the token layer the component itself reads**, so a re-hued
 * split tone moves this measurement with it; the opacity is parsed out of
 * `PhotoGrade.tsx` with a match that is asserted, because it is a number in a
 * `StyleSheet` rather than a token and cannot be imported under this runner.
 * A copy of either is how a guard starts measuring a grade nothing renders.
 *
 * ⚠ The theme import is also what keeps this suite out of
 * `tests-test-real-code.test.ts`'s static-analysis allowlist: it exercises
 * shipped values rather than describing them. `mobile-masthead-plates.test.ts`
 * loads the same module under the same `node` environment.
 */
const SPLIT_STOPS = { sodium: status.attention, mid: grade.splitMid, cyan: brand.accent };

function plateToneOpacity(): number {
  const source = readFileSync(join(COMPONENTS, 'PhotoGrade.tsx'), 'utf8');
  const match = /export const PLATE_TONE_OPACITY = ([\d.]+);/.exec(source);
  expect(match).not.toBeNull();
  const value = Number(match![1]);
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
  return value;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  expect(m).not.toBeNull();
  return [parseInt(m![1], 16), parseInt(m![2], 16), parseInt(m![3], 16)];
}

/** The gradient at `t` across the frame: sodium → mid → cyan. */
function gradientAt(t: number): [number, number, number] {
  const [a, b, c] = [rgb(SPLIT_STOPS.sodium), rgb(SPLIT_STOPS.mid), rgb(SPLIT_STOPS.cyan)];
  const lerp = (from: number, to: number, u: number) => from + (to - from) * u;
  return t <= 0.5
    ? (a.map((v, i) => lerp(v, b[i], t / 0.5)) as [number, number, number])
    : (b.map((v, i) => lerp(v, c[i], (t - 0.5) / 0.5)) as [number, number, number]);
}

function softLight(backdrop: number, source: number): number {
  const d = backdrop <= 0.25 ? ((16 * backdrop - 12) * backdrop + 4) * backdrop : Math.sqrt(backdrop);
  return source <= 0.5
    ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
    : backdrop + (2 * source - 1) * (d - backdrop);
}

/** The frame as `NightPlate` renders it: split tone only, at the shipped opacity. */
function graded(image: Decoded, opacity: number): Decoded {
  const out = new Uint8Array(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 3;
      const src = gradientAt(x / (image.width - 1));
      for (let k = 0; k < 3; k += 1) {
        const cb = image.data[i + k] / 255;
        out[i + k] = Math.round(255 * (cb + opacity * (softLight(cb, src[k] / 255) - cb)));
      }
    }
  }
  return { width: image.width, height: image.height, data: out };
}

describe('the house frames stay chromatic', () => {
  it.each(FRAMES)('$file clears its chroma floor', async ({ file, floor, measured }) => {
    const value = meanSaturation(await decode(file));

    expect(value).toBeGreaterThanOrEqual(floor);

    /*
      The recorded measurement, held loosely. It is here so a re-cut frame that
      still passes the floor shows up in a diff as a number that moved, rather
      than landing silently — the floors have deliberate slack and a frame can
      drift a long way inside them.
    */
    expect(value).toBeCloseTo(measured, 1);
  });

  /*
    ⚠ The anti-vacuous case (§5). Every scanner here has to prove it can still
    fail, and this one is a single number against a threshold — the easiest
    kind to leave measuring nothing. A greyscale cut of a frame that passes is
    exactly the regression the suite exists for, so it is run as a fixture.
  */
  it('can still detect a frame that lost its colour', async () => {
    const { data, info } = await sharp(join(ASSETS, 'masthead-plan.jpg'))
      .resize(140, 140, { fit: 'fill' })
      /*
        ⚠ `modulate`, not `greyscale()`. Both drain the colour, but
        `greyscale()` also collapses the image to a **single channel** — and
        the reader below strides three bytes a pixel, so it walked off the end
        and every saturation came back `NaN`. `toBeLessThan(0.02)` fails on
        `NaN` rather than passing, so the suite caught it; had the assertion
        been `not.toBeGreaterThan`, this case would have passed while
        measuring nothing, which is the §5 failure exactly. `modulate` keeps
        three channels and zero saturation.
      */
      .modulate({ saturation: 0 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.channels).toBe(3);

    const flattened = meanSaturation({ width: info.width, height: info.height, data });

    expect(flattened).toBeLessThan(0.02);
    expect(flattened).toBeLessThan(FRAMES.find((f) => f.file === 'masthead-plan.jpg')!.floor);
  });
});

describe('the house plate is graded into the band', () => {
  it('lands between the advisor frame and the service frame once toned', async () => {
    const opacity = plateToneOpacity();
    const plate = await decode('night-plate.jpg');

    const before = meanSaturation(plate);
    const after = meanSaturation(graded(plate, opacity));

    /*
      The defect in one assertion: ungraded, the app's most-shown image is
      below the least chromatic masthead. Graded, it is not.
    */
    expect(before).toBeLessThan(GRADED_PLATE.min);
    expect(after).toBeGreaterThanOrEqual(GRADED_PLATE.min);
    expect(after).toBeLessThanOrEqual(GRADED_PLATE.max);
  });

  /*
    ⚠ The reason the other three grade layers stay off.
    13 Sep: *"a plate is already the film; grading it again lifts its blacks
    twice."* That objection is about the lift, and it is still right — so the
    tone this applies has to leave the plate's tonality alone. Soft-light does;
    a `screen` or an overlay would not, and this is what would catch someone
    reaching for one.
  */
  it('adds hue without lifting the blacks', async () => {
    const plate = await decode('night-plate.jpg');
    const opacity = plateToneOpacity();

    const luma = (image: Decoded) => {
      let total = 0;
      for (let i = 0; i < image.data.length; i += 3) {
        total += 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
      }
      return total / (image.data.length / 3);
    };

    const shift = luma(graded(plate, opacity)) - luma(plate);

    expect(shift).toBeGreaterThan(0);
    /* Measured at +4 of 255. Ten is the point where it stops being a tone. */
    expect(shift).toBeLessThan(10);
  });
});
