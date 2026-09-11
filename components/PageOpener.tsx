import type { ReactNode } from 'react';

/**
 * How a signed-in page opens: mono eyebrow, condensed uppercase headline, one
 * line of body. Left-aligned, always.
 *
 * ── Why a component and not a convention ────────────────────────────────────
 *
 * The three pages behind the middleware — `/garage`, `/settings`, `/onboard` —
 * were never judged by the design-critic loop (they 307 an anonymous capture
 * to `/login`), and when they finally were, on 11 Sep, the first gap named was
 * that they opened in **three voices**: Inter Bold on the garage, a serif on
 * settings, Inter Semibold centred over an icon tile on onboarding. None of
 * them was the system's — the landing and `/check` had moved to the instrument
 * voice on 5 Sep and these had not.
 *
 * `app/page.tsx` carries this exact pattern inline: eyebrow in `.mono` at
 * 12px tracked uppercase, headline in `.display-instrument` at the 62%
 * masthead width, body in the quiet sans. This is that pattern as one piece so
 * the three pages cannot drift from each other again. The landing keeps its
 * inline copy; it is graded on its own loop and is not this component's to
 * migrate.
 *
 * The brief's sizes: 56px on desktop, 36px on a phone, `leading-[0.95]` as on
 * `/check`. The eyebrow is a slot rather than a string because on a sub-page
 * it is the way back — `← Garage` — and a link belongs in the eyebrow's
 * position rather than in a nav bar above it, which is what the critique cut.
 */
export function PageOpener({
  eyebrow,
  title,
  lede,
  children,
  className = '',
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  /** The one line of body. Optional — a page whose headline says it all omits it. */
  lede?: ReactNode;
  /** Anything that belongs to the opener — the garage's stat strip. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      <p className="mono text-xs uppercase tracking-[0.22em] text-white/55 mb-3">{eyebrow}</p>
      <h1 className="display-instrument display-instrument-tight uppercase text-[36px] sm:text-[56px] leading-[0.95] text-[color:var(--text-primary)]">
        {title}
      </h1>
      {lede ? (
        <p className="mt-3 text-base leading-6 text-[color:var(--text-muted)] max-w-xl">{lede}</p>
      ) : null}
      {children}
    </header>
  );
}
