'use client';

import { useMyVehicles } from '@/hooks/useVehicles';
import { useAuth } from '@/components/AuthProvider';
import { GarageView } from './GarageView';

/**
 * `/garage` — the session's own vehicles, handed to `GarageView`.
 *
 * This file is the gate and the data; the screen lives in `GarageView.tsx`
 * so that `/dev/garage` can render the same component without a session (see
 * the docblock there). Anything visual belongs in the view, not here.
 */
export default function GaragePage() {
  const { loading: authLoading } = useAuth();
  const { data: vehicles = [], isLoading, error: queryError } = useMyVehicles();

  // The vehicle query is disabled until the session resolves, and a disabled
  // query is not "loading" as far as TanStack Query is concerned. Without
  // folding the auth state in, a user with a full garage sees "Your Garage is
  // Empty" for the moment before their session lands.
  const loading = authLoading || isLoading;

  const error = queryError?.message || null;

  return <GarageView vehicles={vehicles} loading={loading} error={error} />;
}
