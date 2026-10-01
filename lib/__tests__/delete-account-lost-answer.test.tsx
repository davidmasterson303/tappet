/**
 * A web deletion whose answer was lost is settled by asking (audit 360, TL-25).
 *
 * @jest-environment jsdom
 *
 * The phone's TL-7, on the web. `deleteAccount()` throws only when the answer
 * was lost (connection, or the platform's ceiling on a long purge). Before the
 * fix the rejection was unhandled: the dialog stayed on "Deleting" with
 * Cancel disabled and could not be closed, while the account was already
 * gone. Rendered, with the server action and the auth client mocked.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn() }),
}));

const toasts: Array<{ kind: 'success' | 'error'; message: string }> = [];
jest.mock('sonner', () => ({
  toast: {
    success: (message: string) => toasts.push({ kind: 'success', message }),
    error: (message: string) => toasts.push({ kind: 'error', message }),
  },
}));

const deleteAccount = jest.fn();
jest.mock('@/app/account-actions', () => ({ deleteAccount: () => deleteAccount() }));

const getUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getUser: () => getUser() } }),
}));

const signOutAndClearCache = jest.fn(async () => {});
jest.mock('@/lib/sign-out', () => ({
  signOutAndClearCache: (...args: unknown[]) => signOutAndClearCache(...(args as [])),
}));

import { DeleteAccountDialog } from '@/components/DeleteAccountDialog';
import {
  DELETION_NOT_FINISHED,
  DELETION_OUTCOME_UNKNOWN,
  classifyAccountProbe,
} from '@/lib/account-gone';

beforeEach(() => {
  toasts.length = 0;
  push.mockReset();
  deleteAccount.mockReset();
  getUser.mockReset();
  signOutAndClearCache.mockClear();
});

async function confirmAndDelete() {
  render(<DeleteAccountDialog open onOpenChange={() => {}} vehicleCount={2} />);
  fireEvent.change(screen.getByLabelText(/to\s*confirm/i), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
}

function cancelButton() {
  return screen.getByRole('button', { name: /^cancel$/i });
}

describe('DeleteAccountDialog — a lost answer (TL-25)', () => {
  it('signs out and says deleted when the auth server no longer knows the user', async () => {
    deleteAccount.mockRejectedValue(new TypeError('Failed to fetch'));
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 403, code: 'user_not_found', name: 'AuthApiError' },
    });

    await confirmAndDelete();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(signOutAndClearCache).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual([
      { kind: 'success', message: 'Your account and all its data have been deleted.' },
    ]);
  });

  it('re-enables the buttons and says it is still here when the user still exists', async () => {
    deleteAccount.mockRejectedValue(new Error('An unexpected response was received from the server.'));
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    await confirmAndDelete();

    await waitFor(() => expect(toasts).toEqual([{ kind: 'error', message: DELETION_NOT_FINISHED }]));
    expect(cancelButton()).not.toBeDisabled();
    expect(signOutAndClearCache).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('never reads an unanswered check as deleted', async () => {
    deleteAccount.mockRejectedValue(new TypeError('Failed to fetch'));
    getUser.mockRejectedValue(new TypeError('Failed to fetch'));

    await confirmAndDelete();

    await waitFor(() => expect(toasts).toEqual([{ kind: 'error', message: DELETION_OUTCOME_UNKNOWN }]));
    expect(cancelButton()).not.toBeDisabled();
    expect(signOutAndClearCache).not.toHaveBeenCalled();
  });

  it('never reads a revoked session as a deleted account (SEC-16)', async () => {
    deleteAccount.mockRejectedValue(new TypeError('Failed to fetch'));
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 400, code: 'refresh_token_not_found', name: 'AuthApiError' },
    });

    await confirmAndDelete();

    await waitFor(() => expect(toasts).toEqual([{ kind: 'error', message: DELETION_OUTCOME_UNKNOWN }]));
    expect(signOutAndClearCache).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('anti-vacuous: a returned failure still shows its own sentence and never probes', async () => {
    deleteAccount.mockResolvedValue({ success: false, error: 'Could not read account contents. Nothing was deleted.' });

    await confirmAndDelete();

    await waitFor(() =>
      expect(toasts).toEqual([
        { kind: 'error', message: 'Could not read account contents. Nothing was deleted.' },
      ])
    );
    expect(getUser).not.toHaveBeenCalled();
    expect(cancelButton()).not.toBeDisabled();
  });

  it('anti-vacuous: a clean success names what went', async () => {
    deleteAccount.mockResolvedValue({ success: true, deleted: { vehicles: 2, storageObjects: 5 } });

    await confirmAndDelete();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(toasts[0]).toEqual({
      kind: 'success',
      message: 'Your account has been deleted, along with 2 vehicles and 5 files.',
    });
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe('classifyAccountProbe', () => {
  it.each([
    [{ status: 403, code: 'user_not_found' }, 'gone'],
    // SEC-16 (round 3): each of these is about the session, and a living
    // account produces it — production answered 403 `bad_jwt` and 400
    // `refresh_token_not_found` with no account involved at all (1 Oct).
    [{ status: 403, code: 'session_not_found' }, 'unknown'],
    [{ status: 400, code: 'refresh_token_not_found' }, 'unknown'],
    [{ status: 403, code: 'bad_jwt' }, 'unknown'],
    [{ status: 401 }, 'unknown'],
    [{ status: 403 }, 'unknown'],
    [{ status: 404 }, 'unknown'],
    [{ status: 400, name: 'AuthSessionMissingError' }, 'unknown'],
    [{ status: 500 }, 'unknown'],
    [{ status: 0, name: 'AuthRetryableFetchError' }, 'unknown'],
    [{}, 'unknown'],
  ] as const)('%j → %s', (error, verdict) => {
    expect(classifyAccountProbe(null, error)).toBe(verdict);
  });

  it('a user with no error is present', () => {
    expect(classifyAccountProbe({ id: 'u' }, null)).toBe('present');
  });

  it('no user and no error is not a reading of gone (SEC-16)', () => {
    expect(classifyAccountProbe(null, null)).toBe('unknown');
  });
});
