#!/usr/bin/env python3
"""Generate the Well Kept brand package: outlined SVGs, then PNGs from them.

Two rules from the first brand package's README drive this whole script, and
both are here because they fail *silently*:

  1. **The type is outlined.** Every SVG the previous package shipped declared
     `font-family="Newsreader, Georgia, serif"`. That is right in a browser with
     the webfont and wrong in any rasteriser without it — the substitute lands
     and the W changes shape with nothing reporting it. So the wordmark and the
     W are converted to paths here, once, from the variable font instanced at
     the exact axis coordinates the design was drawn at. Nothing downstream
     needs Archivo.

  2. **The icon ground is baked.** iOS does not composite transparency on the
     home screen, so the app-icon PNGs carry their own tile. Only the favicon
     and the bare mark are transparent.

⚠ Archivo's cap height is **0.686 em**, read from the font's own OS/2
`sCapHeight`. An assumed 0.73 makes every stated cap height 6% larger than what
renders, which is how the nav lockup came to be reported at a 20px cap while
measuring 18.8.

Usage:  build.py --fonts <dir-with-variable-ttfs> [--png]
"""
import argparse, io, json, os, subprocess, sys, tempfile
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

# ── palette ────────────────────────────────────────────────────────────────
# The shipped tokens, not sampled approximations: app/globals.css
INK    = '#F5F3F0'   # --foreground
GRAPH  = '#1A1815'   # --surface-1   (the icon tile)
GROUND = '#100F0D'   # --background  (splash, adaptive-icon background)

# ── geometry ───────────────────────────────────────────────────────────────
S, C   = 66.0, 10.0  # plate grid, chamfer (15% of the side)
W_CAP  = 44.0        # the letter inside the plate
TILE   = 100.0       # app-icon grid; the plate is 66% of it
LOCK_CAP = 20.0      # lockup cap height — every lockup measure derives from it
MARK_R, GAP_R = 1.00, 0.28   # mark side and gap, in cap heights
MAKER_R = 0.30               # maker cap height, as a share of the wordmark's
TRACK_R, MTRACK_R = -0.01, 0.10

PLATE = f'M{C:g} 0 H{S-C:g} L{S:g} {C:g} V{S-C:g} L{S-C:g} {S:g} H{C:g} L0 {S-C:g} V{C:g} Z'


def load(path, loc):
    """Instance the variable font, and hand back the bytes too — HarfBuzz has to
    shape the *same* instance, or the advances belong to a different width."""
    f = instancer.instantiateVariableFont(TTFont(path), loc, inplace=True)
    buf = io.BytesIO()
    f.save(buf)
    return f, buf.getvalue()


def _n(v):
    """3dp is ~0.005 of a plate unit — below a rounding error at 1024px, and it
    keeps the outlined paths a tenth the size of the raw float output."""
    return f'{v:.3f}'.rstrip('0').rstrip('.') or '0'


def shape(font_bytes, text):
    """Glyph ids and advances from HarfBuzz — the engine the browser uses.

    ⚠ Summing `hmtx` advances is not the same thing: it skips kerning. Archivo
    kerns WELL KEPT by 0.58 units at a 20-unit cap, so the naive sum drifts the
    later letters by most of a pixel against the on-screen wordmark and the
    outlined file stops being the drawing that was approved."""
    face = hb.Face(font_bytes)
    fnt = hb.Font(face)
    fnt.scale = (face.upem, face.upem)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(fnt, buf)
    return [(i.codepoint, p.x_advance) for i, p in zip(buf.glyph_infos, buf.glyph_positions)]


def string_path(font, font_bytes, text, size, tracking=0.0, x0=0.0, y0=0.0):
    """One `d` for the string, baseline at y0, in SVG space (y down)."""
    upem = font['head'].unitsPerEm
    order = font.getGlyphOrder()
    gs = font.getGlyphSet()
    k, x, out = size / upem, x0, []
    run = shape(font_bytes, text)
    for gid, adv in run:
        name = order[gid]
        pen = SVGPathPen(gs, ntos=_n)
        gs[name].draw(TransformPen(pen, Transform(k, 0, 0, -k, x, y0)))
        if pen.getCommands():
            out.append(pen.getCommands())
        x += adv * k + tracking
    return ' '.join(out), x - x0 - (tracking if run else 0.0)


def svg(vb_w, vb_h, body, title, w=None, h=None, extra=''):
    dims = f' width="{w}" height="{h}"' if w else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w:g} {vb_h:g}"{dims}'
            f' role="img" aria-label="Well Kept"{extra}>\n  <title>{title}</title>\n{body}\n</svg>\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', required=True)
    ap.add_argument('--out', default=str(Path(__file__).parent))
    ap.add_argument('--png', action='store_true')
    ap.add_argument('--core', help='also emit the generated TS geometry module here')
    a = ap.parse_args()
    out = Path(a.out); (out / 'svg').mkdir(parents=True, exist_ok=True)

    arch, arch_b = load(f'{a.fonts}/Archivo-var.ttf', {'wdth': 62, 'wght': 800})
    mono, mono_b = load(f'{a.fonts}/JetBrainsMono-var.ttf', {'wght': 400})
    cap_a = arch['OS/2'].sCapHeight / arch['head'].unitsPerEm
    cap_m = mono['OS/2'].sCapHeight / mono['head'].unitsPerEm

    # ── the mark: plate with the W cut clean through it ────────────────────
    # Not a filled letter — a hole, so the ground behind genuinely shows in the
    # W. That is what makes one drawing serve both polarities and a photograph.
    wsize = W_CAP / cap_a
    _, wadv = string_path(arch, arch_b, 'W', wsize)
    wd, _ = string_path(arch, arch_b, 'W', wsize, 0.0, (S - wadv) / 2, S / 2 + W_CAP / 2)
    def mark_body(fill, mid, indent='  '):
        """The plate and the letter as **one path**, knocked out by fill rule.

        ⚠ A `<mask>` was the obvious way to write this and it is the wrong one.
        `even-odd` toggles on every crossing, so putting the W's contours in the
        same `d` as the plate leaves the letter unfilled and the ground shows
        through it — the same drawing, with four things removed:

        - **No id.** A mask needs one, ids are document-global in SVG, and two
          inlined copies with the same id silently bind to the first.
        - **No mask support required.** Satori — which renders the OG card and
          fails by returning a 200 with a **zero-byte body** — supports `<path>`
          and little else. So does every impoverished rasteriser downstream.
        - **No second element**, so `react-native-svg` and the web draw the
          identical markup rather than each importing a `Mask`.
        - The letter's own counters still work: even-odd fills an island inside
          a hole, which is what a knocked-out `O` would need.

        `mid` is kept in the signature so callers read the same; nothing uses it
        any more.
        """
        del mid
        return (f'{indent}<path fill-rule="evenodd" fill="{fill}"\n'
                f'{indent}  d="{PLATE} {wd}"/>')

    files = {}
    files['svg/mark.svg'] = svg(S, S, mark_body('currentColor', 'wk-cut-mark'),
                                'Well Kept — mark')

    # ── the lockups ────────────────────────────────────────────────────────
    cap = LOCK_CAP
    mark_s, gap = cap * MARK_R, cap * GAP_R
    wsize_l = cap / cap_a
    track = TRACK_R * cap
    word_d, word_w = string_path(arch, arch_b, 'WELL KEPT', wsize_l, track, mark_s + gap, cap)
    mcap = cap * MAKER_R
    msize = mcap / cap_m
    mtrack = MTRACK_R * mcap
    maker_base = cap + mcap * 1.9
    maker_d, maker_w = string_path(mono, mono_b, 'SOUTHMOOR DIGITAL', msize, mtrack, mark_s + gap, maker_base)
    vb_w = mark_s + gap + word_w
    scale = mark_s / S

    def lockup(with_maker):
        vb_h = (maker_base + mcap * 0.35) if with_maker else mark_s
        mid = 'wk-cut-lockup-full' if with_maker else 'wk-cut-lockup'
        body = (f'  <g transform="scale({scale:.5f})">\n{mark_body("currentColor", mid, "  ")}\n  </g>\n'
                f'  <path d="{word_d}" fill="currentColor"/>')
        if with_maker:
            body += f'\n  <path d="{maker_d}" fill="currentColor" opacity="0.6"/>'
        return svg(vb_w, vb_h, body,
                   'Well Kept — lockup' + (' with maker' if with_maker else ''))

    files['svg/lockup.svg'] = lockup(False)
    files['svg/lockup-full.svg'] = lockup(True)

    # ── the app icon: the plate at 66% of the tile, ground baked in ────────
    p = (TILE - S) / 2

    def icon_svg(tile_fill=GRAPH, plate_fill=INK, plate_share=None, ground=True, mid='wk-cut-icon'):
        share = plate_share or (S / TILE)
        side = TILE * share
        off = (TILE - side) / 2
        k = side / S
        body = ((f'  <rect width="{TILE:g}" height="{TILE:g}" fill="{tile_fill}"/>\n' if ground else '')
                + f'  <g transform="translate({off:.4f} {off:.4f}) scale({k:.5f})">\n'
                + mark_body(plate_fill, mid, '  ') + '\n  </g>')
        return svg(TILE, TILE, body, 'Well Kept — app icon')

    files['svg/icon.svg'] = icon_svg()

    # ── the two favicons, and why there are two ────────────────────────────
    # `favicon.svg` is the one a modern browser takes: transparent, edge to
    # edge so the W gets every pixel at 16px, and it swaps polarity itself
    # through a media query, which no raster can do.
    #
    # ⚠ `favicon-solid.svg` is the fallback, and it is **not** the same drawing
    # with a background. A transparent favicon has to pick a polarity, and one
    # polarity is always wrong: an off-white plate vanishes on a light tab
    # strip, a graphite one on a dark strip, and neither failure raises
    # anything — the tab just looks empty. Carrying the tile makes it legible on
    # any strip with one file, so ICO and the PNG fallbacks come from here.
    # (`<link media="(prefers-color-scheme: dark)">` would be the elegant answer
    # and is not reliable outside Chromium.)
    files['svg/favicon.svg'] = svg(
        S, S,
        f'  <style>\n'
        f'    .wk-plate {{ fill: {GRAPH}; }}\n'
        f'    @media (prefers-color-scheme: dark) {{ .wk-plate {{ fill: {INK}; }} }}\n'
        f'  </style>\n'
        + mark_body('currentColor', 'wk-cut-favicon').replace(
            'fill="currentColor"', 'class="wk-plate"'),
        'Well Kept — favicon')
    files['svg/favicon-solid.svg'] = svg(
        S, S,
        f'  <rect width="{S:g}" height="{S:g}" fill="{GRAPH}"/>\n'
        + mark_body(INK, 'wk-cut-favicon-solid'),
        'Well Kept — favicon, opaque')
    # Android adaptive foreground: the outer 33% of the canvas can be masked away
    # and the mask may be a circle, so a *square* plate has to fit the inscribed
    # square of that circle — 0.667/√2 = 47% of the canvas, not 66%.
    files['svg/android-foreground.svg'] = icon_svg(plate_share=0.47, ground=False,
                                                   mid='wk-cut-android-fg')
    # `app.json` sets `adaptiveIcon.backgroundColor` too, but a `backgroundImage`
    # wins where both are given, so the flat layer is generated rather than left
    # to agree with a hex string in a config file by hand.
    files['svg/android-background.svg'] = svg(
        TILE, TILE, f'  <rect width="{TILE:g}" height="{TILE:g}" fill="{GROUND}"/>',
        'Well Kept — Android adaptive background')
    files['svg/android-monochrome.svg'] = icon_svg(tile_fill='#000', plate_fill='#fff',
                                                   plate_share=0.47, ground=False,
                                                   mid='wk-cut-android-mono')

    for name, text in files.items():
        (out / name).write_text(text)
        print(f'  {name}')

    meta = {
        'archivo': {'axes': {'wdth': 62, 'wght': 800}, 'capPerEm': round(cap_a, 4),
                    'version': arch['name'].getDebugName(5)},
        'mono': {'axes': {'wght': 400}, 'capPerEm': round(cap_m, 4),
                 'version': mono['name'].getDebugName(5)},
        'plate': {'grid': S, 'chamfer': C, 'chamferShare': C / S, 'wCap': W_CAP,
                  'wAdvance': round(wadv, 3), 'sideMargin': round((S - wadv) / 2, 3),
                  'capMargin': round((S - W_CAP) / 2, 3)},
        'lockup': {'cap': cap, 'mark': mark_s, 'gap': round(gap, 3),
                   'wordmarkAdvance': round(word_w, 3), 'total': round(vb_w, 3),
                   'makerAdvance': round(maker_w, 3), 'makerCap': mcap},
        'icon': {'tile': TILE, 'plateShare': S / TILE, 'androidPlateShare': 0.47},
        'colours': {'ink': INK, 'tile': GRAPH, 'ground': GROUND},
    }
    (out / 'geometry.json').write_text(json.dumps(meta, indent=2) + '\n')
    print('  geometry.json')

    if a.core:
        write_core(Path(a.core), meta, wd, word_d, maker_d, vb_w, scale)
        print(f'  {a.core}')

    if a.png:
        render_pngs(out)


CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# What actually ships, and where it lands. The third field is the colour
# `currentColor` resolves to at raster time.
PNG_SET = [
    *[('svg/icon.svg', n, INK, f'png/ios/icon-{n}.png')
      for n in (1024, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29)],
    ('svg/icon.svg', 1024, INK, 'png/expo/icon.png'),
    ('svg/icon.svg', 512, INK, 'png/web/icon-512.png'),
    ('svg/icon.svg', 192, INK, 'png/web/icon-192.png'),
    ('svg/icon.svg', 180, INK, 'png/web/apple-icon.png'),
    # Android composites the foreground over its own #100F0D background layer,
    # and tints the monochrome itself — both are meant to be transparent.
    ('svg/android-foreground.svg', 1024, INK, 'png/expo/android-icon-foreground.png'),
    ('svg/android-monochrome.svg', 1024, INK, 'png/expo/android-icon-monochrome.png'),
    ('svg/android-background.svg', 1024, INK, 'png/expo/android-icon-background.png'),
    ('svg/mark.svg', 512, INK, 'png/expo/splash-icon.png'),
    *[('svg/favicon-solid.svg', n, INK, f'png/web/favicon-{n}.png') for n in (48, 32, 16)],
    ('svg/favicon-solid.svg', 48, INK, 'png/expo/favicon.png'),
]

# The .ico is packed from those three PNGs — see `write_ico`.
ICO_SIZES = (48, 32, 16)


def render_pngs(out):
    """Rasterise from the *outlined* SVGs, so the PNGs cannot depend on a font."""
    if not Path(CHROME).exists():
        print('  (skipping PNGs — Chrome not found)'); return
    for src, n, colour, dest in PNG_SET:
        d = out / dest; d.parent.mkdir(parents=True, exist_ok=True)
        body = (out / src).read_text()
        # currentColor resolves off `color`; the mark inherits ink, the icon
        # carries its own fills and ignores it.
        html = (f'<!doctype html><meta charset="utf-8">'
                f'<style>html,body{{margin:0;padding:0;background:transparent;color:{colour}}}'
                f'svg{{display:block;width:{n}px;height:{n}px}}</style>{body}')
        with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False) as f:
            f.write(html); tmp = f.name
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--default-background-color=00000000',
                        f'--window-size={n},{n}', '--virtual-time-budget=4000',
                        f'--screenshot={d}', f'file://{tmp}'],
                       check=True, capture_output=True)
        os.unlink(tmp)
        print(f'  {dest}  {n}x{n}')
    write_ico(out)




CORE_HEADER = """/**
 * The Well Kept mark, as geometry. **Generated — do not edit.**
 *
 * Regenerate with `docs/brand-package-v2/build.py --core <this file>`; the
 * README beside that script has the two curl lines that fetch the fonts.
 *
 * ── Why this file is generated and `brand.ts` is not ────────────────────────
 *
 * `brand.ts` carries the reasoning and a small, readable API. This carries the
 * three outlined paths, which are shaped by HarfBuzz from a variable font
 * instanced at an exact axis position — numbers no human should retype and no
 * reviewer can check by eye. Hand-transcribing them is the failure this repo
 * already knows: `Icon.tsx` carries *"do not redraw or approximate"* because a
 * copied glyph drifts, and the old dial's path lived in two files kept in step
 * by hand.
 *
 * `lib/__tests__/brand.test.ts` reads `docs/brand-package-v2/svg/*.svg` and
 * fails if these strings and those files ever disagree, in either direction.
 */

"""


def write_core(dest, meta, plate_w_d, word_d, maker_d, lockup_w, mark_scale):
    """Emit the generated geometry module the two clients import."""
    p, l, i, c = meta['plate'], meta['lockup'], meta['icon'], meta['colours']
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(CORE_HEADER + f"""/** The chamfered plate, on its own {p['grid']:g}-unit grid. */
export const PLATE_GRID = {p['grid']:g};
export const PLATE_CHAMFER = {p['chamfer']:g};
export const PLATE_PATH = '{PLATE}';

/** The W, outlined and already positioned on the plate grid. */
export const W_PATH =
  '{plate_w_d}';

/**
 * The mark as one path: the plate, then the letter, knocked out by fill rule.
 * Draw it with `fill-rule="evenodd"` and nothing else — see `brand.ts`.
 */
export const MARK_PATH = `${{PLATE_PATH}} ${{W_PATH}}`;

/** "WELL KEPT", outlined, positioned on the lockup grid at x = mark + gap. */
export const WORDMARK_PATH =
  '{word_d}';

/** "SOUTHMOOR DIGITAL", outlined, on the same grid and the same left edge. */
export const MAKER_PATH =
  '{maker_d}';

/** Lockup measures, in grid units. */
export const LOCKUP = {{
  cap: {l['cap']:g},
  mark: {l['mark']:g},
  gap: {l['gap']:g},
  wordmarkAdvance: {l['wordmarkAdvance']:g},
  makerAdvance: {l['makerAdvance']:g},
  makerCap: {l['makerCap']:g},
  /** viewBox width for every lockup; height depends on the maker line. */
  width: {l['total']:g},
  /** viewBox height without the maker line — the mark is the tallest thing. */
  heightShort: {l['mark']:g},
  heightFull: {meta['lockup']['makerCap'] * 0.35 + l['cap'] + meta['lockup']['makerCap'] * 1.9:g},
  /** Scale that takes the {p['grid']:g}-unit plate onto the lockup grid. */
  markScale: {mark_scale:.5f},
}} as const;

/** App-icon measures, on a {i['tile']:g}-unit tile. */
export const ICON = {{
  tile: {i['tile']:g},
  plateShare: {i['plateShare']:g},
  androidPlateShare: {i['androidPlateShare']:g},
}} as const;

/** The axis position the outlines were shaped at, for the record. */
export const TYPE_SOURCE = {{
  display: {{ family: 'Archivo', wdth: {meta['archivo']['axes']['wdth']}, wght: {meta['archivo']['axes']['wght']}, capPerEm: {meta['archivo']['capPerEm']} }},
  mono: {{ family: 'JetBrains Mono', wght: {meta['mono']['axes']['wght']}, capPerEm: {meta['mono']['capPerEm']} }},
}} as const;

/** The mark's two non-colours, and the ground its tile is baked on. */
export const BRAND_COLOR = {{
  ink: '{c['ink']}',
  tile: '{c['tile']}',
  ground: '{c['ground']}',
}} as const;
""")

def write_ico(out):
    """Pack the favicon PNGs into a single .ico.

    An ICO may embed PNG payloads whole (Vista onward), so this is a directory
    header in front of files that already exist — no second rasterisation, and
    therefore no second chance to differ from them.
    """
    import struct

    entries = []
    for n in ICO_SIZES:
        entries.append((n, (out / f'png/web/favicon-{n}.png').read_bytes()))
    offset = 6 + 16 * len(entries)
    header = struct.pack('<HHH', 0, 1, len(entries))
    directory, payload = b'', b''
    for n, data in entries:
        # 0 means 256 in this field; every size here is well under it.
        directory += struct.pack('<BBBBHHII', n, n, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        payload += data
    dest = out / 'png/web/favicon.ico'
    dest.write_bytes(header + directory + payload)
    print(f'  png/web/favicon.ico  {"+".join(str(n) for n in ICO_SIZES)}')


if __name__ == '__main__':
    main()
