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
  /** The facts this wait was handed, and what the answer will contain. */
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
  /** Anything else true about the wait — the items being priced, say. */
  children?: ReactNode;
  className?: string;
}

/** Percent of the arc the sweep segment covers. `globals.css` assumes 18. */
const SEGMENT = 18;

/**
 * The card face's square window onto the dial, from `ClusterGauge`: centred
 * on the pivot, wide enough for the terminals. The full face keeps the hero's
 * 178-tall crop so the dial does not float above its line.
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

/**
 * The dial itself. Track, sweep, terminals — nothing that could be read as a
 * number. No needle: a needle points at a value, and there is none.
 */
function Dial({
  size,
  face,
  live,
  frozen,
}: {
  size: number;
  face: 'full' | 'square';
  live: boolean;
  frozen: boolean;
}) {
  /*
    A hairline is a rendered width, not a viewBox number — the dial's own
    lesson from 5 Sep. 3px on the face, 2px on the terminals, at any size.
  */
  const scale = (face === 'square' ? 172 : VIEW_W) / size;
  const hairline = 3 * scale;
  const terminalStroke = 2 * scale;
  const terminalR = 4 * scale;

  const viewBox = face === 'square' ? SQUARE : `0 0 ${VIEW_W} ${VIEW_H}`;
  const height = face === 'square' ? size : (size * VIEW_H) / VIEW_W;

  const foot = pointAt(0, R);
  const head = pointAt(100, R);

  const sweepClass = `working-sweep ${frozen ? 'is-frozen' : live ? 'is-live' : ''}`.trim();

  /*
    ── What survives 28px ────────────────────────────────────────────────────

    The full face is the reading dial's unknown face: a dashed scale with a
    hollow terminal at each end. At the compact size neither survives — a
    2-unit dash is a third of a pixel, and two 4px rings on an 11px-radius
    arc read as a pair of eyes under a brow (measured on the first specimen
    capture, not inferred). So the compact face keeps only what the mark
    keeps: a solid hairline track and the sweep. Same grammar, fewer marks.
  */
  const graduated = face === 'full';

  return (
    <svg viewBox={viewBox} width={size} height={height} aria-hidden="true" overflow="visible">
      {/*
        The scale, dashed — the dial's own "measured range, no measurement"
        face. Deleting it would leave a cyan segment floating in nothing,
        which is indistinguishable from a component that half-loaded.

        ⚠ 0.24, not the reading dial's 0.10. Measured on the specimen: at the
        card face's alpha the dashes did not survive a screenshot at 96px, and
        a sweep with no visible scale under it is a comet, not a needle.
      */}
      <path
        className="working-track"
        d={TRACK}
        fill="none"
        stroke="rgb(255 255 255 / 0.24)"
        strokeWidth={hairline}
        strokeLinecap="butt"
        strokeDasharray={graduated ? '2 5' : undefined}
      />

      {/*
        The sweep. `pathLength="100"` so the dash pattern is in percent of the
        arc and the keyframes in globals.css can name positions on it. The
        gap is the whole path, so exactly one segment is ever on the scale.
        Round caps, so at a 3px stroke it terminates as the dot the north-star
        draws. Cyan, because cyan is what this dial draws in before it has a
        reading.
      */}
      <path
        className={sweepClass}
        d={TRACK}
        fill="none"
        stroke="var(--info)"
        strokeWidth={hairline}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${SEGMENT} 100`}
        style={{ filter: 'drop-shadow(0 0 3px rgb(126 200 220 / 0.55))' }}
      />

      {/*
        The two ends of the scale, as hollow terminals. On the reading dial
        the filled one marks the reading; there is no reading here, so both
        are hollow and both are quiet. Full face only — see `graduated`.
      */}
      {graduated && (
        <>
          <circle
            className="working-terminal"
            cx={foot.x}
            cy={foot.y}
            r={terminalR}
            fill="none"
            stroke="rgb(255 255 255 / 0.3)"
            strokeWidth={terminalStroke}
          />
          <circle
            className="working-terminal"
            cx={head.x}
            cy={head.y}
            r={terminalR}
            fill="none"
            stroke="rgb(255 255 255 / 0.3)"
            strokeWidth={terminalStroke}
          />
        </>
      )}
    </svg>
  );
}

function Stages({ stages }: { stages: WorkingStage[] }) {
  return (
    <ol className="w-full max-w-sm divide-y divide-white/8 border-y border-white/8">
      {stages.map((stage, index) => (
        <li
          key={stage.label}
          className="working-stage flex items-center gap-3 py-2"
          data-state={stage.state}
          /*
            The state is spoken as well as drawn — a screen reader gets "done"
            or "in progress" after the label rather than a coloured dot.
          */
          aria-label={`${stage.label} — ${
            stage.state === 'done' ? 'done' : stage.state === 'active' ? 'in progress' : 'not started'
          }`}
        >
          <span className="mono text-xs text-white/50 tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className={`mono flex-1 text-xs uppercase tracking-[0.14em] ${
              stage.state === 'active'
                ? 'text-[color:var(--info-strong)]'
                : stage.state === 'done'
                  ? 'text-[color:var(--text-primary)]'
                  : 'text-white/50'
            }`}
          >
            {stage.label}
          </span>
          {/*
            Done: filled off-white — good is ink, not a hue. Active: a cyan
            ring, breathing with the sweep. Pending: a hairline ring. The
            ring is a border so forced colours can restate it.
          */}
          <span
            aria-hidden="true"
            className={`working-stage-mark h-2 w-2 rounded-full border ${
              stage.state === 'done'
                ? 'border-[color:var(--text-primary)] bg-[color:var(--text-primary)]'
                : stage.state === 'active'
                  ? 'border-[color:var(--info)]'
                  : 'border-white/25'
            }`}
          />
        </li>
      ))}
    </ol>
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
  className = '',
}: WorkingProps) {
  const still = useStill(frozen);
  const live = !still;

  if (variant === 'compact') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-working="compact"
        data-motion={still ? 'still' : 'live'}
        className={`flex items-center gap-3 ${delay && !frozen ? 'working-enter' : ''} ${className}`.trim()}
      >
        <div className="flex-shrink-0">
          <Dial size={28} face="square" live={live} frozen={frozen} />
        </div>
        <div className="min-w-0">
          <p className="mono text-xs uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
            {line}
          </p>
          {detail && <p className="mt-0.5 text-xs text-white/55 leading-relaxed">{detail}</p>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-working="full"
      data-motion={still ? 'still' : 'live'}
      className={`flex flex-col items-center text-center gap-5 ${
        delay && !frozen ? 'working-enter' : ''
      } ${className}`.trim()}
    >
      <Dial size={96} face="full" live={live} frozen={frozen} />

      <div className="space-y-2 max-w-md">
        <p className="mono text-sm uppercase tracking-[0.18em] text-[color:var(--text-primary)]">
          {line}
        </p>
        {detail && <p className="text-sm text-white/55 leading-relaxed">{detail}</p>}
      </div>

      {stages && stages.length > 0 && <Stages stages={stages} />}

      {children}
    </div>
  );
}

/**
 * The sweep at button scale, in the button's own ink.
 *
 * Replaces `<Loader2 className="… animate-spin" />` one for one: the same
 * `className` sizes it, and it is `aria-hidden` because the button's label —
 * "Saving…", "Analyzing" — is the announcement. No dashes and no terminals:
 * at 16px they would be noise, and the mark only has to say "this control is
 * working", which the moving segment does alone.
 */
export function WorkingMark({
  className = 'h-4 w-4',
  frozen = false,
}: {
  className?: string;
  frozen?: boolean;
}) {
  const still = useStill(frozen);
  const sweepClass = `working-sweep ${frozen ? 'is-frozen' : still ? '' : 'is-live'}`.trim();

  /*
    ⚠ `vector-effect: non-scaling-stroke` would hold the hairline at any
    rendered size without knowing it, but in Chrome it also unscales the dash
    pattern, and the sweep IS a dash pattern. So the mark assumes the 16px it
    is drawn at nearly everywhere and states its strokes in viewBox units.
  */
  return (
    <svg
      viewBox={SQUARE}
      className={`working-mark inline-block flex-shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      data-motion={still ? 'still' : 'live'}
    >
      <path d={TRACK} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={16} />
      <path
        className={sweepClass}
        d={TRACK}
        fill="none"
        stroke="currentColor"
        strokeWidth={16}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${SEGMENT} 100`}
      />
    </svg>
  );
}
