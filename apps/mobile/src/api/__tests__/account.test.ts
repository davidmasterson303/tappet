import { apiRequest, ApiRequestError } from '../client';
import { DELETE_TIMEOUT_MS, deleteAccount, getSubscription, SUBSCRIPTION_UNREAD } from '../account';

/**
 * Audit 360, TL-7 (1 Oct) — a deletion whose answer was lost.
 *
 * `DELETE /account` ran on the default 20 s bound while the server purged
 * every object under every car inline. A purge that outlived it left the
 * phone signed in to a deleted account. The bound is the purge's now, and a
 * lost answer is settled by asking: a 401 means the account is gone.
 */

jest.mock('../client', () => {
  const actual = jest.requireActual('../client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const timedOut = () => new ApiRequestError({ status: 0, message: 'Tappet did not answer within 90 seconds.', kind: 'timeout' });

beforeEach(() => request.mockReset());

describe('deleteAccount — audit 360, TL-7', () => {
  it('waits as long as a purge takes, not the default 20 s', async () => {
    request.mockResolvedValue({ success: true, deleted: { vehicles: 3, storageObjects: 40 } } as never);
    await expect(deleteAccount()).resolves.toEqual({ deleted: { vehicles: 3, storageObjects: 40 } });
    expect(request).toHaveBeenCalledWith('/account', { method: 'DELETE', timeoutMs: DELETE_TIMEOUT_MS });
    expect(DELETE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('reports the deletion when the answer was lost and the account is gone', async () => {
    request.mockImplementation(async (_path, init) => {
      if ((init as { method?: string }).method === 'DELETE') throw timedOut();
      throw new ApiRequestError({ status: 401, message: 'Unauthorized' });
    });
    await expect(deleteAccount()).resolves.toEqual({ deleted: { vehicles: 0, storageObjects: 0 } });
    expect(request).toHaveBeenCalledWith('/account', { method: 'GET' });
  });

  it('keeps the failure when the account is still there (anti-vacuous)', async () => {
    request.mockImplementation(async (_path, init) => {
      if ((init as { method?: string }).method === 'DELETE') throw timedOut();
      return { subscription: { live: false, certain: true } } as never;
    });
    await expect(deleteAccount()).rejects.toThrow('did not answer');
  });

  it('does not probe after a refusal the server did answer', async () => {
    request.mockRejectedValue(new ApiRequestError({ status: 500, message: 'Could not delete' }));
    await expect(deleteAccount()).rejects.toThrow('Could not delete');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('getSubscription — audit 360, LEGAL-15', () => {
  /*
    A failed read used to resolve to "no subscription", so the deletion
    warning disappeared exactly when the phone could not say. It now fails the
    way the server does when it cannot read: warn, and say it is not certain.
  */
  it('warns when the read fails, rather than saying there is no subscription', async () => {
    request.mockRejectedValue(timedOut());
    await expect(getSubscription()).resolves.toEqual({ live: true, certain: false });
    expect(SUBSCRIPTION_UNREAD).toEqual({ live: true, certain: false });
  });

  it('warns when an answer carries no subscription at all', async () => {
    request.mockResolvedValue({ success: true } as never);
    await expect(getSubscription()).resolves.toEqual({ live: true, certain: false });
  });

  it('passes a real answer through untouched (anti-vacuous)', async () => {
    request.mockResolvedValue({ subscription: { live: false, certain: true } } as never);
    await expect(getSubscription()).resolves.toEqual({ live: false, certain: true });
  });
});
