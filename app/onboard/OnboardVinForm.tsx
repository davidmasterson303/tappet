'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader as Loader2, ArrowLeft } from 'lucide-react';
import { decodeVIN } from '../actions';
import OnboardingWizard from '@/components/OnboardingWizard';
import { PageOpener } from '@/components/PageOpener';
import { SignedInShell } from '@/components/SignedInShell';

/**
 * The VIN form, and then the wizard.
 *
 * Split out of `page.tsx` when task 1.6 added the returning-user guard. The
 * guard has to run before anything renders — a client-side check would paint
 * the onboarding form and then yank it away — so `page.tsx` is now a server
 * component and this is what it renders once the visitor is cleared.
 *
 * ── 11 Sep — the form joins the settled system ──────────────────────────────
 *
 * This was a centred auth-style card: an icon in a rounded tile, "Add Your
 * Vehicle" in Inter, a blurred `rounded-2xl` panel, a cyan-glowing
 * `rounded-xl` Continue and a footer link back to the garage under a second
 * back button. The first critique it ever received (it sat behind the
 * middleware through two locked briefs) ranked it last of six and named the
 * tile, the centring and the duplicate link. The locked signed-in brief is
 * what it follows now: mono eyebrow that is the way back, condensed uppercase
 * headline, one line of body, left-aligned, and the form panel built the way
 * `/check` builds its own.
 *
 * ⚠ Two things the form deliberately does not do. The VIN counter no longer
 * turns green at 17 — good news is off-white ink in this system, not a hue.
 * And the submit is the plain primitive: the `glow-cyan-sm`, the `rounded-xl`
 * and the `hover:scale` were each a per-page override of something the
 * primitive settles, and the primitive's hover is the sodium fill that means
 * "the thing you are about to press".
 *
 * ── The VIN is the hero — B8 ────────────────────────────────────────────────
 *
 * Round two made the field the largest element on the page: the `lg` step of
 * `.field`, 64px in 24px mono, with a cyan hairline beneath it that advances
 * one seventeenth per character. The "0/17" counter went — the ramp is the
 * count — and the ramp is a real `progressbar` so a screen reader gets the
 * same fact the eye does. "17-character VIN" had been on the page three
 * times (body line, label, placeholder); the body line keeps it.
 *
 * ── The photograph — B9 ─────────────────────────────────────────────────────
 *
 * The right column carries a generated night plate of a VIN tag at the base
 * of a windscreen, styled to the north-star. It is a **contained** image
 * beside the form, which is the distinction CC-142 §5 draws: what §5 removed
 * was a photographic page *background* under a wash, and this page keeps a
 * drawn one. `image-weight-budget.test.ts` caps the plate's heaviest
 * derivative, as it does `/check`'s, so the exemption has a number attached.
 * The plate's stamped characters are deliberately not legible — the one
 * candidate that rendered a readable VIN-like string was rejected, because
 * a fake number on the page that asks for a real one is precision this
 * product does not invent. Provenance in `public/design/CREDITS.md`.
 */
export default function OnboardVinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromDemo = searchParams.get('from') === 'demo';
  // The demo garage is `/` now; `/demo` only redirects there.
  const garageHref = fromDemo ? '/' : '/garage';

  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vehicleData, setVehicleData] = useState<any>(null);
  const [showWizard, setShowWizard] = useState(false);

  const handleVINSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await decodeVIN(vin);

    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Failed to decode VIN');
      if (result.vehicleId) {
        setTimeout(() => {
          router.push(`/dashboard/${result.vehicleId}`);
        }, 2000);
      }
      return;
    }

    setVehicleData(result.vehicle);
    setShowWizard(true);
  };

  if (showWizard && vehicleData) {
    return <OnboardingWizard vehicleData={vehicleData} />;
  }

  return (
    <SignedInShell>
      <main className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 py-14">
        <PageOpener
          className="mb-10"
          eyebrow={
            <Link
              href={garageHref}
              className="tap-target-44 relative inline-flex items-center gap-1.5 text-white/55 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {fromDemo ? 'Demo garage' : 'Garage'}
            </Link>
          }
          title="Add a vehicle"
          lede="Enter the 17-character VIN. We decode it and research the car."
        />

        {/*
          Two columns from `lg`: the form at 720 on the left, the plate on the
          right; on a phone the plate stacks above the form, as the brief
          places it.
        */}
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)] items-stretch">
          {/* The panel is `/check`'s: cut corner, the card surface, the hairline. */}
          <div className="order-2 lg:order-1 cut-panel border border-[color:var(--border)] bg-[hsl(var(--card))]/95 p-5 sm:p-6">
            <form onSubmit={handleVINSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="vin" className="mono text-xs uppercase tracking-[0.18em] text-white/55">
                  VIN
                </Label>
                <Input
                  id="vin"
                  fieldSize="lg"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  maxLength={17}
                  className="mono"
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="vin-hint"
                />
                {/*
                  The ramp: a cyan hairline advancing one seventeenth per
                  character. Cyan is information and focus, and this is both.
                  `progressbar` rather than decoration so the count survives
                  for anyone not looking at it.
                */}
                <div
                  role="progressbar"
                  aria-label="VIN length"
                  aria-valuemin={0}
                  aria-valuemax={17}
                  aria-valuenow={vin.length}
                  className="h-px w-full bg-white/10"
                >
                  <div
                    className="h-px bg-[color:var(--brand-accent)] transition-[width] duration-[120ms] ease-linear"
                    style={{ width: `${(vin.length / 17) * 100}%` }}
                  />
                </div>
                <p id="vin-hint" className="text-xs text-[color:var(--text-muted)]">
                  Find it on the driver&apos;s side dashboard or door jamb.
                </p>
              </div>

              {/*
                Sodium, not red — B3. `bg-red-500/10 border-red-400/30
                text-red-300` was the retired red family as utility classes.
                The same cut panel and tokens the landing's failed-load notice
                uses.
              */}
              {error && (
                <div
                  role="alert"
                  className="chamfer-sm border border-[color:var(--critical-border)] bg-[color:var(--critical-wash)] p-4 text-sm text-[color:var(--critical)]"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full font-semibold" disabled={loading || vin.length !== 17}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Decoding VIN…
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </form>
          </div>

          {/*
            The plate. An `<img>` rather than a CSS background so the preload
            scanner can see it; stated intrinsic size so it cannot shift the
            form when it lands; eager, because it is above the fold on both
            viewports.

            ⚠ Its height is the form's, not its own. At its 3:2 aspect the
            plate ran 42px deeper than the panel beside it (measured), so the
            two columns started on one line and ended on two. From `lg` the
            figure takes the grid row's height — which the panel sets, because
            an absolutely positioned image contributes none — and the image
            covers it; below `lg`, stacked above the form, it keeps its aspect.
          */}
          <figure className="relative order-1 lg:order-2 cut-panel overflow-hidden border border-white/8 bg-[hsl(var(--card))] aspect-[3/2] lg:aspect-auto lg:min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/design/onboard-vin-plate-1400.webp"
              srcSet="/design/onboard-vin-plate-800.webp 800w, /design/onboard-vin-plate-1400.webp 1400w"
              sizes="(min-width: 1024px) 45vw, 100vw"
              width={2528}
              height={1696}
              loading="eager"
              decoding="async"
              alt="A VIN plate at the base of a windscreen at night, lit by a streetlamp"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </figure>
        </div>
      </main>
    </SignedInShell>
  );
}
