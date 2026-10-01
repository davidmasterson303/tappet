/**
 * Deleting an invoice deletes the invoice, not only its row.
 *
 * @jest-environment node
 *
 * Audit 360, SEC-5 (1 Oct). Both delete paths removed the `vehicle_documents`
 * row and left the scan — name, address, VIN — in the private bucket for the
 * life of the car, while the app said it was gone.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@tappet/core/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  getClientIdentifier: jest.fn(() => 'ip'),
  rateLimitResponse: jest.fn(),
}));
jest.mock('@/lib/api-auth', () => ({ authorizeVehicleScopedRow: jest.fn() }));

import { NextRequest } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase';
import { authorizeVehicleScopedRow } from '@/lib/api-auth';
import { storedUrl } from '@tappet/core/storage-paths';
import { removeDocumentFile } from '../document-file';
import { POST } from '@/app/api/v1/delete-maintenance-item/route';

const CAR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const PATH = `${CAR}/invoices/1769000000000-Shop_Receipt.pdf`;

/** Tables answer `select … in('file_url', …)`; storage records what it is asked to remove. */
function fakeClient(refs: Record<string, string[]> = {}, removeError: string | null = null) {
  const removed: string[][] = [];
  const client = {
    from: (table: string) => {
      let urls: string[] = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: (_c: string, list: string[]) => ((urls = list), chain),
        limit: async () => ({ data: (refs[table] ?? []).filter((u) => urls.includes(u)).map((id) => ({ id })), error: null }),
      };
      return chain;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => (removed.push(paths), { error: removeError ? { message: removeError } : null }),
      }),
    },
  };
  return { client: client as never, removed };
}

describe('removeDocumentFile', () => {
  it('removes the object a stored URL names, under its own vehicle', async () => {
    const { client, removed } = fakeClient();
    await expect(removeDocumentFile(client, CAR, storedUrl(PATH))).resolves.toBe('removed');
    expect(removed).toEqual([[PATH]]);
  });

  it('keeps an object another row still names — the advisor attachment it was filed from', async () => {
    const { client, removed } = fakeClient({ consultant_documents: [storedUrl(PATH)] });
    await expect(removeDocumentFile(client, CAR, storedUrl(PATH))).resolves.toBe('still-referenced');
    expect(removed).toEqual([]);
  });

  it('refuses a path under another vehicle, and anything that is not a stored path', async () => {
    const { client, removed } = fakeClient();
    await expect(removeDocumentFile(client, OTHER, storedUrl(PATH))).resolves.toBe('foreign-path');
    await expect(removeDocumentFile(client, CAR, 'https://demo-placeholder.local/invoice.pdf')).resolves.toBe('not-stored');
    await expect(removeDocumentFile(client, CAR, null)).resolves.toBe('not-stored');
    expect(removed).toEqual([]);
  });

  it('says so when storage refuses', async () => {
    const { client } = fakeClient({}, 'boom');
    await expect(removeDocumentFile(client, CAR, storedUrl(PATH))).resolves.toBe('failed');
  });
});

describe('the phone’s delete route', () => {
  it('removes the file after the row — the finding', async () => {
    const order: string[] = [];
    const rowClient = {
      from: () => {
        let op = 'select';
        const chain: Record<string, unknown> = {
          select: () => chain,
          delete: () => ((op = 'delete'), chain),
          eq: () => (op === 'delete' ? (order.push('row'), Promise.resolve({ error: null, count: 1 })) : chain),
          maybeSingle: async () => ({ data: { file_url: storedUrl(PATH) }, error: null }),
        };
        return chain;
      },
    };
    (authorizeVehicleScopedRow as jest.Mock).mockResolvedValue({ ok: true, client: rowClient, vehicleId: CAR });
    const { client, removed } = fakeClient();
    const storage = (client as unknown as { storage: { from: () => { remove: (p: string[]) => unknown } } }).storage;
    const remove = storage.from().remove;
    (client as unknown as { storage: unknown }).storage = {
      from: () => ({ remove: (p: string[]) => (order.push('file'), remove(p)) }),
    };
    (getServiceRoleClient as jest.Mock).mockReturnValue(client);

    const response = await POST(
      new NextRequest('https://tappet.test/api/v1/delete-maintenance-item', {
        method: 'POST',
        body: JSON.stringify({ itemId: DOC, itemType: 'document' }),
      })
    );

    expect(response.status).toBe(200);
    expect(removed).toEqual([[PATH]]);
    expect(order).toEqual(['row', 'file']);
  });

  it('the web action does the same', () => {
    const actions = readFileSync(join(__dirname, '..', '..', 'app', 'actions.ts'), 'utf8');
    const body = actions.slice(actions.indexOf('export async function deleteMaintenanceLineItem'));
    const del = body.indexOf('.delete()');
    const remove = body.indexOf('removeDocumentFile(getServiceRoleClient(), access.vehicleId, documentFileUrl)');
    expect(del).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(del);
  });
});
