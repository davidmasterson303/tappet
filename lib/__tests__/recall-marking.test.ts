/**
 * Marking a recall repaired.
 *
 * @jest-environment node
 *
 * ── What is worth asserting about this route ────────────────────────────────
 *
 * Not that an upsert calls `upsert`. Three things, and each of them is a
 * decision somebody could reasonably reverse without noticing what it cost:
 *
 *   - **Authorization runs before anything is read from the body**, and a demo
 *     vehicle cannot be written to. This is the one route in the product where
 *     a write is a claim about a safety defect.
 *   - **The date is the server's.** A body-supplied `addressedAt` would let a
 *     phone with a wrong clock stamp "repaired in 2019" onto a 2024 campaign.
 *   - **`DELETE` exists and works.** A claim an owner can make and cannot
 *     unmake is a trap, and this is the tap most worth being able to undo.
 *   - **A mark files a service record, and an undo takes it back** (22 Sep).
 *     David: *"a recall should improve a score once fixed AND go into
 *     history."* The score half is `recallDriver`; this is the other, and
 *     what is worth asserting is the row's honesty — no invented cost or
 *     shop, the component named from our own NHTSA row rather than from the
 *     request — and that a withdrawn claim does not leave a repair behind.
 *
 * The campaign-number check gets its own block because it is the one string a
 * client controls that reaches a `TEXT` column with a `UNIQUE` constraint.
 */

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  getServerClient: jest.fn(),
}));
jest.mock('@/lib/api-auth', () => ({ authorizeVehicleAccess: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  getClientIdentifier: jest.fn().mockReturnValue('test'),
  rateLimitResponse: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { getServiceRoleClient } from '@/lib/supabase';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { DELETE, GET, POST } from '@/app/api/v1/recalls/route';

const serviceRole = getServiceRoleClient as jest.Mock;
const authorize = authorizeVehicleAccess as jest.Mock;

const VEHICLE = '11111111-2222-3333-4444-555555555555';

/** What the route handed the database, so a test can read it back. */
interface Seen {
  upserts: unknown[];
  /** `[table, column, value]` — the table matters now that two are written. */
  deleteFilters: Array<[string, string, unknown]>;
  inserts: Array<[string, Record<string, unknown>]>;
  /** Descriptions the undo asked `maintenance_line_items` to remove. */
  removedDescriptions: string[];
}

/**
 * A table-aware stand-in for the service-role client.
 *
 * ⚠ It answers **per table**, which the first version did not: one `from()`
 * served every call, so the route's NHTSA read fell off a chain that had no
 * `maybeSingle` and the whole record-filing branch threw into its own catch.
 * The suite stayed green over a feature that never ran. `existingRecords`
 * drives the idempotence case.
 */
function client(
  rows: unknown[] = [],
  {
    recalls = [{ NHTSACampaignNumber: '23V-441', Component: 'FUEL SYSTEM', Summary: 'Pump may fail.' }] as unknown,
    existingRecords = [] as unknown[],
    nhtsaMissing = false,
  }: { recalls?: unknown; existingRecords?: unknown[]; nhtsaMissing?: boolean } = {}
): Seen {
  const seen: Seen = { upserts: [], deleteFilters: [], inserts: [], removedDescriptions: [] };

  serviceRole.mockReturnValue({
    from: (table: string) => ({
      select: () => {
        if (table === 'nhtsa_data') {
          return {
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: nhtsaMissing ? null : { recalls }, error: null }),
            }),
          };
        }
        if (table === 'maintenance_line_items') {
          const chain = {
            eq: () => chain,
            limit: () => Promise.resolve({ data: existingRecords, error: null }),
          };
          return chain;
        }
        return { eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) };
      },
      upsert: (values: unknown) => {
        seen.upserts.push(values);
        return Promise.resolve({ error: null });
      },
      insert: (values: Record<string, unknown>) => {
        seen.inserts.push([table, values]);
        return Promise.resolve({ error: null });
      },
      delete: () => {
        const chain = {
          eq: (column: string, value: unknown) => {
            seen.deleteFilters.push([table, column, value]);
            return chain;
          },
          in: (column: string, values: string[]) => {
            if (column === 'item_description') seen.removedDescriptions.push(...values);
            return chain;
          },
          then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
        };
        return chain;
      },
    }),
  });

  return seen;
}

function post(body: unknown): NextRequest {
  return new NextRequest('https://tappet.test/api/v1/recalls', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  authorize.mockResolvedValue({ ok: true, isDemo: false, userId: 'u1', client: {} });
});

describe('authorization comes first', () => {
  it('refuses before it reads the body', async () => {
    // The shape every other v1 route uses. A route that parsed first would be
    // one edit away from acting on an unauthorized body.
    authorize.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    client();

    const response = await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }));

    expect(response.status).toBe(401);
    expect(serviceRole).not.toHaveBeenCalled();
  });

  it('asks for write access, not read, on both mutations', async () => {
    client();

    await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }));
    expect(authorize).toHaveBeenLastCalledWith(VEHICLE, { intent: 'write' });

    await DELETE(
      new NextRequest(
        `https://tappet.test/api/v1/recalls?vehicleId=${VEHICLE}&campaignNumber=23V-441`,
        { method: 'DELETE' }
      )
    );
    expect(authorize).toHaveBeenLastCalledWith(VEHICLE, { intent: 'write' });
  });

  it('reads with read intent, so a demo car can be looked at', async () => {
    /*
      `authorizeVehicleAccess` refuses a demo id outright for `write` and hands
      back the anon client for `read`. A demo vehicle therefore has no marks and
      can gain none, which reads as an empty list — the truth, rather than a
      special case in here.
    */
    client();
    await GET(new NextRequest(`https://tappet.test/api/v1/recalls?vehicleId=${VEHICLE}`));

    expect(authorize).toHaveBeenCalledWith(VEHICLE, { intent: 'read' });
  });
});

describe('the mark itself', () => {
  it('stamps the server date and never the client one', async () => {
    /*
      ⚠ This is a safety record. A body-supplied date would let a phone with a
      wrong clock — or anything holding a token — write "repaired in 2019" onto
      a campaign issued in 2024.
    */
    const seen = client();

    await POST(
      post({ vehicleId: VEHICLE, campaignNumber: '23V-441', addressedAt: '2019-01-01' })
    );

    const [written] = seen.upserts as Array<Record<string, unknown>>;
    expect(written.addressed_at).not.toBe('2019-01-01');
    expect(written.addressed_at).toBe(new Date().toISOString().slice(0, 10));
    expect(written).toMatchObject({ vehicle_id: VEHICLE, campaign_number: '23V-441' });
  });

  it('gives the campaign and the date back, so a client need not guess', async () => {
    client();
    const body = await (
      await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }))
    ).json();

    expect(body.addressed).toMatchObject({ campaignNumber: '23V-441' });
    expect(body.addressed.addressedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('undoes a mark on the vehicle and campaign it was asked about', async () => {
    // Both filters, and this is the assertion that matters: a delete scoped to
    // the campaign alone would clear that campaign on every car in the table.
    const seen = client();

    await DELETE(
      new NextRequest(
        `https://tappet.test/api/v1/recalls?vehicleId=${VEHICLE}&campaignNumber=23V-441`,
        { method: 'DELETE' }
      )
    );

    expect(seen.deleteFilters).toContainEqual(['recall_actions', 'vehicle_id', VEHICLE]);
    expect(seen.deleteFilters).toContainEqual(['recall_actions', 'campaign_number', '23V-441']);
  });

  it('reads the marks back as the clients expect them', async () => {
    client([{ campaign_number: '23V-441', addressed_at: '2026-08-23' }]);

    const body = await (
      await GET(new NextRequest(`https://tappet.test/api/v1/recalls?vehicleId=${VEHICLE}`))
    ).json();

    expect(body.addressed).toEqual([
      { campaignNumber: '23V-441', addressedAt: '2026-08-23' },
    ]);
  });
});

describe('the campaign number, which is the one string a client controls', () => {
  it.each([
    ['missing', undefined],
    ['not a string', 42],
    ['empty', '   '],
    ['longer than any campaign', 'A'.repeat(41)],
    ['carrying a quote', "23V-441'; drop"],
    ['carrying a newline', '23V-441\n441'],
  ])('refuses one that is %s', async (_label, value) => {
    const seen = client();

    const response = await POST(post({ vehicleId: VEHICLE, campaignNumber: value }));

    expect(response.status).toBe(400);
    expect(seen.upserts).toHaveLength(0);
  });

  it.each(['23V-441', 'PE24-012', '21V100', 'NHTSA 23V-441'])(
    'accepts %s, because NHTSA has changed its numbering before',
    async (value) => {
      /*
        Anti-vacuous, and it is the half that matters more. A check strict
        enough to refuse a genuine campaign would refuse the safety notice —
        which is why this is bounded and character-checked rather than matched
        against a format.
      */
      const seen = client();
      const response = await POST(post({ vehicleId: VEHICLE, campaignNumber: value }));

      expect(response.status).toBe(200);
      expect(seen.upserts).toHaveLength(1);
    }
  );

  it('refuses a body that is not JSON at all', async () => {
    client();
    const response = await POST(
      new NextRequest('https://tappet.test/api/v1/recalls', { method: 'POST', body: 'nope' })
    );

    expect(response.status).toBe(400);
  });
});

/**
 * ── The service record a mark files (22 Sep) ───────────────────────────────
 *
 * David: *"a recall should improve a score once fixed AND go into history."*
 * A score that rises with nothing in the record to show for it is a rise the
 * owner cannot check, so the mark writes one `maintenance_line_items` row.
 */
describe('the record the mark files', () => {
  const described = 'Recall 23V-441 — Fuel system';

  it('files one row, naming the campaign and the component from our own NHTSA data', async () => {
    const seen = client();

    const body = await (await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }))).json();

    expect(body.recorded).toBe(true);
    expect(seen.inserts).toHaveLength(1);
    const [table, row] = seen.inserts[0];
    expect(table).toBe('maintenance_line_items');
    expect(row).toMatchObject({
      vehicle_id: VEHICLE,
      item_description: described,
      service_date: new Date().toISOString().slice(0, 10),
      /* The value the check constraint permits — a `'recall'` source is a migration. */
      source: 'manual',
    });
  });

  it('invents neither a price nor a shop', async () => {
    /*
      ⚠ Nobody told us either. A recall repair is free at a franchised dealer,
      but that is a fact about the campaign rather than about this visit, and
      a `0` renders as a price (§10). Both columns take null.
    */
    const seen = client();
    await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }));

    const [, row] = seen.inserts[0];
    expect(row.total_cost).toBeNull();
    expect(row.unit_cost).toBeNull();
    expect(row.shop_name).toBeNull();
    expect(row.mileage_at_service).toBeNull();
    // And it says what it is, including the claim's limit.
    expect(String(row.notes)).toMatch(/year, make and model, not this VIN/);
  });

  it('takes the number alone when we have no NHTSA row to name the part from', async () => {
    const seen = client([], { nhtsaMissing: true });
    await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }));

    expect(seen.inserts[0][1].item_description).toBe('Recall 23V-441');
  });

  it('never takes the description from the request', async () => {
    /*
      A client sends a campaign number and nothing else. A description read
      off the body would be free text written into the service history by
      anything holding a token.
    */
    const seen = client();
    await POST(
      post({
        vehicleId: VEHICLE,
        campaignNumber: '23V-441',
        itemDescription: 'Engine rebuild',
        notes: 'paid $4,000',
        totalCost: 4000,
      })
    );

    const [, row] = seen.inserts[0];
    expect(row.item_description).toBe(described);
    expect(JSON.stringify(row)).not.toMatch(/Engine rebuild|4000/);
  });

  it('does not file it twice when the same campaign is marked again', async () => {
    // The upsert above it is idempotent; this half has to be too, and the
    // description is what makes the row findable.
    const seen = client([], { existingRecords: [{ id: 'already' }] });

    const body = await (await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }))).json();

    expect(body.recorded).toBe(true);
    expect(seen.inserts).toHaveLength(0);
  });

  it('keeps the mark when the record cannot be written', async () => {
    /*
      ⚠ The record is not the mark. The safety claim is the thing being
      stored; refusing it because a history row failed would lose the more
      important half. The response says which happened.
    */
    const seen = client();
    serviceRole.mockReturnValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { recalls: [] }, error: null }),
            order: () => Promise.resolve({ data: [], error: null }),
          }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        upsert: (values: unknown) => {
          seen.upserts.push(values);
          return Promise.resolve({ error: null });
        },
        insert: () => Promise.resolve({ error: { message: 'column missing' } }),
      }),
    });

    const response = await POST(post({ vehicleId: VEHICLE, campaignNumber: '23V-441' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.addressed).toMatchObject({ campaignNumber: '23V-441' });
    expect(body.recorded).toBe(false);
    expect(seen.upserts).toHaveLength(1);
  });

  it('takes the record back when the owner undoes the mark', async () => {
    /*
      A withdrawn claim that leaves a service record behind is worse than
      never filing one: the history would carry a repair the owner has just
      said did not happen, and the score would keep the credit.
    */
    const seen = client();

    await DELETE(
      new NextRequest(
        `https://tappet.test/api/v1/recalls?vehicleId=${VEHICLE}&campaignNumber=23V-441`,
        { method: 'DELETE' }
      )
    );

    expect(seen.deleteFilters).toContainEqual(['maintenance_line_items', 'vehicle_id', VEHICLE]);
    // Both spellings: the row may have been filed before the NHTSA read landed.
    expect(seen.removedDescriptions).toEqual([described, 'Recall 23V-441']);
  });

  it('removes the one spelling when there is nothing to name the part with', async () => {
    const seen = client([], { nhtsaMissing: true });

    await DELETE(
      new NextRequest(
        `https://tappet.test/api/v1/recalls?vehicleId=${VEHICLE}&campaignNumber=23V-441`,
        { method: 'DELETE' }
      )
    );

    expect(seen.removedDescriptions).toEqual(['Recall 23V-441']);
  });
});
