import BrandLockup from '@/components/brand/BrandLockup';
import { CLEAR_SPACE, LOCKUP, MIN_WIDTH } from '@tappet/core/brand';

/*
 * The lockup at every size and on both grounds. Development only.
 *
 * ── Why this page exists ────────────────────────────────────────────────────
 *
 * The mark is drawn from constants rather than pasted as a file, so the way it
 * fails is not a broken image. It is a maker line at a size nobody can read, or
 * a plate that sits at two different heights depending on which lockup you
 * picked, or — the one this page is really for — a W that quietly fills solid
 * because the fill rule went missing and the mark just looks a little heavier.
 * None of that throws, and all of it is obvious in one screenful.
 *
 * `brand.test.ts` proves the numbers match the brand package. This is the half
 * a test cannot do: whether the drawing those numbers produce is the drawing
 * Design meant.
 *
 * ⚠ The thresholds are the point, and they are **derived rather than chosen** —
 * so the interesting rows are the ones on either side of them, where the maker
 * line and then the whole lockup drop out. Both come from `MIN_WIDTH`, so this
 * page cannot fall out of step with the rule the way hard-coded numbers did.
 */

const WIDTHS = [
  280,
  MIN_WIDTH.full,
  MIN_WIDTH.full - 1,
  200,
  MIN_WIDTH.short,
  MIN_WIDTH.short - 1,
  96,
  40,
];

/** Clear space is stated in grid units; this is it in px at the width below. */
const SPEC_WIDTH = 280;
const CLEAR_PX = Math.round((SPEC_WIDTH * CLEAR_SPACE) / LOCKUP.width);

export default function BrandStatesPage() {
  return (
    <main className="min-h-screen bg-[#100F0D] px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-12">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Well Kept lockup — states</h1>
          <p className="text-sm text-white/60">
            Development only. Every drawing below comes from{' '}
            <code className="text-white/80">@tappet/core/brand</code>, whose values are asserted
            against <code className="text-white/80">docs/brand-package-v2</code>.
          </p>
        </header>

        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-white">By width, on the page ground</h2>
          <p className="text-sm text-white/60">
            The drawing is chosen from the width. Below {MIN_WIDTH.full}px the maker line breaks the
            12px type floor and goes; below {MIN_WIDTH.short}px the wordmark drops under a 20px cap
            and the mark takes over alone.
          </p>

          <div className="space-y-8">
            {WIDTHS.map((width) => (
              <div key={width} className="space-y-2">
                <p className="mono text-xs uppercase tracking-widest text-white/55">{width}px</p>
                <BrandLockup width={width} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-white">On a light ground</h2>
          <p className="text-sm text-white/60">
            The same drawing, not a substitution. The plate takes the graphite fill and the ivory
            shows through the W, because the letter is a hole rather than a shape — which is why
            there is no light-ground variant to keep in step.
          </p>
          <div className="space-y-8 rounded-2xl bg-[#F5F3F0] p-8">
            <BrandLockup width={280} ground="light" />
            <BrandLockup width={200} ground="light" />
            <BrandLockup width={64} ground="light" />
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-white">Mono — the mark as furniture</h2>
          <p className="text-sm text-white/60">
            <code className="text-white/80">variant=&quot;mono&quot;</code> takes{' '}
            <code className="text-white/80">currentColor</code>, for the places the mark is a
            watermark rather than the subject and the caller sets the colour with a text class.
          </p>
          <div className="flex items-end gap-8">
            <BrandLockup width={48} variant="mono" className="text-[var(--text-muted-40)]" />
            <BrandLockup width={40} variant="mono" className="text-white/70" />
            <BrandLockup width={24} variant="mono" className="text-white" />
            <BrandLockup width={16} variant="mono" className="text-white" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Clear space</h2>
          <p className="text-sm text-white/60">
            {CLEAR_SPACE} grid units — one mark height — on all sides, so {CLEAR_PX}px at the{' '}
            {SPEC_WIDTH}px below. Nothing enters it, including the score dial. The dashed box is the
            boundary, not part of the mark.
          </p>
          <div
            className="inline-block border border-dashed border-white/25"
            style={{ padding: CLEAR_PX }}
          >
            <BrandLockup width={SPEC_WIDTH} />
          </div>
        </section>
      </div>
    </main>
  );
}
