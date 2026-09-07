/**
 * The mark in `core/brand*.ts` is the mark in the brand package.
 *
 * @jest-environment node
 *
 * ── Why this reads the SVG files ────────────────────────────────────────────
 *
 * `packages/core/src/brand-geometry.ts` and `docs/brand-package-v2/svg/*.svg`
 * are emitted by the same script from the same fonts, but only one of them ends
 * up in the bundle — and nothing forces them to be regenerated together. So the
 * assertions do not restate the numbers, they read the package and compare. A
 * drift in either direction fails, which is what makes the constants safe to
 * import instead of the files.
 *
 * That matters more here than in most guards because the paths are shaped
 * outlines: nobody reviewing a diff can tell a correct 4KB path string from a
 * subtly wrong one. `Icon.tsx` carries *"do not redraw or approximate"* for the
 * same reason.
 *
 * ⚠ The package is vendored at `docs/brand-package-v2/` precisely so this test
 * has something durable to read; a zip in `~/Downloads` would have made it pass
 * until somebody emptied a folder.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BRAND_COLOR,
  BRAND_NAME,
  CLEAR_SPACE,
  ICON,
  LOCKUP,
  MAKER_PATH,
  MAKER_FLOOR_PX,
  MARK_PATH,
  MIN_WIDTH,
  PLATE_GRID,
  PLATE_PATH,
  TYPE_SOURCE,
  WORDMARK_PATH,
  W_PATH,
  lockupFor,
} from '@tappet/core/brand';

const ROOT = join(__dirname, '..', '..');
const PACKAGE = join(ROOT, 'docs', 'brand-package-v2');
const svg = (name: string) => readFileSync(join(PACKAGE, 'svg', `${name}.svg`), 'utf8');
/**
 * Source with its prose removed.
 *
 * ⚠ Every scan below has to do this. These files *document* the defects they
 * guard against — `brand.ts` quotes the display chain that shipped the wordmark
 * in the wrong face — so a scanner reading comments fires on the explanation
 * rather than the code. `CLAUDE.md` §5: a guard that cries wolf gets made to
 * pass, and the way it gets made to pass is by deleting the docblock.
 *
 * Line comments are dropped whole-line rather than by regex, so a `//` inside a
 * URL or a string cannot truncate a line of real code.
 */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const geometry = () =>
  JSON.parse(readFileSync(join(PACKAGE, 'geometry.json'), 'utf8')) as {
    archivo: { capPerEm: number; axes: { wdth: number; wght: number } };
    mono: { capPerEm: number };
    lockup: { total: number; wordmarkAdvance: number };
    icon: { plateShare: number; androidPlateShare: number };
  };

const ALL = [
  'mark',
  'lockup',
  'lockup-full',
  'icon',
  'favicon',
  'favicon-solid',
  'android-foreground',
  'android-monochrome',
] as const;

describe('the drawing is the one in the package', () => {
  it('finds the package at all', () => {
    // Anti-vacuous. Every case below reads these files, and a test suite whose
    // walker silently returns nothing reports a clean app forever.
    for (const name of ALL) {
      expect(`${name}: ${svg(name).length > 200}`).toBe(`${name}: true`);
    }
    expect(ALL.length).toBe(8);
  });

  it('carries the same plate, W, wordmark and maker outlines', () => {
    // The plate and the W are one `d` — see the fill-rule cases below — so the
    // mark is asserted whole rather than in halves.
    expect(svg('mark')).toContain(`d="${MARK_PATH}"`);
    expect(MARK_PATH).toContain(PLATE_PATH);
    expect(MARK_PATH).toContain(W_PATH);
    expect(svg('lockup')).toContain(`d="${WORDMARK_PATH}"`);
    expect(svg('lockup-full')).toContain(`d="${MAKER_PATH}"`);
    expect(svg('mark')).toContain(`viewBox="0 0 ${PLATE_GRID} ${PLATE_GRID}"`);
  });

  it('can still tell a changed outline from an unchanged one', () => {
    /*
      §5's anti-vacuous case. `toContain` on a 4KB path is the assertion most
      likely to be quietly satisfied by the wrong thing, so prove the comparison
      has teeth before trusting the case above.
    */
    const nudged = `${W_PATH.slice(0, -8)}9.999 Z`;

    expect(svg('mark')).not.toContain(`d="${nudged}"`);
    expect(nudged).not.toBe(W_PATH);
  });

  it('agrees with the package on the numbers the outlines were shaped from', () => {
    /*
      ⚠ `capPerEm` is the value this whole system was two rounds wrong about.
      Archivo's cap height is **0.686 em**; the loop assumed 0.73, which made
      every stated cap height 6% larger than the render — a nav lockup reported
      at a 20px cap was measuring 18.8px, under its floor, green on paper.

      So it is pinned to the font's own OS/2 table via the package rather than
      to a literal here. A literal would only assert that somebody typed the
      same number twice.
    */
    const g = geometry();

    expect(TYPE_SOURCE.display.capPerEm).toBe(g.archivo.capPerEm);
    expect(TYPE_SOURCE.mono.capPerEm).toBe(g.mono.capPerEm);
    expect(TYPE_SOURCE.display.wdth).toBe(g.archivo.axes.wdth);
    expect(LOCKUP.width).toBe(g.lockup.total);
    expect(LOCKUP.wordmarkAdvance).toBe(g.lockup.wordmarkAdvance);
  });

  it('is one drawing — the icon and the mark share a plate', () => {
    /*
      The mark this replaced needed four drawings and picked by size floor:
      full, single-W, flat, and an inverted 29 whose plate was a *different
      path* from the icon's. Asserting the plate is shared is what stops a
      reduction ladder growing back one well-meaning size at a time.
    */
    for (const name of ALL) {
      expect(`${name}: ${svg(name).includes(`d="${MARK_PATH}"`)}`).toBe(`${name}: true`);
    }
  });
});

describe('the letter is a hole, and the fill rule is what makes it one', () => {
  it('carries even-odd on every drawing that paints the plate', () => {
    /*
      ⚠ The silent one. `MARK_PATH` is the plate and the W in a single path;
      `fill-rule="evenodd"` is what turns the second contour into a hole. Drop
      it and the W fills in the plate's own colour — no error, no blank, just a
      logo that reads slightly heavier than the one that was approved. That is
      `CLAUDE.md` §6's defect class exactly.
    */
    for (const name of ALL) {
      const source = svg(name);
      expect(`${name}: ${source.includes('fill-rule="evenodd"')}`).toBe(`${name}: true`);
    }

    for (const [file, tell] of [
      [join(ROOT, 'components', 'brand', 'BrandLockup.tsx'), 'fillRule="evenodd"'],
      [join(ROOT, 'apps', 'mobile', 'src', 'components', 'BrandLockup.tsx'), 'fillRule="evenodd"'],
      [join(ROOT, 'app', 'opengraph-image.tsx'), 'fillRule="evenodd"'],
    ] as const) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      expect(`${file}: ${source.includes('MARK_PATH')}`).toBe(`${file}: true`);
      expect(`${file}: ${source.includes(tell)}`).toBe(`${file}: true`);
    }
  });

  it('can still notice the fill rule missing', () => {
    const dropped = svg('mark').replace(/ fill-rule="evenodd"/g, '');

    expect(dropped.includes('fill-rule="evenodd"')).toBe(false);
    expect(dropped).toContain(`d="${MARK_PATH}"`);
  });

  it('joins the plate and the letter into one path, in that order', () => {
    // Order matters to nothing but readability; that both are present in one
    // `d` is what even-odd needs, and splitting them back into two elements is
    // the change this catches.
    expect(MARK_PATH).toBe(`${PLATE_PATH} ${W_PATH}`);
    expect(svg('mark')).toContain(`d="${MARK_PATH}"`);
  });
});

describe('the type is geometry, not text', () => {
  it('ships no font-dependent element in any package file', () => {
    /*
      The package this replaced declared `font-family="Newsreader, Georgia,
      serif"` in every SVG and asked, in its own README, for the type to be
      outlined at export. It never was — which is why `app/favicon.ico` and
      `app/apple-icon.png` sat on the *previous* logo for a fortnight: nothing
      on this machine could rasterise them without the webfont.

      A rasteriser without the family substitutes silently and the W changes
      shape. There is nothing to see and nothing to log.
    */
    for (const name of ALL) {
      const source = svg(name);
      for (const tell of ['<text', 'font-family', 'font-size']) {
        expect(`${name} ${tell}: ${source.includes(tell)}`).toBe(`${name} ${tell}: false`);
      }
    }
  });

  it('can still detect a font-dependent element', () => {
    const planted = svg('mark').replace('</svg>', '<text font-family="Archivo">W</text></svg>');

    expect(planted.includes('<text')).toBe(true);
    expect(planted.includes('font-family')).toBe(true);
  });

  it('draws no text in the web component either', () => {
    /*
      ⚠ The web lockup is where the equivalent defect actually shipped. Each
      `<text>` spelled its own stack — `var(--font-display), Newsreader, Georgia,
      serif` — which was correct until brief B2 moved the display slot to
      Archivo. From that moment the brand mark rendered in a face it was never
      drawn in, on every page, and the guard that should have caught it was
      named for the property it did not check.
    */
    const component = codeOnly(
      readFileSync(join(ROOT, 'components', 'brand', 'BrandLockup.tsx'), 'utf8')
    );

    expect(component).toContain('WORDMARK_PATH');
    for (const tell of ['<text', 'fontFamily', 'font-display']) {
      expect(`${tell}: ${component.includes(tell)}`).toBe(`${tell}: false`);
    }
  });
});

describe('the mark takes no hue', () => {
  it('spends only the two non-colours and the tile', () => {
    /*
      Cyan and sodium are *light* in this system, and light belongs to
      photography and to UI state. `--ring` is cyan; a logo that owned cyan
      would be competing with the focus ring every time one appeared beside it.

      `#fff` and `#000` are mask channels, not colours — the mask paints the
      plate opaque and the letter transparent, and neither reaches the screen.
    */
    const allowed = new Set(
      [BRAND_COLOR.ink, BRAND_COLOR.tile, BRAND_COLOR.ground, '#fff', '#000'].map((c) =>
        c.toLowerCase()
      )
    );

    for (const name of ALL) {
      const found = (svg(name).match(/#[0-9a-fA-F]{3,6}/g) ?? []).map((c) => c.toLowerCase());
      const stray = found.filter((c) => !allowed.has(c));
      expect(`${name}: ${stray.join(',')}`).toBe(`${name}: `);
    }
  });

  it('can still spot a hue', () => {
    // The cyan the previous mark glowed with, and the sodium beside it.
    const allowed = new Set([BRAND_COLOR.ink, BRAND_COLOR.tile, BRAND_COLOR.ground, '#fff', '#000']);

    expect(allowed.has('#22D3EE')).toBe(false);
    expect(allowed.has('#FF8A3D')).toBe(false);
  });

  it('does not reach into the app’s tokens', () => {
    /*
      A brand asset that changed colour when a surface token moved would have a
      dependency nobody intended. The three values are stated, and
      `design-system-drift.md` §12.8 records that they are the shipped tokens
      rather than the critic's sampled approximations.
    */
    for (const file of ['brand.ts', 'brand-geometry.ts']) {
      const source = codeOnly(readFileSync(join(ROOT, 'packages', 'core', 'src', file), 'utf8'));

      // Anti-vacuous: stripping prose must not have stripped the module.
      expect(source).toContain('export');
      expect(source).not.toMatch(/from '\.\/(tokens|theme)/);
      expect(source).not.toMatch(/var\(--/);
    }
  });
});

describe('the minimum sizes are derived, not chosen', () => {
  it('drops the maker line where it would break the 12px type floor', () => {
    /*
      The maker sets at `makerCap / capPerEm` grid units and renders at
      `that × width / LOCKUP.width` px. Re-derived here rather than restated,
      because a guard that repeats a number cannot catch the number being wrong
      — which is exactly how the cap-height error survived two rounds.
    */
    const makerGridSize = LOCKUP.makerCap / TYPE_SOURCE.mono.capPerEm;
    const renderedAt = (width: number) => (makerGridSize * width) / LOCKUP.width;

    expect(renderedAt(MIN_WIDTH.full)).toBeGreaterThanOrEqual(MAKER_FLOOR_PX);
    expect(renderedAt(MIN_WIDTH.full - 1)).toBeLessThan(MAKER_FLOOR_PX);
  });

  it('holds the nav budget at the cap floor', () => {
    /*
      ⚠ The brief line that was silently failing. "The nav lockup fits 140px at
      a ≥20px cap height" was being reported as met while the cap measured
      18.8px, because the cap-height constant was wrong. Asserting it in grid
      units against the shipped geometry is what makes it checkable.
    */
    const capAt = (width: number) => (LOCKUP.cap * width) / LOCKUP.width;

    expect(MIN_WIDTH.short).toBe(140);
    expect(capAt(MIN_WIDTH.short)).toBeGreaterThanOrEqual(20);
    expect(LOCKUP.width).toBeLessThanOrEqual(140);
  });

  it('never scales the lockup below legibility instead', () => {
    /*
      The failure this prevents is a caller passing 90px and getting a full
      lockup with 4px maker type. `lockupFor` answers with a different drawing.
    */
    expect(lockupFor(MIN_WIDTH.full)).toBe('full');
    expect(lockupFor(MIN_WIDTH.full - 1)).toBe('short');
    expect(lockupFor(MIN_WIDTH.short)).toBe('short');
    expect(lockupFor(MIN_WIDTH.short - 1)).toBe('icon');
    expect(lockupFor(12)).toBe('icon');
  });

  it('states clear space against the mark, so it survives a grid change', () => {
    expect(CLEAR_SPACE).toBe(LOCKUP.mark);
  });
});

describe('the app icon and the Android foreground are not the same share', () => {
  it('keeps the Android plate inside the circle a launcher may mask to', () => {
    /*
      ⚠ The one that would have been "simplified" away. An adaptive icon's outer
      third is maskable and the mask may be a **circle**, so a square plate has
      to fit the square inscribed in that circle — 0.667 / √2 = 0.47 of the
      canvas, not the icon's 0.66. At 0.66 the corners clip under a round
      launcher and nothing warns you.

      Asserting they *differ*, and that the Android share clears the geometry,
      is the point: a later tidy that reused one number would pass every other
      case here.
    */
    const g = geometry();

    expect(ICON.plateShare).toBe(g.icon.plateShare);
    expect(ICON.androidPlateShare).toBe(g.icon.androidPlateShare);
    expect(ICON.androidPlateShare).not.toBe(ICON.plateShare);
    expect(ICON.androidPlateShare).toBeLessThanOrEqual((2 / 3) / Math.SQRT2);
  });
});

describe('the name', () => {
  it('is two words, both capitalised', () => {
    expect(BRAND_NAME).toBe('Tappet');
  });
});
