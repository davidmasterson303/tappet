'use client';

import { useQuery } from '@tanstack/react-query';
import { useMyVehicles } from '@/hooks/useVehicles';
import { useAuth } from '@/components/AuthProvider';
import { getProfile } from '@/app/account-actions';
import { GarageView } from './GarageView';

/**
 * `/garage` — the session's own vehicles, handed to `GarageView`.
 *
 * This file is the gate and the data; the screen lives in `GarageView.tsx`
 * so that `/dev/garage` can render the same component without a session (see
 * the docblock there). Anything visual belongs in the view, not here.
 *
 * ── The eyebrow's name — 11 Sep ─────────────────────────────────────────────
 *
 * The view's eyebrow reads SIGNED IN AS and a name. It is the profile's
 * `display_name` — the value settings lets someone set, and until now the
 * only place it was ever shown was the settings field itself. Not
 * `user.email`: the round-three critique read a lowercase address inside a
 * tracked uppercase line as the wrong register, and it was — the email is
 * the account's identifier, not what the person asked to be called.
 *
 * `getProfile` is the settings page's own read, cached under `['profile',
 * userId]` for five minutes so the garage does not re-ask on every visit;
 * `SettingsView` invalidates that key when a save succeeds, so a new name
 * shows the next time the garage renders. Sign-out clears the whole cache
 * (`lib/sign-out.ts`), and the key carries the user id so two accounts in
 * one tab cannot share an entry. While the read is in flight the eyebrow
 * says only SIGNED IN, which is true.
 *
 * The key is spelled here and in `SettingsView` rather than exported: a
 * Next page module may export nothing but its page conventions.
 */
export default function GaragePage() {
  const { user, loading: authLoading } = useAuth();
  const { data: vehicles = [], isLoading, error: queryError } = useMyVehicles();

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id ?? null],
    enabled: !authLoading && !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await getProfile();
      return result.success ? result.profile : null;
    },
  });

  // The vehicle query is disabled until the session resolves, and a disabled
  // query is not "loading" as far as TanStack Query is concerned. Without
  // folding the auth state in, a user with a full garage sees "Your Garage is
  // Empty" for the moment before their session lands.
  const loading = authLoading || isLoading;

  const error = queryError?.message || null;

  return (
    <GarageView
      vehicles={vehicles}
      loading={loading}
      error={error}
      owner={profile?.display_name ?? null}
    />
  );
}
