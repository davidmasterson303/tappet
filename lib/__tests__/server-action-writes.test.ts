/**
 * A server action writes named columns, to rows of the car it authorized.
 *
 * @jest-environment node
 *
 * Audit 360, security round 3 (1 Oct). Next compiles every export of a
 * `'use server'` file into a POST endpoint, and a parameter's TypeScript type
 * is erased at that boundary — the client posts whatever it likes. Two shapes
 * shipped, both behind a correct authorization:
 *
 *   - SEC-12 · `updateServiceItem(itemId, updates: any)` → `.update(updates)`:
 *     `vehicle_id` was the caller's to choose, so a free account could move
 *     its own line onto the public demo's Accord.
 *   - SEC-14 · `updateVehicleTCOFields` → `.update({ ...fields, … })`:
 *     `is_demo`, `user_id` and `vin` were writable.
 *   - SEC-13 · `moveServiceItemToHistory` authorized `vehicleId`, then read
 *     and deleted `serviceItemId` alone with the service role — the demo's
 *     service-item ids are anon-readable, so any account could empty the
 *     demo's Needs.
 *
 * And the sweep of every export found two more of the second kind:
 *   - `generateQuoteRequestV2` read `.in('id', selectedItemIds)` with no
 *     vehicle filter — another car's items, into a quote, from the demo.
 *   - `getModificationDetailsBatch` (a `read` action, so open to a demo
 *     visitor) enqueued whatever mod names it was sent into the demo cars'
 *     queue.
 *
 * Part 1 is a scanner over every `'use server'` file; part 2 executes the
 * fixed actions against a recording client.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

const ROOT = join(__dirname, '..', '..');

// ── Part 1 · the scanner ────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '__tests__', '.next', 'apps', 'packages']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** True when the module's first statement is the directive (comments aside). */
export function isServerModule(source: string): boolean {
  const code = source.replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  return /^['"]use server['"]/.test(code);
}

export interface WriteFinding {
  fn: string;
  call: string;
}

export interface ScanResult {
  /** Exported functions — each one a POST endpoint. */
  exports: number;
  /** Every named function scanned, exported or not. */
  functions: number;
  writes: number;
  findings: WriteFinding[];
}

/*
 * ⚠ Audit 360, SEC-19 (round 4). The first version of this scanner was a
 * regex over the text between one `export` and the next, and it flagged a
 * write only when the payload *was* a parameter or spread one. The reviewer
 * ran it and every one of these came back clean: an alias
 * (`const row = { ...fields }; .update(row)`), a plain rename, an
 * `Object.assign({}, updates)`, a nested destructure in the signature, and a
 * non-exported helper — which sat outside every export's slice, so its write
 * was not even counted. It now reads the TypeScript syntax tree (the compiler
 * is already a root devDependency), so comments and strings are not code by
 * construction, and it follows a client value through the function: a
 * parameter is tainted; so is anything declared, assigned, destructured,
 * `Object.assign`ed or iterated from a tainted value. Every named function is
 * scanned, exported or not: a helper that writes whatever it is handed is
 * flagged, because its caller is one refactor from handing it a client object.
 *
 * Not followed, deliberately: a value passed through a call to a function of
 * our own (`tcoPatch(fields)` is how an allow-list is written), a property
 * value (`{ vehicle_id: vehicleId }`), and `.filter`/`.map` results.
 */

type FnLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

const WRITE_METHODS = new Set(['update', 'insert', 'upsert']);

function bindingNames(name: ts.BindingName, acc: string[] = []): string[] {
  if (ts.isIdentifier(name)) acc.push(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, acc);
  return acc;
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
    else if (ts.isSatisfiesExpression(e)) e = e.expression;
    else return e;
  }
}

function calleeName(call: ts.CallExpression): string {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    return `${callee.expression.text}.${callee.name.text}`;
  }
  return '';
}

const PASS_THROUGH = new Set(['Object.assign', 'structuredClone', 'JSON.parse', 'JSON.stringify', 'Object.fromEntries', 'Object.entries', 'Array.from']);

/** Whether this expression carries a tainted value whole (not a field of it by name). */
function isTainted(expr: ts.Expression, tainted: Set<string>): boolean {
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) return tainted.has(e.text);
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return isTainted(e.expression, tainted);
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.some((p) => ts.isSpreadAssignment(p) && isTainted(p.expression, tainted));
  }
  if (ts.isArrayLiteralExpression(e)) {
    return e.elements.some((el) => (ts.isSpreadElement(el) ? isTainted(el.expression, tainted) : isTainted(el, tainted)));
  }
  if (ts.isConditionalExpression(e)) return isTainted(e.whenTrue, tainted) || isTainted(e.whenFalse, tainted);
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return isTainted(e.left, tainted) || isTainted(e.right, tainted);
    }
    return false;
  }
  if (ts.isAwaitExpression(e)) return isTainted(e.expression, tainted);
  if (ts.isCallExpression(e) && PASS_THROUGH.has(calleeName(e))) {
    return e.arguments.some((a) => (ts.isSpreadElement(a) ? isTainted(a.expression, tainted) : isTainted(a, tainted)));
  }
  return false;
}

function isFunctionLike(node: ts.Node): node is FnLike {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}

/** Every name in `fn` that can hold a client value, to a fixed point. */
function taintOf(fn: FnLike): Set<string> {
  const tainted = new Set<string>();
  for (const p of fn.parameters) bindingNames(p.name, []).forEach((n) => tainted.add(n));
  if (!fn.body) return tainted;

  let grew = true;
  const add = (names: string[]) => {
    for (const n of names) if (!tainted.has(n)) { tainted.add(n); grew = true; }
  };
  while (grew) {
    grew = false;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && isTainted(node.initializer, tainted)) {
        add(bindingNames(node.name));
      } else if (
        ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) && isTainted(node.right, tainted)
      ) {
        add([node.left.text]);
      } else if (ts.isCallExpression(node)) {
        // Object.assign(row, updates) taints `row`.
        const [target, ...rest] = node.arguments;
        if (calleeName(node) === 'Object.assign' && target && ts.isIdentifier(unwrap(target)) &&
            rest.some((a) => isTainted(ts.isSpreadElement(a) ? a.expression : a, tainted))) {
          add([(unwrap(target) as ts.Identifier).text]);
        }
        // updates.forEach((u) => …) taints `u`.
        const callee = node.expression;
        if (ts.isPropertyAccessExpression(callee) && isTainted(callee.expression, tainted)) {
          for (const a of node.arguments) {
            if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
              for (const p of a.parameters) add(bindingNames(p.name));
            }
          }
        }
      } else if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && isTainted(node.expression, tainted)) {
        const init = node.initializer;
        if (ts.isVariableDeclarationList(init)) init.declarations.forEach((d) => add(bindingNames(d.name)));
        else if (ts.isIdentifier(init)) add([init.text]);
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
  }
  return tainted;
}

/** The top-level named functions: declarations and `const f = (…) => …`. */
function namedFunctions(sf: ts.SourceFile): Array<{ name: string; fn: FnLike; exported: boolean }> {
  const out: Array<{ name: string; fn: FnLike; exported: boolean }> = [];
  const isExported = (node: ts.Node) =>
    (ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.push({ name: stmt.name.text, fn: stmt, exported: isExported(stmt) });
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        const init = d.initializer && unwrap(d.initializer);
        if (init && ts.isIdentifier(d.name) && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          out.push({ name: d.name.text, fn: init, exported: isExported(stmt) });
        }
      }
    }
  }
  return out;
}

/**
 * Every `.update(` / `.insert(` / `.upsert(` in the module, and the ones
 * whose payload carries a function's parameter whole — directly, through an
 * alias, a spread, `Object.assign`, a destructure or a loop.
 */
export function findClientObjectWrites(raw: string): ScanResult {
  const sf = ts.createSourceFile('scan.ts', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fns = namedFunctions(sf);
  const result: ScanResult = { exports: fns.filter((f) => f.exported).length, functions: fns.length, writes: 0, findings: [] };
  const taintCache = new Map<FnLike, Set<string>>();
  const owner = new Map<FnLike, string>(fns.map((f) => [f.fn, f.name]));

  const visit = (node: ts.Node, outer: FnLike | null) => {
    const scope = outer ?? (isFunctionLike(node) && owner.has(node) ? node : null);
    if (
      ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      WRITE_METHODS.has(node.expression.name.text) && node.arguments.length > 0
    ) {
      result.writes++;
      if (scope) {
        if (!taintCache.has(scope)) taintCache.set(scope, taintOf(scope));
        const payload = node.arguments[0];
        if (isTainted(payload, taintCache.get(scope)!)) {
          const text = payload.getText(sf).replace(/\s+/g, ' ');
          result.findings.push({ fn: owner.get(scope)!, call: `.${node.expression.name.text}(${text.slice(0, 60)})` });
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };
  visit(sf, null);
  return result;
}

describe('no server action writes a client object without an allow-list', () => {
  const files = walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'lib')))
    .filter((file) => isServerModule(readFileSync(file, 'utf8')));
  const relativeFiles = files.map((f) => relative(ROOT, f)).sort();

  it('found the server modules', () => {
    expect(relativeFiles).toEqual(expect.arrayContaining([
      'app/actions.ts',
      'app/account-actions.ts',
      'lib/actions/wishlist.ts',
    ]));
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))('%s', (_name, file) => {
    const scan = findClientObjectWrites(readFileSync(file, 'utf8'));
    expect(scan.exports).toBeGreaterThan(0);
    expect(scan.findings).toEqual([]);
  });

  it('read the whole of app/actions.ts, not a fragment of it', () => {
    const scan = findClientObjectWrites(readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8'));
    expect(scan.exports).toBeGreaterThanOrEqual(70);
    // SEC-19: the helpers too — 91 named functions on 1 Oct, 16 not exported.
    expect(scan.functions - scan.exports).toBeGreaterThanOrEqual(10);
    expect(scan.writes).toBeGreaterThanOrEqual(50);
  });

  /*
    SEC-19 (round 4): each shape the reviewer ran against the regex scanner
    and got zero findings from. One finding each, and the helper's write is
    counted.
  */
  it.each([
    ['an alias of a spread', `export async function a(vehicleId: string, fields: any) {
      const row = { ...fields };
      await client.from('vehicles').update(row).eq('id', vehicleId);
    }`],
    ['a plain alias', `export async function a(itemId: string, updates: any) {
      const patch = updates;
      await client.from('service_items').update(patch).eq('id', itemId);
    }`],
    ['Object.assign inline', `export async function a(itemId: string, updates: any) {
      await client.from('service_items').update(Object.assign({}, updates, { updated_at: now })).eq('id', itemId);
    }`],
    ['Object.assign into a local', `export async function a(itemId: string, updates: any) {
      const row: Record<string, unknown> = {};
      Object.assign(row, updates);
      await client.from('service_items').update(row).eq('id', itemId);
    }`],
    ['a nested destructure in the signature', `export async function a({ vehicleId, body: { row } }: Input) {
      await client.from('things').insert(row);
    }`],
    ['a destructure in the body', `export async function a(input: Input) {
      const { body: { row } } = input;
      await client.from('things').insert(row);
    }`],
    ['a reassigned let', `export async function a(input: Input) {
      let row;
      row = input.row;
      await client.from('things').insert(row);
    }`],
    ['a loop over a parameter', `export async function a(rows: Row[]) {
      for (const row of rows) await client.from('things').insert(row);
    }`],
    ['a callback over a parameter', `export async function a(rows: Row[]) {
      await Promise.all(rows.map((row) => client.from('things').insert(row)));
    }`],
    ['a defaulted payload', `export async function a(itemId: string, updates?: any) {
      await client.from('service_items').update(updates ?? {}).eq('id', itemId);
    }`],
    ['an array of it', `export async function a(row: any) {
      await client.from('things').insert([row]);
    }`],
  ])('SEC-19 · can still detect %s', (_shape, source) => {
    const scan = findClientObjectWrites(source);
    expect(scan.writes).toBe(1);
    expect(scan.findings).toHaveLength(1);
  });

  it('SEC-19 · can still detect a non-exported helper, and counts its write', () => {
    const source = `
      async function persist(client: Client, updates: any) {
        await client.from('service_items').update(updates).eq('id', updates.id);
      }
      const persistArrow = async (client: Client, row: any) => {
        await client.from('things').insert({ ...row });
      };
      export async function updateServiceItem(itemId: string, updates: unknown) {
        await persist(getServiceRoleClient(), updates);
        await persistArrow(getServiceRoleClient(), updates);
      }`;
    const scan = findClientObjectWrites(source);
    expect(scan.exports).toBe(1);
    expect(scan.functions).toBe(3);
    expect(scan.writes).toBe(2);
    expect(scan.findings.map((f) => f.fn)).toEqual(['persist', 'persistArrow']);
  });

  it('SEC-19 · passes what an allow-list, a stored row or a named column produces', () => {
    const clean = `export async function a(vehicleId: string, fields: unknown, names: string[]) {
      const checked = tcoPatch(fields);
      const row = { ...checked.patch, updated_at: now };
      await client.from('vehicles').update(row).eq('id', vehicleId);
      const { data: stored } = await client.from('service_items').select('*').eq('vehicle_id', vehicleId);
      for (const item of stored ?? []) await client.from('history').insert({ vehicle_id: vehicleId, description: item.description });
      await Promise.all((stored ?? []).map((item) => client.from('copies').insert(item)));
      await client.from('queue').upsert(names.map((name) => ({ vehicle_id: vehicleId, mod_name: name })));
    }`;
    const scan = findClientObjectWrites(clean);
    expect(scan.writes).toBe(4);
    expect(scan.findings).toEqual([]);
  });

  it('can still detect each shape that shipped (anti-vacuous)', () => {
    const shipped = [
      `export async function updateServiceItem(itemId: string, updates: any) {
        const { data } = await client.from('service_items').update(updates).eq('id', itemId);
      }`,
      `export async function updateVehicleTCOFields(vehicleId: string, fields: { avg_mpg?: number }) {
        await client.from('vehicles').update({
          ...fields,
          updated_at: new Date().toISOString(),
        }).eq('id', vehicleId);
      }`,
      `export async function saveThing({ vehicleId, row }: { vehicleId: string; row: any }) {
        await client.from('things').insert(row as Thing);
      }`,
      `export async function saveNested(input: { row: Row }) {
        await client.from('things').upsert(input.row, { onConflict: 'id' });
      }`,
    ];
    for (const source of shipped) {
      expect(findClientObjectWrites(source).findings).toHaveLength(1);
    }
  });

  it('passes a payload built from named columns', () => {
    const fixed = `export async function updateVehicleTCOFields(vehicleId: string, fields: unknown) {
      const checked = tcoPatch(fields);
      await client.from('vehicles').update({ ...checked.patch, updated_at: now }).eq('id', vehicleId);
      await client.from('service_items').insert({ vehicle_id: vehicleId, description: data.description });
    }`;
    const scan = findClientObjectWrites(fixed);
    expect(scan.writes).toBe(2);
    expect(scan.findings).toEqual([]);
  });

  it('reads code, not the comments that quote the old shape', () => {
    const quoted = `export async function a(updates: unknown) {
      /* This was \`.update(updates)\` — see SEC-12. */
      // and .insert({ ...updates }) too
      await client.from('t').update({ name: 'https://example.com/x' });
    }`;
    const scan = findClientObjectWrites(quoted);
    expect(scan.writes).toBe(1);
    expect(scan.findings).toEqual([]);
  });

  it('isServerModule reads the directive, not a mention of it', () => {
    expect(isServerModule("'use server';\nexport async function a() {}")).toBe(true);
    expect(isServerModule("/** doc */\n'use server';\n")).toBe(true);
    expect(isServerModule("/** a 'use server' file may only export … */\nimport x from 'y';")).toBe(false);
  });
});

// ── Part 2 · the fixed actions, executed ────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  createServerActionClient: jest.fn(),
  getServerClient: jest.fn(),
  supabase: {},
}));
jest.mock('@/lib/api-auth', () => ({
  NOT_FOUND_MESSAGE: 'Vehicle not found',
  requireSession: jest.fn(),
  requireCaller: jest.fn(),
  authorizeVehicleAccess: jest.fn(),
  authorizeVehicleScopedRow: jest.fn(),
}));

import { getServiceRoleClient } from '@/lib/supabase';
import { authorizeVehicleAccess, authorizeVehicleScopedRow } from '@/lib/api-auth';
import { DEMO_VEHICLE_IDS } from '@tappet/core/demo';
import {
  getModificationDetailsBatch,
  moveServiceItemToHistory,
  updateServiceItem,
  updateVehicleTCOFields,
} from '@/app/actions';
import { serviceItemPatch, tcoPatch } from '@/lib/action-patches';

const DEMO_ACCORD = DEMO_VEHICLE_IDS[0];
const OWN_CAR = 'b1000000-0000-0000-0000-00000000000b';
const DEMO_ITEM = '4a8f50c3-e320-4e65-ad9d-47fb02c03909';
const OWN_ITEM = 'c1000000-0000-0000-0000-00000000000c';

interface Query {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

/** A recording client over a tiny `service_items` table. */
function recordingClient(log: Query[], rows: Array<Record<string, unknown>>) {
  const matches = (q: Query) =>
    rows.filter((r) => q.filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)));
  return {
    from(table: string) {
      const q: Query = { table, op: 'select', filters: [] };
      log.push(q);
      const one = () => {
        if (q.op === 'insert') return { data: { id: 'new-row', ...(q.payload as object) }, error: null };
        if (table === 'service_items') return { data: matches(q)[0] ?? null, error: null };
        return { data: null, error: null };
      };
      const builder: any = {
        select: () => builder,
        insert: (p: unknown) => ((q.op = 'insert'), (q.payload = p), builder),
        update: (p: unknown) => ((q.op = 'update'), (q.payload = p), builder),
        upsert: (p: unknown) => ((q.op = 'upsert'), (q.payload = p), builder),
        delete: () => ((q.op = 'delete'), builder),
        eq: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        in: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => one(),
        single: async () => one(),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: q.op === 'select' ? [] : null, error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
}

let log: Query[];
const writes = () => log.filter((q) => q.op !== 'select');

beforeEach(() => {
  log = [];
  (getServiceRoleClient as jest.Mock).mockReturnValue(
    recordingClient(log, [
      { id: DEMO_ITEM, vehicle_id: DEMO_ACCORD, description: 'CVT Fluid Flush', category: 'maintenance', cost_parts: 120, cost_labor: 80 },
      { id: OWN_ITEM, vehicle_id: OWN_CAR, description: 'Brake pads', category: 'repair', cost_parts: 90, cost_labor: 60 },
    ])
  );
  (authorizeVehicleAccess as jest.Mock).mockResolvedValue({ ok: true, isDemo: false, userId: 'u1' });
  (authorizeVehicleScopedRow as jest.Mock).mockResolvedValue({ ok: true, isDemo: false, userId: 'u1', vehicleId: OWN_CAR });
});

describe('SEC-12 · updateServiceItem', () => {
  it('refuses a vehicle_id, so its own line cannot be moved onto the demo', async () => {
    const result = await updateServiceItem(OWN_ITEM, { vehicle_id: DEMO_ACCORD, description: 'Planted' });
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it.each([['id'], ['created_at'], ['vehicle_id']])('refuses %s', async (column) => {
    const result = await updateServiceItem(OWN_ITEM, { [column]: 'x' });
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('refuses an uncapped description with the SEC-10 sentence', async () => {
    const result = await updateServiceItem(OWN_ITEM, { description: 'x'.repeat(4_001) });
    expect(result).toEqual({ success: false, error: 'The description must be 4,000 characters or fewer.' });
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: writes named columns, scoped to the authorized car', async () => {
    const result = await updateServiceItem(OWN_ITEM, { description: 'Front brake pads', cost_parts: 95 });
    expect(result.success).toBe(true);
    expect(writes()).toEqual([
      {
        table: 'service_items',
        op: 'update',
        payload: { description: 'Front brake pads', cost_parts: 95 },
        filters: [['id', OWN_ITEM], ['vehicle_id', OWN_CAR]],
      },
    ]);
  });
});

describe('SEC-13 · moveServiceItemToHistory', () => {
  it('cannot read or delete the demo’s item from the caller’s own car', async () => {
    const result = await moveServiceItemToHistory(DEMO_ITEM, OWN_CAR, { dateCompleted: '2026-10-01' });
    expect(result).toEqual({ success: false, error: 'Service item not found' });
    expect(writes()).toEqual([]);
    const read = log.find((q) => q.table === 'service_items');
    expect(read?.filters).toEqual([['id', DEMO_ITEM], ['vehicle_id', OWN_CAR]]);
  });

  it('refuses an invoice path filed under another car', async () => {
    const result = await moveServiceItemToHistory(OWN_ITEM, OWN_CAR, {
      dateCompleted: '2026-10-01',
      invoiceUrl: `placeholder://${DEMO_ACCORD}/invoices/1700000000000-receipt.pdf`,
    });
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: files the caller’s own item and deletes it from that car only', async () => {
    const result = await moveServiceItemToHistory(OWN_ITEM, OWN_CAR, { dateCompleted: '2026-10-01', shopName: 'Main Street Auto' });
    expect(result.success).toBe(true);
    const [insert, remove] = writes();
    expect(insert).toMatchObject({ table: 'maintenance_line_items', op: 'insert', payload: { vehicle_id: OWN_CAR, item_description: 'Brake pads' } });
    expect(remove).toEqual({ table: 'service_items', op: 'delete', filters: [['id', OWN_ITEM], ['vehicle_id', OWN_CAR]] });
  });
});

describe('SEC-14 · updateVehicleTCOFields', () => {
  it.each([
    [{ is_demo: true }],
    [{ user_id: '00000000-0000-0000-0000-000000000000' }],
    [{ vin: 'DEMO1HGCV1F30JA000001' }],
    [{ avg_mpg: 30, is_demo: true }],
    [{ avg_mpg: -1 }],
    [{ purchase_price: '25000' }],
  ])('refuses %j', async (fields) => {
    const result = await updateVehicleTCOFields(OWN_CAR, fields as never);
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: the four numbers the modal sends are written, and nothing else', async () => {
    const result = await updateVehicleTCOFields(OWN_CAR, {
      purchase_price: 24_500,
      avg_mpg: 31.5,
      fuel_price_per_gallon: null,
      insurance_monthly: 112,
    });
    expect(result.success).toBe(true);
    const [update] = writes();
    expect(update.table).toBe('vehicles');
    expect(Object.keys(update.payload as object).sort()).toEqual(
      ['avg_mpg', 'fuel_price_per_gallon', 'insurance_monthly', 'purchase_price', 'updated_at']
    );
    expect(update.filters).toEqual([['id', OWN_CAR]]);
  });
});

describe('sweep · a demo read writes nothing', () => {
  it('getModificationDetailsBatch does not enqueue for a demo visitor', async () => {
    (authorizeVehicleAccess as jest.Mock).mockResolvedValue({ ok: true, isDemo: true, userId: null });
    await getModificationDetailsBatch(DEMO_ACCORD, ['x'.repeat(10_000), 'Anything at all'], 'moderate');
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: an owner’s missing details are still enqueued', async () => {
    await getModificationDetailsBatch(OWN_CAR, ['Cold air intake'], 'moderate');
    expect(writes()).toEqual([
      expect.objectContaining({ table: 'mod_detail_queue', op: 'upsert' }),
    ]);
  });
});

describe('sweep · generateQuoteRequestV2 reads only the authorized car’s items', () => {
  it('the service-item read is scoped to the vehicle before the id list', () => {
    const actions = readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8');
    const start = actions.indexOf('export async function generateQuoteRequestV2(');
    expect(start).toBeGreaterThan(-1);
    const body = actions.slice(start);
    const read = /\.from\('service_items'\)\s*\.select\('\*'\)\s*([\s\S]*?)\.in\('id', selectedItemIds\)/.exec(body);
    expect(read).not.toBeNull();
    expect(read![1]).toMatch(/\.eq\('vehicle_id', vehicleId\)/);
  });

  it('anti-vacuous: the shipped read has no vehicle filter', () => {
    const shipped = `.from('service_items')
        .select('*')
        .in('id', selectedItemIds);`;
    const read = /\.from\('service_items'\)\s*\.select\('\*'\)\s*([\s\S]*?)\.in\('id', selectedItemIds\)/.exec(shipped);
    expect(read![1]).not.toMatch(/\.eq\('vehicle_id', vehicleId\)/);
  });
});

describe('the allow-lists themselves', () => {
  it('serviceItemPatch refuses a non-object and an empty patch', () => {
    expect(serviceItemPatch(null).ok).toBe(false);
    expect(serviceItemPatch([]).ok).toBe(false);
    expect(serviceItemPatch({}).ok).toBe(false);
    expect(serviceItemPatch({ status: 'pwned' }).ok).toBe(false);
    expect(serviceItemPatch({ date_completed: 'yesterday' }).ok).toBe(false);
  });

  it('serviceItemPatch keeps null as null, never 0', () => {
    expect(serviceItemPatch({ cost_labor: null })).toEqual({ ok: true, patch: { cost_labor: null } });
  });

  it('tcoPatch refuses non-finite numbers', () => {
    expect(tcoPatch({ avg_mpg: Number.NaN }).ok).toBe(false);
    expect(tcoPatch({ avg_mpg: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(tcoPatch({ avg_mpg: 0 })).toEqual({ ok: true, patch: { avg_mpg: 0 } });
  });
});
