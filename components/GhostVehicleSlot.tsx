import Link from 'next/link';
import { vehicleField } from '@tappet/core/vehicle-identity';
import { Button } from '@/components/ui/button';

/**
 * An empty garage, drawn as the first card slot rather than as a pitch.
 *
 * ── What this replaces, and why it was cut ──────────────────────────────────
 *
 * The signed-in garage's empty state was a centred, rounded, blurred panel: an
 * icon in a gradient tile, "Your Garage is Empty", a paragraph selling
 * "AI-powered maintenance insights, cost optimization, and repair bundling
 * strategies", a cyan pill and a "Learn More" beside it. The 11 Sep critique
 * listed every part of it under AI tells and under Cut, and the locked brief
 * (B6) states the replacement: *one ghost card slot, one button; no icon,
 * Learn More or pitch.*
 *
 * The person seeing this has already signed up. They do not need to be sold
 * the product; they need the one thing the page cannot do yet, which is show
 * them a car. So this is the shape of the card they are about to have — the
 * same 4:3 plate, the same hairline frame, the same body — with the slot's
 * one line in the plate and the one action in the body.
 *
 * Built from the same pieces as `VehicleIdentity`'s no-photo plate, on
 * purpose: `vehicleField(null)` is the field for a car with no make, the inset
 * hairline is the card frame, `.machined` is the top edge. A ghost that is
 * drawn differently from the real thing would not read as a ghost of it.
 *
 * `href` is a prop rather than a constant because `onboarding-guard.test.ts`
 * scans `GarageView.tsx` for every `/onboard` link and requires the
 * `?from=garage` marker on each — the marker is what stops the returning-user
 * redirect from bouncing "add a car" straight back to the garage. The literal
 * has to live where the guard reads.
 */
export function GhostVehicleSlot({ href }: { href: string }) {
  const field = vehicleField(null);

  return (
    <div
      data-testid="ghost-vehicle-slot"
      className="cut-panel relative border border-white/8 overflow-hidden bg-[hsl(var(--card))]/95 edge-light h-full flex flex-col"
    >
      <div
        className="relative overflow-hidden"
        style={{
          background: field.gradient,
          aspectRatio: '4 / 3',
          borderBottom: '1px solid rgb(255 255 255 / 0.08)',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute pointer-events-none chamfer-sm border border-white/8"
          style={{ inset: 12 }}
        />
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <p className="mono text-xs uppercase tracking-[0.2em] text-white/55">No vehicles yet</p>
        </div>
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none machined" />
      </div>

      <div className="p-5 flex flex-col gap-5">
        <h2 className="display-instrument display-instrument-narrow uppercase text-2xl leading-none text-[color:var(--text-primary)]">
          Add your first car
        </h2>
        <Link href={href} className="self-start">
          <Button className="font-semibold">Enter a VIN</Button>
        </Link>
      </div>
    </div>
  );
}
