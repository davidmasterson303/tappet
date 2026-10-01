'use client';

import { useEffect, useState } from 'react';
import { Working } from '@/components/Working';
import { getProfile, updateProfile, exportAccountData } from '@/app/account-actions';
import { SettingsView, type SettingsInitial } from './SettingsView';
import { settingsInitialFrom, type ProfileAnswer } from './initial';

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
      // A thrown read is a failed read: the page still opens, and warns (LEGAL-15).
      const result = await getProfile().catch(() => null);
      if (cancelled) return;
      setInitial(settingsInitialFrom(result as ProfileAnswer | null));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!initial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Working delay line="Opening settings" />
      </div>
    );
  }

  return <SettingsView initial={initial} actions={{ updateProfile, exportAccountData }} />;
}
