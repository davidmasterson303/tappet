import type { ReactNode } from 'react';

/**
 * A section of a spec sheet: a hairline, a grotesk caps head, and the page.
 *
 * ── Why this is a component and not four `<section>`s ───────────────────────
 *
 * `/vehicle-info` was four `Card`s — bordered, filled `#141720`, small radius,
 * serif mixed-case title — stacked on the page panel. A design critique of the
 * rendered page put it plainly: *"the page is two designs stacked, and the join
 * is visible."* The header had already moved to the September system and
 * everything under it had not, so the seam ran straight across the page.
 *
 * Three brief lines were failing at once, and they fail together because they
 * are one decision:
 *
 * - **B1** — no serif anywhere; condensed-grotesk caps for section heads.
 * - **B5** — every corner is a 45° cut; zero radii.
 * - **B6** — one graphite surface family; nested cards become hairline-ruled
 *   bands.
 *
 * A card cannot satisfy B6 by being restyled. Its fill *is* the second surface,
 * and its border and radius are what B5 removes — so the fix is to stop drawing
 * a container at all. What separates two sections is one hairline, and what
 * names them is type. That is the whole component.
 *
 * ⚠ **The head is `display-instrument-narrow`, not `display-serif`.** Same
 * family as the masthead above it, one width narrower — `HealthSummary` sets
 * its sub-heads the same way at 15px, and this is the page-level step at 20px.
 * A serif here was the single most visible B1 breach on the page, and it read
 * as an "editorial" gesture on what is a spec sheet.
 *
 * ⚠ **No fill, no border, no radius.** If a future section needs to be set
 * apart, the answer is a rule or the type, not a box — reintroducing one
 * container here brings the seam back with it.
 */
export default function SpecBand({
  title,
  action,
  children,
}: {
  title: string;
  /**
   * An optional control that belongs to this section, set on the head's
   * baseline.
   *
   * Kept deliberately narrow: the critique's Cut list asked for the two refresh
   * controls on this page to go entirely, and they are actions rather than
   * decoration — see `docs/design-system-drift.md` §3.13 for why the treatment
   * moved and the capability did not.
   */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/8 pt-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="display-instrument display-instrument-narrow text-[20px] uppercase tracking-wide text-white">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
