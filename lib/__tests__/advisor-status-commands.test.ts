/**
 * The advisor's status tags change the rows they name, and only those.
 *
 * @jest-environment node
 *
 * Audit 360, SEC-3 (1 Oct). `[UPDATE_ISSUE_STATUS: <identifier>|completed]`
 * fed the model's identifier to `.ilike()`, so `%%` — two characters, past the
 * parser's floor — completed every tracked issue and deleted every issue on
 * the owner's Needs. Model output follows attached documents; one line of
 * small print on an invoice was enough.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStatusCommands } from '@tappet/core/consultant-commands';
import { applyStatusCommand } from '../advisor-status-commands';

type Row = Record<string, unknown> & { id: string; vehicle_id: string };

/** An in-memory table set that honours eq / in, and records every write. */
function fakeClient(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: 'update' | 'delete'; ids: string[]; values?: unknown }> = [];
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let op: 'select' | 'update' | 'delete' = 'select';
    let values: unknown;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (v: unknown) => ((op = 'update'), (values = v), chain),
      delete: () => ((op = 'delete'), chain),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), chain),
      in: (column: string, list: unknown[]) => (filters.push((row) => list.includes(row[column])), chain),
      ilike: () => {
        throw new Error('ilike must not be reached');
      },
      then: (resolve: (v: unknown) => unknown) => {
        const hit = rows();
        if (op !== 'select') writes.push({ table, op, ids: hit.map((r) => r.id), values });
        if (op === 'delete') tables[table] = (tables[table] ?? []).filter((r) => !hit.includes(r));
        return Promise.resolve({ data: op === 'select' ? hit : null, error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { client: { from } as never, writes };
}

const CAR = 'car-1';
const tables = () => ({
  known_issue_tracking: [
    { id: 'i1', vehicle_id: CAR, issue_identifier: 'Water Pump Failure' },
    { id: 'i2', vehicle_id: CAR, issue_identifier: 'Timing Chain Stretch' },
    { id: 'i3', vehicle_id: 'someone-else', issue_identifier: 'Water Pump Failure' },
  ],
  wishlist_items: [
    { id: 'w1', vehicle_id: CAR, item_type: 'issue', item_name: 'water pump failure' },
    { id: 'w2', vehicle_id: CAR, item_type: 'issue', item_name: 'Timing Chain Stretch' },
  ],
});

describe('applyStatusCommand', () => {
  it('a wildcard identifier changes nothing — the finding', async () => {
    const { commands } = parseStatusCommands('[UPDATE_ISSUE_STATUS: %%|completed]', 'UPDATE_ISSUE_STATUS');
    // Anti-vacuous: the parser really does hand this to the writer.
    expect(commands).toEqual([{ identifier: '%%', status: 'completed' }]);

    for (const identifier of ['%%', '%', '**', '_%', 'Water%']) {
      const { client, writes } = fakeClient(tables());
      const result = await applyStatusCommand(client, CAR, 'issue', { identifier, status: 'completed' });
      expect(result.updated).toBe(0);
      expect(writes).toEqual([]);
    }
  });

  it('the named issue, matched ignoring case, on this car only — and its Need goes', async () => {
    const t = tables();
    const { client, writes } = fakeClient(t);
    const result = await applyStatusCommand(client, CAR, 'issue', { identifier: 'water pump FAILURE', status: 'completed' }, '2026-10-01');

    expect(result.updated).toBe(1);
    expect(writes[0]).toEqual({
      table: 'known_issue_tracking',
      op: 'update',
      ids: ['i1'],
      values: { status: 'completed', completed_date: '2026-10-01' },
    });
    expect(writes[1]).toMatchObject({ table: 'wishlist_items', op: 'delete', ids: ['w1'] });
    expect(t.wishlist_items.map((w) => w.id)).toEqual(['w2']);
  });

  it('the action no longer hands model output to ilike', () => {
    const actions = readFileSync(join(__dirname, '..', '..', 'app', 'actions.ts'), 'utf8');
    expect(actions).toMatch(/applyStatusCommand\(client, vehicleId, 'issue', cmd\)/);
    expect(actions).toMatch(/applyStatusCommand\(client, vehicleId, 'mod', cmd\)/);
    expect(actions).not.toMatch(/\.ilike\([^)]*cmd\.identifier\)/);
    // Can still detect the shipped shape.
    expect(".ilike('issue_identifier', cmd.identifier);").toMatch(/\.ilike\([^)]*cmd\.identifier\)/);
  });
});
