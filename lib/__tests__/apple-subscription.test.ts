/**
 * The Apple notification state machine.
 *
 * @jest-environment node
 *
 * Phase 6, E8. Every case here is an ordering or a state Apple can actually
 * produce, and most of them fail *silently* if the reasoning is wrong — a
 * resurrected subscription and a refunded-but-still-working account both look
 * exactly like a working account from the inside.
 */

import {
  applyAppleNotification,
  isHandGranted,
  PRODUCT_TIERS,
  type AppleSubscriptionEvent,
  type StoredEntitlement,
} from '@tappet/core/apple-subscription';
import { resolveEntitledTier } from '@tappet/core/entitlement';

const MONTHLY = 'com.southmoordigital.tappet.paid.monthly';

const at = (iso: string) => Date.parse(iso);

function event(over: Partial<AppleSubscriptionEvent> = {}): AppleSubscriptionEvent {
  return {
    notificationType: 'DID_RENEW',
    signedDate: at('2026-08-18T10:00:00Z'),
    originalTransactionId: '2000000000000001',
    productId: MONTHLY,
    transactionId: '2000000000000009',
    expiresDate: at('2026-09-18T10:00:00Z'),
    environment: 'Production',
    ...over,
  };
}

function stored(over: Partial<StoredEntitlement> = {}): StoredEntitlement {
  return {
    tier: 'paid',
    expiresAt: '2026-08-18T10:00:00.000Z',
    originalTransactionId: '2000000000000001',
    productId: MONTHLY,
    environment: 'Production',
    autoRenewStatus: true,
    revokedAt: null,
    latestTransactionId: '2000000000000008',
    lastSignedDate: '2026-08-18T09:00:00.000Z',
    ...over,
  };
}

/** Narrow to a write, failing loudly rather than returning undefined. */
function writeOf(decision: ReturnType<typeof applyAppleNotification>) {
  if (decision.action !== 'write') {
    throw new Error(`expected a write, got ignore:${decision.reason}`);
  }
  return decision.record;
}

describe('the product map is a closed list', () => {
  it('maps every configured product to a tier that exists', () => {
    /*
      Anti-vacuous: an empty map would make every "unknown product" assertion
      below pass while proving nothing about the real ids.
    */
    const ids = Object.keys(PRODUCT_TIERS);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('com.southmoordigital.tappet.'))).toBe(true);
    expect(Object.values(PRODUCT_TIERS).every((t) => t === 'paid')).toBe(true);
  });

  it('carries no price', () => {
    // D2 is undecided, and Apple is the authority on price regardless.
    expect(JSON.stringify(PRODUCT_TIERS)).not.toMatch(/\d+\.\d{2}|\$|USD/);
  });
});

describe('out-of-order delivery, which Apple does not prevent', () => {
  it('ignores a renewal signed before the event already applied', () => {
    /*
      The one that costs money and says nothing. A DID_RENEW delayed by a
      retry, arriving after the EXPIRED that superseded it, would otherwise
      write a future expiry over a dead subscription.
    */
    const decision = applyAppleNotification(
      stored({ lastSignedDate: '2026-08-18T10:05:00.000Z' }),
      event({ signedDate: at('2026-08-18T10:00:00Z') })
    );

    expect(decision.action).toBe('ignore');
    expect(decision).toMatchObject({ reason: 'stale-event' });
  });

  it('ignores a replay of the exact same event', () => {
    // Apple retries on any non-2xx, so duplicate delivery is routine.
    const decision = applyAppleNotification(
      stored({ lastSignedDate: '2026-08-18T10:00:00.000Z' }),
      event({ signedDate: at('2026-08-18T10:00:00Z') })
    );

    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event' });
  });

  it('applies an event strictly newer than the last one', () => {
    const record = writeOf(
      applyAppleNotification(
        stored({ lastSignedDate: '2026-08-18T09:00:00.000Z' }),
        event({ signedDate: at('2026-08-18T10:00:00Z') })
      )
    );

    expect(record.lastSignedDate).toBe('2026-08-18T10:00:00.000Z');
    expect(record.expiresAt).toBe('2026-09-18T10:00:00.000Z');
  });

  it('applies the first event for an account that has never had one', () => {
    const record = writeOf(applyAppleNotification(null, event({ notificationType: 'SUBSCRIBED' })));

    expect(record.tier).toBe('paid');
    expect(record.originalTransactionId).toBe('2000000000000001');
  });

  it('does not wedge on an unparseable stored date', () => {
    /*
      A corrupt `last_signed_date` treated as a barrier would freeze the
      subscription at whatever it last was, forever, with no error. Letting the
      next real event through repairs the row.
    */
    const record = writeOf(
      applyAppleNotification(stored({ lastSignedDate: 'not a date' }), event())
    );

    expect(record.lastSignedDate).toBe('2026-08-18T10:00:00.000Z');
  });

  it('does not advance the ordering clock for a notification it ignores', () => {
    /*
      The subtle one. If an unhandled type wrote `lastSignedDate`, a meaningful
      notification signed between it and the next write would be dropped as
      stale — a real lapse silently discarded.
    */
    const ignored = applyAppleNotification(
      stored({ lastSignedDate: '2026-08-18T09:00:00.000Z' }),
      event({ notificationType: 'CONSUMPTION_REQUEST', signedDate: at('2026-08-18T11:00:00Z') })
    );
    expect(ignored).toMatchObject({ action: 'ignore', reason: 'unhandled-notification-type' });

    // The real event, signed earlier than the ignored one, must still apply.
    const record = writeOf(
      applyAppleNotification(
        stored({ lastSignedDate: '2026-08-18T09:00:00.000Z' }),
        event({ notificationType: 'EXPIRED', signedDate: at('2026-08-18T10:00:00Z') })
      )
    );
    expect(record.lastSignedDate).toBe('2026-08-18T10:00:00.000Z');
  });
});

describe('refunds end access now, not at the end of the period', () => {
  it('revokes on REFUND even with weeks left on the expiry', () => {
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({
          notificationType: 'REFUND',
          revocationDate: at('2026-08-18T10:00:00Z'),
          expiresDate: at('2026-09-18T10:00:00Z'),
          signedDate: at('2026-08-18T10:00:00Z'),
        })
      )
    );

    expect(record.tier).toBe('free');
    expect(record.revokedAt).toBe('2026-08-18T10:00:00.000Z');
    // Collapsed, so the read path needs no special case for revocation.
    expect(record.expiresAt).toBe('2026-08-18T10:00:00.000Z');
  });

  it('falls back to the signing time when REVOKE carries no revocation date', () => {
    // Family-sharing revocations can arrive without one.
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({
          notificationType: 'REVOKE',
          revocationDate: null,
          signedDate: at('2026-08-18T12:00:00Z'),
        })
      )
    );

    expect(record.revokedAt).toBe('2026-08-18T12:00:00.000Z');
    expect(record.tier).toBe('free');
  });

  it('reads as free through resolveEntitledTier, which is the real proof', () => {
    /*
      The two modules have to agree. A revoked write that still resolved to
      `paid` would be a refunded customer with a working product, and neither
      module alone would show it.
    */
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({ notificationType: 'REFUND', revocationDate: at('2026-08-18T10:00:00Z') })
      )
    );

    const tier = resolveEntitledTier(
      { tier: record.tier, expiresAt: record.expiresAt },
      new Date('2026-08-18T10:00:01Z')
    );
    expect(tier.name).toBe('free');
  });

  it('clears a previous revocation when the customer subscribes again', () => {
    const record = writeOf(
      applyAppleNotification(
        stored({ revokedAt: '2026-08-01T00:00:00.000Z', tier: 'free' }),
        event({ notificationType: 'SUBSCRIBED', signedDate: at('2026-08-18T10:00:00Z') })
      )
    );

    expect(record.revokedAt).toBeNull();
    expect(record.tier).toBe('paid');
  });
});

describe('grace period keeps a good customer working while the card is retried', () => {
  it('extends access to the grace date when it is later than the expiry', () => {
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({
          notificationType: 'DID_FAIL_TO_RENEW',
          subtype: 'GRACE_PERIOD',
          expiresDate: at('2026-08-18T10:00:00Z'),
          gracePeriodExpiresDate: at('2026-08-25T10:00:00Z'),
        })
      )
    );

    expect(record.expiresAt).toBe('2026-08-25T10:00:00.000Z');
    expect(resolveEntitledTier(record, new Date('2026-08-20T00:00:00Z')).name).toBe('paid');
  });

  it('does not shorten access when the grace date is earlier', () => {
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({
          expiresDate: at('2026-09-18T10:00:00Z'),
          gracePeriodExpiresDate: at('2026-08-19T10:00:00Z'),
        })
      )
    );

    expect(record.expiresAt).toBe('2026-09-18T10:00:00.000Z');
  });

  it('lapses once the grace period expires', () => {
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({
          notificationType: 'GRACE_PERIOD_EXPIRED',
          expiresDate: at('2026-08-25T10:00:00Z'),
          gracePeriodExpiresDate: null,
          signedDate: at('2026-08-25T10:00:01Z'),
        })
      )
    );

    expect(resolveEntitledTier(record, new Date('2026-08-26T00:00:00Z')).name).toBe('free');
  });
});

describe('sandbox cannot reach a production subscription', () => {
  it('ignores a sandbox event against a production entitlement', () => {
    /*
      Anyone with a developer account can make a free sandbox purchase against
      this bundle id. It must not extend a real one.
    */
    const decision = applyAppleNotification(
      stored({ environment: 'Production' }),
      event({ environment: 'Sandbox', signedDate: at('2026-08-18T11:00:00Z') })
    );

    expect(decision).toMatchObject({
      action: 'ignore',
      reason: 'sandbox-would-overwrite-production',
    });
  });

  it('still lets App Review buy things, which runs entirely in sandbox', () => {
    /*
      The assertion that keeps the rule above from being a rejection. A
      reviewer's account has no production entitlement, so a sandbox purchase
      must work normally.
    */
    const fresh = writeOf(
      applyAppleNotification(null, event({ environment: 'Sandbox', notificationType: 'SUBSCRIBED' }))
    );
    expect(fresh.tier).toBe('paid');
    expect(fresh.environment).toBe('Sandbox');

    const renewed = writeOf(
      applyAppleNotification(
        stored({ environment: 'Sandbox' }),
        event({ environment: 'Sandbox', signedDate: at('2026-08-18T11:00:00Z') })
      )
    );
    expect(renewed.tier).toBe('paid');
  });

  it('lets production write over a sandbox row', () => {
    // The stronger claim wins in the direction that is not an attack.
    const record = writeOf(
      applyAppleNotification(
        stored({ environment: 'Sandbox' }),
        event({ environment: 'Production', signedDate: at('2026-08-18T11:00:00Z') })
      )
    );
    expect(record.environment).toBe('Production');
  });
});

/*
  Ruled 27 Sep: sandbox purchases keep granting in production (App Review buys
  in sandbox against the live server), but they must not replace access granted
  by hand. The review account is such a row, and a sandbox subscription lapses
  on Apple's minutes-long clock — it would have dropped the reviewer to free.
*/
describe('sandbox cannot replace access granted by hand', () => {
  const GRANT = stored({
    tier: 'paid',
    expiresAt: null,
    originalTransactionId: null,
    productId: null,
    environment: null,
    autoRenewStatus: null,
    latestTransactionId: null,
    lastSignedDate: null,
  });

  it('keeps the grant, and says which tier stays in force', () => {
    const decision = applyAppleNotification(
      GRANT,
      event({ environment: 'Sandbox', notificationType: 'SUBSCRIBED' })
    );

    expect(decision).toMatchObject({
      action: 'ignore',
      reason: 'sandbox-would-overwrite-grant',
      keeps: 'paid',
    });
  });

  it('refuses the lapse that would otherwise follow', () => {
    const decision = applyAppleNotification(
      GRANT,
      event({ environment: 'Sandbox', notificationType: 'EXPIRED' })
    );
    expect(decision.action).toBe('ignore');
  });

  it('can still detect a purchase on an ordinary account', () => {
    // Anti-vacuous: the same event with no grant writes, as App Review needs.
    const record = writeOf(
      applyAppleNotification(null, event({ environment: 'Sandbox', notificationType: 'SUBSCRIBED' }))
    );
    expect(record.environment).toBe('Sandbox');
  });

  it('lets a real purchase take over from a grant', () => {
    const record = writeOf(
      applyAppleNotification(
        GRANT,
        event({ environment: 'Production', notificationType: 'SUBSCRIBED' })
      )
    );
    expect(record.environment).toBe('Production');
  });

  it('protects nothing that is not a live paid grant', () => {
    for (const row of [
      stored({ ...GRANT, tier: 'free' }),
      stored({ ...GRANT, revokedAt: '2026-08-01T00:00:00.000Z' }),
      stored({ environment: 'Sandbox' }), // a sandbox purchase's own row
    ]) {
      expect(isHandGranted(row)).toBe(false);
    }
    expect(isHandGranted(GRANT)).toBe(true);
  });

  it('marks no other refusal as keeping access', () => {
    /*
      A stale event from a DIFFERENT original transaction must never be read
      as an entitlement by the verify route — even against a row that is live
      and paid, so the absence of `keeps` is not merely the clock's doing.
    */
    const decision = applyAppleNotification(
      stored({ expiresAt: '2026-09-18T10:00:00.000Z' }),
      event({ signedDate: at('2026-08-18T08:00:00Z'), originalTransactionId: '2000000000000077' }),
      new Date('2026-08-20T00:00:00Z')
    );
    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event' });
    expect('keeps' in decision && decision.keeps !== undefined).toBe(false);
  });
});

describe('a product we do not recognise never grants a paid tier', () => {
  it('grants free and says so loudly', () => {
    /*
      The realistic cause is a typo in PRODUCT_TIERS or a product added in App
      Store Connect and not here. Silently granting `paid` would be a hole;
      silently granting `free` would be an unexplained support ticket. So it
      grants free and carries a warning the route logs at error level.
    */
    const decision = applyAppleNotification(
      null,
      event({ productId: 'com.southmoordigital.tappet.paid.weekly' })
    );

    const record = writeOf(decision);
    expect(record.tier).toBe('free');
    expect(decision.action === 'write' && decision.warning).toMatch(/unknown-product/);
  });

  it('carries no warning for a product that is mapped', () => {
    // Anti-vacuous: the warning must not be unconditional.
    const decision = applyAppleNotification(null, event());
    expect(decision.action === 'write' && decision.warning).toBeUndefined();
  });
});

describe('auto-renew status is recorded but never decides entitlement', () => {
  it('stores a cancellation without ending access', () => {
    /*
      Turning off auto-renew means "do not charge me again", not "cut me off
      now". The customer has paid through the period and ending it early is
      both wrong and a refund request waiting to happen.
    */
    const record = writeOf(
      applyAppleNotification(
        stored(),
        event({
          notificationType: 'DID_CHANGE_RENEWAL_STATUS',
          subtype: 'AUTO_RENEW_DISABLED',
          autoRenewStatus: false,
          expiresDate: at('2026-09-18T10:00:00Z'),
        })
      )
    );

    expect(record.autoRenewStatus).toBe(false);
    expect(record.tier).toBe('paid');
    expect(resolveEntitledTier(record, new Date('2026-09-01T00:00:00Z')).name).toBe('paid');
  });
});

/**
 * ── Audit 360, TL-21: the device's transaction against Apple's newer row ────
 *
 * Restore and the quiet check send the device's transaction, signed at
 * purchase; Apple's notification for the same subscription is signed later and
 * moves `lastSignedDate` past it. And in the other ordering a re-signed device
 * transaction is newer than the notification, but carries no renewal info.
 */
describe('the subscriber’s own transaction against a row Apple has moved on', () => {
  const NOW = new Date('2026-08-20T00:00:00Z');
  /** The row after Apple's SUBSCRIBED notification, signed seconds after the purchase. */
  const NOTIFIED = stored({
    expiresAt: '2026-09-18T10:00:00.000Z',
    lastSignedDate: '2026-08-18T10:00:05.000Z',
  });
  /** What Restore sends: the same subscription, signed at purchase. */
  const restored = (over: Partial<AppleSubscriptionEvent> = {}) =>
    event({ notificationType: 'SUBSCRIBED', fromDevice: true, signedDate: at('2026-08-18T10:00:00Z'), ...over });

  it('keeps the row’s live tier for a stale event of the same subscription', () => {
    const decision = applyAppleNotification(NOTIFIED, restored(), NOW);
    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event', keeps: 'paid' });
  });

  it('keeps it for a stale notification of the same subscription too — nothing is written', () => {
    const decision = applyAppleNotification(NOTIFIED, event({ signedDate: at('2026-08-18T09:30:00Z') }), NOW);
    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event', keeps: 'paid' });
  });

  it('keeps nothing when the same subscription has lapsed on the row', () => {
    const decision = applyAppleNotification(NOTIFIED, restored(), new Date('2026-10-01T00:00:00Z'));
    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event' });
    expect('keeps' in decision && decision.keeps !== undefined).toBe(false);
  });

  it('keeps nothing when the row was refunded after the device’s transaction', () => {
    const refunded = stored({
      tier: 'free',
      expiresAt: '2026-08-19T00:00:00.000Z',
      revokedAt: '2026-08-19T00:00:00.000Z',
      autoRenewStatus: false,
      lastSignedDate: '2026-08-19T00:00:00.000Z',
    });
    const decision = applyAppleNotification(refunded, restored(), NOW);
    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event' });
    expect('keeps' in decision && decision.keeps !== undefined).toBe(false);
  });

  it('keeps nothing for a stale transaction from a different subscription', () => {
    const decision = applyAppleNotification(
      NOTIFIED,
      restored({ originalTransactionId: '2000000000000077' }),
      NOW
    );
    expect(decision).toMatchObject({ action: 'ignore', reason: 'stale-event' });
    expect('keeps' in decision && decision.keeps !== undefined).toBe(false);
  });

  it('does not loosen the hand-grant rule: a sandbox purchase still never replaces a grant', () => {
    const grant = stored({
      expiresAt: null, originalTransactionId: null, productId: null, environment: null,
      autoRenewStatus: null, latestTransactionId: null, lastSignedDate: null,
    });
    expect(
      applyAppleNotification(grant, restored({ environment: 'Sandbox' }), NOW)
    ).toMatchObject({ action: 'ignore', reason: 'sandbox-would-overwrite-grant', keeps: 'paid' });
  });

  /** The row DID_FAIL_TO_RENEW wrote: in grace until the 25th, renewal on. */
  const IN_GRACE = stored({
    expiresAt: '2026-08-25T10:00:00.000Z',
    autoRenewStatus: true,
    lastSignedDate: '2026-08-18T10:00:05.000Z',
  });
  /** A re-signed device transaction, newer than the notification, no renewal info. */
  const resigned = (over: Partial<AppleSubscriptionEvent> = {}) =>
    restored({ signedDate: at('2026-08-20T00:00:00Z'), expiresDate: at('2026-08-18T10:00:00Z'), ...over });

  it('never shortens a stored grace-period expiry from a device transaction', () => {
    const record = writeOf(applyAppleNotification(IN_GRACE, resigned(), NOW));
    expect(record.expiresAt).toBe('2026-08-25T10:00:00.000Z');
    expect(resolveEntitledTier(record, new Date('2026-08-21T00:00:00Z')).name).toBe('paid');
  });

  it('never nulls a stored renewal status from a device transaction', () => {
    const cancelled = stored({ ...IN_GRACE, autoRenewStatus: false });
    expect(writeOf(applyAppleNotification(cancelled, resigned(), NOW)).autoRenewStatus).toBe(false);
    expect(writeOf(applyAppleNotification(IN_GRACE, resigned(), NOW)).autoRenewStatus).toBe(true);
  });

  it('still takes a later expiry from the device — a renewal it knows of first', () => {
    const record = writeOf(
      applyAppleNotification(IN_GRACE, resigned({ expiresDate: at('2026-09-18T10:00:00Z') }), NOW)
    );
    expect(record.expiresAt).toBe('2026-09-18T10:00:00.000Z');
  });

  it('carries nothing from a different subscription’s row', () => {
    const record = writeOf(
      applyAppleNotification(IN_GRACE, resigned({ originalTransactionId: '2000000000000077' }), NOW)
    );
    expect(record.expiresAt).toBe('2026-08-18T10:00:00.000Z');
    expect(record.autoRenewStatus).toBeNull();
  });

  it('carries nothing onto a notification — an absent grace date there means grace ended', () => {
    const record = writeOf(
      applyAppleNotification(
        IN_GRACE,
        resigned({ fromDevice: undefined, notificationType: 'GRACE_PERIOD_EXPIRED' }),
        NOW
      )
    );
    expect(record.expiresAt).toBe('2026-08-18T10:00:00.000Z');
    expect(record.autoRenewStatus).toBeNull();
  });

  it('carries nothing from a revoked row, and a device revocation still revokes', () => {
    const revoked = stored({
      ...IN_GRACE, tier: 'free', revokedAt: '2026-08-19T00:00:00.000Z', expiresAt: '2026-08-19T00:00:00.000Z',
    });
    expect(writeOf(applyAppleNotification(revoked, resigned(), NOW)).expiresAt).toBe('2026-08-18T10:00:00.000Z');
    const revoke = writeOf(
      applyAppleNotification(
        IN_GRACE,
        resigned({ notificationType: 'REVOKE', revocationDate: at('2026-08-19T12:00:00Z') }),
        NOW
      )
    );
    expect(revoke).toMatchObject({ tier: 'free', revokedAt: '2026-08-19T12:00:00.000Z' });
  });
});

/**
 * ── IAP-07 / IAP-09: two states the decision layer used to drop ─────────────
 */
describe('states that were silently unhandled', () => {
  it('restores access when Apple reverses a refund — IAP-07', () => {
    /*
      ⚠ The failure was **one-directional and permanent**. `REFUND` sets
      `revokedAt`, `resolveEntitledTier` reads a revoked record as not live, and
      `REFUND_REVERSED` — Apple saying the refund it granted has been reversed,
      because the chargeback failed — was not in `STATE_BEARING_TYPES`. So it
      fell into `unhandled-notification-type`, was logged, and dropped.

      The customer is paying and locked out, and the only signal that would fix
      it is the one being ignored.
    */
    const revoked = applyAppleNotification(null, event({ notificationType: 'REFUND' }));
    expect(revoked.action).toBe('write');
    expect(revoked.action === 'write' && revoked.record.revokedAt).not.toBeNull();

    const restored = applyAppleNotification(
      revoked.action === 'write' ? revoked.record : null,
      event({
        notificationType: 'REFUND_REVERSED',
        signedDate: at('2026-08-19T10:00:00Z'),
        expiresDate: at('2026-09-18T10:00:00Z'),
      })
    );

    expect(restored.action).toBe('write');
    expect(restored.action === 'write' && restored.record.revokedAt).toBeNull();
    expect(restored.action === 'write' && restored.record.tier).not.toBe('free');
  });

  it('refuses a paid tier that arrives with no expiry — IAP-09', () => {
    /*
      ⚠ `expiresAt: null` means "does not expire" to `resolveEntitledTier`. For
      a subscription that is a **lifetime grant** written from a payload we do
      not understand, and no renewal event would ever correct it.

      `ignore`, not a write of `free`: revoking somebody mid-period on the
      strength of a payload already judged untrustworthy is the wrong direction
      to be wrong in.
    */
    const decision = applyAppleNotification(
      null,
      event({ notificationType: 'DID_RENEW', expiresDate: null })
    );

    expect(decision).toMatchObject({ action: 'ignore', reason: 'paid-tier-with-no-expiry' });
  });

  it('still writes a revocation that has no expiry, because it does not need one', () => {
    /*
      The anti-vacuous half. A refund's truth is `revokedAt`, not `expiresDate`
      — refusing it for a missing expiry would leave access running on a
      subscription that has been refunded, which is the opposite of the fix.
    */
    const decision = applyAppleNotification(
      null,
      event({ notificationType: 'REVOKE', expiresDate: null })
    );

    expect(decision.action).toBe('write');
  });
});
