'use client';

import { useState } from 'react';
import Link from 'next/link';
import { firstEmbed } from '@tappet/core/vehicle-embed';
import { byAttention } from '@tappet/core/garage-order';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import BrandLockup, { BrandWordmark } from '@/components/brand/BrandLockup';
import { VehicleCard } from '@/components/VehicleCard';
import type { GarageVehicle } from '@/hooks/useVehicles';
import { AccountMenu } from '@/components/AccountMenu';
import { RevealOnScroll } from '@/components/RevealOnScroll';
import { useHomeHref } from '@/hooks/use-home-href';
import FeaturesDrawer from '@/components/FeaturesDrawer';

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
 */
export interface GarageViewProps {
  vehicles: GarageVehicle[];
  loading: boolean;
  error: string | null;
}

export function GarageView({ vehicles, loading, error }: GarageViewProps) {
  const homeHref = useHomeHref();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

      <nav className="relative z-20 border-b border-info-border" style={{ backgroundColor: '#000000', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-5">
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
              */}
              <Link href="/onboard?from=garage">
                <Button className="bg-black border-2 border-cyan-400 hover:bg-cyan-400/10 text-cyan-400 font-semibold">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Vehicle
                </Button>
              </Link>
              <AccountMenu />
            </div>
          </div>
        </div>
      </nav>

      {/* Widened at `2xl` to match the dashboard — see app/page.tsx. */}
      <main className="relative z-20 max-w-7xl 2xl:max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-12 py-16">
        <div className="mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 tracking-tight">
            My Garage
          </h1>
          <p className="text-lg text-gray-400">
            {loading ? 'Loading...' : `Managing ${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {loading ? (
          <div className="text-white">Loading your vehicles...</div>
        ) : error ? (
          <div className="border border-red-500/30 rounded-3xl text-center py-16 px-12 bg-gradient-to-b from-red-950/20 to-black/40 backdrop-blur-sm">
            <h2 className="text-2xl font-bold mb-4 text-red-400">Error Loading Vehicles</h2>
            <p className="text-gray-300 mb-4">{error}</p>
            <p className="text-sm text-gray-400">Check console for more details</p>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="border border-info-border rounded-3xl text-center py-32 px-12 bg-gradient-to-b from-black/60 to-black/40 backdrop-blur-sm">
            <div className="mb-8">
              <div className="h-24 w-24 bg-gradient-to-br from-cyan-500/20 to-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto">
                {/* Resting glyph: mark alone, one colour, --text-muted-40. */}
                <BrandLockup width={48} variant="mono" className="text-[var(--text-muted-40)]" />
              </div>
            </div>
            <h2 className="text-4xl font-bold mb-4 text-white tracking-tight">Your Garage is Empty</h2>
            <p className="text-lg text-gray-300 mb-10 max-w-md mx-auto leading-relaxed">
              Add your first vehicle and unlock AI-powered maintenance insights, cost optimization, and repair bundling strategies.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/onboard?from=garage">
                <Button size="lg" className="bg-cyan-500 hover:bg-cyan-400 text-black h-14 px-10 rounded-full text-base font-semibold transition-all hover:scale-105">
                  Add Your First Vehicle
                </Button>
              </Link>
              {/*
                Opens the feature drawer rather than linking to `/`.

                This is the empty state of a *signed-in* garage, so "Learn More"
                was sending someone who already has an account to the anonymous
                demo — and now that a signed-in user is redirected off `/`, it
                would have bounced them straight back here. Same affordance, no
                round trip, and the drawer is the better answer anyway: it
                explains the product without leaving the page they need to act on.
              */}
              <Button
                size="lg"
                variant="outline"
                onClick={() => setDrawerOpen(true)}
                className="h-14 px-10 rounded-full text-base font-medium border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
              >
                Learn More
              </Button>
            </div>
          </div>
        ) : (
          // Identical to the dashboard's grid on purpose — these disagreed
          // about their gap (8 here, 6 there) as well as skipping `sm`. See
          // app/page.tsx.
          <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {/* Same read order as the landing garage — see `byAttention`. */}
            {byAttention(vehicles).map((vehicle, i) => (
              // Index is per-grid, so the stagger restarts here rather than
              // continuing a count from elsewhere on the page.
              <RevealOnScroll key={vehicle.id} index={i} className="h-full">
                <VehicleCard
                  vehicle={vehicle}
                  activeRecalls={firstEmbed(vehicle.nhtsa_data)?.recalls?.length || 0}
                  healthSummary={firstEmbed(vehicle.vehicle_health_summary)}
                />
              </RevealOnScroll>
            ))}
          </div>
        )}
      </main>

      <FeaturesDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
