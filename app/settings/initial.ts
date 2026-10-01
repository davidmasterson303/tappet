import type { SettingsInitial } from './SettingsView';

type DistanceUnit = SettingsInitial['distanceUnit'];

/** The parts of `getProfile`'s answer the settings screen reads. */
export interface ProfileAnswer {
  success: boolean;
  profile?: { display_name?: string | null; distance_unit: DistanceUnit } | null;
  vehicleCount?: number;
  hasLiveSubscription?: boolean;
}

/**
 * `getProfile`'s answer in the shape `SettingsView` holds it.
 *
 * ⚠ Audit 360, LEGAL-15 (1 Oct). A failed profile read used to set
 * `hasLiveSubscription: false`, so the delete dialog showed no billing warning
 * exactly when the page could not say — while `getProfile` itself warns when
 * only the entitlement read fails, and the phone's route answers
 * `live: true, certain: false` when it cannot read. The notice is a sentence,
 * never a block: a non-subscriber reads one confusing line, a subscriber who
 * is not warned keeps being charged for an account that is gone. So a failed
 * (or thrown) read warns. `null` means the read threw.
 */
export function settingsInitialFrom(result: ProfileAnswer | null): SettingsInitial {
  const ok = result?.success === true;
  return {
    displayName: ok ? result.profile?.display_name ?? '' : '',
    distanceUnit: ok && result.profile ? result.profile.distance_unit : 'mi',
    vehicleCount: ok ? result.vehicleCount ?? 0 : 0,
    hasLiveSubscription: ok ? result.hasLiveSubscription ?? true : true,
  };
}
