'use client';

import { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CircleAlert as AlertCircle, FileText, Wrench } from 'lucide-react';
import { Working } from '@/components/Working';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  updateIssueStatus,
  updateModificationStatusWithTier,
  getIssueTracking,
  getModificationTracking,
  getModificationDetailsBatch,
  addMaintenanceHistory,
  preloadAllPerformanceModifications,
  getModNamesOnly,
  getDetailedModsWithCachedDetails,
  getCachedPerformanceModifications,
  getModsForVehicle,
  ensureAggressiveModMinimum,
  generateVehicleDossier,
  generateVehicleHealthSummary,
} from '@/app/actions';
import { useWishlistData } from '@/hooks/useWishlistData';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { invalidateDashboardCache } from '@tappet/core/query-invalidation';
import IssueFixDialog from './IssueFixDialog';
import MaintenanceHistoryDialog from './MaintenanceHistoryDialog';
import IssuesTab from './insights/IssuesTab';
import MaintenanceTab from './insights/MaintenanceTab';
import ModificationsTab from './insights/ModificationsTab';
import RegisterSwitch from './RegisterSwitch';
import { showsModifications } from '@tappet/core/mod-progression';

/**
 * One of the three bodies this component can render on its own.
 *
 * ⚠ **The dossier is gone as a container, and this prop is what dissolved it.**
 * Until 8 Sep these three lived as tabs inside a card called "The Dossier",
 * inside a collapsible, at the bottom of the dashboard — three clicks from
 * landing, under a name that describes the drawer rather than anything in it.
 * An IA review put the cost plainly: a subscriber counting what they are paying
 * for could not see the maintenance schedule, the mods ladder or the needs
 * list at all, so the product read as a health score with a note attached.
 *
 * Each body now lives on the page that owns its question — issues with the
 * vehicle's research, maintenance with the service record it is computed from,
 * mods with the plan. The data layer stayed here rather than being copied three
 * ways: `Icon.tsx` carries this repo's rule about hand-duplicated things
 * drifting, and two of these bodies write to the same wishlist.
 */
export type InsightSection = 'issues' | 'maintenance' | 'mods';

interface VehicleInsightsProps {
  vehicle: any;
  knowledge: any;
  onWishlistStateUpdate?: (itemNames: Set<string>) => void;
  /**
   * Render exactly one body, with no card, no tab strip and no name.
   *
   * ⚠ Omitting it renders the old dossier, and nothing ships that way any more
   * — the three call sites all pass a section. It is kept because the early
   * returns above (`pending`, `failed`, `unsupported`) are the same for every
   * section and deleting the branch would mean re-deriving them per page.
   */
  section?: InsightSection;
  /**
   * Who renders the modifications on/off switch for `section="mods"`.
   *
   * `'section'` (default) draws it here, above the body, and draws it alone
   * when the surface is hidden. `'page'` draws nothing: the page renders
   * `RegisterSwitch` itself, in both states, because a switch that lives
   * inside the section it hides is gone the moment it is used — the Plan
   * tab lost its way back exactly that way (11 Sep).
   */
  switchOwner?: 'section' | 'page';
}

const VehicleInsights = forwardRef<{ getSavedItemNames: () => Set<string> }, VehicleInsightsProps>(
  ({ vehicle, knowledge, onWishlistStateUpdate, section, switchOwner = 'section' }, ref) => {
    const router = useRouter();
    const { data: wishlistItems } = useWishlistData(vehicle.id);
    const savedItemNames = useMemo(
      () => new Set<string>((wishlistItems ?? []).map((item: any) => item.item_name as string)),
      [wishlistItems]
    );
    const [issueTracking, setIssueTracking] = useState<any[]>([]);
    const [modTracking, setModTracking] = useState<any[]>([]);
    const [modDetails, setModDetails] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(false);
    const [issueFixDialogOpen, setIssueFixDialogOpen] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<{ id: string; name: string } | null>(null);
    const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
    const [selectedMaintenanceItem, setSelectedMaintenanceItem] = useState<string>('');
    const [selectedModForInstall, setSelectedModForInstall] = useState<string>('');
    const [performanceMods, setPerformanceMods] = useState<any[]>([]);
    /*
      `earnedTier` and its progress card lived here. Both are gone (7 Aug): the
      build dial shows where a car sits directly, so a tier the owner had to
      unlock was a second, coarser answer to the same question — and one that
      gated the mod list while it was at it.
    */
    /*
      ── Which dossier tabs exist, and in what order ─────────────────────────

      Driven by the owner's own onboarding answer rather than fixed.

      `stock` has hidden the mods tab since it was written, and that gate has
      **never once fired** — no vehicle in the product has ever been `stock`,
      because until now the onboarding answer only ever narrowed what was shown
      and nothing made the choice consequential. It stays.

      What is new (7 Aug, David) is that anyone who wants modifications gets
      them **first**. Someone who asked for the surface is not opening the
      dossier to read the maintenance schedule, and making them scroll past two
      tabs to reach the one they came for is the same clutter complaint pointing
      the other way.

      This briefly keyed on `aggressive` versus `mild`. Those levels are gone —
      onboarding asks a yes/no now, because a level is an end state — so the
      rule is simply: asked for it, sees it first.
    */
    /*
      Held locally so turning modifications on reveals the tab immediately.
      The server action persists it; waiting for a refetch to show a tab the
      person just asked for reads as the button not having worked.
    */
    const [modsVisible, setModsVisible] = useState(
      showsModifications(vehicle.performance_mindedness)
    );

    const dossierTabs = modsVisible
      ? ['mods', 'issues', 'maintenance']
      : ['issues', 'maintenance'];

    /*
      The default follows the order rather than being pinned to 'issues'. A
      first tab that is not the selected one reads as a rendering bug.
    */
    const [dossierTab, setDossierTab] = useState(dossierTabs[0]);
    const [loadingModNames, setLoadingModNames] = useState(false);
    const [isAutoResearching, setIsAutoResearching] = useState(false);
    const autoResearchRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getSavedItemNames: () => savedItemNames,
    }));

    useEffect(() => {
      loadTracking();
      preloadAllPerformanceModifications(vehicle.id).catch(() => {});
    }, [vehicle.id]);

    useEffect(() => {
    }, [vehicle.id]);

    useEffect(() => {
      loadPerformanceMods();
    }, [vehicle.id]);

    useEffect(() => {
      onWishlistStateUpdate?.(savedItemNames);
    }, [savedItemNames, onWishlistStateUpdate]);

    useEffect(() => {
      if ((knowledge?.research_status === 'pending' || knowledge?.research_status === 'failed') && !autoResearchRef.current) {
        autoResearchRef.current = true;
        const autoResearch = async () => {
          setIsAutoResearching(true);
          const result = await generateVehicleDossier(vehicle.id, {
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
          });
          if (result.success) {
            invalidateDashboardCache(vehicle.id);
            router.refresh();
          }
          setIsAutoResearching(false);
        };
        autoResearch();
      }
    }, [vehicle.id, vehicle.year, vehicle.make, vehicle.model, knowledge?.research_status, router]);

    const loadTracking = async () => {
      const [issueResult, modResult] = await Promise.all([
        getIssueTracking(vehicle.id),
        getModificationTracking(vehicle.id),
      ]);

      if (issueResult.success) setIssueTracking(issueResult.data);

      if (modResult.success) {
        setModTracking(modResult.data);
        const modNames = (knowledge?.common_mods || []).map((mod: any) => mod.name);
        if (modNames.length > 0) {
          const batchResult = await getModificationDetailsBatch(
            vehicle.id,
            modNames,
            vehicle.performance_mindedness
          );
          if (batchResult.success) setModDetails(batchResult.data);
        }
      }
    };

    const loadPerformanceMods = async () => {
      setLoadingModNames(true);

      // Try tier-specific mod list first
      const tierResult = await getModsForVehicle(vehicle.id);
      if (tierResult.success && tierResult.data.length > 0) {
        setPerformanceMods(tierResult.data);
        const detailsMap: Record<string, any> = {};
        for (const mod of tierResult.data) {
          if (mod.details) detailsMap[mod.name] = mod.details;
        }
        setModDetails((prev) => ({ ...prev, ...detailsMap }));
        setLoadingModNames(false);
        return;
      }

      // Fallback: load from names cache then details cache
      const namesResult = await getModNamesOnly(vehicle.id, 'mild');
      if (namesResult.success && namesResult.data.length > 0) {
        setPerformanceMods(namesResult.data);
      }
      setLoadingModNames(false);

      const detailsResult = await getDetailedModsWithCachedDetails(vehicle.id, 'mild');
      if (detailsResult.success && detailsResult.data.length > 0) {
        setPerformanceMods(detailsResult.data);
        const detailsMap: Record<string, any> = {};
        for (const mod of detailsResult.data) {
          if (mod.details) detailsMap[mod.name] = mod.details;
        }
        setModDetails((prev) => ({ ...prev, ...detailsMap }));
      } else {
        const fallbackResult = await getCachedPerformanceModifications(vehicle.id, 'mild');
        if (fallbackResult.success && fallbackResult.data.length > 0) {
          setPerformanceMods(fallbackResult.data);
          const detailsMap: Record<string, any> = {};
          for (const mod of fallbackResult.data) {
            if (mod.details) detailsMap[mod.name] = mod.details;
          }
          setModDetails((prev) => ({ ...prev, ...detailsMap }));
        }
      }

      /*
        Backfill top-up. This was gated on `tier === 'aggressive'` — so the
        owners most likely to exhaust a list were the only ones who ever got
        more generated, and everyone else quietly ran out. With tiers gone it
        runs for any car showing modifications.
      */
      ensureAggressiveModMinimum(vehicle.id).catch(() => {});
    };

    const handleIssueStatusUpdate = async (
      issueIdentifier: string,
      status: 'pending' | 'completed' | 'not_interested'
    ) => {
      setLoading(true);
      const result = await updateIssueStatus(
        vehicle.id,
        issueIdentifier,
        status,
        undefined,
        status === 'completed' ? new Date().toISOString().split('T')[0] : undefined
      );
      if (result.success) {
        toast.success('Issue status updated');
        await loadTracking();
        generateVehicleHealthSummary(vehicle.id, true).then(() => {
          invalidateDashboardCache(vehicle.id);
          router.refresh();
        });
        invalidateDashboardCache(vehicle.id);
        router.refresh();
      } else {
        toast.error('Failed to update issue status');
      }
      setLoading(false);
    };

    const handleWishlistToggleComplete = async () => {
      await loadTracking();
    };

    const triggerPerfStatsRecalc = () => {
      fetch('/api/v1/performance-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: vehicle.id }),
      }).catch(() => {});
    };

    const handleModStatusUpdate = async (
      modName: string,
      status: 'pending' | 'completed' | 'not_interested'
    ) => {
      if (status === 'completed') {
        setSelectedModForInstall(modName);
        setMaintenanceDialogOpen(true);
        return;
      }
      setLoading(true);
      const result = await updateModificationStatusWithTier(vehicle.id, modName, status);
      if (result.success) {
        if (status === 'not_interested' && result.backfillTriggered) {
          toast.success('Skipped — a replacement mod is being generated');
        } else {
          toast.success('Modification status updated');
        }

        await loadTracking();
        await loadPerformanceMods();
        invalidateDashboardCache(vehicle.id);
        triggerPerfStatsRecalc();
        router.refresh();
      } else {
        toast.error('Failed to update modification status');
      }
      setLoading(false);
    };

    const handleMarkFixedClick = (issueId: string, issueName: string) => {
      setSelectedIssue({ id: issueId, name: issueName });
      setIssueFixDialogOpen(true);
    };

    const handleIssueFixSubmit = async (data: {
      dateCompleted: string;
      shopName?: string;
      cost?: number;
      notes?: string;
    }) => {
      if (!selectedIssue) return;
      setLoading(true);
      const result = await updateIssueStatus(
        vehicle.id,
        selectedIssue.id,
        'completed',
        data.notes,
        data.dateCompleted,
        data.shopName,
        data.cost
      );
      if (result.success) {
        const historyResult = await addMaintenanceHistory(
          vehicle.id,
          selectedIssue.name,
          data.dateCompleted,
          data.shopName,
          data.cost,
          data.notes
        );
        if (historyResult.success) {
          toast.success('Issue fixed and added to maintenance history');
        } else {
          toast.success('Issue marked as fixed (history entry failed, but issue recorded)');
        }
        setIssueFixDialogOpen(false);
        setSelectedIssue(null);
        await loadTracking();
        invalidateDashboardCache(vehicle.id);
        router.refresh();
      } else {
        toast.error('Failed to mark issue as fixed');
      }
      setLoading(false);
    };

    const handleMaintenanceHistorySubmit = async (data: {
      dateCompleted: string;
      description: string;
      shopName?: string;
      cost?: number;
      notes?: string;
    }) => {
      setLoading(true);
      if (selectedModForInstall) {
        const modResult = await updateModificationStatusWithTier(
          vehicle.id,
          selectedModForInstall,
          'completed',
          data.notes,
          data.dateCompleted
        );
        if (!modResult.success) {
          toast.error('Failed to update modification status');
          setLoading(false);
          return;
        }
      }
      const result = await addMaintenanceHistory(
        vehicle.id,
        data.description,
        data.dateCompleted,
        data.shopName,
        data.cost,
        data.notes
      );
      if (result.success) {
        if (selectedModForInstall) {
          toast.success('Modification installed and added to maintenance history');
          setSelectedModForInstall('');
          triggerPerfStatsRecalc();
        } else {
          toast.success('Added to maintenance history');
        }
        setMaintenanceDialogOpen(false);
        setSelectedMaintenanceItem('');
        await loadTracking();
        await loadPerformanceMods();
        generateVehicleHealthSummary(vehicle.id, true).then(() => {
          invalidateDashboardCache(vehicle.id);
          router.refresh();
        });
        invalidateDashboardCache(vehicle.id);
        router.refresh();
      } else {
        toast.error('Failed to add maintenance history');
      }
      setLoading(false);
    };

    if (!knowledge || knowledge.research_status === 'pending') {
      /*
        ── The fourth fake indicator, found while replacing the third ────────

        This card drew three bars — "Issues Analysis", "Maintenance Schedule",
        "Performance Data" — filled to 33%, 53% and 73% by the expression
        `(i + 1) * 20 + 13`, and pulsed them. The widths were arithmetic on
        the array index. Nothing here measures research, which is one call to
        `generateVehicleDossier` with one outcome, so the card was showing
        three readings of a quantity it did not have, in the same paint the
        health dial uses for a reading it does. `b1e2baa` removed the quote
        panel's percentage on 30 Aug for exactly this; this one was a page
        away and nobody was watching a loader.

        What is true: which car, what comes back, and the one duration this
        product has measured — `VehicleResearchStatus` records ~60s of work
        against a 4s poll, and says "usually under a minute" from it. Same
        sentence here, because it is the same wait.
      */
      return (
        <Card className="cut-panel bg-[hsl(var(--card))] border-[color:var(--border)]">
          <CardContent className="py-10">
            <Working
              line="Researching this car"
              detail={`Common issues, maintenance intervals and recalls for a ${vehicle.year} ${vehicle.make} ${vehicle.model}. Usually under a minute — the rest of the page works now.`}
            />
          </CardContent>
        </Card>
      );
    }

    if (knowledge.research_status === 'failed') {
      /*
        The retry is the same wait as above, so it is the same instrument —
        the failure card only shows once the retry has also come back empty.
      */
      if (isAutoResearching) {
        return (
          <Card className="cut-panel bg-[hsl(var(--card))] border-[color:var(--border)]">
            <CardContent className="py-10">
              <Working
                line="Retrying the research"
                detail={`The first attempt did not finish. Common issues, maintenance intervals and recalls for a ${vehicle.year} ${vehicle.make} ${vehicle.model} — the rest of the page works now.`}
              />
            </CardContent>
          </Card>
        );
      }
      return (
        <Card className="bg-slate-900/50 border-yellow-400/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              Research Unavailable
            </CardTitle>
            <CardDescription className="text-slate-400">
              We encountered an issue researching your vehicle. You can still track maintenance manually.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    if (knowledge.research_status === 'unsupported') {
      return (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle>Limited Data Available</CardTitle>
            <CardDescription>
              We couldn&apos;t find enough information about your specific vehicle, but you can still use Tappet
              to track maintenance and get general advice.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const knownIssues = knowledge.known_issues || [];
    const maintenanceSchedule = knowledge.maintenance_schedule || [];

    const issuesBody = (
      <IssuesTab
        issues={knownIssues}
        /*
          Always true here — the early returns above send `pending`, `failed`
          and `unsupported` elsewhere. Passed anyway so the guarantee is stated
          rather than assumed by a component that cannot see this file.
        */
        researchComplete={knowledge.research_status === 'completed'}
        vehicleId={vehicle.id}
        issueTracking={issueTracking}
        savedItemNames={savedItemNames}
        loading={loading}
        onMarkFixed={handleMarkFixedClick}
        onNotApplicable={handleIssueStatusUpdate}
        onWishlistToggleComplete={handleWishlistToggleComplete}
      />
    );

    const maintenanceBody = (
      <MaintenanceTab
        schedule={maintenanceSchedule}
        vehicleId={vehicle.id}
        savedItemNames={savedItemNames}
        loading={loading}
        onAddToHistory={(itemName) => {
          setSelectedMaintenanceItem(itemName);
          setMaintenanceDialogOpen(true);
        }}
        onWishlistToggleComplete={handleWishlistToggleComplete}
      />
    );

    const modsBody = (
      <ModificationsTab
        vehicle={vehicle}
        performanceMods={performanceMods}
        modDetails={modDetails}
        modTracking={modTracking}
        savedItemNames={savedItemNames}
        loading={loading}
        loadingModNames={loadingModNames}
        onModStatusUpdate={handleModStatusUpdate}
        onWishlistToggleComplete={handleWishlistToggleComplete}
      />
    );

    /*
      The dialogs belong to the bodies, not to the container, so they ship with
      whichever section is on screen. Both are driven by state this component
      owns; rendering them only in the legacy branch is how a "mark fixed"
      button on a sectioned page would open nothing.
    */
    const dialogs = (
      <>
        <IssueFixDialog
          open={issueFixDialogOpen}
          onOpenChange={setIssueFixDialogOpen}
          issueName={selectedIssue?.name || ''}
          onSubmit={handleIssueFixSubmit}
          isLoading={loading}
        />
        <MaintenanceHistoryDialog
          open={maintenanceDialogOpen}
          onOpenChange={setMaintenanceDialogOpen}
          maintenanceItem={selectedModForInstall || selectedMaintenanceItem}
          isModInstallation={!!selectedModForInstall}
          onSubmit={handleMaintenanceHistorySubmit}
          isLoading={loading}
        />
      </>
    );

    if (section) {
      /*
        ⚠ `mods` answers to the same gate the dossier tab did. A person who told
        us the car is stock should not be shown a modifications surface, and the
        page that renders this section is expected to hide its own switcher too
        — a one-option control is not a control.
      */
      if (section === 'mods' && !modsVisible) {
        return (
          <>
            {switchOwner === 'section' ? (
              <RegisterSwitch vehicleId={vehicle.id as string} visible={modsVisible} onApply={setModsVisible} />
            ) : null}
            {dialogs}
          </>
        );
      }

      return (
        <>
          {section === 'mods' && switchOwner === 'section' ? (
            <RegisterSwitch
              vehicleId={vehicle.id as string}
              visible={modsVisible}
              className="mb-4"
              onApply={setModsVisible}
            />
          ) : null}
          {section === 'issues' ? issuesBody : section === 'maintenance' ? maintenanceBody : modsBody}
          {dialogs}
        </>
      );
    }

    return (
      <>
        <Card className="bg-slate-900/50 border-info-border">
          <CardHeader>
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-info" />
                The Dossier
              </CardTitle>
              <CardDescription className="text-slate-400">AI-researched insights for your vehicle</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={dossierTab} onValueChange={setDossierTab} className="w-full">
              {/*
                The way back. Why it must exist is in `RegisterSwitch`; what is
                dossier-specific is here.

                It sits beside the tabs rather than in them, and stays quiet in
                both directions: someone who said no should not be sold to
                every time they open the dossier, only shown that the door is
                unlocked.

                Shown in BOTH states as of v8 §6. It was one-way until then —
                which left "not interested" reversible exactly once, and only
                for people who had never changed their mind before.
              */}
              <RegisterSwitch
                vehicleId={vehicle.id as string}
                visible={modsVisible}
                className="mb-4"
                onApply={(next) => {
                  setModsVisible(next);
                  /*
                    Turning the surface off while standing on its tab would
                    leave the dossier on a tab that no longer exists. Moving
                    only in that case keeps a failed revert from yanking
                    somebody off whatever they were reading.
                  */
                  if (next) setDossierTab('mods');
                  else if (dossierTab === 'mods') setDossierTab('issues');
                }}
              />

              <TabsList className={`grid w-full ${dossierTabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} mb-4 bg-white/4 border border-white/8 p-0.5 rounded-xl`}>
                {dossierTabs.map((tabVal) => {
                  const isActive = dossierTab === tabVal;
                  const tabConfig = {
                    issues:      { Icon: AlertCircle, label: 'Issues',      count: knownIssues.length },
                    maintenance: { Icon: FileText,    label: 'Maintenance', count: maintenanceSchedule.length },
                    mods:        { Icon: Wrench,      label: 'Mods',        count: performanceMods.filter((m) => { const t = modTracking.find((tr) => tr.mod_name === m.name); return !t || t.status === 'pending'; }).length },
                  }[tabVal]!;
                  const { Icon, label, count } = tabConfig;
                  return (
                    <TabsTrigger
                      key={tabVal}
                      value={tabVal}
                      className={`relative flex items-center gap-1.5 rounded-lg py-2 transition-all duration-200 ${isActive ? 'bg-slate-800 text-white shadow-md' : 'text-white/50 hover:text-white/65 bg-transparent'}`}
                      style={isActive ? { boxShadow: '0 0 0 1px rgba(34,211,238,0.18), 0 1px 6px rgba(0,0,0,0.4)' } : undefined}
                    >
                      <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-cyan-400' : ''}`} />
                      <span className={`font-medium text-xs ${isActive ? 'text-white' : ''}`}>{label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${isActive ? 'bg-cyan-400/10 text-cyan-300' : 'bg-white/8 text-white/50'}`}>
                        {count}
                      </span>
                      {isActive && (
                        <span
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full"
                          style={{ background: '#22d3ee', boxShadow: '0 0 8px 1px rgba(34,211,238,0.55)' }}
                        />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="issues">{issuesBody}</TabsContent>
              <TabsContent value="maintenance">{maintenanceBody}</TabsContent>
              {modsVisible && <TabsContent value="mods">{modsBody}</TabsContent>}
            </Tabs>
          </CardContent>
        </Card>

        {dialogs}
      </>
    );
  }
);

VehicleInsights.displayName = 'VehicleInsights';
export default VehicleInsights;
