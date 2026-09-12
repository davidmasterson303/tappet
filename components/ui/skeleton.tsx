import { cn } from '@tappet/core/utils';

/**
 * The quiet skeleton — for a layout hold, never for a wait.
 *
 * ── Which is which ──────────────────────────────────────────────────────────
 *
 * A skeleton stands in for content whose *shape* is known and whose arrival
 * is imminent: a dashboard served from a warm query cache, a form's fields
 * before the options list lands. It holds the layout so nothing jumps. It is
 * not a way of saying "working" — a person who is actually waiting on
 * something (a model call, a decode, a plate being drawn) gets `Working`,
 * which says what is happening and moves while it does. `docs` for the
 * distinction: the Plan → Mods card drew skeleton bars under a mod nobody
 * had analysed, and read as a wait that never ended.
 *
 * ── The system's skeleton, not shadcn's ─────────────────────────────────────
 *
 * This shipped as `animate-pulse rounded-md bg-muted`: a rounded grey block
 * throbbing at Tailwind's default. The design-system specimen demonstrates
 * `.skeleton-shimmer` — a slow highlight crossing a flat band, on the panel
 * cut — and that is what every skeleton in the app should be, so the
 * primitive takes it. Two callers, both untouched: the change is here so the
 * next skeleton cannot be the old one.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer chamfer-sm bg-white/6', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
