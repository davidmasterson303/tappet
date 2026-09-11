'use client';

import { firstEmbed } from '@tappet/core/vehicle-embed';
import { byAttention } from '@tappet/core/garage-order';
import { fleetSummary } from '@tappet/core/fleet-summary';
import { VehicleCard } from '@/components/VehicleCard';
import type { GarageVehicle } from '@/hooks/useVehicles';
import { RevealOnScroll } from '@/components/RevealOnScroll';
import { PageOpener } from '@/components/PageOpener';
import { FleetStrip } from '@/components/FleetStrip';
import { GhostVehicleSlot } from '@/components/GhostVehicleSlot';
import { SignedInShell, AddVehicleAction } from '@/components/SignedInShell';

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
 *
 * The room and the header are `SignedInShell`'s, shared with settings and
 * onboarding: the landing's drawn `.service-bay` plate rather than the pure
 * black and separate `.vignette-frame` this page carried, which the critique
 * graded as "the whole distance" between this garage and the landing on the
 * same cards. CC-142 §5 still holds — the plate is drawn, not photographed.
 */
export interface GarageViewProps {
  vehicles: GarageVehicle[];
  loading: boolean;
  error: string | null;
  /**
   * Who is signed in, for the eyebrow — the session's email. `null` when the
   * page does not know (the session is still resolving), and the eyebrow
   * says only that someone is.
   */
  owner?: string | null;
}

export function GarageView({ vehicles, loading, error, owner = null }: GarageViewProps) {
  const fleet = fleetSummary(vehicles);

  return (
    /*
      The header's "Add vehicle" lives in `SignedInShell.tsx` with its
      `?from=garage` marker; `onboarding-guard.test.ts` reads that file as
      well as this one.
    */
    <SignedInShell actions={<AddVehicleAction />}>
      {/* Widened at `2xl` to match the dashboard — see app/page.tsx. */}
      <main className="relative max-w-7xl 2xl:max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-12 py-14">
        {/*
          ── The opener, in the landing's voice ──────────────────────────────

          "My Garage" in Inter Bold over "Managing 3 vehicles" in grey was the
          first gap the 11 Sep critique named (B2): three signed-in pages, three
          headline voices, none of them the system's. `PageOpener` is the
          landing's opener as one piece — mono eyebrow, condensed uppercase
          headline, one quiet line.

          The eyebrow is a state label, which is what mono is for here, and it
          says who: SIGNED IN AS and the session's email. Round one said only
          SIGNED IN and the critique cut it — "says nothing; the brief's
          'SIGNED IN AS ADA' says who. Say who or drop the line." Dropping it
          would take the eyebrow B2 asks for. The email is the account's own
          identifier and true as printed; what this deliberately does *not*
          do is print its local part as if it were a display name, which
          would show someone who set "David" in settings a different word.
          The garage does not fetch the profile, and an eyebrow is not a
          reason to start.

          "Managing N vehicles" is gone; the fleet strip below carries the
          count, and carries it as a number rather than as a sentence.
        */}
        <PageOpener
          className="mb-10"
          eyebrow={
            owner ? (
              <>
                Signed in as{' '}
                <span className="inline-block max-w-full truncate align-bottom normal-case">{owner}</span>
              </>
            ) : (
              'Signed in'
            )
          }
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
    </SignedInShell>
  );
}
