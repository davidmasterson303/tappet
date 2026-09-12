'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readPlanEntry, type PlanSegment } from '@/lib/plan-entry';
import DashboardLayout from '@/components/DashboardLayout';
import VehicleInsights from '@/components/VehicleInsights';
import { WishlistSection } from '@/components/WishlistSection';
import { getClientSupabase } from '@/lib/supabase';
import { useVehicleImage } from '@/hooks/useSignedUrl';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { showsModifications } from '@tappet/core/mod-progression';
import { Button } from '@/components/ui/button';
import RegisterSwitch from '@/components/RegisterSwitch';

export type { PlanSegment };

/**
 * Plan: what this car needs, and what you want to do to it.
 *
 * ── ⚠ Why this page exists ──────────────────────────────────────────────────
 *
 * Both of these lived at the bottom of the dashboard until 8 Sep — the wishlist
 * in a collapsible, the mods inside a second collapsible called "The Dossier",
 * behind a tab strip. Three clicks and two containers, on a page already
 * 3,600px tall. An IA review of the rendered dashboard found that a subscriber
 * could not see either one, and read the product as "a health score with an AI
 * note attached". A capability nobody can find is one that was not built.
 *
 * ── Why the two are one destination ─────────────────────────────────────────
 *
 * Carried over from `apps/mobile/src/screens/PlanScreen.tsx`, which made this
 * move first and whose argument holds here unchanged: needs and mods both
 * answer *"what should I do to this car next"*, both are ordered lists of jobs
 * with a suggestions source and a user-added path, and splitting them makes the
 * owner classify a job before they can look for it. Its example is exact — a
 * charge pipe on an M235i is a known failure point **and** the first thing
 * anyone modifies, so under two lists it is filed wrong half the time and then
 * cannot be found.
 *
 * ⚠ **Same word, same order, same segments as the phone.** The two clients had
 * drifted into different names for the same places — Consultant against
 * Advisor, Maintenance against Service — and a person who pays once for both
 * should not have to learn two vocabularies.
 *
 * ── ⚠ `Mods` is conditional, and the switcher goes with it ──────────────────
 *
 * Shown only when the owner has not told us the car is stock, which is the same
 * `showsModifications` gate the dossier tab used. A one-option control is not a
 * control, so when mods are hidden the segmented control is not rendered at all
 * rather than rendered with a single button.
 */
/*
  ── ⚠ The URL can choose the segment and open the Needs dialog ──────────────

  `/plan/<id>?segment=needs&add=1` is what the Service tab's "Add a service
  record" pushes (11 Sep, David's ask; the contract is `lib/plan-entry.ts`).
  `useSearchParams` needs a Suspense boundary above it or Next de-opts the
  whole route into client rendering with a build warning — same reason
  `app/onboard/page.tsx` wraps its form. The page is split accordingly.
*/
export default function PlanPage(props: { params: { vehicleId: string } }) {
  return (
    <Suspense fallback={null}>
      <PlanPageInner {...props} />
    </Suspense>
  );
}

function PlanPageInner({ params }: { params: { vehicleId: string } }) {
  const entry = readPlanEntry(useSearchParams());
  const [segment, setSegment] = useState<PlanSegment>(entry.segment);
  const queryClient = useQueryClient();
  /*
    ── ⚠ The page owns the modifications switch, in both states (11 Sep) ────

    It used to live inside `VehicleInsights section="mods"`, which hides with
    the surface it switches. Two things followed, and David hit both on the
    live demo: hiding left this page's cached `showsMods` stale, so the MODS
    tab stayed selected over an empty panel; and after a reload the tab was
    gone *and so was the switch* — the section that rendered it no longer
    rendered. "Not now" had become "never" on this page, which is the exact
    thing `RegisterSwitch`'s docblock says must not happen.

    So the switch renders here, beside the segmented control when the surface
    is shown and alone when it is hidden, and applying it does three things at
    once: flips the local override so the strip reacts immediately, writes the
    same value into the plan query's cache so a remount agrees without a
    refetch, and steps off the tab that is about to disappear. The server
    action inside `RegisterSwitch` is what persists it, per car; a refusal
    calls back with the previous value and all three undo together.
  */
  const [visibleOverride, setVisibleOverride] = useState<boolean | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['plan', params.vehicleId],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const supabase = getClientSupabase();
      const [vehicleResult, knowledgeResult] = await Promise.all([
        supabase.from('vehicles').select('*').eq('id', params.vehicleId).maybeSingle(),
        supabase.from('vehicle_knowledge_base').select('*').eq('vehicle_id', params.vehicleId).maybeSingle(),
      ]);
      if (vehicleResult.error) throw vehicleResult.error;
      if (!vehicleResult.data) throw new Error('Vehicle not found');
      return { vehicle: vehicleResult.data, knowledge: knowledgeResult.data };
    },
  });

  const vehicleImage = useVehicleImage(data?.vehicle);
  const showsMods = visibleOverride ?? showsModifications(data?.vehicle?.performance_mindedness);
  const active = showsMods ? segment : 'needs';

  function applyModsVisible(next: boolean) {
    setVisibleOverride(next);
    queryClient.setQueryData(['plan', params.vehicleId], (old: typeof data) =>
      old
        ? {
            ...old,
            // The same value `setModificationsVisible` writes, so cache and row agree.
            vehicle: { ...old.vehicle, performance_mindedness: next ? 'mild' : 'stock' },
          }
        : old,
    );
    if (!next && segment === 'mods') setSegment('needs');
  }

  if (isLoading || error || !data) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        {error ? (
          <p className="text-sm text-white/50">Could not load this car&apos;s plan.</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-info-border border-t-info rounded-full animate-spin" />
            <p className="text-sm text-white/50">Loading plan…</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout vehicle={data.vehicle} knowledge={data.knowledge} currentPage="plan" vehicleImage={vehicleImage}>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {showsMods ? (
            <div
              role="tablist"
              aria-label="Plan"
              className="inline-flex rounded-xl border border-white/8 bg-white/4 p-0.5"
            >
              {(['needs', 'mods'] as const).map((value) => {
                const on = active === value;
                return (
                  <Button
                    key={value}
                    role="tab"
                    aria-selected={on}
                    variant="ghost"
                    onClick={() => setSegment(value)}
                    className={`label-uppercase min-h-[44px] rounded-lg px-5 ${
                      on ? 'bg-slate-800 text-white' : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {value === 'needs' ? 'Needs' : 'Mods'}
                  </Button>
                );
              })}
            </div>
          ) : null}
            {/* The way back, in both states — see the note on `visibleOverride`. */}
            <RegisterSwitch vehicleId={data.vehicle.id} visible={showsMods} onApply={applyModsVisible} />
          </div>

          {active === 'needs' ? (
            <WishlistSection vehicleId={data.vehicle.id} openAdd={entry.openAdd} />
          ) : (
            <VehicleInsights
              vehicle={data.vehicle}
              knowledge={data.knowledge}
              section="mods"
              switchOwner="page"
            />
          )}
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
