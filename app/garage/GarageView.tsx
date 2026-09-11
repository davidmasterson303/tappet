'use client';

import Link from 'next/link';
import { firstEmbed } from '@tappet/core/vehicle-embed';
import { byAttention } from '@tappet/core/garage-order';
import { fleetSummary } from '@tappet/core/fleet-summary';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { BrandWordmark } from '@/components/brand/BrandLockup';
import { VehicleCard } from '@/components/VehicleCard';
import type { GarageVehicle } from '@/hooks/useVehicles';
import { AccountMenu } from '@/components/AccountMenu';
import { RevealOnScroll } from '@/components/RevealOnScroll';
import { useHomeHref } from '@/hooks/use-home-href';
import { PageOpener } from '@/components/PageOpener';
import { FleetStrip } from '@/components/FleetStrip';
import { GhostVehicleSlot } from '@/components/GhostVehicleSlot';

/**
 * The signed-in garage, as a view over data it is handed.
 *
 * ── ⚠ Why the page is split in two ──────────────────────────────────────────
 *
 * `/garage` is behind the middleware, so an anonymous capture 307s to `/login`
 * and the design-critic loop could never reach it — it was one of three pages
 * that stayed unjudged through two locked briefs. The phone met the same wall
 * twice and its `dev/fixtures.ts` records the lesson: **the screens need
 * data, not a session; auth is only the gate in front of the data.**
 *
 * So the page keeps the gate and the hooks, and this file keeps the screen.
 * `/dev/garage` renders this exact component on the demo garage's real rows
 * (`useDemoVehicles`, the same query `/` uses anonymously), which is what the
 * loop shoots. `dev-surfaces-render-the-real-views.test.tsx` pins that the
 * dev route and the real route render *this* component and not a copy —
 * a dev surface that drifts from the product would be graded instead of it.
 *
 * `loading` and `error` are props for the same reason: the three states are
 * three screenshots, and the loop should be able to ask for each.
 *
 * ── 11 Sep — the page joins the system it was serving cards into ────────────
 *
 * `VehicleCard` had been on the settled system since 5 Sep; everything around
 * it was still the pre-4-Sep register — Inter Bold "My Garage", a cyan-bordered
 * "Add Vehicle", pure black behind the cards, and an empty state that pitched
 * the product to someone who had already bought it. The signed-in brief
 * (`design-loop/signed-in/brief.md`, locked 11 Sep) is what this now follows:
 * the page opens like the landing — mono eyebrow, condensed headline, the
 * fleet strip — and the grid is the same grid with, when there is nothing in
 * it, one ghost slot where the first car will go.
 */
export interface GarageViewProps {
  vehicles: GarageVehicle[];
  loading: boolean;
  error: string | null;
}

export function GarageView({ vehicles, loading, error }: GarageViewProps) {
  const homeHref = useHomeHref();
  const fleet = fleetSummary(vehicles);

  return (
    <div className="relative w-full min-h-screen">
      {/*
        CC-142 §5 — flat, not photographic. The garage is now a grid of
        identity plates, each carrying its own make-derived field; a
        photographic backdrop behind them put a second, unrelated image
        underneath every one of those and tinted the lot. It also fetched
        470 KB of `dark-roomb.jpeg` to sit at low opacity behind opaque cards.

        Image backgrounds stay on landing and auth, which are not in scope.
      */}
      <div className="absolute inset-0 z-0 bg-black" />
      {/* Signature vignette — see app/demo/page.tsx. */}
      <div
        className="fixed inset-0 z-0 vignette-frame pointer-events-none"
        aria-hidden="true"
      />

      <nav className="relative z-20 border-b border-white/8" style={{ backgroundColor: '#000000', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-4">
          <div className="flex items-center justify-between">
            <Link href={homeHref} className="flex items-center group">
              {/* 21px mark — the small cut, switched inside the component. */}
              <BrandWordmark size={28} />
            </Link>
            <div className="flex items-center gap-3">
              {/*
                `from=garage` marks this as a deliberate visit. /onboard now
                redirects a user who already has vehicles, and without this
                marker that guard would make adding a second car impossible —
                see lib/onboarding.ts.

                ⚠ An outline, not a cyan one. This carried `border-cyan-400
                text-cyan-400` — a cyan call to action on a page whose design
                system reserves cyan for information and focus, and the one
                thing the critique named under "no cyan-filled CTA" (B3). The
                brief's header is "one off-white hairline cut-corner 'Add
                vehicle'": the primitive's outline variant is exactly that, and
                the label is sentence case like every other control here.
              */}
              <Link href="/onboard?from=garage">
                <Button variant="outline" size="sm" className="font-semibold text-[color:var(--text-primary)]">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add vehicle
                </Button>
              </Link>
              <AccountMenu />
            </div>
          </div>
        </div>
      </nav>

      {/* Widened at `2xl` to match the dashboard — see app/page.tsx. */}
      <main className="relative z-20 max-w-7xl 2xl:max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-12 py-14">
        {/*
          ── The opener, in the landing's voice ──────────────────────────────

          "My Garage" in Inter Bold over "Managing 3 vehicles" in grey was the
          first gap the 11 Sep critique named (B2): three signed-in pages, three
          headline voices, none of them the system's. `PageOpener` is the
          landing's opener as one piece — mono eyebrow, condensed uppercase
          headline, one quiet line.

          The eyebrow is a state label, which is what mono is for here. It
          does not name the owner: the garage query does not fetch the profile,
          and `user.email` is not a display name — printing it would show
          someone who set "David" in settings their email's local part instead.

          "Managing N vehicles" is gone; the fleet strip below carries the
          count, and carries it as a number rather than as a sentence.
        */}
        <PageOpener
          className="mb-10"
          eyebrow="Signed in"
          title="Garage"
          lede={
            loading
              ? 'Loading…'
              : error
              ? 'Unable to load your vehicles'
              : vehicles.length === 0
              ? 'Nothing here yet.'
              : 'Open a car for its dossier.'
          }
        >
          {!loading && !error && <FleetStrip fleet={fleet} className="mt-7" />}
        </PageOpener>

        {loading ? (
          <p className="text-[color:var(--text-muted)]">Loading your vehicles…</p>
        ) : error ? (
          /*
            Sodium, not red — B3. This was `border-red-500/30`, `text-red-400`
            and a `from-red-950/20` gradient: the retired critical family
            spelled as utility classes, which `retired-palette-literals` cannot
            see because it scans hex. An error is on the warning axis like every
            other alarm in the system, and it is a cut panel like every other
            container.
          */
          <div className="cut-panel border border-[color:var(--critical-border)] bg-[color:var(--critical-wash)] p-6 max-w-xl">
            <h2 className="display-instrument display-instrument-narrow uppercase text-2xl text-[color:var(--critical)] mb-2">
              Error loading vehicles
            </h2>
            <p className="text-[color:var(--text-primary)] mb-2">{error}</p>
            <p className="text-sm text-[color:var(--text-muted)]">Check the console for more details.</p>
          </div>
        ) : (
          // Identical to the dashboard's grid on purpose — these disagreed
          // about their gap (8 here, 6 there) as well as skipping `sm`. See
          // app/page.tsx.
          <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {vehicles.length === 0 ? (
              /*
                An empty garage is the first slot, drawn as a ghost of the card
                that will fill it — B6. The pitch, the icon tile, the cyan pill
                and "Learn More" went with the critique's Cut list; see the
                component for what each was and why. The `?from=garage` marker
                is required here as on the nav button, and the guard reads this
                file for it.
              */
              <GhostVehicleSlot href="/onboard?from=garage" />
            ) : (
              /* Same read order as the landing garage — see `byAttention`. */
              byAttention(vehicles).map((vehicle, i) => (
                // Index is per-grid, so the stagger restarts here rather than
                // continuing a count from elsewhere on the page.
                <RevealOnScroll key={vehicle.id} index={i} className="h-full">
                  <VehicleCard
                    vehicle={vehicle}
                    activeRecalls={firstEmbed(vehicle.nhtsa_data)?.recalls?.length || 0}
                    healthSummary={firstEmbed(vehicle.vehicle_health_summary)}
                  />
                </RevealOnScroll>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
