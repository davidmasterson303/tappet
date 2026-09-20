/**
 * The Account screen's subscription row is a status, not a link's name.
 * @jest-environment node
 *
 * QE 2.3 (20 Sep). Each sentence is what the rows support and nothing more.
 */
import { subscriptionStatusLine } from '@tappet/core/subscription-status';

describe('subscriptionStatusLine', () => {
  it('says "Not subscribed" for an account with no live entitlement', () => {
    expect(subscriptionStatusLine({ live: false, certain: true })).toBe('Not subscribed');
    expect(subscriptionStatusLine({ live: false, certain: true, until: '2026-08-01T00:00:00Z', renews: true })).toBe('Not subscribed');
  });

  it('says nothing when the server could not read the row — a status it does not have', () => {
    expect(subscriptionStatusLine({ live: true, certain: false })).toBeNull();
    expect(subscriptionStatusLine({ live: false, certain: false })).toBeNull();
  });

  it('says "Active" alone for a grant with no period end', () => {
    expect(subscriptionStatusLine({ live: true, certain: true, until: null, renews: null })).toBe('Active');
  });

  it('says "renews" only when Apple has said so, and "until" otherwise', () => {
    const until = '2026-10-20T14:00:00Z';
    expect(subscriptionStatusLine({ live: true, certain: true, until, renews: true })).toBe('Active — renews Oct 20, 2026');
    expect(subscriptionStatusLine({ live: true, certain: true, until, renews: false })).toBe('Active until Oct 20, 2026');
    // Never told is not "renews": a renewal announced on the phone's own
    // authority is a charge nobody promised.
    expect(subscriptionStatusLine({ live: true, certain: true, until, renews: null })).toBe('Active until Oct 20, 2026');
    expect(subscriptionStatusLine({ live: true, certain: true, until })).toBe('Active until Oct 20, 2026');
  });
});
