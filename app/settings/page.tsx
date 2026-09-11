'use client';

import { useEffect, useState } from 'react';
import { Loader as Loader2 } from 'lucide-react';
import { getProfile, updateProfile, exportAccountData } from '@/app/account-actions';
import { SettingsView, type SettingsInitial } from './SettingsView';

/**
 * `/settings` — load the profile, then hand it to `SettingsView`.
 *
 * This file is the gate and the data; the screen lives in `SettingsView.tsx`
 * so that `/dev/settings` can render the same component without a session (see
 * the docblock there). Anything visual belongs in the view, not here.
 */
export default function SettingsPage() {
  const [initial, setInitial] = useState<SettingsInitial | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getProfile();
      if (cancelled) return;
      setInitial({
        displayName: result.success ? result.profile?.display_name ?? '' : '',
        distanceUnit: result.success && result.profile ? result.profile.distance_unit : 'mi',
        vehicleCount: result.success ? result.vehicleCount ?? 0 : 0,
        hasLiveSubscription: result.success ? result.hasLiveSubscription ?? false : false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!initial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-info" aria-hidden={true} />
      </div>
    );
  }

  return <SettingsView initial={initial} actions={{ updateProfile, exportAccountData }} />;
}
