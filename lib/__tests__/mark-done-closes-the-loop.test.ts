/**
 * Marking a service done moves what is due — the route's half.
 *
 * @jest-environment node
 *
 * ── The finding (QE 1.3, 20 Sep) ─────────────────────────────────────────────
 *
 * Marked "Engine Oil and Filter Change" done (DIY, today) on the Accord. The
 * row was written — with `mileage_at_service: null` and `total_cost: 0` —
 * and the DUE tab still read "due in 2,500 mi" with ADD offered again. A
 * record with no mileage cannot move a miles interval; nothing re-projected
 * the next service; nothing touched the score. Three writes, none of which
 * changed what the owner was looking at.
 *
 * Read from source, like the other v1 route guards: the properties worth
 * pinning are what is written and what runs afterwards, and both are text.
 * `wishlist-completion.test.ts` executes the client half.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { completionPayload, emptyCompletion } from '@tappet/core/wishlist-completion';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const complete = code(read('app', 'api', 'v1', 'wishlist', 'complete', 'route.ts'));
const post = complete.slice(complete.indexOf('export async function POST'));
const insert = post.slice(post.indexOf(".from('maintenance_line_items')"), post.indexOf('.select()', post.indexOf(".from('maintenance_line_items')")));

describe('the record carries what the schedule reads from', () => {
  it('the sheet sends the field the route writes — one name on both sides', () => {
    // The client half sends `mileageAtService`; the route reads exactly that.
    const payload = completionPayload('item', { ...emptyCompletion('2026-09-20', 170_000), isDIY: true });
    expect(payload.mileageAtService).toBe(170_000);
    expect(post).toMatch(/\bmileageAtService\b/);
  });

  it('writes the odometer at the time of the work', () => {
    expect(post).toMatch(/mileageAtService,/);
    expect(insert).toMatch(/mileage_at_service:\s*mileage,/);
  });

  it('stores a blank cost as null — never a claim the job was free', () => {
    expect(insert).toMatch(/parts_cost:\s*parts,/);
    expect(insert).toMatch(/labor_cost:\s*labor,/);
    expect(insert).not.toMatch(/partsCost \|\| 0|laborCost \|\| 0/);
    expect(post).toMatch(/const totalCost = parts === null && labor === null \? null : \(parts \?\? 0\) \+ \(labor \?\? 0\)/);
  });
});

describe('what a new record changes, changed here', () => {
  it('re-projects the next service after the record and the plan row are written', () => {
    const wrote = post.indexOf(".from('wishlist_items')\n      .delete()");
    const projected = post.indexOf('await projectNextService(vehicleId)');
    expect(wrote).toBeGreaterThan(-1);
    expect(projected).toBeGreaterThan(wrote);
  });

  it('moves the odometer only forward, through the rule every mileage write uses', () => {
    expect(post).toMatch(/if \(current !== null && mileage > current\)/);
    expect(post).toMatch(/validateMileageUpdate\(\{ current, next: mileage \}\)/);
    expect(post).toMatch(/current_mileage: mileage, last_mileage_update_date/);
  });

  it('stamps the score stale, the way an invoice upload does', () => {
    expect(post).toMatch(/from\('vehicle_health_summary'\)[\s\S]{0,80}last_generated: '2000-01-01T00:00:00\.000Z'/);
    // And never holds the completion for a model call.
    expect(post).not.toMatch(/generateVehicleHealthSummary\(/);
  });

  it('the mileage PATCH re-projects too — a confirmed reading moves what is due', () => {
    const vehicles = code(read('app', 'api', 'v1', 'vehicles', 'route.ts'));
    const patch = vehicles.slice(vehicles.indexOf('export async function PATCH'), vehicles.indexOf('export async function POST'));
    expect(patch).toMatch(/if \(!writeError\) await projectNextService\(vehicleId as string\)/);
  });

  it('the wishlist add stores no estimate as null, not 0', () => {
    const add = code(read('app', 'api', 'v1', 'wishlist', 'route.ts'));
    expect(add).toMatch(/estimated_cost_parts:\s*typeof estimatedCostParts === 'number' \? estimatedCostParts : null/);
    expect(add).not.toMatch(/estimated\w+ \|\| 0/);
  });

  it('can still detect the route that shipped, so this is not vacuous', () => {
    const shipped = code(`
    const totalCost = (partsCost || 0) + (laborCost || 0);
      .from('maintenance_line_items')
      .insert({
        parts_cost: partsCost || 0,
        labor_cost: laborCost || 0,
        total_cost: totalCost,
      })
      .select()`);
    const old = shipped.slice(shipped.indexOf(".from('maintenance_line_items')"), shipped.indexOf('.select()'));
    expect(old).not.toMatch(/mileage_at_service/);
    expect(old).toMatch(/partsCost \|\| 0/);
    expect(shipped).not.toMatch(/projectNextService/);
  });
});
