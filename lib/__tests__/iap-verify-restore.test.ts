/**
 * Audit 360, TL-21 (1 Oct) — Restore of a subscription Apple has already
 * notified about says "Your subscription is active", and a device transaction
 * never rewrites the renewal state a notification stored.
 *
 * @jest-environment node
 *
 * `POST /api/v1/iap/verify` is executed over an in-memory `account_entitlements`
 * table, through the real `entitlement-store` and the real decision layer; only
 * the signature check is stubbed (it is pinned in `apple-notification.test.ts`,
 * including that a bare transaction is marked `fromDevice`). The route's answer
 * is then read the way the phone reads it — `verifyOutcomeFromStatus` and
 * `resolvePurchase` — so the assertion is the sentence on the sheet.
 */

jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: jest.fn() }));
jest.mock('@/lib/api-auth', () => ({ requireSession: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: jest.fn(),
  getClientIdentifier: jest.fn(() => '203.0.113.7'),
}));
jest.mock('@/lib/apple-root-ca', () => ({ getAppleRootCertificates: jest.fn(() => []), APPLE_BUNDLE_ID: 'b' }));
jest.mock('@/lib/apple-notification', () => ({ parseAppleTransaction: jest.fn() }));
jest.mock('@/lib/orphaned-subscriptions', () => ({ markSubscriptionReclaimed: jest.fn(async () => {}) }));

import { NextRequest } from 'next/server';

import type { AppleSubscriptionEvent } from '@tappet/core/apple-subscription';
import { resolvePurchase, verifyOutcomeFromStatus } from '@tappet/core/purchase-flow';
import { POST } from '@/app/api/v1/iap/verify/route';
import { getServiceRoleClient } from '@/lib/supabase';
import { requireSession } from '@/lib/api-auth';
import { parseAppleTransaction } from '@/lib/apple-notification';
import { markSubscriptionReclaimed } from '@/lib/orphaned-subscriptions';

type Row = Record<string, unknown>;

const OWNER = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-2222-3333-4444-555555555555';
const MONTHLY = 'com.southmoordigital.tappet.paid.monthly';
const OTI = '2000000000000001';

const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;
const NOW = Date.now();

/** A table whose stub honours `eq` filters and upserts on `user_id`. */
function table(rows: Row[]) {
  const from = jest.fn(() => {
    const filters: Array<(row: Row) => boolean> = [];
    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      eq: jest.fn((column: string, value: unknown) => (filters.push((r) => r[column] === value), chain)),
      maybeSingle: jest.fn(async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null })),
      upsert: jest.fn(async (values: Row) => {
        const i = rows.findIndex((r) => r.user_id === values.user_id);
        if (i >= 0) rows[i] = { ...rows[i], ...values };
        else rows.push(values);
        return { error: null };
      }),
    };
    return chain;
  });
  return { from };
}

/** The row after Apple's SUBSCRIBED notification, signed 5 s after the purchase. */
function notifiedRow(over: Row = {}): Row {
  return {
    user_id: OWNER,
    tier: 'paid',
    expires_at: iso(NOW + 20 * DAY),
    original_transaction_id: OTI,
    product_id: MONTHLY,
    environment: 'Production',
    auto_renew_status: true,
    revoked_at: null,
    latest_transaction_id: '2000000000000009',
    last_signed_date: iso(NOW - 10 * DAY + 5_000),
    ...over,
  };
}

/** The device's transaction, as `parseAppleTransaction` hands it to the route. */
function deviceEvent(over: Partial<AppleSubscriptionEvent> = {}): AppleSubscriptionEvent {
  return {
    notificationType: 'SUBSCRIBED',
    subtype: null,
    signedDate: NOW - 10 * DAY,
    originalTransactionId: OTI,
    productId: MONTHLY,
    transactionId: '2000000000000009',
    expiresDate: NOW + 20 * DAY,
    gracePeriodExpiresDate: null,
    autoRenewStatus: null,
    revocationDate: null,
    environment: 'Production',
    fromDevice: true,
    ...over,
  };
}

async function restore(rows: Row[], event: AppleSubscriptionEvent, userId = OWNER) {
  (getServiceRoleClient as jest.Mock).mockReturnValue(table(rows));
  (requireSession as jest.Mock).mockResolvedValue({ ok: true, userId });
  (parseAppleTransaction as jest.Mock).mockReturnValue({ ok: true, event, notificationUUID: null });

  const response = await POST(
    new NextRequest('https://tappet.test/api/v1/iap/verify', {
      method: 'POST',
      body: JSON.stringify({ jwsRepresentation: 'header.payload.signature' }),
      headers: { 'content-type': 'application/json' },
    })
  );
  const body = await response.json();
  const sheet = resolvePurchase(
    { kind: 'purchased', jwsRepresentation: 'x' },
    verifyOutcomeFromStatus(response.status, body)
  );
  return { status: response.status, body, sheet };
}

beforeEach(() => jest.clearAllMocks());

describe('Restore after Apple’s notification has touched the row', () => {
  it('says the subscription is active, not "get in touch"', async () => {
    const rows = [notifiedRow()];
    const { status, body, sheet } = await restore(rows, deviceEvent());

    expect(status).toBe(200);
    expect(body.entitlement).toEqual({ tier: 'paid', recorded: false });
    expect(sheet).toMatchObject({ status: 'entitled', grantsAccess: true, message: 'Your subscription is active.' });
    // Nothing written: the newer row stands.
    expect(rows[0].last_signed_date).toBe(iso(NOW - 10 * DAY + 5_000));
  });

  it('can still say "get in touch" — for a stale transaction of a different subscription', async () => {
    /*
      Anti-vacuous. The account's row holds another subscription; this
      transaction is unknown to every row (so no 409) and older than the row.
    */
    const { body, sheet } = await restore([notifiedRow()], deviceEvent({ originalTransactionId: '2000000000000077' }));

    expect(body.entitlement).toEqual({ tier: null, recorded: false });
    expect(sheet.grantsAccess).toBe(false);
    expect(sheet.message).toMatch(/could not match it to a subscription/);
  });

  it('does not answer active over the same subscription once it has lapsed', async () => {
    const { sheet } = await restore(
      [notifiedRow({ expires_at: iso(NOW - DAY) })],
      deviceEvent({ expiresDate: NOW - DAY })
    );
    expect(sheet.grantsAccess).toBe(false);
  });

  it('still answers 409 for a transaction that belongs to another account', async () => {
    const { status, sheet } = await restore([notifiedRow()], deviceEvent(), OTHER);
    expect(status).toBe(409);
    expect(sheet.grantsAccess).toBe(false);
  });

  it('still keeps a hand grant against a sandbox purchase, as App Review needs', async () => {
    const grant: Row = {
      user_id: OWNER, tier: 'paid', expires_at: null, original_transaction_id: null, product_id: null,
      environment: null, auto_renew_status: null, revoked_at: null, latest_transaction_id: null, last_signed_date: null,
    };
    const rows = [grant];
    const { body, sheet } = await restore(rows, deviceEvent({ environment: 'Sandbox' }));
    expect(body.entitlement).toEqual({ tier: 'paid', recorded: false });
    expect(sheet.grantsAccess).toBe(true);
    expect(rows[0].original_transaction_id).toBeNull();
  });
});

describe('a re-signed device transaction newer than the notification', () => {
  it('leaves a billing grace period and the renewal status as the notification stored them', async () => {
    const graceEnds = iso(NOW + 5 * DAY);
    const rows = [notifiedRow({ expires_at: graceEnds, auto_renew_status: false })];

    const { sheet } = await restore(
      rows,
      // Signed now (fetched fresh), its period ended yesterday; grace runs on.
      deviceEvent({ signedDate: NOW, expiresDate: NOW - DAY })
    );

    expect(sheet.grantsAccess).toBe(true);
    expect(rows[0].expires_at).toBe(graceEnds);
    expect(rows[0].auto_renew_status).toBe(false);
    expect(rows[0].last_signed_date).toBe(iso(NOW));
  });

  it('can still lapse access — from a notification, which carries renewal info', async () => {
    /*
      Anti-vacuous for the carry: the same write without `fromDevice` takes
      the transaction's expiry, so the guard above is the flag, not the stub.
    */
    const rows = [notifiedRow({ expires_at: iso(NOW + 5 * DAY), auto_renew_status: false })];
    await restore(rows, deviceEvent({ signedDate: NOW, expiresDate: NOW - DAY, fromDevice: undefined }));
    expect(rows[0].expires_at).toBe(iso(NOW - DAY));
    expect(rows[0].auto_renew_status).toBeNull();
  });
});

describe('a re-signup restoring a deleted account’s subscription (TL-29)', () => {
  it('binds to the new account and marks the orphan record reclaimed', async () => {
    const rows: Row[] = [];
    const { status, body } = await restore(rows, deviceEvent(), OTHER);
    expect(status).toBe(200);
    expect(body.entitlement.tier).toBe('paid');
    expect(rows[0]).toMatchObject({ user_id: OTHER, original_transaction_id: OTI });
    expect(markSubscriptionReclaimed).toHaveBeenCalledWith(OTI);
  });

  it('anti-vacuous: the owner’s own Restore reclaims nothing', async () => {
    await restore([notifiedRow()], deviceEvent());
    expect(markSubscriptionReclaimed).not.toHaveBeenCalled();
  });
});
