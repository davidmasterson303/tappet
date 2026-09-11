'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download, Loader as Loader2, User, SlidersHorizontal, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog';
import { FormField } from '@/components/ui/form-field';
import { useScrollReveal, revealDelay } from '@/hooks/use-scroll-reveal';

/**
 * Account settings, as a view over a profile it is handed.
 *
 * Four groups, in the order a user looks for them: who you are, how the app
 * behaves, your data, and the irreversible one last. Account deletion lives
 * here rather than in a support flow because App Store Guideline 5.1.1(v)
 * requires it to be genuinely discoverable — Apple's own wording is that it
 * is "typically included in the app's account settings".
 *
 * Styling is entirely design-system tokens: surfaces via bg-card/bg-secondary,
 * text via foreground/muted-foreground, informational accents via --info, and
 * the danger group via the critical family. No ad-hoc colours — the point of
 * the token layer is that a palette change propagates here for free.
 *
 * ── ⚠ Why the page is split in two ──────────────────────────────────────────
 *
 * `/settings` is behind the middleware, so the design-critic loop's anonymous
 * capture could never reach it. The page keeps the gate, the profile load and
 * the spinner; this file keeps the screen, and `/dev/settings` renders it on a
 * fixture profile with actions that write nothing. See `GarageView.tsx` for the
 * lesson this follows, and `dev-surfaces-render-the-real-views.test.tsx` for
 * the guard that the dev route renders this component and not a copy.
 */
type DistanceUnit = 'mi' | 'km';

function SettingsSection({
  title,
  description,
  icon: Icon,
  index,
  children,
  tone = 'default',
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  index: number;
  children: React.ReactNode;
  tone?: 'default' | 'critical';
}) {
  const ref = useScrollReveal<HTMLElement>();
  const isCritical = tone === 'critical';

  return (
    <section
      ref={ref}
      className="scroll-reveal rounded-lg border bg-card p-4 sm:p-6 edge-light"
      style={{
        ...revealDelay(index),
        borderColor: isCritical ? 'var(--critical-border)' : undefined,
      }}
    >
      <div className="mb-5 flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${isCritical ? 'text-red-400' : 'text-info'}`}
          aria-hidden={true}
        />
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** What `getProfile` resolved, in the shape the view holds it. */
export interface SettingsInitial {
  displayName: string;
  distanceUnit: DistanceUnit;
  vehicleCount: number;
  hasLiveSubscription: boolean;
}

/**
 * The two writes the screen can make, injected so a surface without a session
 * can render this exact view with actions that go nowhere. `/settings` passes
 * the real server actions; `/dev/settings` passes stubs.
 */
export interface SettingsActions {
  updateProfile: (input: {
    display_name: string;
    distance_unit: DistanceUnit;
  }) => Promise<{ success: boolean; error?: string }>;
  exportAccountData: () => Promise<{
    success: boolean;
    error?: string;
    data?: { vehicles?: unknown } & Record<string, unknown>;
  }>;
}

export function SettingsView({
  initial,
  actions,
}: {
  initial: SettingsInitial;
  actions: SettingsActions;
}) {
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(initial.distanceUnit);
  const [vehicleCount, setVehicleCount] = useState(initial.vehicleCount);
  const hasLiveSubscription = initial.hasLiveSubscription;

  // Derived, not stored — a separate error state can drift out of sync with
  // the value it describes.
  const nameError =
    displayName.length > 60
      ? `Display names are 60 characters or fewer — this one has ${displayName.length}.`
      : null;

  async function handleSave() {
    if (nameError) return;
    setSaving(true);
    const result = await actions.updateProfile({ display_name: displayName, distance_unit: distanceUnit });
    setSaving(false);
    if (result.success) toast.success('Settings saved');
    else toast.error(result.error ?? 'Could not save settings');
  }

  async function handleExport() {
    setExporting(true);
    const result = await actions.exportAccountData();
    setExporting(false);

    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Could not export your data');
      return;
    }

    setVehicleCount(Array.isArray(result.data.vehicles) ? result.data.vehicles.length : 0);

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tappet-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-surface-nav">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 sm:px-6 py-4">
          <Link
            href="/garage"
            className="tap-target-44 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden={true} />
            Garage
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
        {/* The single display-serif element on this screen. */}
        <h1 className="display-serif mb-8 text-3xl text-foreground">Settings</h1>

        <div className="flex flex-col gap-5">
          <SettingsSection
            title="Profile"
            description="How you appear in the app."
            icon={User}
            index={0}
          >
            <FormField
              id="display-name"
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
              error={nameError}
              hint="Shown in the app. Up to 60 characters."
            />
          </SettingsSection>

          <SettingsSection
            title="Preferences"
            description="Units and formatting across the app."
            icon={SlidersHorizontal}
            index={1}
          >
            <div className="space-y-2">
              <Label className="text-muted-foreground">Distance</Label>
              <div className="flex gap-2" role="radiogroup" aria-label="Distance unit">
                {(['mi', 'km'] as DistanceUnit[]).map((unit) => {
                  const active = distanceUnit === unit;
                  return (
                    <button
                      key={unit}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDistanceUnit(unit)}
                      className={`tap-target-44 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-info-border bg-info-wash text-info-strong'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {unit === 'mi' ? 'Miles' : 'Kilometres'}
                    </button>
                  );
                })}
              </div>
            </div>
          </SettingsSection>

          <div className="flex justify-end">
            {/*
              ⚠ **UI-01, the worst of them.** `hover:bg-accent` with the default
              variant's `text-primary-foreground` renders "Save changes" at
              **1.72:1 while the pointer is on it** — illegible at exactly the
              moment somebody is about to press it.

              `bg-primary` was already the default variant's fill, so the whole
              override said nothing except "and make the hover unreadable".
            */}
            <Button onClick={handleSave} disabled={saving || Boolean(nameError)}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden={true} />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>

          <SettingsSection
            title="Your data"
            description="Download everything Tappet holds about you."
            icon={Download}
            index={2}
          >
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="border-border"
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden={true} />
                  Preparing…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" aria-hidden={true} />
                  Export my data
                </>
              )}
            </Button>
          </SettingsSection>

          <SettingsSection
            title="Delete account"
            description="Permanently remove your account and everything in it."
            icon={ShieldAlert}
            index={3}
            tone="critical"
          >
            <p className="mb-4 max-w-prose text-sm text-muted-foreground">
              This deletes your vehicles, maintenance history, uploaded invoices and consultant
              conversations. It cannot be undone, and we cannot recover it for you afterwards.
            </p>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="border-red-400/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              Delete my account
            </Button>
          </SettingsSection>
        </div>
      </main>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        vehicleCount={vehicleCount}
        hasLiveSubscription={hasLiveSubscription}
      />
    </div>
  );
}
