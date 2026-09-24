'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  draftFromTireSet,
  emptyRotationDraft,
  emptyTireSetDraft,
  formatMiles,
  parseWholeMiles,
  rotationPayload,
  rotationProblems,
  tireSetPayload,
  tireSetProblems,
  type RotationDraft,
  type TireRotation,
  type TireSet,
  type TireSetDraft,
  type TireSetField,
} from '@tappet/core/tires';
import { localToday } from '@tappet/core/garage-next-service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { addTireRotation, createTireSet, updateTireSet } from '@/hooks/useTireRecords';

/**
 * The three entry dialogs — the phone's three entry screens, as dialogs.
 *
 * Every rule they apply is core's (`tireSetProblems`, `rotationProblems`),
 * proved in `lib/__tests__/tires.test.ts` and applied again by the route, so
 * the web, the phone and the server cannot disagree about what may be saved.
 * Problems appear after the first attempt to save, not while typing — the
 * phone's rule, for the phone's reason.
 *
 * ── The interval is asked, never assumed ────────────────────────────────────
 *
 * No placeholder figure, no default, no "typical" chip. The hint names the
 * warranty card because only the card can source the sentence the push sends.
 */

type Problems<F extends string> = Array<{ field: F; message: string }>;

function problemFor<F extends string>(problems: Problems<F>, shown: boolean, field: F): string | undefined {
  return shown ? problems.find((p) => p.field === field)?.message : undefined;
}

export function TireSetDialog({
  open,
  onOpenChange,
  vehicleId,
  set,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  /** Present when editing. */
  set: TireSet | null;
  onSaved: () => void;
}) {
  const today = localToday();
  const [draft, setDraft] = useState<TireSetDraft>(() => (set ? draftFromTireSet(set) : emptyTireSetDraft()));
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);

  /* A fresh draft per opening — the dialog is mounted for the page's lifetime (CLAUDE.md §6). */
  useEffect(() => {
    if (open) {
      setDraft(set ? draftFromTireSet(set) : emptyTireSetDraft());
      setShown(false);
    }
  }, [open, set]);

  const problems = useMemo(() => tireSetProblems(draft, today), [draft, today]);
  const patch = (change: Partial<TireSetDraft>) => setDraft((current) => ({ ...current, ...change }));
  const field = (name: TireSetField) => problemFor(problems, shown, name);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setShown(true);
    if (problems.length > 0) return;
    setSaving(true);
    try {
      const payload = tireSetPayload(draft);
      if (set) await updateTireSet(set.id, payload);
      else await createTireSet(vehicleId, payload);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That was not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{set ? 'What you entered' : 'Add a tire set'}</DialogTitle>
          <DialogDescription>
            {set
              ? 'Change what you entered about this set. Tappet derives everything else from it.'
              : 'What is on the sidewall and the receipt. Leave blank what you do not know — Tappet will not fill it in.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Brand" value={draft.brand} onChange={(e) => patch({ brand: e.target.value })} error={field('brand')} placeholder="Michelin" />
            <FormField label="Tire" hint="the name on the sidewall" value={draft.line} onChange={(e) => patch({ line: e.target.value })} error={field('line')} placeholder="Pilot Sport 4S" />
            <FormField label="Size, front" value={draft.sizeFront} onChange={(e) => patch({ sizeFront: e.target.value })} error={field('sizeFront')} placeholder="245/35R19" />
            <FormField label="Size, rear" hint="blank if the same" value={draft.sizeRear} onChange={(e) => patch({ sizeRear: e.target.value })} error={field('sizeRear')} />
            <FormField label="Installed on" hint="optional" type="date" max={today} value={draft.installedOn} onChange={(e) => patch({ installedOn: e.target.value })} error={field('installedOn')} />
            <FormField label="Odometer at install" hint="optional · without it, no axis" inputMode="numeric" value={draft.installOdometer} onChange={(e) => patch({ installOdometer: e.target.value })} error={field('installOdometer')} />
            <FormField label="Bought at" hint="optional" value={draft.purchasePlace} onChange={(e) => patch({ purchasePlace: e.target.value })} error={field('purchasePlace')} />
            <FormField label="Treadwear mileage" hint="optional · as printed" inputMode="numeric" value={draft.treadwearMilesEntered} onChange={(e) => patch({ treadwearMilesEntered: e.target.value })} error={field('treadwearMilesEntered')} />
          </div>
          <FormField
            label="Rotation interval, miles"
            hint="from your warranty card — Tappet will not guess one"
            inputMode="numeric"
            value={draft.rotationIntervalMiles}
            onChange={(e) => patch({ rotationIntervalMiles: e.target.value })}
            error={field('rotationIntervalMiles')}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving' : set ? 'Save the changes' : 'Save the set'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TireIntervalDialog({
  open,
  onOpenChange,
  set,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  set: TireSet | null;
  onSaved: () => void;
}) {
  const today = localToday();
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(set?.rotationIntervalMiles === null || set?.rotationIntervalMiles === undefined ? '' : String(set.rotationIntervalMiles));
      setShown(false);
    }
  }, [open, set]);

  const problem = useMemo(() => {
    if (!set) return undefined;
    if (value.trim().length === 0) return 'Enter the interval from your warranty card.';
    return tireSetProblems({ ...draftFromTireSet(set), rotationIntervalMiles: value }, today).find(
      (p) => p.field === 'rotationIntervalMiles'
    )?.message;
  }, [value, set, today]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setShown(true);
    if (!set || problem) return;
    setSaving(true);
    try {
      await updateTireSet(set.id, { rotationIntervalMiles: parseWholeMiles(value) ?? null });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That was not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter the interval</DialogTitle>
          <DialogDescription>
            The rotation interval on your warranty card. Tappet holds this set to it and tells you when you are past
            it. Until you enter one, the set has no obligation and nothing is due.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          <FormField
            label="Rotation interval, miles"
            hint="from your warranty card"
            inputMode="numeric"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={shown ? problem : undefined}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving' : 'Save the interval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TireRotationDialog({
  open,
  onOpenChange,
  set,
  rotations,
  currentMileage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  set: TireSet | null;
  rotations: TireRotation[];
  currentMileage: number | null;
  onSaved: () => void;
}) {
  const today = localToday();
  const [draft, setDraft] = useState<RotationDraft>(() => emptyRotationDraft(today, currentMileage));
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(emptyRotationDraft(today, currentMileage));
      setShown(false);
    }
  }, [open, today, currentMileage]);

  const problems = useMemo(
    () => (set ? rotationProblems(draft, { today, set, rotations }) : []),
    [draft, today, set, rotations]
  );
  const floor = Math.max(set?.installOdometer ?? 0, ...rotations.map((r) => r.odometer));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setShown(true);
    if (!set || problems.length > 0) return;
    setSaving(true);
    try {
      await addTireRotation(set.id, rotationPayload(draft));
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That was not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a rotation</DialogTitle>
          <DialogDescription>
            {set ? `${set.brand} ${set.line}. ` : ''}When were the tires rotated, and what did the odometer read?
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          <FormField
            label="Rotated on"
            type="date"
            max={today}
            value={draft.rotatedOn}
            onChange={(e) => setDraft((current) => ({ ...current, rotatedOn: e.target.value }))}
            error={problemFor(problems, shown, 'rotatedOn')}
          />
          <FormField
            label="Odometer, miles"
            hint={floor > 0 ? `at least ${formatMiles(floor).toLowerCase()}` : undefined}
            inputMode="numeric"
            value={draft.odometer}
            onChange={(e) => setDraft((current) => ({ ...current, odometer: e.target.value }))}
            error={problemFor(problems, shown, 'odometer')}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving' : 'Log the rotation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
