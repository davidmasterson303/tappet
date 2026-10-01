import { apiRequest, ApiRequestError } from './client';
import type { DeletionCounts } from '@tappet/core/account-deletion';

/**
 * Account operations. Currently one, and it is the one Apple reviews.
 *
 * App Store guideline 5.1.1(v) requires account deletion to be initiated from
 * inside the app. `DELETE /api/v1/account` is the route built for exactly this
 * — `deleteAccount` is a Next.js server action, and a React Native app cannot
 * call one, which is the same gap that made `/api/v1/consultant` necessary in
 * Phase 3.0.
 */

export interface DeleteAccountResult {
  deleted: DeletionCounts;
}

export interface AccountSubscription {
  /** Whether an App Store subscription is still running. */
  live: boolean;
  /**
   * False when the server could not read the entitlement and defaulted to
   * warning. The screen shows the same notice either way — a warning withheld
   * from a subscriber is a charge they cannot stop, where a warning shown to a
   * non-subscriber is a confusing sentence — but the flag is carried so a log
   * or a support conversation can tell the two apart.
   */
  certain: boolean;
  /**
   * Whether Apple is charging for it (21 Sep). False for a comped grant, which
   * has no transaction — the deletion warning names Apple and must not on
   * one. Absent from an older API, which the screen reads as "assume so":
   * a warning shown to a comped account is a confusing sentence, a warning
   * withheld from a subscriber is a charge they cannot stop.
   */
  billedByApple?: boolean;
  /** The period's end, when live; absent from an older API. See `subscriptionStatusLine`. */
  until?: string | null;
  /** Apple's auto-renew flag, when live; display only. */
  renews?: boolean | null;
}

/**
 * What the delete screen needs to know before it asks.
 *
 * Deliberately fails to `live: false` on a network error rather than throwing:
 * the account screen's job is deletion, and blocking it because a secondary
 * read failed would obstruct the one flow Apple requires to work. The tradeoff
 * is stated where it is made — see `AccountScreen`.
 */
export async function getSubscription(): Promise<AccountSubscription> {
  try {
    const response = await apiRequest<{ subscription?: AccountSubscription }>('/account', {
      method: 'GET',
    });
    return response.subscription ?? { live: false, certain: false };
  } catch {
    return { live: false, certain: false };
  }
}

/**
 * Delete the signed-in account and everything belonging to it.
 *
 * **The caller must clear the local session afterwards.** The bearer token
 * names an auth user that no longer exists, so nothing will ever come back and
 * tell the app it is signed out — a later request simply 401s. The route's own
 * docblock says the same thing and names `signOut` as the mobile half.
 *
 * Errors surface as `ApiRequestError` with the server's message, which those
 * routes write to be shown.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  let response: { success: boolean; deleted?: DeletionCounts };
  try {
    response = await apiRequest<{ success: boolean; deleted?: DeletionCounts }>('/account', {
      method: 'DELETE',
      timeoutMs: DELETE_TIMEOUT_MS,
    });
  } catch (error) {
    /*
      ⚠ 1 Oct · audit 360, TL-7 · a deletion whose answer was lost.

      The purge is inline — every object under every car, then the auth user
      — and an account with a few cars and receipts can outlive any bound.
      At the default 20 s the phone said "did not answer", kept the session,
      and left the owner signed in to an account that no longer existed,
      every screen answering "could not confirm who you are". So a lost
      answer asks: a 401 for the account means it is gone, and the caller
      signs out as it would on success. Anything else is the original error.
    */
    if (error instanceof ApiRequestError && (error.kind === 'timeout' || error.kind === 'offline')) {
      if (await accountIsGone()) return { deleted: { vehicles: 0, storageObjects: 0 } };
    }
    throw error;
  }

  return {
    // A successful delete with no counts is possible — an account with nothing
    // in it — and is not an error. `describeDeletion` handles the zero case.
    deleted: response.deleted ?? { vehicles: 0, storageObjects: 0 },
  };
}

/**
 * Longer than any purge measured, and well inside the phone's patience for
 * the one irreversible act it performs (audit 360, TL-7).
 */
export const DELETE_TIMEOUT_MS = 90_000;

/** Whether the server no longer knows this account — a 401 to the read. */
async function accountIsGone(): Promise<boolean> {
  try {
    await apiRequest('/account', { method: 'GET' });
    return false;
  } catch (probe) {
    return probe instanceof ApiRequestError && probe.status === 401;
  }
}
