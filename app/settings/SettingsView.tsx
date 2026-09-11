'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader as Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog';
import { FormField } from '@/components/ui/form-field';
import { useScrollReveal, revealDelay } from '@/hooks/use-scroll-reveal';
import { PageOpener } from '@/components/PageOpener';
import { SignedInShell, AddVehicleAction } from '@/components/SignedInShell';

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
 * text via foreground/muted-foreground, and the danger group via the critical
 * family. No ad-hoc colours — the point of the token layer is that a palette
 * change propagates here for free.
 *
 * ── 11 Sep — the page joins the settled system ──────────────────────────────
 *
 * The first critique this page ever received (it sat behind the middleware
 * through two locked briefs) blind-ranked it 5th of 6 for two things: a serif
 * headline on a product whose display slot moved to a condensed grotesk on
 * 4 Sep, and a **third hue** — `text-red-400` on the delete button and its
 * shield, which is `#F87171`, the exact value `retired-palette-literals`
 * names as the retired critical red. It survived that guard because it was
 * spelled as a utility class rather than as hex. The delete group is on the
 * sodium axis now like every other alarm in the system, the headline is the
 * instrument voice under a mono eyebrow, and the four decorative section icons
 * — the critique's "decorative cyan icon beside every settings section" — are
 * gone. The way back is the eyebrow, `← Garage`, rather than a nav bar of its
 * own above the page.
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
  index,
  children,
  tone = 'default',
}: {
  title: string;
  description: string;
  index: number;
  children: React.ReactNode;
  tone?: 'default' | 'critical';
}) {
  const ref = useScrollReveal<HTMLElement>();
  const isCritical = tone === 'critical';

  /*
    A cut panel with a 12% hairline — B4/B7. This was `rounded-lg` with
    `edge-light`'s four-way gradient border, the one container on the page
    still at a radius while every control inside it took the cut.
  */
  return (
    <section
      ref={ref}
      className="scroll-reveal cut-panel border bg-card p-4 sm:p-6"
      style={{
        ...revealDelay(index),
        borderColor: isCritical ? 'var(--critical-border)' : 'rgb(255 255 255 / 0.12)',
      }}
    >
      <div className="mb-5">
        <h2
          className={`display-instrument display-instrument-narrow uppercase text-xl leading-none ${
            isCritical ? 'text-[color:var(--critical)]' : 'text-foreground'
          }`}
        >
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
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

  /*
    Dirty is derived too, for the same reason. Save is grey until something
    has actually changed (B7): a live Save beside untouched fields is a
    control that promises a write it has nothing to write.
  */
  const dirty = displayName !== initial.displayName || distanceUnit !== initial.distanceUnit;

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
    <SignedInShell actions={<AddVehicleAction />}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
        <PageOpener
          className="mb-10"
          eyebrow={
            <Link
              href="/garage"
              className="tap-target-44 relative inline-flex items-center gap-1.5 text-white/55 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden={true} />
              Garage
            </Link>
          }
          title="Settings"
          lede="Your profile, preferences and data."
        />

        <div className="flex flex-col gap-5">
          <SettingsSection
            title="Profile"
            description="How you appear in the app."
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
            index={1}
          >
            <div className="space-y-2">
              <Label className="text-muted-foreground">Distance</Label>
              {/*
                A two-segment cut control, mono, the selected segment off-white
                — B7. This was two pills with a cyan-tinted selection: cyan
                is information and focus here, not "chosen", and a pill is not
                a shape this system has.

                The visible label is the unit; the full word follows for a
                screen reader, so the accessible name still contains what is
                on screen (WCAG 2.5.3) and reads as a word rather than as two
                letters.
              */}
              <div
                className="chamfer-sm flex w-max border border-[color:var(--border-field)]"
                role="radiogroup"
                aria-label="Distance unit"
              >
                {(['mi', 'km'] as DistanceUnit[]).map((unit) => {
                  const active = distanceUnit === unit;
                  return (
                    <button
                      key={unit}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDistanceUnit(unit)}
                      className={`mono min-h-[44px] px-5 text-xs uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {unit}
                      <span className="sr-only">{unit === 'mi' ? ', miles' : ', kilometres'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SettingsSection>

          {/* The rule closes the editable group; Save sits beneath it — B7. */}
          <div className="flex justify-end border-t border-white/8 pt-5">
            {/*
              ⚠ **UI-01, the worst of them.** `hover:bg-accent` with the default
              variant's `text-primary-foreground` renders "Save changes" at
              **1.72:1 while the pointer is on it** — illegible at exactly the
              moment somebody is about to press it.

              `bg-primary` was already the default variant's fill, so the whole
              override said nothing except "and make the hover unreadable".
            */}
            <Button onClick={handleSave} disabled={saving || !dirty || Boolean(nameError)}>
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
            index={3}
            tone="critical"
          >
            <p className="mb-4 max-w-prose text-sm text-muted-foreground">
              This deletes your vehicles, maintenance history, uploaded invoices and consultant
              conversations. It cannot be undone, and we cannot recover it for you afterwards.
            </p>
            {/*
              Sodium outline, sodium wash on hover — B3. `border-red-400/40
              text-red-400 hover:bg-red-500/10` was the retired red family
              as utility classes; the alarm family is `--critical` and its
              wash, the same pair the landing's failed-load panel uses.
            */}
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="border-[color:var(--critical-border)] text-[color:var(--critical)] hover:border-[color:var(--critical)] hover:bg-[color:var(--critical-wash)]"
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
    </SignedInShell>
  );
}
