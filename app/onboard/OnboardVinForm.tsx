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
    <div className="relative min-h-screen overflow-hidden">
      {/* CC-142 §5 — flat on authenticated routes. Under a 0.72–0.88 black
          wash this photograph was already almost entirely invisible; what it
          reliably did was download. */}
      <div className="fixed inset-0 z-0 bg-black" />

      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-12 py-14">
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

        {/* The panel is `/check`'s: cut corner, the card surface, the hairline. */}
        <div className="cut-panel border border-[color:var(--border)] bg-[hsl(var(--card))]/95 p-5 sm:p-6 w-full max-w-lg">
          <form onSubmit={handleVINSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="vin" className="text-[color:var(--text-muted)]">
                  Vehicle Identification Number (VIN)
                </Label>
                {/*
                  A count, not a verdict. This went `text-green-400` at 17,
                  which is a third hue saying "good" — and good is off-white
                  ink here (B3). The counter lifts from muted to primary when
                  the VIN is complete, which is the same thing said in the
                  system's own words.
                */}
                <span
                  className={`mono text-xs tabular-nums transition-colors ${
                    vin.length === 17 ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'
                  }`}
                >
                  {vin.length}/17
                </span>
              </div>
              <Input
                id="vin"
                placeholder="Enter 17-character VIN"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                maxLength={17}
                className="mono text-base"
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-[color:var(--text-muted)]">
                Find your VIN on the driver&apos;s side dashboard or door jamb.
              </p>
            </div>

            {/*
              Sodium, not red — B3. `bg-red-500/10 border-red-400/30
              text-red-300` was the retired red family as utility classes. The
              same cut panel and tokens the landing's failed-load notice uses.
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
      </main>
    </div>
  );
}
