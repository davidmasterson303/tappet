# Well Kept — brand package v2

**Chosen mark: the data plate.** A solid chamfered plate with a single **W cut
clean through it**, so whatever sits behind the plate shows in the letter.

Produced by a design-critic loop, `design-loop/logo/` (gitignored): an
independent critic wrote the brief from the shipped mark, then graded three
iterations against it without ever seeing code. 4/10 → 7 → 8, all nine brief
lines met, critic called it settled. The frozen brief is reproduced in
`BRIEF.md`.

**This is the shipped identity as of 7 Sep 2026.** `@tappet/core/brand`
imports the generated geometry, both `BrandLockup` components draw it, and every
icon slot on web and mobile is rendered from these files. The mark it replaced —
the backlit coachbuilder plate — is kept at `../brand-package/` as the
provenance record for Design's 30 Aug delivery and is no longer referenced by
code. `design-system-drift.md` §12 is the register entry.

---

## Why the plate, and why the letter is a hole

One rule does the work of five. Because the W is a **hole** rather than a
filled letter — the plate and the letter are a single path, and
`fill-rule="evenodd"` turns the second contour into a void:

- **Both polarities are one file.** Off-white plate on graphite; graphite plate
  on ivory. Nothing is redrawn and nothing can drift out of step.
- **It survives a photograph.** On the launch card the wet asphalt shows through
  the W, so the mark sits *in* the image instead of covering it.
- **There is no reduction ladder.** The previous package shipped four drawings —
  full, single-W, flat, and an inverted 29 — and the tile you got depended on
  which floor it cleared. This is one drawing at 1024, 180, 167, 152, 120, 87,
  80, 76, 60, 58, 40, 29 and 16. The 29 and the 1024 are the same file.

The mark carries **no hue**. Cyan and sodium are light in this system, and light
belongs to the photograph and to UI state — not to the logo. A glowing badge
promises; a stamped plate reports, which is the product's position in `advice-range.ts`
carried into the identity.

## Contents

| File | Use |
|---|---|
| `svg/mark.svg` | The mark alone, `currentColor`. Anywhere the host owns the colour. |
| `svg/favicon.svg` | Tab icon. Transparent, and swaps polarity by media query. → `app/icon.svg` |
| `svg/favicon-solid.svg` | Tab icon with its tile, for the raster fallbacks. |
| `svg/lockup.svg` | Mark + wordmark, `currentColor`. Nav, footers. **Fits 140px at a 20px cap.** |
| `svg/lockup-full.svg` | Adds the maker line. Store, paywall, launch screen, foot of a service record. |
| `svg/icon.svg` | App icon — the plate at 66% of a matte graphite tile, ground baked in. |
| `svg/android-foreground.svg` | Android adaptive foreground. Plate at **47%** — see below. |
| `svg/android-monochrome.svg` | Android themed-icon layer. |
| `svg/android-background.svg` | Android adaptive background, flat `#100F0D`. |
| `png/ios/` | 1024 · 180 · 167 · 152 · 120 · 87 · 80 · 76 · 60 · 58 · 40 · 29. |
| `png/expo/` | `icon.png`, `splash-icon.png`, `android-icon-{foreground,monochrome}.png`. |
| `png/web/` | `icon-512`, `icon-192`, `apple-icon`, `favicon-{48,32,16}`, `favicon.ico`. |
| `geometry.json` | Every measure below, as data. |
| `build.py` | Regenerates all of it, plus `packages/core/src/brand-geometry.ts`. |

## Geometry

Drawn on a **66-unit plate**; the app icon places it on a **100-unit tile**.

```
plate    M10 0 H56 L66 10 V56 L56 66 H10 L0 56 V10 Z
chamfer  10 units — 15.2% of the side, so the cut still reads at the 29pt tile
W        Archivo wdth 62 / wght 800, cap height 44, advance 45.09
         margins 10.46 left and right against 11.0 top and bottom
tile     plate at 66% of the tile, centred, on #1A1815
lockup   cap 20 · mark 20 · gap 5.6 · wordmark 113.91  ->  139.51 total
maker    JetBrains Mono, caps, +10% tracking, cap 6 (30% of the wordmark's)
```

Colours are the shipped tokens, not sampled approximations: ink `#F5F3F0`
(`--foreground`), tile `#1A1815` (`--surface-1`), ground `#100F0D`
(`--background`).

**Rules.** The plate is always solid — no stroke, no glow, no rivets. The
wordmark is never boxed. The mark is centred on the wordmark's **cap band**, in
both lockups, and the maker line hangs off the wordmark alone. Under 140px the
lockup gives way to the mark. Nothing in the drawing takes a hue.

## Six things that fail silently, and what was done about them

**1. The type is outlined.** Every SVG here is font-independent. The previous
package declared `font-family="Newsreader, Georgia, serif"` in each file, which
is right in a browser with the webfont and wrong in any rasteriser without it —
the substitute lands and the W changes shape with nothing reporting it.
`build.py` converts the wordmark and the W to paths from the variable font
instanced at the exact axis coordinates the design was drawn at, and the PNGs
are then rendered from the *outlined* files. `grep -l "<text" svg/*.svg` returns
nothing, and that is the check.

**2. Archivo's cap height is 0.686 em, not 0.73.** Read from the font's own
OS/2 `sCapHeight`. The loop ran two rounds on the assumed 0.73, which made every
stated cap height 6% larger than the render: the nav lockup was being reported
at a 20px cap and was measuring **18.8px** — under the brief's floor, passing on
paper. Correcting it left only 25.6px for the mark and the gap inside the 140px
nav budget, which is why the mark is exactly one cap high and the gap is one
word space rather than the half-mark-width the brief prose asks for.

**3. A `<mask>` would have been the obvious way to cut the W, and it is the
wrong one.** Even-odd needs no id, and ids in SVG are document-global — inline
two copies of a masked mark in one page and the second silently binds to the
first. It also needs no mask *support*: Satori, which renders the OG card, does
`<path>` and little else, and when it cannot render something it answers **200
with `content-type: image/png` and a zero-byte body**. A scraper sees a valid
response and a broken picture. One path avoids the whole class.

⚠ The trade is that `fill-rule="evenodd"` is now load-bearing and its absence is
silent: drop it and the W fills in the plate's own colour, which reads as a
slightly heavier logo rather than as a bug. `brand.test.ts` asserts every
drawing and all three components carry it.

**4. `hmtx` advances are not shaping — the wordmark is kerned by HarfBuzz.**
Summing per-glyph advances out of the font skips the kern pairs the browser
applies, which drifts the later letters against the approved drawing with
nothing to see but a wordmark that is very slightly wrong. `build.py` shapes
through HarfBuzz — the engine Chrome uses — on the *instanced* font, so the
advances belong to the same width. Checked by rendering the outlined file and
the live-font version at a locked scale and differencing them: identical
letterforms, no cumulative drift, advance within 0.12% (113.91 vs the browser's
113.77, the residual being the trailing letter-spacing convention). What is left
is an even hairline of antialiasing, because Chrome rasterises glyphs and paths
through different gamma.

**5. A raster favicon has to pick a polarity, and one polarity is always
wrong.** An off-white plate is invisible on a light tab strip, a graphite one on
a dark strip, and neither failure raises anything — the tab just looks empty.

So there are two drawings, not one with a background bolted on:

- `favicon.svg` is what a modern browser takes. Transparent, edge to edge so the
  W gets every pixel at 16px, and it **swaps polarity itself** through a
  `prefers-color-scheme` media query inside the file.
- `favicon-solid.svg` carries the tile, and the PNGs and the `.ico` come from
  it. One file, legible on any strip.

`<link media="(prefers-color-scheme: dark)">` would have let the rasters adapt
too, and it is not reliable outside Chromium — hence the tile.

**6. The Android plate is 47% of the canvas, not 66%.** An adaptive icon's outer
third can be masked away and the mask may be a **circle**, so a square plate has
to fit the square inscribed in that circle: 0.667 / √2 = 47%. At 66% the
corners clip under a round launcher and nothing warns you. Verified against both
a circular and a squircle mask.

## Regenerating

```
python3 -m venv .venv && .venv/bin/pip install fonttools brotli uharfbuzz
curl -sSL -o Archivo-var.ttf \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf'
curl -sSL -o JetBrainsMono-var.ttf \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf'
.venv/bin/python build.py --fonts . --png
```

PNGs are rendered by headless Chrome — the only rasteriser on this machine, and
it needs no fonts because the SVGs are already outlined.

## Where it is wired up

- `packages/core/src/brand-geometry.ts` — **generated by `build.py`.** Do not edit.
- `packages/core/src/brand.ts` — the readable API: names, clear space, the two
  derived `MIN_WIDTH` thresholds, `lockupFor`.
- `components/brand/BrandLockup.tsx` and `apps/mobile/src/components/BrandLockup.tsx`
  — same props as before, so no call site changed.
- `app/opengraph-image.tsx` — the share card, now carrying the real wordmark
  instead of Satori's fallback face.
- `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`,
  `public/icons/icon-{192,512}.png`, `public/brand/tappet-*.svg`.
- `apps/mobile/assets/*` — icon, splash and the three Android adaptive layers.
- `lib/__tests__/brand.test.ts` pins all of it against the files in this folder.

## Still to do

- ⚠ **The iOS icon and splash need a native EAS build.** Metro will not move
  either, so they cannot ride an OTA update; bundle them with anything else
  native that is queued. Budget is ~15 iOS cloud builds a month, and everything
  else here is JS and ships over the air.
- ⚠ `wellkept.southmoordigital.com` is gated behind `web-live`, so none of the
  web assets are live until someone promotes. That is a gate, not a bug — see
  `CLAUDE.md` §8.
- The App Store listing's own screenshots and marketing images still carry the
  previous mark. Not code, and not in this package.
