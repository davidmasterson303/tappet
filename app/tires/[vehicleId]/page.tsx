'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TireRotation, TireSet } from '@tappet/core/tires';
import { formatDateMono, formatMiles } from '@tappet/core/tires';
import DashboardLayout from '@/components/DashboardLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import TireRecord from '@/components/TireRecord';
import { TireIntervalDialog, TireRotationDialog, TireSetDialog } from '@/components/TireDialogs';
import { Working } from '@/components/Working';
import { Button } from '@/components/ui/button';
import { removeTireRotation, tireRecordsKey, useTireRecords } from '@/hooks/useTireRecords';
import { useVehicleImage } from '@/hooks/useSignedUrl';
import { getClientSupabase } from '@/lib/supabase';

/**
 * Tires — the fourth leaf, on the web.
 *
 * The phone puts the tire set under Garage → Vehicle beside Health · Service ·
 * Plan; the web's vehicle hub is the dashboard, so this page is reached from
 * it (`DashboardNextSteps`) rather than from the tab bar. The tab bar mirrors
 * the phone's — Dashboard · Service · Advisor · Plan — and the phone considered
 * a tires tab in all three design concepts and rejected it: the bar names
 * tenses and places, not objects, and a tab for one car's consumable is a
 * category error. So the page is off-nav, like Vehicle Info, and the
 * breadcrumb names it.
 *
 * Everything on it is `TireRecord`'s, which is `packages/core/src/tires.ts`'s.
 * The page owns the three dialogs and the query; the record owns nothing but
 * its props.
 */
export default function TiresPage({ params }: { params: { vehicleId: string } }) {
  const queryClient = useQueryClient();
  const [setDialog, setSetDialog] = useState<{ open: boolean; set: TireSet | null }>({ open: false, set: null });
  const [intervalDialog, setIntervalDialog] = useState<{ open: boolean; set: TireSet | null }>({ open: false, set: null });
  const [rotationDialog, setRotationDialog] = useState<{ open: boolean; set: TireSet | null; rotations: TireRotation[] }>({
    open: false,
    set: null,
    rotations: [],
  });

  const vehicleQuery = useQuery({
    queryKey: ['vehicle-row', params.vehicleId],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const supabase = getClientSupabase();
      const { data, error } = await supabase.from('vehicles').select('*').eq('id', params.vehicleId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Vehicle not found');
      return data;
    },
  });
  const tires = useTireRecords(params.vehicleId);
  const vehicleImage = useVehicleImage(vehicleQuery.data);

  const refresh = () => queryClient.invalidateQueries({ queryKey: tireRecordsKey(params.vehicleId) });

  async function remove(rotation: TireRotation) {
    const confirmed = window.confirm(
      `Remove the rotation of ${formatDateMono(rotation.rotatedOn)} at ${formatMiles(rotation.odometer)}? It comes off the record and the axis; there is no undo.`
    );
    if (!confirmed) return;
    try {
      await removeTireRotation(rotation.id);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Not removed.');
    }
  }

  if (vehicleQuery.isLoading || tires.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Working line="Opening the tire record" />
      </div>
    );
  }

  if (vehicleQuery.error || !vehicleQuery.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <p className="text-white/70">Could not load this vehicle.</p>
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const odometer = typeof vehicle.current_mileage === 'number' && vehicle.current_mileage > 0 ? vehicle.current_mileage : null;

  return (
    <ErrorBoundary>
      <DashboardLayout vehicle={vehicle} currentPage="tires" vehicleImage={vehicleImage}>
        {tires.data?.unavailable ? (
          <div className="space-y-2 py-8 text-center">
            <h2 className="display-instrument display-instrument-narrow text-[20px] uppercase text-white">
              Tire records are not switched on yet
            </h2>
            <p className="text-sm text-white/55">Nothing is wrong with this car. The record opens once they are.</p>
          </div>
        ) : tires.error ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-white/70">Could not load the tire record.</p>
            <Button variant="outline" onClick={() => void tires.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <TireRecord
            vehicleName={vehicleName}
            odometer={odometer}
            set={tires.data?.set ?? null}
            rotations={tires.data?.rotations ?? []}
            onAddSet={() => setSetDialog({ open: true, set: null })}
            onEditSet={(set) => setSetDialog({ open: true, set })}
            onEnterInterval={(set) => setIntervalDialog({ open: true, set })}
            onAddRotation={(set, rotations) => setRotationDialog({ open: true, set, rotations })}
            onRemoveRotation={(rotation) => void remove(rotation)}
          />
        )}

        <TireSetDialog
          open={setDialog.open}
          onOpenChange={(open) => setSetDialog((current) => ({ ...current, open }))}
          vehicleId={params.vehicleId}
          set={setDialog.set}
          onSaved={() => void refresh()}
        />
        <TireIntervalDialog
          open={intervalDialog.open}
          onOpenChange={(open) => setIntervalDialog((current) => ({ ...current, open }))}
          set={intervalDialog.set}
          onSaved={() => void refresh()}
        />
        <TireRotationDialog
          open={rotationDialog.open}
          onOpenChange={(open) => setRotationDialog((current) => ({ ...current, open }))}
          set={rotationDialog.set}
          rotations={rotationDialog.rotations}
          currentMileage={odometer}
          onSaved={() => void refresh()}
        />
      </DashboardLayout>
    </ErrorBoundary>
  );
}
