/**
 * What a server action may write, built from what the caller sent.
 *
 * ── Audit 360, SEC-12 / SEC-14 (round 3, 1 Oct) ─────────────────────────────
 *
 * Two exports of `app/actions.ts` proved the caller owned one row and then
 * wrote the caller's object into it whole, with the service role:
 *
 *   updateServiceItem(itemId, updates: any)   → .update(updates)
 *   updateVehicleTCOFields(vehicleId, fields) → .update({ ...fields, … })
 *
 * A TypeScript parameter type is erased at the action boundary — Next
 * compiles every export of a `'use server'` file into a POST endpoint, and a
 * client posts whatever it likes. So `vehicle_id` was the caller's to choose
 * on a service item (a free account could move its own line onto the public
 * demo's Accord, where every visitor reads it), and `is_demo`, `user_id` and
 * `vin` were the caller's to choose on a vehicle.
 *
 * The rule these enforce: **name every writable column**, check each value's
 * type and bound, and *refuse* a key that is not on the list rather than drop
 * it. Dropping would hide a broken or hostile caller behind a success; a
 * refusal is the loud failure (CLAUDE.md §6). Neither of the legitimate
 * callers sends anything else — `TCOInputsModal` sends the four numbers, and
 * nothing in the web or the phone calls `updateServiceItem` at all.
 *
 * A refusal carries a sentence only when it is a length the owner can fix
 * (the existing SEC-10 sentences); otherwise the action answers with its own
 * `COULD_NOT_SAVE`. No new customer copy.
 *
 * `lib/__tests__/server-action-writes.test.ts` scans every `'use server'`
 * file for the shape these replace.
 */

import {
  SERVICE_DESCRIPTION_MAX,
  markDoneFieldProblem,
  wishlistFieldProblem,
} from '@tappet/core/input-bounds';

export type PatchResult<T> = { ok: true; patch: T } | { ok: false; error?: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/** `null`, or a finite number in [0, max]. `undefined` means "not sent". */
function moneyOrNull(value: unknown, max: number): { ok: boolean; value?: number | null } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    return { ok: false };
  }
  return { ok: true, value };
}

function stringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

// ── service_items ───────────────────────────────────────────────────────────

/**
 * The columns an owner may change on one of their own service items.
 * Never `id`, `vehicle_id` or `created_at`.
 */
export const SERVICE_ITEM_WRITABLE = [
  'description',
  'category',
  'status',
  'cost_parts',
  'cost_labor',
  'notes',
  'date_completed',
  'shop_name',
] as const;

type ServiceItemColumn = (typeof SERVICE_ITEM_WRITABLE)[number];
export type ServiceItemPatch = Partial<Record<ServiceItemColumn, string | number | null>>;

/** `serviceItemSchema`'s enums (`@tappet/core/validation`), which production's rows all fall inside. */
const SERVICE_CATEGORIES = new Set(['maintenance', 'repair', 'modification', 'upgrade']);
const SERVICE_STATUSES = new Set(['wishlist', 'scheduled', 'completed', 'purchased']);
const COST_MAX = 1_000_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function serviceItemPatch(input: unknown): PatchResult<ServiceItemPatch> {
  if (!isPlainObject(input)) return { ok: false };

  const patch: ServiceItemPatch = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (!(SERVICE_ITEM_WRITABLE as readonly string[]).includes(key)) return { ok: false };
    const column = key as ServiceItemColumn;

    switch (column) {
      case 'description':
        if (typeof value !== 'string' || value.trim().length === 0) return { ok: false };
        if (value.length > SERVICE_DESCRIPTION_MAX) {
          return { ok: false, error: wishlistFieldProblem({ description: value }) ?? undefined };
        }
        patch.description = value;
        break;
      case 'category':
        if (typeof value !== 'string' || !SERVICE_CATEGORIES.has(value)) return { ok: false };
        patch.category = value;
        break;
      case 'status':
        if (typeof value !== 'string' || !SERVICE_STATUSES.has(value)) return { ok: false };
        patch.status = value;
        break;
      case 'cost_parts':
      case 'cost_labor': {
        const money = moneyOrNull(value, COST_MAX);
        if (!money.ok) return { ok: false };
        patch[column] = money.value ?? null;
        break;
      }
      case 'notes': {
        if (!stringOrNull(value)) return { ok: false };
        const problem = wishlistFieldProblem({ notes: value });
        if (problem) return { ok: false, error: problem };
        patch.notes = value as string | null;
        break;
      }
      case 'shop_name': {
        if (!stringOrNull(value)) return { ok: false };
        const problem = markDoneFieldProblem({ shopName: value });
        if (problem) return { ok: false, error: problem };
        patch.shop_name = value as string | null;
        break;
      }
      case 'date_completed':
        if (value !== null && (typeof value !== 'string' || !ISO_DATE.test(value))) return { ok: false };
        patch.date_completed = value as string | null;
        break;
    }
  }

  if (Object.keys(patch).length === 0) return { ok: false };
  return { ok: true, patch };
}

// ── vehicles: the cost-of-ownership inputs ─────────────────────────────────

export const TCO_WRITABLE = [
  'purchase_price',
  'avg_mpg',
  'fuel_price_per_gallon',
  'insurance_monthly',
] as const;

type TcoColumn = (typeof TCO_WRITABLE)[number];
export type TcoPatch = Partial<Record<TcoColumn, number | null>>;

/**
 * Generous ceilings — they exist to refuse nonsense, not to edit an owner.
 * A purchase price is the only one that is legitimately large.
 */
const TCO_MAX: Record<TcoColumn, number> = {
  purchase_price: 100_000_000,
  avg_mpg: 1_000,
  fuel_price_per_gallon: 1_000,
  insurance_monthly: 1_000_000,
};

export function tcoPatch(input: unknown): PatchResult<TcoPatch> {
  if (!isPlainObject(input)) return { ok: false };

  const patch: TcoPatch = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (!(TCO_WRITABLE as readonly string[]).includes(key)) return { ok: false };
    const column = key as TcoColumn;
    const money = moneyOrNull(value, TCO_MAX[column]);
    if (!money.ok) return { ok: false };
    patch[column] = money.value ?? null;
  }

  if (Object.keys(patch).length === 0) return { ok: false };
  return { ok: true, patch };
}
