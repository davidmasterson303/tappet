/**
 * The three masthead plates carry the ground their titles are printed on.
 *
 * @jest-environment node
 *
 * ── What this holds, and why nothing else can ───────────────────────────────
 *
 * Service, Plan and Advisor open on a night plate with the root's name set
 * straight onto it — `MastheadPlate` says why there is no scrim (it would
 * dissolve the edge and the 45° cut B2 asks to see). The rule that makes a
 * title on a photograph legal is `HeroBed`'s: *no type whose contrast depends
 * on the photograph*. The vehicle hero satisfies it with an opaque bed under
 * an unknown owner's photo; the masthead satisfies it by being a **known**
 * photograph, cut and graded so the ground under the name is dark — and this
 * suite is what makes "known" mean something. It decodes the shipped JPEGs and
 * measures the ink against the pixels where the title and ACCOUNT sit.
 *
 * Neither contrast suite in `apps/mobile` can see this. `contrast.test.tsx`
 * finds a string's ground by reading `backgroundColor` down the tree, and an
 * `Image` has none — so every masthead title measures against the page there
 * and passes at a ratio it may not achieve. Only the file knows what is
 * behind the name.
 *
 * The failure it pins is silent in the way `CLAUDE.md` §6 collects: a brighter
 * frame cut in later — the bed dropped, the crop moved up into the lamps —
 * renders without an error and reads as a design choice, and the title is a
 * little harder to read on every launch of the tab.
 *
 * ── The geometry ────────────────────────────────────────────────────────────
 *
 * The plate fills the root's title band on the device the loop grades against
 * — an iPhone 16 Pro, 402pt wide, 59pt status inset, `TITLE_BAND` = 58 —
 * so 117pt over 402pt: 1206 × 351 at 3×. The title's caps sit in the band's
 * lower third from the page gutter; ACCOUNT sits on the nav row at the right
 * edge (`AccountControl`). Both boxes are stated as fractions of the plate so
 * a re-cut at another size is measured the same way, and both are a little
 * larger than the glyphs so a highlight beside a letter counts too. On other
 * devices `cover` takes a centred crop of the same file, which keeps the same
 * rows in the dark lower half.
 *
 * Luminance is read after a small blur, because what legibility depends on is
 * the area behind a stroke, not a single specular pixel of wet grit; the blur
 * is 3px at 3×, one point on the screen.
 *
 * ⚠ `sharp`, not `jimp`. `jimp` is the app's own decoder (`lib/plate-image.ts`)
 * and would have been the natural choice, but its `read` detects the file type
 * through a dynamic `import()`, which this runner cannot execute without
 * `--experimental-vm-modules`. `sharp` is the root's image devDependency —
 * the one `scripts/build-image-derivatives.mjs` and the plate scripts use —
 * and loads under jest as a plain module.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import { text } from '../../apps/mobile/src/theme';

/**
 * WCAG 2.1 AA for normal text. Stated here rather than imported from
 * `apps/mobile/src/test-support/contrast.ts`, whose first line imports
 * `react-native` — which this runner cannot load. The arithmetic below is the
 * same relative-luminance formula that helper uses; the plates' own case
 * `measures the way the rendered suite does` pins one known pair so the two
 * cannot drift apart silently.
 */
const AA_NORMAL = 4.5;

const MOBILE = join(__dirname, '..', '..', 'apps', 'mobile');
const ASSETS = join(MOBILE, 'assets');
const SCREENS = join(MOBILE, 'src', 'screens');

/** Which root opens on which plate — the same table `MASTHEADS` keys. */
const ROOTS: Record<string, string> = {
  service: 'ServiceScreen.tsx',
  plan: 'PlanScreen.tsx',
  advisor: 'AdvisorScreen.tsx',
};

/** A plate the app ships must stay a band, and must stay small. */
const PLATE = { width: 1206, height: 351, maxBytes: 120 * 1024 };

/** The boxes, as fractions of the plate: [x0, x1, y0, y1]. */
const TITLE_BOX = [0.03, 0.4, 0.61, 0.86] as const;
const ACCOUNT_BOX = [0.78, 0.97, 0.62, 0.77] as const;
/** Where the lamps live — the anti-vacuous half reads this. */
const SKY_BOX = [0, 1, 0, 0.48] as const;

/** `text.secondary` is white at an alpha; composite it over the ground it sits on. */
function inkOver(ink: string, groundLuminance: number): number {
  const alpha = Number(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/.exec(ink)?.[1] ?? 1);
  return alpha * 1 + (1 - alpha) * groundLuminance;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratioAgainst(inkLuminance: number, groundLuminance: number): number {
  const [hi, lo] = inkLuminance > groundLuminance ? [inkLuminance, groundLuminance] : [groundLuminance, inkLuminance];
  return (hi + 0.05) / (lo + 0.05);
}

/** Raw RGB, three bytes a pixel. */
type Decoded = { width: number; height: number; data: Buffer | Uint8Array };

/** The brightest blurred pixel in a box, as relative luminance. */
function brightest(image: Decoded, box: readonly [number, number, number, number]): number {
  const [fx0, fx1, fy0, fy1] = box;
  let max = 0;
  for (let y = Math.floor(fy0 * image.height); y < Math.ceil(fy1 * image.height); y += 1) {
    for (let x = Math.floor(fx0 * image.width); x < Math.ceil(fx1 * image.width); x += 1) {
      const i = (y * image.width + x) * 3;
      const l = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
      if (l > max) max = l;
    }
  }
  return max;
}

async function decode(file: string): Promise<Decoded> {
  const { data, info } = await sharp(file).blur(3).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(3);
  return { width: info.width, height: info.height, data };
}

async function size(file: string): Promise<[number, number]> {
  const meta = await sharp(file).metadata();
  return [meta.width ?? 0, meta.height ?? 0];
}

const primaryInk = luminance(
  parseInt(text.primary.slice(1, 3), 16),
  parseInt(text.primary.slice(3, 5), 16),
  parseInt(text.primary.slice(5, 7), 16)
);

describe('the masthead plates', () => {
  const plates = readdirSync(ASSETS).filter((f) => /^masthead-.*\.jpg$/.test(f));

  it('ships one plate per image root, and no root ships without one', () => {
    expect(plates.sort()).toEqual(Object.keys(ROOTS).map((key) => `masthead-${key}.jpg`).sort());
  });

  it.each(Object.entries(ROOTS))('the %s root opens on its own plate', (key, screen) => {
    /*
      The key is what a root passes to `RootScreen`; a root passing another
      root's key — Service on the advisor's windscreen — renders perfectly and
      is only wrong to somebody who knows which frame is which.
    */
    const source = readFileSync(join(SCREENS, screen), 'utf8');
    expect(source).toMatch(new RegExp(`plate=["']${key}["']`));
  });

  it('the garage opens on the car’s plate, not a masthead', () => {
    // Two nights on one screen — a masthead over the bay — is the failure.
    const source = readFileSync(join(SCREENS, 'GarageScreen.tsx'), 'utf8');
    expect(source).not.toMatch(/plate=/);
    expect(source).toMatch(/<RootScreen title="Garage"/);
  });

  it.each(plates)('%s is the band, at a weight a phone should carry', async (file) => {
    const path = join(ASSETS, file);
    expect(statSync(path).size).toBeLessThanOrEqual(PLATE.maxBytes);
    expect(await size(path)).toEqual([PLATE.width, PLATE.height]);
  });

  it.each(plates)('%s carries the title and ACCOUNT on ground that clears AA', async (file) => {
    const image = await decode(join(ASSETS, file));

    const underTitle = brightest(image, TITLE_BOX);
    const underAccount = brightest(image, ACCOUNT_BOX);

    /*
      The title is 34pt bold and would be allowed 3:1 as large text; it is held
      to the normal floor because the plates were cut to clear it, and a plate
      that only just clears the large-text line is one whose next re-cut fails.
    */
    expect(ratioAgainst(primaryInk, underTitle)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(ratioAgainst(inkOver(text.secondary, underAccount), underAccount)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(plates)('%s still has a night in it — the reader can see the lamps', async (file) => {
    /*
      Anti-vacuous. A reader that returned 0 for every pixel — a decode that
      came back empty, a box measured off the image — would pass the case
      above on every plate forever. The lamps sit in the upper half of each
      frame, and the same reader must find them bright.
    */
    const image = await decode(join(ASSETS, file));
    expect(brightest(image, SKY_BOX)).toBeGreaterThan(0.3);
  });

  it('would fail a plate whose ground is lit', () => {
    // The measurement, handed a bright ground, must refuse it.
    const lit: Decoded = { width: 10, height: 10, data: Buffer.alloc(300, 200) };
    expect(ratioAgainst(primaryInk, brightest(lit, TITLE_BOX))).toBeLessThan(AA_NORMAL);
    expect(ratioAgainst(inkOver(text.secondary, brightest(lit, ACCOUNT_BOX)), brightest(lit, ACCOUNT_BOX))).toBeLessThan(AA_NORMAL);
  });

  it('measures the way the rendered suite does', () => {
    /*
      `text.primary` on pure black is 18.96:1 by WCAG's formula, which is what
      `contrast.test.tsx`'s helper reports for the same pair. A luminance or
      ratio function edited here would move this number first.
    */
    expect(ratioAgainst(primaryInk, 0)).toBeCloseTo(18.96, 1);
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 5);
  });
});
