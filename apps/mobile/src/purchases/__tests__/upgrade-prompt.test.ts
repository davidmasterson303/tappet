/**
 * The one function a refused screen calls, and the one subscription the host
 * holds. Small on purpose; what matters is that a request reaches a listener
 * that exists, and that a listener that has gone is not called.
 */

import { onUpgradeRequested, requestUpgrade } from '../upgrade-prompt';

describe('requestUpgrade', () => {
  it('reaches a listener with the feature that was refused', () => {
    const listener = jest.fn();
    const stop = onUpgradeRequested(listener);

    expect(requestUpgrade('advisor')).toBe(true);
    expect(listener).toHaveBeenCalledWith({ feature: 'advisor' });

    stop();
  });

  it('carries no feature from settings', () => {
    const listener = jest.fn();
    const stop = onUpgradeRequested(listener);

    requestUpgrade();
    expect(listener).toHaveBeenCalledWith({ feature: null });

    stop();
  });

  it('says so when nothing is listening', () => {
    /*
      A `false` here is "the host is not mounted" — the shape the paywall was
      in from 18 Aug to 12 Sep, built and reachable from nowhere.
    */
    expect(requestUpgrade('dossier')).toBe(false);
  });

  it('stops calling a listener that unsubscribed', () => {
    const listener = jest.fn();
    onUpgradeRequested(listener)();

    requestUpgrade('advisor');

    expect(listener).not.toHaveBeenCalled();
  });
});
