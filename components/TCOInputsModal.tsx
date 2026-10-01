'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, Check, Fuel, ShieldCheck, Gauge, AlertTriangle } from 'lucide-react';
import { updateVehicleTCOFields } from '@/app/actions';
import { COULD_NOT_SAVE, NO_ANSWER, answerSentence } from '@/lib/api-error-copy';

interface TCOInputsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicle: any;
  onSaved?: (updated: { purchase_price: number | null; avg_mpg: number | null; fuel_price_per_gallon: number | null; insurance_monthly: number | null }) => void;
}

const FIELDS = [
  { key: 'purchase_price', label: 'Purchase price', placeholder: 'e.g. 28000', prefix: '$', icon: DollarSign, hint: 'What you paid (or market value)' },
  { key: 'avg_mpg', label: 'Average MPG', placeholder: 'e.g. 28', prefix: null, icon: Gauge, hint: 'Combined city/highway estimate' },
  { key: 'fuel_price_per_gallon', label: 'Fuel price per gallon', placeholder: 'e.g. 3.89', prefix: '$', icon: Fuel, hint: 'Your local average' },
  { key: 'insurance_monthly', label: 'Monthly insurance', placeholder: 'e.g. 120', prefix: '$', icon: ShieldCheck, hint: 'Full coverage monthly premium' },
] as const;

type FieldKey = typeof FIELDS[number]['key'];

export const NEGATIVE_FIGURE = 'Each figure is a number of zero or more. Correct the negative one and save again.';

export default function TCOInputsModal({ open, onOpenChange, vehicleId, vehicle, onSaved }: TCOInputsModalProps) {
  const [fields, setFields] = useState({
    purchase_price: '',
    avg_mpg: '',
    fuel_price_per_gallon: '',
    insurance_monthly: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** What the server answered when it did not save, in its own words. */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (vehicle) {
      setFields({
        purchase_price: vehicle.purchase_price != null ? String(vehicle.purchase_price) : '',
        avg_mpg: vehicle.avg_mpg != null ? String(vehicle.avg_mpg) : '',
        fuel_price_per_gallon: vehicle.fuel_price_per_gallon != null ? String(vehicle.fuel_price_per_gallon) : '',
        insurance_monthly: vehicle.insurance_monthly != null ? String(vehicle.insurance_monthly) : '',
      });
    }
  }, [vehicle?.id, open]);

  /*
    ── Audit 360, UX-21 (1 Oct) · Saved only when it was ──────────────────────

    This awaited \`updateVehicleTCOFields\`, discarded the answer, and showed a
    green *Saved* — then pushed the typed numbers into the page's cost
    figures. The action never throws: a lapsed session, a refused patch (a
    negative price, SEC-14) and a failed write all answer \`success: false\`.
    So an owner read figures recomputed from numbers that were never stored,
    and the next load quietly put the old ones back. Now the answer is read:
    a refusal keeps the dialog open with the server's sentence, and only a
    save that landed says *Saved* and repaints the page. A request that threw
    may still have landed, and says so (\`NO_ANSWER\`).
  */
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const parsed = {
        purchase_price: fields.purchase_price ? parseFloat(fields.purchase_price) : null,
        avg_mpg: fields.avg_mpg ? parseFloat(fields.avg_mpg) : null,
        fuel_price_per_gallon: fields.fuel_price_per_gallon ? parseFloat(fields.fuel_price_per_gallon) : null,
        insurance_monthly: fields.insurance_monthly ? parseFloat(fields.insurance_monthly) : null,
      };
      /*
        The server refuses a negative figure with its general "could not
        save… try again", which trying again will not fix. Said here, before
        the request, in words that will.
      */
      if (Object.values(parsed).some((value) => value !== null && !(value >= 0))) {
        setError(NEGATIVE_FIGURE);
        return;
      }
      const result = await updateVehicleTCOFields(vehicleId, parsed);
      if (!result?.success) {
        setError(answerSentence(result, COULD_NOT_SAVE));
        return;
      }
      setSaved(true);
      onSaved?.(parsed);
      setTimeout(() => {
        setSaved(false);
        onOpenChange(false);
      }, 1200);
    } catch {
      setError(NO_ANSWER);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <DollarSign className="h-5 w-5 text-info" />
            Cost of ownership inputs
          </DialogTitle>
          <DialogDescription className="text-xs text-white/50 mt-1">
            These figures power your real-world cost-per-mile and TCO breakdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {FIELDS.map(({ key, label, placeholder, prefix, icon: Icon, hint }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-white/35" />
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">{label}</label>
              </div>
              <div className="relative">
                {prefix && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/50 pointer-events-none select-none">
                    {prefix}
                  </span>
                )}
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder={placeholder}
                  value={fields[key as FieldKey]}
                  onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                  className={`bg-white/5 border-white/10 text-white placeholder:text-white/50 focus:border-cyan-400/50 h-10 ${prefix ? 'pl-7' : ''}`}
                />
              </div>
              <p className="text-xs text-white/50 leading-none">{hint}</p>
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2.5 p-3.5 mt-4 bg-red-500/10 border border-red-400/25 rounded-xl">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-white/12 text-white/50 hover:text-white hover:bg-white/6 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || saved}
            className={`flex-1 text-sm transition-all duration-200 ${saved ? 'bg-emerald-600 hover:bg-emerald-600 text-primary-foreground' : 'bg-primary hover:bg-primary/90 text-primary-foreground'}`}
          >
            {saved ? (
              <><Check className="h-4 w-4 mr-1.5" />Saved</>
            ) : saving ? (
              'Saving...'
            ) : (
              'Save changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
