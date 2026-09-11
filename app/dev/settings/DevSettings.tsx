'use client';

import { toast } from 'sonner';
import { SettingsView, type SettingsInitial } from '@/app/settings/SettingsView';

/**
 * `SettingsView` on a fixture profile, with actions that write nothing.
 *
 * ⚠ The values are plausible, not real: no account is read. The two actions
 * resolve success after a beat so the saving and exporting states render, and
 * say so in the toast — a dev surface that looked like it saved would be worse
 * than one that said it did not.
 */
const FIXTURE: SettingsInitial = {
  displayName: 'Ada',
  distanceUnit: 'mi',
  vehicleCount: 3,
  hasLiveSubscription: false,
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 600));

export default function DevSettings() {
  return (
    <SettingsView
      initial={FIXTURE}
      actions={{
        updateProfile: async () => {
          await settle();
          toast.message('Fixture — nothing was saved');
          return { success: true };
        },
        exportAccountData: async () => {
          await settle();
          toast.message('Fixture — nothing was exported');
          return { success: false, error: 'This is the dev surface; there is no account to export.' };
        },
      }}
    />
  );
}
