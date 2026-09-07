/*
 * `next/server`, not `next/og`. Every current example writes `next/og` — that
 * path was added in Next 14, and this project is pinned to 13.5.11, where the
 * import resolves to nothing and the build fails with "Module not found".
 * Move it when Next is upgraded; the same note is on the Newsreader font in
 * layout.tsx, for the same pin.
 */
import { ImageResponse } from 'next/server';

import { BRAND_COLOR, LOCKUP, MARK_PATH, WORDMARK_PATH } from '@tappet/core/brand';
import { isDemoSite } from '@/lib/site-role';

/*
 * The share card, generated rather than stored.
 *
 * The audit that prompted this found two faults on the same line of
 * `app/layout.tsx`: the card pointed at `/garage-interior-1920.jpg`, an image
 * whose licence public/CREDITS.md could not establish, and it pointed at it
 * *relatively* with no `metadataBase` — so Next 13.5 resolved it against
 * `http://localhost:3000` and every deployed share card asked scrapers to
 * fetch an image from their own machine. The portfolio link has been sharing
 * a broken preview.
 *
 * Deleting the photograph fixes the licence and breaks the card, so the card
 * needed a replacement first. This is it: the same service-bay recipe as
 * `.service-bay` in globals.css, rendered to PNG at build time. Nothing to
 * licence, no binary in the repo to drift from the stylesheet, and no fetch
 * of a 142 KB JPEG when a scraper comes calling.
 *
 * Next finds this file by convention — the filename is the API. It emits the
 * `og:image` and `twitter:image` tags itself, at the right absolute URL, which
 * is why `layout.tsx` no longer declares `images` at all. `metadataBase` still
 * has to be set there: convention-based routes are resolved against it too.
 *
 * Written with stacked absolute divs rather than the stylesheet's single
 * background-layer stack. This renders through Satori, not a browser, and
 * Satori takes a subset of CSS — no `background-size` per layer, no
 * `repeating-linear-gradient`. The values are the stylesheet's; keep them in
 * step by hand, there are only nine.
 *
 * The batten is drawn here even though `.service-bay` never carried one and the
 * app no longer does either — the nav's cyan hairline was cut on 4 Sep after
 * successive design critiques read it as "a leftover from another theme".
 *
 * ⚠ It survives on this card deliberately, and the distinction is the point:
 * what was cut is a *chrome* element, a rule under a nav competing with the
 * page's own accents. This is a single composed frame with no chrome in it, so
 * the fixture reads as what the concept drew — a light below an implied
 * ceiling — rather than as a stray line. It is the one surface where the
 * original single-layer composition is still the right one.
 */

export const runtime = 'nodejs';
export const alt = 'Tappet — an AI that keeps the record, so the care keeps itself';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: 'linear-gradient(180deg, #0B0A09 0%, #131110 52%, #191713 64%, #15130F 100%)',
        }}
      >
        {/* Ceiling wash */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background:
              'radial-gradient(ellipse 92% 52% at 50% 13%, rgba(34,211,238,0.09), rgba(34,211,238,0) 62%)',
          }}
        />
        {/* The batten, and its bloom */}
        <div
          style={{
            position: 'absolute',
            top: 76,
            left: 108,
            width: 984,
            height: 2,
            background:
              'linear-gradient(90deg, rgba(34,211,238,0) 0%, rgba(34,211,238,0.75) 14%, rgba(160,240,252,0.95) 50%, rgba(34,211,238,0.75) 86%, rgba(34,211,238,0) 100%)',
            boxShadow: '0 0 18px 2px rgba(34,211,238,0.35), 0 0 70px 16px rgba(34,211,238,0.10)',
          }}
        />
        {/* Wall/floor seam.
            76% here, against the stylesheet's 64%. The plate fills a viewport
            and this fills a 1.91:1 crop, so the same fraction puts the horizon
            straight through the headline's second line — it read as a rule
            struck through "knows your car". Dropped until both lines and the
            subhead sit on the wall. The one number in this file that is
            deliberately not the stylesheet's. */}
        <div
          style={{
            position: 'absolute',
            top: 479,
            left: 0,
            width: '100%',
            height: 1,
            background: 'rgba(255,255,255,0.045)',
          }}
        />
        {/* Floor sheen, and the batten reflected in it */}
        <div
          style={{
            position: 'absolute',
            top: 480,
            left: 0,
            width: '100%',
            height: 150,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0) 45%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 480,
            left: 0,
            width: '100%',
            height: 150,
            background:
              'radial-gradient(ellipse 52% 38% at 50% 20%, rgba(34,211,238,0.06), rgba(34,211,238,0) 72%)',
          }}
        />
        {/* Corner falloff */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background:
              'radial-gradient(120% 100% at 50% 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)',
          }}
        />

        {/*
          ── The lockup, restated because Satori renders JSX, not components ──

          `BrandLockup` cannot be used here: this renders through Satori, which
          takes a JSX tree rather than a React component tree with our imports.
          What it *can* share is the geometry — the plate, the W and the
          wordmark all come from `@tappet/core/brand`, so the card cannot
          drift from the mark the app draws even though the drawing is restated.

          ── ⚠ Satori refuses SVG text, and refuses it dangerously ───────────

          *"<text> nodes are not currently supported, please convert them to
          <path>"* — and the way it refuses is the dangerous part: the route
          still answers **200 with `content-type: image/png` and a zero-byte
          body**. A scraper sees a valid response and a broken picture, and
          nothing in the app looks wrong. Caught by generating the card and
          measuring it; it would not have shown up in any test that reads
          source.

          ⚠ **That constraint used to cost this card its typeface.** The name
          was a positioned `div` set in Satori's default face, because loading
          a webfont here means a network fetch inside `next build` — and this
          build is the promote gate for the hostname the App Store points at,
          so a font CDN having a bad minute would fail a deploy.

          The identity redraw removes the trade entirely. The wordmark is an
          **outlined path**, which is the one thing Satori does support, so the
          card now carries the real drawing with no font, no fetch, and no
          substitute face. Every element below is a `<path>` — the mark included,
          because its letter is knocked out by fill rule rather than by a mask.
        */}
        <div
          style={{
            position: 'absolute',
            top: 132,
            left: 108,
            display: 'flex',
          }}
        >
          <svg
            width={340}
            height={Math.round((340 * LOCKUP.heightShort) / LOCKUP.width)}
            viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.heightShort}`}
          >
            <g transform={`scale(${LOCKUP.markScale})`}>
              <path d={MARK_PATH} fillRule="evenodd" fill={BRAND_COLOR.ink} />
            </g>
            <path d={WORDMARK_PATH} fill={BRAND_COLOR.ink} />
          </svg>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 236,
            left: 108,
            display: 'flex',
            flexDirection: 'column',
            width: 840,
          }}
        >
          <div style={{ fontSize: 68, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.025em', lineHeight: 1.08 }}>
            An AI that keeps the record, so the care keeps itself.
          </div>
          {/*
            ⚠ **Per site, and it was not.** This line read "Live demo with
            sample vehicles — no signup required" on *both* deployments — so the
            share card for `tappet.southmoordigital.com`, which is the App Store
            listing's marketing URL, described the product as a demo.

            `39f7f0b` fixed exactly this on the landing page and `site-role.ts`
            states the rule — *"the product copy must not describe Tappet as
            a demo"* — and the card was missed because it is generated by a
            convention route rather than rendered inside the app.
          */}
          <div style={{ marginTop: 26, fontSize: 30, color: 'rgba(255,255,255,0.55)', lineHeight: 1.35 }}>
            {isDemoSite(process.env.TAPPET_DEMO_SITE ?? process.env.WELLKEPT_DEMO_SITE ?? process.env.CREWCHIEF_DEMO_SITE)
              ? 'Live demo with sample vehicles — no signup required'
              : 'Every invoice read, every interval anchored.'}
          </div>
        </div>
      </div>
    ),
    size
  );
}
