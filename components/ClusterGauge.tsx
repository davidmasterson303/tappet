'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/hooks/use-reduced-motion';
import { useHealthBand } from '@/hooks/use-health-band';

/*
 * The health score as an instrument cluster, not a progress donut.
 *
 * Built to `docs/roadmap.md` item 7 (concept 2a). The reference is a modern
 * flagship cluster at night, and its grammar is specific: a near-black face, a
 * thin luminous arc open at the bottom, fine ticks with the numbers *on* the
 * majors, one accent hue used as light rather than as fill, tabular numerals,
 * and a needle sweep at ignition. What it never does is close the ring — a
 * 360° track has no start and no end, so it reads as a loading spinner rather
 * than a scale.
 *
 * The 270° opening is what buys the ticks. On a closed donut there is nowhere
 * to put 40 / 60 / 80 without them colliding with the fill, which is why the
 * ring this replaces had no marks at all: it could show that a score was
 * large, but not that 68 sits one tick past the boundary where "Needs
 * attention" becomes "Fair". The linear band scale this hero used to carry
 * made the same argument in its own comment; the ticks have simply moved onto
 * the arc, where the reading and the scale are one object.
 *
 * ── Geometry ────────────────────────────────────────────────────────────────
 *
 * viewBox 0 0 200 178, centre (100,100), arc radius 70, open 90° at the
 * bottom. The height is 178 rather than 200 deliberately: the arc bottoms out
 * at y≈152, and the 26 units left below it are exactly the readout's line.
 * Cropping there is what stops the dial floating in a square of nothing.
 *
 * A score maps to an angle by `2.7 * score - 135` degrees from twelve
 * o'clock: 2.7 = 270/100, and -135 puts zero at the bottom-left end. Every
 * rotating part — needle, ticks, labels — uses that one expression, so nothing
 * can drift out of register with the track.
 *
 * The track path is `M 50.5 149.5 A 70 70 0 1 1 149.5 149.5`; those endpoints
 * are the same formula at 0 and 100, and the large-arc flag is 1 because 270°
 * exceeds a semicircle — the flag most hand-written arcs get wrong. The lit
 * portion reuses the identical `d` with `pathLength="100"`, so the dasharray
 * is literally the score: no circumference arithmetic, and no chance of the
 * fill and the track describing different curves.
 *
 * Caps are butt, not round. A round cap adds half a stroke width of arc at
 * each end, so a score of 0 would still paint a visible stub and every reading
 * would sit ~2% long. On a dial with ticks that error is legible.
 */

const VIEW_W = 200;
const VIEW_H = 178;
const CX = 100;
const CY = 100;
const R = 70;
const TRACK = `M 50.5 149.5 A ${R} ${R} 0 1 1 149.5 149.5`;

/** Degrees from twelve o'clock for a score. The one conversion in the file. */
function angleFor(score: number): number {
  return 2.7 * score - 135;
}

/** A point at `radius` along the dial, for a score. */
function pointAt(score: number, radius: number): { x: number; y: number } {
  const rad = (angleFor(score) * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

/*
  Majors carry the numbers; minors are every 5 and carry nothing. 40, 60 and 80
  are also band boundaries and are drawn brighter still — they are the only
  points on this scale where the score's meaning changes, and the whole reason
  the dial is ticked rather than smooth.
*/
const MAJORS = [0, 20, 40, 60, 80, 100];
/*
  ── ⚠ Two numerals, and the second attempt at this ────────────────────────

  Six numerals around a 160px arc is a scale competing with its own reading,
  and a critique of the rendered dashboard named the clutter first.

  The first reduction kept the *meaningful* points — the two ends plus the
  three where the verdict changes, 40/60/80 — and dropped 20. The next round of
  the same critique caught what that did: "tick labels sit at irregular
  positions (40/60 crowding the top, 80 alone on the right)". Of course they
  do. Removing one number from an evenly spaced set does not make the set
  meaningful, it makes it look mismeasured, and on an instrument face — where
  regularity *is* the craft — that is worse than the clutter it fixed.

  So the numerals are the two ends of the scale, which is what a scale's
  numerals are for, and the band boundaries keep saying what they say the way
  an instrument says it: with a heavier tick. The verdict is written out under
  the dial in words, which is more legible than a number a reader has to
  compare against three remembered thresholds.

  Every major still gets a mark, so the geometry is even all the way round.
*/
const LABELLED = [0, 100];
const BOUNDARIES = new Set([40, 60, 80]);


/**
 * The ignition sweep: 0 → 100 → settle on the score, ~900ms.
 *
 * Not decoration — it is how a cluster says the instrument is live and what its
 * range is, before it says the reading. Driving needle and arc from one value
 * keeps them on the same number at every frame; they are one quantity drawn
 * twice.
 *
 * Reduced motion lands on the final value immediately, and so does a hidden
 * document — `requestAnimationFrame` does not fire in a background tab, and the
 * failure there is not a missed animation but a needle parked at zero beside
 * the label "Fair". `use-count-up.ts` records finding exactly that.
 */
function useIgnitionSweep(target: number, enabled: boolean): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frame = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion() || (typeof document !== 'undefined' && document.hidden)) {
      setValue(target);
      return;
    }
    if (!enabled) {
      setValue(0);
      return;
    }

    const SWEEP_UP = 420;
    const SETTLE = 480;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed < SWEEP_UP) {
        const t = elapsed / SWEEP_UP;
        setValue(100 * (1 - Math.pow(1 - t, 3)));
      } else if (elapsed < SWEEP_UP + SETTLE) {
        const t = (elapsed - SWEEP_UP) / SETTLE;
        setValue(100 + (target - 100) * (1 - Math.pow(1 - t, 3)));
      } else {
        setValue(target);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, enabled]);

  return value;
}

interface ClusterGaugeProps {
  /**
   * The reading, or `null` when there is not enough history to make one.
   *
   * ── ⚠ D10 · `null` is not a zero, and this dial used to draw it as one ────
   *
   * `DiagnosticHero` passed `healthScore ?? 0` and `VehicleCard` passed
   * `healthSummary.health_score` straight through, so a car the model had
   * declined to score — the state `app/actions.ts` was rewritten to produce
   * rather than fake a 70 — arrived here as `0` and rendered a **full red dial
   * reading 0, labelled "Needs attention"**. Not an error, not a blank: a
   * confident worst-possible reading about a car nobody had assessed.
   *
   * That is the defect this whole file's sibling modules are written against —
   * `health-drivers.ts` says it four times, the garage card calls it "no score
   * is not a zero" — arriving through the one component that draws the number.
   *
   * So the type carries it. A caller cannot pass a missing score without
   * deciding what a missing score looks like, because the compiler now asks.
   */
  score: number | null;
  /**
   * 'hero' is the full dial: minors every 5, numbered majors, needle and hub,
   * the reading on its own line beneath. 'card' is the same instrument at the
   * garage grid's 56px slot — see the note on the variant below.
   */
  variant?: 'hero' | 'card';
  /** Hold the sweep until the caller's own reveal has finished. */
  active?: boolean;
  /** Rendered width in px; height follows the viewBox ratio. */
  size?: number;
}

export function ClusterGauge({
  score,
  variant = 'hero',
  active = true,
  size = 196,
}: ClusterGaugeProps) {
  const isCard = variant === 'card';

  /**
   * No reading. Every branch below that would assert something about the car
   * is switched off by this, rather than fed a substitute number.
   */
  const unknown = score === null;

  /*
    ⚠ Hooks run on every path, including the unknown one.

    `0` here is a placeholder for arithmetic that is never drawn — the sweep is
    disabled and the band is discarded when `unknown`. It must not become a
    default score: the guards below are what stop it reaching the face, and the
    reason it is safe to write is that nothing reads it.
  */
  const swept = useIgnitionSweep(score ?? 0, active && !isCard && !unknown);

  /*
    The card dial is deliberately still — no sweep, no count-up. VehicleCard's
    ring comment already settled this: those were single-card moments, and
    three of them side by side in the garage grid read as noise while the band
    colour already carries severity. Adopting the ticked dial there does not
    reopen it.
  */
  const value = isCard ? score ?? 0 : swept;

  // Band comes from the *target*, never the swept value: the face must not
  // cycle amber → cyan → green on its way to a reading.
  const band = useHealthBand(score ?? 0);

  /*
    ⚠ The unknown face takes no band colour at all.

    Not the lowest band, not a neutral green — the muted ink the rest of this
    product uses for "we cannot say", the same choice `HealthDrivers` on mobile
    makes for a `null` driver. Colouring an unmeasured dial would assert a
    condition nobody checked, which is the overclaim in a different paint.
  */
  const ink = unknown ? 'rgb(255 255 255 / 0.38)' : band.color;
  const inkRgb = unknown ? '255 255 255' : band.rgb;

  const settled = isCard || unknown || Math.abs(swept - (score ?? 0)) < 0.5;
  const clamped = Math.max(0, Math.min(100, value));

  /*
    Two viewBoxes, one geometry.

    The hero crops to 178 tall because the 26 units below the arc are the
    readout's line. The card has no readout line — its number sits in the well —
    so that crop would hang 11 units of dead space under the dial and push the
    numeral visibly off-centre: measured 3px low in a 56px slot, which is a lot
    at that size. The card gets a square box centred on the pivot instead, wide
    enough for the major ticks at r=84.

    Nothing else changes. Same centre, same radius, same angle expression — only
    the window onto them.
  */
  const viewBox = isCard ? '14 14 172 172' : `0 0 ${VIEW_W} ${VIEW_H}`;
  const height = isCard ? size : (size * VIEW_H) / VIEW_W;

  /*
    At 56px the minors would be sub-pixel and six numbers illegible, so the
    card keeps only what survives: the boundary majors, the arc, and a marker
    in place of needle-and-hub. A hub plus a centred numeral collide at any
    size — the needle would cross the digits — and the card has nowhere else to
    put its reading, so the pointer stops short there and the hub goes. The
    hero has the room and keeps both.
  */
  /*
    ⚠ Ticks against the track, not floating outside it. `majorFrom: 76` left a
    visible gap between the arc's outer edge and the mark — a critique of the
    rendered dial called them "stray tick marks floating at odd angles outside
    the ring", which is what a mark separated from the thing it marks looks
    like. The track is `R = 70` with a stroke either side of it, so 74 is its
    outer edge.
  */
  const tickR = { minorFrom: 74, minorTo: 78, majorFrom: 74, majorTo: 81 };

  return (
    <div
      /*
        ⚠ `w-fit` on the hero. The band label under the dial is `text-center`,
        and in the hero's stacked mobile column this wrapper stretched to the
        full 324px while the dial itself is 196 — so "Fair" centred on the
        column and sat 64px to the right of the instrument it belongs to.
        Hugging the drawing puts the two on one axis.
      */
      className={isCard ? 'flex flex-col items-center gap-1 flex-shrink-0' : 'w-fit flex-shrink-0'}
      role="img"
      /*
        ⚠ The unknown state has to be spoken, not merely undrawn. A dial that
        renders "—" and announces "Health score 0 out of 100" would be honest
        to the eye and false to a screen reader, which is the half of this
        product nobody looks at while fixing the other half.
      */
      aria-label={
        unknown
          ? 'Health score not available — not enough history yet'
          : `Health score ${Math.round(score)} out of 100 — ${band.label}`
      }
    >
      <svg
        viewBox={viewBox}
        width={size}
        height={height}
        aria-hidden="true"
        overflow="visible"
      >
        {/*
          ── The track is the scale, and a scale with no reading on it ────────

          ⚠ On the card face it is drawn ONLY when there is nothing to read.

          It is a 270° arc, not a ring, and it always has been — but at 10% ink
          under a bright value arc it reads as the faint remainder of a circle,
          and three critiques in a row called the dial "a closed ring". They
          were describing what is on the screen: two concentric strokes of the
          same geometry, one bright and one dim, which the eye resolves as one
          ring with a lit portion rather than as an arc against its scale.

          So a scored card face draws the value arc and its two terminals and
          nothing else — the north-star's instrument, where the mark IS the
          reading.

          ⚠ The unknown face keeps it, and that is the whole point of the
          paragraph below: a dashed track with no arc says "measured range, no
          measurement". Delete it there and a car with no score renders as an
          empty frame, which is indistinguishable from a component that failed
          to load. The hero face keeps it too — it carries labels and ticks and
          reads as a scale rather than as a mark.
        */}
        {(!isCard || unknown) && (
        <path
          className="gauge-track"
          d={TRACK}
          fill="none"
          stroke={isCard ? `rgba(${inkRgb},0.10)` : 'rgb(255 255 255 / 0.08)'}
          /*
            ⚠ 6 -> 3, card face first (design-system B7) and then the hero
            face too (dossier B1-B3): "a hairline arc, not a filled ring". A
            6px stroke on a 172 viewBox reads as a donut — a stock dashboard
            widget — and the whole point of this instrument is that it looks
            measured rather than dashboarded.

            The round cap on the value arc below is doing more work at this
            weight than it did at 6, not less: at 3px it terminates as a dot,
            which is what the north-star draws.

            ⚠ The hero face was held at 6 on the argument that "a hairline arc
            under a 2px tick would put the reading beneath its own scale". The
            dossier critique read that same stroke as a "thick cream-gold dial"
            introducing "a fourth hue and a luxury mood" — the weight was what
            made the ramp's `ok` band read as gold rather than as a value. The
            ticks lost half a pixel with it; the reading stopped looking like
            jewellery.
          */
          strokeWidth={3}
          strokeLinecap="butt"
          /*
            Dashed when there is no reading. The scale is still real — this is
            the instrument, and the range it measures has not gone away — but a
            broken line reads as "not measured" the way an unbroken one reads as
            "measured and empty". `strokeDasharray` on the *track* rather than a
            second element, so there is nothing extra to keep in register.
          */
          strokeDasharray={unknown ? '2 5' : undefined}
        />
        )}

        {/*
          The lit arc *is* the claim — its length is the score. There is no
          honest length for a score nobody has, so the unknown face has no arc
          at all rather than a zero-length one. (A zero-length arc and a missing
          arc look identical here only because the caps are butt; that is a
          coincidence of styling, not a reason to draw a reading of 0.)
        */}
        {!unknown && (
          <path
            className="gauge-arc"
            d={TRACK}
            fill="none"
            stroke={band.color}
            strokeWidth={3}
            /*
              ⚠ Round on the value arc, butt on the track beneath it.

              The arc "terminates bluntly" was a critique's word for it, and on
              a 6px stroke a square end reads as a cut rather than a reading.
              The track keeps butt caps because it is the full sweep and its
              ends are the scale's ends, which are marked by ticks — a rounded
              track would push those ends past their own graduations.

              ⚠ This does **not** make a 0 look like a reading: `strokeDasharray`
              at 0 draws nothing at all, and a cap needs a dash to sit on.
            */
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
            style={{
              // The light is the data; a heavy bloom reads as chrome. Held back
              // until the needle settles so the sweep itself stays crisp.
              filter: settled ? `drop-shadow(0 0 4px rgba(${band.rgb},0.28))` : 'none',
            }}
          />
        )}

        {/*
          ── The terminals — brief B7, 5 Sep ──────────────────────────────────

          The arc has been 270° and open at the bottom since it was drawn; a
          critique read it as "a near-closed ring" twice, and the geometry was
          never what made it read that way. At a 3px hairline the two ends of a
          270° sweep are simply too quiet to announce that the scale stops.

          So the ends are stated rather than implied. A hollow dot at the
          scale's start, a filled one at the reading — the north-star's
          instrument language, and it costs two circles.

          `pointAt` is the same function the ticks use, so these cannot drift
          from the arc they sit on. `pointAt(0, R)` and `pointAt(clamped, R)`
          are, by construction, exactly the path's own endpoints.

          Card face only. The hero carries a needle and a full tick scale, and
          a dot at the terminus of a needled dial is two things pointing at one
          number.

          ⚠ No terminal at all when there is no reading. A dot sitting at the
          scale's zero would be a mark where the reading goes, on a face whose
          entire argument is that it has no reading to show.
        */}
        {!unknown && (
          <>
            {/* ⚠ On both faces since the dossier loop — the hero dial needs the
                terminals more than the card did, because it also carries a 0
                and a 100 label and the arc's ends were the only unlabelled
                thing on it.
                ⚠ 2.6/3.2 -> 4/5.5. At the first sizes a critique could not tell
                the terminals from antialiasing on the arc, which makes them
                decoration rather than the marks that say the sweep ends. They
                are drawn against a 3px stroke, so they have to be visibly
                larger than it to read as a different kind of thing. */}
            <circle
              cx={pointAt(0, R).x}
              cy={pointAt(0, R).y}
              r={4}
              fill="none"
              stroke={`rgba(${inkRgb},0.45)`}
              strokeWidth={2}
            />
            <circle
              cx={pointAt(clamped, R).x}
              cy={pointAt(clamped, R).y}
              r={5.5}
              fill={band.color}
            />
          </>
        )}

        {/*
          ── ⚠ The every-5 hairlines are gone, and so is `MINORS` ─────────────

          Twenty of them ringed a 160px arc, and a design critique of the
          rendered page counted them as noise twice — "stray outer ticks", then
          "drop raw ticks entirely". They read as texture rather than as a
          scale: nobody measures a health score to the nearest five, and the
          five marks that mean something were competing with fifteen that mean
          nothing.

          Deleted rather than switched off. A dead branch behind a constant is
          how a reduction becomes a thing somebody restores by accident,
          believing it was disabled for a release.
        */}

        {/* Majors. On the card only the three band boundaries survive. */}
        {(isCard ? [40, 60, 80] : MAJORS).map((tick) => (
          <line
            key={`M${tick}`}
            className="gauge-tick"
            x1={CX}
            y1={CY - (isCard ? 80 : tickR.majorTo)}
            x2={CX}
            y2={CY - tickR.majorFrom}
            stroke={
              BOUNDARIES.has(tick) ? 'rgb(255 255 255 / 0.5)' : 'rgb(255 255 255 / 0.26)'
            }
            strokeWidth={BOUNDARIES.has(tick) ? 2 : 1.5}
            transform={`rotate(${angleFor(tick)} ${CX} ${CY})`}
          />
        ))}

        {/* The numbers, on the majors. Upright — never rotated with the tick. */}
        {/*
          ── ⚠ The 0 and 100 labels are cut — dossier §7 ────────────────────

          They graduated a scale whose ends are now marked by the terminals,
          and the brief cut them by name. Two numerals at the arc's feet were
          also the last thing keeping the hero face readable as a chart of one
          number rather than as the number.

          What went with them is worth naming so it is not lost: they were the
          site of UI-04, where one element broke the 12px type floor and the
          4.5:1 contrast floor at the same time — measured live at 10px and
          2.20:1 — and the fix was 0.55 alpha for a boundary tick and 0.50 for
          an ordinary one, against `--background`. If labels ever return to
          this dial, those are the floors they return under.
        */}

        {/* Needle. Hero runs it to the pivot and caps it with a hub; the card
            stops it short, because its reading sits in the well. */}
        {/*
          ⚠ No needle without a reading. A needle points at a value; parking one
          at the bottom of the scale is how the unknown state became "0" in the
          first place, and it would be the most convincing wrong answer on the
          face. The hub stays on the hero — it is the instrument, not the
          reading — but takes the muted ink so nothing on a dark face glows a
          judgement.
        */}
        {/*
          ── ⚠ The hero has no pointer. The card still does ─────────────────

          A full needle met a hub in the middle and read as a toy speedometer;
          shortening it to a marker inside the track fixed that and produced
          the next complaint — "a stubby needle-nub at the arc's end that reads
          as a rendering artifact".

          Both are symptoms of the same redundancy. The arc's own filled length
          *is* the reading, and its rounded cap already marks where the value
          falls. A second mark at the same angle adds nothing but a shape to
          misread.

          ── ⚠ And on 5 Sep the card lost it too ──────────────────────────

          The exception read: *"the card variant keeps it, and that is not an
          inconsistency: at 56px there is no room for a numeral in the well, so
          the pointer is the only thing saying where on the scale the arc
          stopped."*

          **That condition stopped being true.** The card face sets the reading
          at `fontSize` 60 in the middle of the well — it has said its own
          number since the hub was removed. So the pointer went back to being
          exactly what the paragraph above describes: a second mark at the same
          angle as the arc's cap, adding nothing but a shape to misread.

          Three consecutive critiques misread it, in the same words each time —
          "a closed ring bisected by a dash". At the reading's angle the marker
          lies almost horizontal and sits immediately beside the numeral, so it
          reads as punctuation rather than as a position on a scale. The last
          critique cut it by name: *"a workaround, not a mark."*

          What says where the value falls now is the terminal dot, which is
          drawn at `pointAt(clamped, R)` — the same angle this used, at the
          arc's own end rather than beside it.

          ⚠ Diagnosed wrongly first. The boundary tick at 80 sits 4.5° from an
          82 reading's terminal, so it looked like the collision; the ticks were
          removed and the dash was still there. They are restored above. The
          lesson is in `CLAUDE.md` §1's shape — the artefact was a rendered SVG
          the whole time, and reading it settled in one look what two rounds of
          inference did not.
        */}

        {/*
          The reading. Inter tabular via `.num`, per the type rule — a cluster
          face is mechanical, and a number that animates digit by digit must not
          reflow while it does.

          On the hero it sits on the line the 178-tall viewBox exists to make,
          below the hub and between the 0 and 100 labels, exactly where a tach
          puts its digital readout. Centring it in the well is not available
          once there is a hub: the needle would cross the digits, which is what
          it did before the hub came back.

          No "/100". No instrument prints its own denominator when the scale is
          drawn around it and both ends are numbered. The full reading is in the
          container's aria-label, where the dial cannot be seen.
        */}
        {/*
          ⚠ In the well now, not on the bottom line.

          The comment this replaces was accurate about its own constraint —
          *"centring it in the well is not available once there is a hub: the
          needle would cross the digits"* — and the constraint is gone with the
          hub. The reading is the instrument's subject; sitting it between the
          0 and 100 labels made it a caption to the dial instead of the point
          of it.

          108 rather than 100: the arc is open at the bottom, so the optical
          centre of the drawn shape is above the geometric one, and type
          centred on 100 rides high in it.
        */}
        <text
          x={CX}
          y={isCard ? CY : 108}
          /*
            `display-instrument` joins `num` on 4 Sep — brief B2 puts the
            condensed grotesk in the display slot, and the reading is the
            largest piece of type this component sets. `num` stays for the
            tabular figures, which is the reason the font-size note below was
            measurable in the first place.

            ⚠ And `display-instrument-tight` on 5 Sep. At 88% width beside a
            masthead set at 62%, a critique read this numeral as "the body
            sans" — which it was not, but the distance between the two widths
            was doing a worse job than either would alone. The reading is the
            product's centrepiece; it takes the masthead's cut.

            ⚠ Tabular figures at 62% width are narrower than at 88%, so the
            font-size note below over-states its margin rather than
            under-stating it. It is left as measured: the number it quotes was
            true when taken, and a comment that silently re-states an old
            measurement as if it still held is worse than one that dates
            itself.

            ⚠ `gauge-reading` must stay too: `inclusive-affordances.test.ts`
            keys the forced-colors rules off the `gauge-*` classes, and forced
            colors overrides SVG fill — rename it and the stylesheet keeps
            reviewing perfectly while applying to nothing.
          */
          className="num display-instrument display-instrument-tight gauge-reading"
          textAnchor="middle"
          dominantBaseline="central"
          /*
            ⚠ Off-white on both faces since the dossier loop. The hero face
            took `band.color`, so at a 74 the numeral rendered in the ramp's
            `ok` warm stone and a critique read the whole dial as "gold" —
            "a fourth hue and a luxury mood".

            The arc keeps the band colour, because the arc IS the state and the
            ramp is settled system. The numeral does not need to say the same
            thing twice, and saying it in a mid-tone is what made a value look
            like a finish. This is the card face's arrangement, which had it
            right: coloured arc, off-white reading.
          */
          fill={unknown ? ink : '#FFFFFF'}
          // 60, not 64: tabular figures make "100" exactly 1.5x the width of
          // "88", and at 64 a perfect score measured 40.4px inside a 43.6px
          // well. It fit, with 1.6px a side. 60 buys the margin back.
          /*
            30 -> 40 on the hero. The dial was spending a large band of a phone
            screen to say one number, and printing that number smaller than the
            page's own subheadings. With the hub gone and the labels pushed out
            there is room in the well for the reading to be the largest thing
            in the instrument, which is what it is.
          */
          fontSize={isCard ? 60 : 48}
          fontWeight="700"
        >
          {/*
            An em dash, not a 0 and not an empty string. `health-drivers.ts`
            settled the wording for a missing driver — "a dash on its own reads
            as a bug" — which is why the sentence beneath the dial is not
            optional and says what is missing.
          */}
          {unknown ? '—' : Math.round(value)}
        </text>
      </svg>

      {/*
        Band label. Mounted rather than faded from opacity 0 — an invisible
        label is still in the accessibility tree, and hero-photo-fallback
        asserts it is absent during the reveal so it cannot describe a
        placeholder. Gated on the caller's reveal, not on the sweep finishing:
        the band derives from the target score, so it is known the moment the
        score is, and gating on the animation would make it depend on
        requestAnimationFrame — which does not run under fake timers or in a
        background tab.

        `short` on the card: "Needs attention" does not fit under 56px in a
        three-up grid. Same band, abbreviated; never a different judgement.
      */}
      {(isCard || active) && (
        <span
          /* ⚠ `mono` and caps since the dossier loop — B1 and B3 both put the
             state word in the monospace register, where every other label on
             the surface already sits. It is a state label, not prose. */
          className={
            isCard
              ? 'mono text-xs font-medium uppercase tracking-wider leading-none'
              : 'mono block text-center font-medium uppercase tracking-wider leading-none animate-fade-in'
          }
          style={{
            /*
              ── ⚠ Neutral on the hero, so something leads ──────────────────

              The numeral, the arc and this word were all the band's colour, and
              a critique of the rendered dial said the consequence plainly:
              "nothing leads". Three elements at the same weight in the same
              hue is a set, not a hierarchy.

              The reading is the subject and keeps the colour. The arc is the
              same fact drawn, and keeps it too. This is the caption — it names
              the band the number already sits in — so it takes ordinary ink.

              ⚠ The card keeps the band colour, and the reason it gives is now
              out of date: it read "at 56px there is no numeral in the well, so
              this word *is* the reading". The card face has set a numeral in
              that well since the hub was removed — the same expired exception
              that kept a pointer on it. It keeps the colour anyway, because at
              card size the word is the only thing carrying the band once the
              numeral went off-white, and two neutral elements would say
              nothing. Worth revisiting if the card ever grows a coloured mark
              of its own.
            */
            color: isCard ? ink : 'rgb(255 255 255 / 0.7)',
            ...(isCard ? {} : { fontSize: size * 0.07, marginTop: size * 0.02 }),
          }}
        >
          {/*
            ⚠ Never a band. `getHealthBand(0)` returns a real judgement with a
            real colour, and printing it here is what put "Needs attention"
            under a car that had simply never been assessed. The unknown face
            says which of the two it is.

            "No score yet" rather than "Unknown": the *yet* is the load-bearing
            word — it tells the owner this is a gap that closes, which is what
            makes the action beneath it worth tapping.
          */}
          {unknown ? (isCard ? 'No score' : 'No score yet') : isCard ? band.short : band.label}
        </span>
      )}
    </div>
  );
}

export default ClusterGauge;
