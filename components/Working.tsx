'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { R, TRACK, VIEW_H, VIEW_W, pointAt } from '@tappet/core/cluster-geometry';
import { prefersReducedMotion } from '@/hooks/use-reduced-motion';
import type { WorkingStage } from '@/lib/working';

/**
 * The wait instrument: the health dial's ignition sweep, held until the work
 * is done.
 *
 * ── What it replaces, and the rule it is built under ────────────────────────
 *
 * 11 Sep, David walking the live demo: *"i want more engaging loading states
 * than just simple skeleton loader. something engaging will buy patience from
 * user."* The screenshot was the Plan → Mods card — two grey skeleton bars
 * under a mod that had simply never been analysed, drawn as a wait that never
 * ends — and when an analysis does run, a spinner.
 *
 * "Engaging" here cannot mean a made-up percentage. `b1e2baa` removed the last
 * fake progress bar on 30 Aug because it lied about progress, and CLAUDE.md
 * §10 is the standing position: no claim the data cannot support. So this is
 * an instrument that is visibly *alive* while the work runs, and copy that
 * tells the truth about what is happening. Stages only where the process
 * emits them. A duration only where one was measured. `unknown` over a guess.
 *
 * ── Why the dial ────────────────────────────────────────────────────────────
 *
 * `ClusterGauge` already has a motion for "the instrument is on and has not
 * said its number yet": the ignition sweep, drawn in cyan and settled
 * off-white once there is a reading. Its own docblock names it as *"the one
 * moment on this dial that is about the product rather than about the car."*
 * A wait is exactly that moment, prolonged. So this borrows the geometry from
 * `@tappet/core/cluster-geometry` — the same 270° track, the same hairline,
 * the same dot terminals — and keeps the sweep going.
 *
 * ⚠ It swings, it does not fill. An arc that draws to 100 and restarts is a
 * progress bar in the dial's clothes. The segment is a fixed length travelling
 * between the two ends of the scale, which carries no claim about how much is
 * left. `globals.css` holds the keyframes and the argument in full.
 *
 * ── The three sizes ─────────────────────────────────────────────────────────
 *
 *   full     a page-level wait: the dial at 96px with the mono line beneath,
 *            an optional quiet sentence, an optional stage list, and whatever
 *            facts the caller has (the items being priced, the file name).
 *   compact  a card or a row: the dial at 28px beside the line.
 *   mark     `WorkingMark` — the same sweep at button scale in `currentColor`,
 *            for the control that started the work. The button's own label
 *            carries the state; the mark is `aria-hidden`.
 *
 * ── Reduced motion, and screenshots ─────────────────────────────────────────
 *
 * The sweep is a CSS animation, so the blanket rule in `globals.css` stops it
 * for anyone who has asked for less motion; the stylesheet also says so
 * explicitly, and the base position — the segment centred at the top of the
 * dial — is a designed still that reads as "switched on, no reading". The
 * component reads the preference too and marks itself `data-motion="still"`,
 * so the state is testable without a browser and the stage marks stop
 * breathing with it.
 *
 * `frozen` is the specimen's still frame — the same picture, chosen rather
 * than inherited — for `/dev/working` and the design loop's captures. Nothing
 * animates on a page that has finished: every caller unmounts this the moment
 * its work settles.
 *
 * ── Copy ────────────────────────────────────────────────────────────────────
 *
 * `line` is what is happening, in the present tense, set in mono caps — the
 * system's state-label voice. It is required: a caller that cannot say what
 * it is waiting on should not render this. `detail` is for the facts the
 * caller was handed (the car, the file, the count) and for what the answer
 * will contain, which is knowable. Neither is a place for a number nobody
 * measured.
 */


export type { WorkingStage, WorkingStageState } from '@/lib/working';

interface WorkingProps {
  /** What is happening, present tense. Rendered in mono caps. */
  line: string;
  /** The facts this wait was handed, and what the answer will contain. One sentence. */
  detail?: ReactNode;
  /** Real stages, in order. Omit when the work is one opaque call. */
  stages?: WorkingStage[];
  variant?: 'full' | 'compact';
  /** Hold the sweep on its centre frame. Specimen and screenshots only. */
  frozen?: boolean;
  /**
   * Fade in after 350ms rather than at once, so a hold that resolves sooner
   * never paints a dial. For page loads; not for a wait somebody just started.
   */
  delay?: boolean;
  /** Anything else true about the wait — a real count, the items being priced. */
  children?: ReactNode;
  /**
   * The full face draws its own panel — graphite, hairline, the cut. A caller
   * that already is one (a dialog, a page panel) turns it off so the wait is
   * not a card inside a card.
   */
  panel?: boolean;
  className?: string;
}

/**
 * Percent of the arc the pip covers: 24° of the 270° scale — brief B5.
 * `globals.css` assumes 9; the keyframes park it at `0` and `-91`.
 */
const SEGMENT = 9;

/**
 * The card face's square window onto the dial, from `ClusterGauge`: centred
 * on the pivot. The full face keeps the hero's 178-tall crop so the dial does
 * not float above its line.
 */
const SQUARE = '14 14 172 172';

/**
 * Does this visitor want the instrument still?
 *
 * Read in an effect rather than during render so the server and the first
 * client paint agree; the stylesheet has already stopped the animation by
 * then, so the only thing this decides late is the attribute.
 */
function useStill(frozen: boolean): boolean {
  const [still, setStill] = useState(frozen);
  useEffect(() => {
    setStill(frozen || prefersReducedMotion());
  }, [frozen]);
  return still;
}

type Face = 'full' | 'compact' | 'mark';

/**
 * The dial itself. Track, pip, terminals — nothing that could be read as a
 * number. No needle: a needle points at a value, and there is none.
 *
 * ── Strokes are pixels, and the pixels come from CSS ─────────────────────
 *
 * A hairline is a rendered width, not a viewBox number — the dial's lesson
 * from 5 Sep. The full face is 160px on desktop and 128px on a phone (brief
 * B2), which is a CSS width, so the stroke widths that keep a 1px track at
 * both sizes are CSS too: `.working-dial[data-face]` in globals.css sets
 * `--wk-track`, `--wk-pip` and `--wk-dot` in viewBox units per face and per
 * breakpoint, and the elements read them. No JS media query, no first paint
 * at the wrong size.
 *
 * ⚠ Not `vector-effect: non-scaling-stroke`. It would hold every stroke at
 * its pixel width for free, but it also unscales the dash pattern, and the
 * pip IS a dash pattern on a `pathLength="100"` path.
 *
 * ⚠ The terminals are round-capped paths of near-zero length, not circles.
 * A circle's `r` is an attribute; a round cap's diameter is its stroke width,
 * which the same custom property can set. Same dot, one mechanism.
 */
function Dial({ face, live, frozen }: { face: Face; live: boolean; frozen: boolean }) {
  const viewBox = face === 'full' ? `0 0 ${VIEW_W} ${VIEW_H}` : SQUARE;
  const foot = pointAt(0, R);
  const head = pointAt(100, R);
  const sweepClass = `working-sweep ${frozen ? 'is-frozen' : live ? 'is-live' : ''}`.trim();

  /*
    ── What survives 20px ──────────────────────────────────────────────────

    Full and compact keep the terminals (brief B1); the mark does not — at
    14px two dots on a 5px-radius arc read as a face, and the mark only has
    to say "this control is working", which the moving pip does alone.
  */
  const terminals = face !== 'mark';

  const sizeClass =
    face === 'full'
      ? 'w-32 sm:w-40'
      : face === 'compact'
        ? 'w-5 h-5'
        : '';

  return (
    <svg
      viewBox={viewBox}
      className={`working-dial flex-shrink-0 ${sizeClass}`.trim()}
      data-face={face}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
    >
      {/*
        The scale: a solid hairline, open at the bottom. The first draft dashed
        it, borrowing the reading dial's "measured range, no measurement"
        face, and the critique read the dots as stock spinner grammar — they
        are, at any size a person actually meets a wait at. Solid now; the
        empty centre where the numeral would be is what says "no reading".
      */}
      <path
        className="working-track"
        d={TRACK}
        fill="none"
        strokeLinecap="butt"
      />

      {/*
        The pip. `pathLength="100"` so the dash pattern is in percent of the
        arc and the keyframes in globals.css can name positions on it. The
        gap is the whole path, so exactly one pip is ever on the scale. Round
        caps, cyan, a 1px bloom: the dial draws in cyan before it has a
        reading, and this dial never gets one.
      */}
      <path
        className={sweepClass}
        d={TRACK}
        fill="none"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${SEGMENT} 100`}
      />

      {/*
        The two ends of the scale, filled — the reading dial's terminals. The
        foot and head each take a flash keyframe timed to the pip's arrival
        (brief B5); see `.working-terminal` in globals.css.
      */}
      {terminals && (
        <>
          <path
            className="working-terminal"
            data-end="foot"
            d={`M ${foot.x} ${foot.y} l 0.01 0`}
            strokeLinecap="round"
            fill="none"
          />
          <path
            className="working-terminal"
            data-end="head"
            d={`M ${head.x} ${head.y} l 0.01 0`}
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

/**
 * The ledger: real stages on hairline rules — brief B4. Number and label
 * left, glyph at the right edge. Done is a filled off-white dot with off-white
 * ink (good news carries no hue); active is a cyan ring and cyan ink; pending
 * is a grey ring and grey ink. The glyphs are static: one moving thing per
 * panel, and the pip is it.
 */
function Ledger({ stages, footer }: { stages: WorkingStage[]; footer?: ReactNode }) {
  return (
    <div className="w-full">
      <ol className="divide-y divide-white/8 border-y border-white/8">
        {stages.map((stage, index) => {
          const ink =
            stage.state === 'active'
              ? 'text-[color:var(--info-strong)]'
              : stage.state === 'done'
                ? 'text-[color:var(--text-primary)]'
                : 'text-white/50';
          return (
            <li
              key={stage.label}
              className="working-stage flex items-center gap-4 py-2.5"
              data-state={stage.state}
              /*
                The state is spoken as well as drawn — a screen reader gets
                "done" or "in progress" after the label rather than a dot.
              */
              aria-label={`${stage.label} — ${
                stage.state === 'done' ? 'done' : stage.state === 'active' ? 'in progress' : 'not started'
              }`}
            >
              <span className={`mono text-xs tabular-nums ${ink}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={`mono text-xs uppercase tracking-[0.08em] text-left ${ink}`}>
                {stage.label}
              </span>
              <span
                aria-hidden="true"
                className={`working-stage-mark ml-auto h-2 w-2 rounded-full border ${
                  stage.state === 'done'
                    ? 'border-[color:var(--text-primary)] bg-[color:var(--text-primary)]'
                    : stage.state === 'active'
                      ? 'border-[color:var(--info)]'
                      : 'border-white/25'
                }`}
              />
            </li>
          );
        })}
      </ol>
      {footer && (
        <div className="working-ledger-footer mono pt-2.5 text-xs uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
          {footer}
        </div>
      )}
    </div>
  );
}

export function Working({
  line,
  detail,
  stages,
  variant = 'full',
  frozen = false,
  delay = false,
  children,
  panel = true,
  className = '',
}: WorkingProps) {
  const still = useStill(frozen);
  const live = !still;
  const enter = delay && !frozen ? 'working-enter' : '';

  if (variant === 'compact') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-working="compact"
        data-motion={still ? 'still' : 'live'}
        className={`flex items-center gap-3 text-left ${enter} ${className}`.trim()}
      >
        <Dial face="compact" live={live} frozen={frozen} />
        <div className="min-w-0">
          <p className="mono text-xs uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
            {line}
          </p>
          {detail && <p className="mt-0.5 text-xs text-white/55 leading-relaxed">{detail}</p>}
        </div>
        {children}
      </div>
    );
  }

  /*
    ── The full face is a panel, left-anchored — brief B3 ──────────────────

    The first draft centred everything and let the caller supply the panel,
    and the critique read the result as a loading modal. So the instrument
    owns its panel now — graphite, hairline, the 45° cut, 32px of padding —
    and the cluster sits on its left edge: arc left, the status line on the
    arc's centre line, one sentence beneath, the ledger beneath that. On a
    phone the arc stacks over the text on the same left edge.
  */
  return (
    <div
      role="status"
      aria-live="polite"
      data-working="full"
      data-motion={still ? 'still' : 'live'}
      className={`${
        panel ? 'cut-panel border border-white/8 bg-[hsl(var(--card))]/95 p-6 sm:p-8' : ''
      } text-left ${enter} ${className}`.trim()}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        <Dial face="full" live={live} frozen={frozen} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="mono text-sm uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
            {line}
          </p>
          {detail && <p className="text-sm text-white/55 leading-relaxed">{detail}</p>}
        </div>
      </div>

      {stages && stages.length > 0 ? (
        <div className="mt-6">
          <Ledger stages={stages} footer={children} />
        </div>
      ) : (
        children && <div className="mt-6 space-y-3">{children}</div>
      )}
    </div>
  );
}

/**
 * The sweep at button scale, in the button's own ink.
 *
 * Replaces `<Loader2 className="… animate-spin" />` one for one: the same
 * `className` sizes it, and it is `aria-hidden` because the button's label —
 * "Saving…", "Analyzing" — is the announcement. No terminals: at 14px they
 * would be a face, and the mark only has to say "this control is working",
 * which the moving pip does alone.
 */
export function WorkingMark({
  className = 'h-3.5 w-3.5',
  frozen = false,
}: {
  className?: string;
  frozen?: boolean;
}) {
  const still = useStill(frozen);
  const sweepClass = `working-sweep ${frozen ? 'is-frozen' : still ? '' : 'is-live'}`.trim();

  return (
    <svg
      viewBox={SQUARE}
      className={`working-dial working-mark inline-block flex-shrink-0 ${className}`}
      data-face="mark"
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      data-motion={still ? 'still' : 'live'}
    >
      <path className="working-track" d={TRACK} fill="none" stroke="currentColor" />
      <path
        className={sweepClass}
        d={TRACK}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${SEGMENT} 100`}
      />
    </svg>
  );
}
