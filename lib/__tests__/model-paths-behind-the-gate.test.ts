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
 * ── The decision, David's, 17 Sep — twice ───────────────────────────────────
 *
 * The fork resolved as "keep the free tier, gate the model paths": an
 * account that has not paid costs nothing that calls a model, with one
 * exception chosen with the cost in front of him. The four:
 *
 *   fetchPowertrainOptions         → dossier    research about the model
 *   recomputePerformanceStats      → dossier    stock and modified figures
 *   generateQuoteRequestV2         → advisor    a second opinion on a quote
 *   generateVehicleHealthSummary   → FREE       the free tier's whole face;
 *                                               half a cent, once a car a day,
 *                                               bounded by the free ceiling
 *
 * The health score was gated under the advisor for two hours on 17 Sep
 * because "gate the four" was executed as written; it is asserted *ungated*
 * below so the reversal cannot quietly un-reverse. `recomputePerformanceStats`
 * is proven by mounting it in `performance-stats.test.ts`; the paths in
 * `actions.ts` are read here, because importing that module in a test means
 * importing the world. The quote gate lands with the quote path's metering
 * (`task_b2e011b4`), which is editing that function as this is written.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FREE_FEATURES,
  FREE_FEATURE_COPY,
  PAID_FEATURES,
  PAID_FEATURE_COPY,
} from '@tappet/core/paid-features';

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
  ['fetchPowertrainOptions', 'dossier', ACTIONS],
  ['recomputePerformanceStats', 'dossier', PERF],
];

describe('the health score is free — the one model path outside the gate, on purpose', () => {
  const body = bodyOf(ACTIONS, 'generateVehicleHealthSummary');

  it('calls the model with no feature gate in front of it', () => {
    expect(body).toContain('generateContent(');
    expect(body).not.toMatch(/checkFeatureAccess\(/);
  });

  it('is bounded by the free ceiling instead, below the cache', () => {
    // Half a cent a summary is still a bill; `FREE_MONTHLY_COST_USD` is what
    // bounds it, through the monthly ceiling every metered path checks.
    const cached = body.indexOf('cached: true');
    const ceiling = body.indexOf('if (!budget.allowed)');
    expect(cached).toBeGreaterThan(-1);
    expect(ceiling).toBeGreaterThan(cached);
    expect(body).toMatch(/checkMonthlyBudget\(access\.userId\)/);
  });

  it('is named in FREE_FEATURES, so every sentence that lists what is free carries it', () => {
    expect(FREE_FEATURES).toContain('health-score');
    expect(FREE_FEATURE_COPY['health-score'].label).toBe('Health score');
  });

  it('no paid feature’s paywall sentence names a free feature', () => {
    /*
      The advisor's blurb named the health score for the two hours the score
      was gated under it, and the recall refusal called recall alerts free
      for eighteen days after they moved to paid — both hand-written sentences
      nobody re-checked against the list they described. So every paid blurb
      is held against every free label, on every run, both ways.
    */
    const noun = (label: string) => label.replace(/^(Your|The) /, '').toLowerCase();
    /*
      A paid sentence may name a free feature as its *destination* — invoice
      scanning reads a receipt "into your service log" — and that is the one
      shape allowed, listed here so a new mention has to be added on purpose
      rather than slipping in as a subject. The advisor's two-hour blurb made
      the health score its subject; no entry here would have let it through.
    */
    const DESTINATION_MENTIONS: Partial<Record<(typeof PAID_FEATURES)[number], readonly (typeof FREE_FEATURES)[number][]>> = {
      'invoice-scanning': ['service-log'],
    };
    for (const paid of PAID_FEATURES) {
      const sentence = `${PAID_FEATURE_COPY[paid].label} ${PAID_FEATURE_COPY[paid].blurb}`.toLowerCase();
      for (const free of FREE_FEATURES) {
        if (DESTINATION_MENTIONS[paid]?.includes(free)) continue;
        expect(`${paid} names ${free}: ${sentence.includes(noun(FREE_FEATURE_COPY[free].label))}`).toBe(
          `${paid} names ${free}: false`
        );
      }
    }
    for (const free of FREE_FEATURES) {
      const sentence = `${FREE_FEATURE_COPY[free].label} ${FREE_FEATURE_COPY[free].blurb}`.toLowerCase();
      for (const paid of PAID_FEATURES) {
        expect(`${free} names ${paid}: ${sentence.includes(noun(PAID_FEATURE_COPY[paid].label))}`).toBe(
          `${free} names ${paid}: false`
        );
      }
    }
    // Anti-vacuous: the sentence that shipped for two hours fails this reader.
    const twoHours = 'A health score for each car from its own records, and answers about a noise, a quote or a job.';
    expect(twoHours.toLowerCase().includes(noun(FREE_FEATURE_COPY['health-score'].label))).toBe(true);
  });
});

describe('the model paths that went behind the gate', () => {
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
    // Powertrain options as they were: session, budget, cache, model — no gate.
    const before = `
export async function fetchPowertrainOptions(year: number) {
    const session = await requireSession();
    const budget = await checkMonthlyBudget(session.userId);
    const cached = powertrainCache.get(cacheKey);
    const response = await genAI.models.generateContent({
export async function fetchAllVehicles() {`;
    const body = bodyOf(before, 'fetchPowertrainOptions');
    expect(body).toContain('generateContent(');
    expect(body.search(/checkFeatureAccess\([^)]*'dossier'\)/)).toBe(-1);
    // And the reader stops at the next function rather than running to the end.
    expect(body).not.toContain('fetchAllVehicles');
  });
});
