'use client';

import { GarageView } from '@/app/garage/GarageView';
import { useDemoVehicles } from '@/hooks/useVehicles';

/** The garage's three states, each a screenshot the design loop can ask for. */
export type DevGarageState = 'demo' | 'empty' | 'error' | 'loading';

/**
 * `GarageView` without a session.
 *
 * The data is the demo garage's **real rows** — `useDemoVehicles` is the query
 * `/` runs anonymously — so nothing here is invented and nothing can lie the
 * way a hand-typed fixture can (see `apps/mobile/src/dev/fixtures.ts` for what
 * that cost). `state` overrides the data only to reach the two states the demo
 * rows never produce.
 */
export default function DevGarage({ state }: { state: DevGarageState }) {
  const { data: vehicles = [], isLoading, error } = useDemoVehicles();

  if (state === 'loading') return <GarageView vehicles={[]} loading error={null} />;
  if (state === 'empty') return <GarageView vehicles={[]} loading={false} error={null} />;
  if (state === 'error') {
    return (
      <GarageView
        vehicles={[]}
        loading={false}
        error="Could not reach the garage. This is the error state, rendered on purpose."
      />
    );
  }
  return <GarageView vehicles={vehicles} loading={isLoading} error={error?.message ?? null} />;
}
