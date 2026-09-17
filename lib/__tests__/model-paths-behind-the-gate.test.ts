/**
 * Every model call sits behind the feature gate — the four that did not, and
 * where each went.
 *
 * @jest-environment node
 *
 * ── Why this exists beside `paid-features.test.ts` ──────────────────────────
 *
 * That file's "every paid path is gated" asserts `checkFeatureAccess(…, 'x')`
 * appears somewhere in a *file*. `app/actions.ts` is 7,000 lines, and the
 * string appears in it for the advisor whether or not the health summary,
 * three thousand lines away, ever calls it — CLAUDE.md §5's anchoring failure,
 * and exactly how four model paths stayed outside the gate until 17 Sep with
 * every guard green. So this reads each *function's body*: from its signature
 * to the next top-level function, the gate must be called with that path's
 * feature, before the model is, and the refusal must carry E6's wire.
 *
 * ── The decision, David's, 17 Sep ───────────────────────────────────────────
 *
 * The fork resolved as "keep the free tier, gate every model path": an
 * account that has not paid costs nothing that calls a model. The four:
 *
 *   generateVehicleHealthSummary   → advisor    the score and the narrative
 *   fetchPowertrainOptions         → dossier    research about the model
 *   recomputePerformanceStats      → dossier    stock and modified figures
 *   generateQuoteRequestV2         → advisor    a second opinion on a quote
 *
 * The third is proven by mounting it in `performance-stats.test.ts`; the two
 * in `actions.ts` are read here, because importing that module in a test
 * means importing the world. The fourth lands with the quote path's metering
 * (`task_b2e011b4`), which is editing that function as this is written.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PAID_FEATURES } from '@tappet/core/paid-features';

const ROOT = join(__dirname, '..', '..');
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** A top-level function's body: its signature to the next top-level function. */
function bodyOf(source: string, name: string): string {
  const start = source.search(new RegExp(`^(?:export )?async function ${name}\\(`, 'm'));
  if (start < 0) throw new Error(`no top-level function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/^(?:export )?(?:async )?function \w+\(/m);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

const ACTIONS = stripComments(read('app', 'actions.ts'));
const PERF = stripComments(read('lib', 'performance-stats.ts'));

const GATED: Array<[string, string, string]> = [
  ['generateVehicleHealthSummary', 'advisor', ACTIONS],
  ['fetchPowertrainOptions', 'dossier', ACTIONS],
  ['recomputePerformanceStats', 'dossier', PERF],
];

describe('the four model paths that were outside the gate', () => {
  it.each(GATED)('%s calls the gate for %s, before the model, and returns the wire', (name, feature, source) => {
    const body = bodyOf(source, name);
    const gate = body.search(new RegExp(`checkFeatureAccess\\([^)]*'${feature}'\\)`));
    const model = body.indexOf('generateContent(');

    expect(`${name}: gate ${gate > -1 ? 'found' : 'MISSING'}`).toBe(`${name}: gate found`);
    expect(`${name}: model ${model > -1 ? 'found' : 'MISSING'}`).toBe(`${name}: model found`);
    expect(gate).toBeLessThan(model);
    // E6's wire: the refusal leaves with its code and feature, written out.
    expect(body).toMatch(/code: \w+\.code, feature: \w+\.feature/);
    expect((PAID_FEATURES as readonly string[]).includes(feature)).toBe(true);
  });

  it('the health summary refuses below the cache read — a lapsed owner keeps the last one', () => {
    const body = bodyOf(ACTIONS, 'generateVehicleHealthSummary');
    const cached = body.indexOf('cached: true');
    const gate = body.search(/checkFeatureAccess\([^)]*'advisor'\)/);
    expect(cached).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(cached);
  });

  it('powertrain options refuse above their cache — the gate is on the feature, not the call', () => {
    const body = bodyOf(ACTIONS, 'fetchPowertrainOptions');
    const cache = body.indexOf('powertrainCache.get(');
    const gate = body.search(/checkFeatureAccess\([^)]*'dossier'\)/);
    expect(cache).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(cache);
  });

  it('every caller of the performance recompute hands it the account that is spending', () => {
    // Three callers, one parameter — the reason the gate lives inside.
    const callers = [
      read('app', 'api', 'v1', 'performance-stats', 'route.ts'),
      read('app', 'api', 'v1', 'wishlist', 'complete', 'route.ts'),
      bodyOf(ACTIONS, 'uploadInvoice'),
    ];
    for (const source of callers) {
      const call = source.slice(source.indexOf('recomputePerformanceStats({'));
      const close = call.indexOf('})');
      expect(call.slice(0, close)).toMatch(/userId: access\.userId/);
    }
    // And the route forwards the wire, so a client can open the paywall on the code.
    expect(read('app', 'api', 'v1', 'performance-stats', 'route.ts')).toMatch(/code: result\.code, feature: result\.feature/);
  });

  it('can still detect the shape that shipped, so this is not vacuous', () => {
    // The health summary as it was: budget, cache, model — no gate.
    const before = `
export async function generateVehicleHealthSummary(vehicleId: string, forceRefresh: boolean = false) {
    const budget = await checkMonthlyBudget(access.userId);
    if (hoursSinceGenerated < 24) {
      return { success: true, data: existingHealth, cached: true };
    }
    if (!budget.allowed) {
      return { success: false, error: budgetMessage(budget) };
    }
    const result = await genAI.models.generateContent({
export async function fetchAllVehicles() {`;
    const body = bodyOf(before, 'generateVehicleHealthSummary');
    expect(body).toContain('generateContent(');
    expect(body.search(/checkFeatureAccess\([^)]*'advisor'\)/)).toBe(-1);
    // And the reader stops at the next function rather than running to the end.
    expect(body).not.toContain('fetchAllVehicles');
  });
});
