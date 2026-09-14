/**
 * A Needs item added from the web dossier carries the reason and the figure
 * the phone's catalogue would have written — the same row from either client.
 *
 * @jest-environment node
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * The phone's catalogue (`WishlistAddScreen`) writes three things with an
 * item: the name, the reason (`description` — "six weeks later a row
 * reading 'Charge pipe' has lost the only thing that made it a
 * recommendation"), and the figure (`source_data.note` / `.value` — the
 * interval, the mileage window, the effort — which the Needs row prints in
 * its numeral column). The web's dossier cards wrote the name alone, so a
 * row added on the web read bare on the phone: no reason beneath, an empty
 * figure slot. Same dossier, same car, two different rows.
 *
 * The server holds the dossier, and core already turns it into suggestions
 * (`suggestionsFor`), so the action looks the item up by its identifier —
 * the one spelling every client shares — and writes what core says. A
 * name the dossier does not carry is written as before; a failed read of
 * the dossier never fails the add (the reason is worth having, not worth
 * losing the item over).
 *
 * The insert is captured through the client the authorizer hands back, and
 * the first case is proven against an action that ignores the dossier.
 */

jest.mock('@/lib/api-auth', () => ({ authorizeVehicleAccess: jest.fn() }));

import { authorizeVehicleAccess } from '@/lib/api-auth';
import { addItemToWishlist } from '@/lib/actions/wishlist';
import { suggestionsFor } from '@tappet/core/wishlist-suggestions';
import { wishlistItemIdentifier } from '@tappet/core/wishlist-identifier';

const authorize = authorizeVehicleAccess as jest.Mock;
const VEHICLE = '11111111-2222-3333-4444-555555555555';

/** The 10th-gen Accord's dossier, the shape `vehicle_knowledge_base` holds. */
const KNOWLEDGE = {
  known_issues: [
    {
      part: '10th Gen CVT Transmission',
      description: 'CVT fluid degradation causes shudder and hesitation under light throttle.',
      mileage_range: '60,000 - 100,000 miles',
      severity: 'high',
    },
  ],
  maintenance_schedule: [
    { service: 'Engine Oil (0W-20 Full Synthetic)', interval_miles: 5000, interval_months: 12, priority: 'critical' },
  ],
  common_mods: [{ name: 'K&N Drop-in Air Filter', purpose: 'A little more induction noise.', difficulty: 'Easy' }],
};

interface Seen {
  inserts: Array<Record<string, unknown>>;
}

function client(knowledge: unknown, { knowledgeFails = false } = {}): Seen {
  const seen: Seen = { inserts: [] };
  authorize.mockResolvedValue({
    ok: true,
    client: {
      from: (table: string) => {
        if (table === 'vehicle_knowledge_base') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  knowledgeFails
                    ? Promise.reject(new Error('PostgREST is having a day'))
                    : Promise.resolve({ data: knowledge, error: null }),
              }),
            }),
          };
        }
        if (table === 'wishlist_items') {
          return {
            insert: (row: Record<string, unknown>) => {
              seen.inserts.push(row);
              return { select: () => ({ single: () => Promise.resolve({ data: { id: 'w1', ...row }, error: null }) }) };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  });
  return seen;
}

describe('a Needs item added from the web dossier', () => {
  it('carries the reason and the figure core gives it', async () => {
    const seen = client(KNOWLEDGE);
    const result = await addItemToWishlist(VEHICLE, 'Engine Oil (0W-20 Full Synthetic)', 'maintenance');

    expect(result.success).toBe(true);
    expect(seen.inserts).toHaveLength(1);
    const row = seen.inserts[0];

    const expected = suggestionsFor(KNOWLEDGE).find(
      (s) => s.identifier === wishlistItemIdentifier('maintenance', 'Engine Oil (0W-20 Full Synthetic)')
    );
    expect(expected).toBeDefined();
    expect(expected?.value).toBe('5,000 MI / 12 MO');

    expect(row.description).toBe(expected?.reason);
    expect(row.source_data).toEqual({ note: expected?.note, value: expected?.value });
    expect(row.source).toBe('dossier');
    expect(row.item_identifier).toBe(expected?.identifier);
  });

  it('spans an issue’s window and names a mod’s effort the same way the phone does', async () => {
    const issues = client(KNOWLEDGE);
    await addItemToWishlist(VEHICLE, '10th Gen CVT Transmission', 'issue');
    expect(issues.inserts[0].source_data).toMatchObject({ value: '60,000–100,000 MI' });
    expect(String(issues.inserts[0].description)).toMatch(/shudder/);

    const mods = client(KNOWLEDGE);
    await addItemToWishlist(VEHICLE, 'K&N Drop-in Air Filter', 'modification');
    expect(mods.inserts[0].source_data).toMatchObject({ value: 'EASY' });
  });

  it('writes a name the dossier does not carry as it always did', async () => {
    const seen = client(KNOWLEDGE);
    const result = await addItemToWishlist(VEHICLE, 'Something the owner typed', 'maintenance');

    expect(result.success).toBe(true);
    const row = seen.inserts[0];
    expect(row.item_name).toBe('Something the owner typed');
    expect(row).not.toHaveProperty('description');
    expect(row).not.toHaveProperty('source_data');
  });

  it('never loses the item over a dossier that would not read', async () => {
    const seen = client(KNOWLEDGE, { knowledgeFails: true });
    const result = await addItemToWishlist(VEHICLE, 'Engine Oil (0W-20 Full Synthetic)', 'maintenance');

    expect(result.success).toBe(true);
    expect(seen.inserts).toHaveLength(1);
    expect(seen.inserts[0]).not.toHaveProperty('source_data');
  });

  it('writes nothing for an item with no figure to carry', async () => {
    const seen = client({
      ...KNOWLEDGE,
      common_mods: [{ name: 'Short shifter', purpose: 'A shorter throw.' }],
    });
    await addItemToWishlist(VEHICLE, 'Short shifter', 'modification');
    const row = seen.inserts[0];
    expect(row.description).toBe('A shorter throw.');
    expect(row).not.toHaveProperty('source_data');
  });
});
