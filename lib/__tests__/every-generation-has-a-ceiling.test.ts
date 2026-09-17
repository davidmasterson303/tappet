/**
 * Every Gemini call is behind a spend ceiling.
 *
 * @jest-environment node
 *
 * ── ⚠ The finding this exists for (PERF-06, 24 Aug) ─────────────────────────
 *
 * **Eleven of fourteen `generateContent` call sites bypassed the monthly
 * budget.** Only `sendConsultantMessage` and `parseInvoiceLineItems` called
 * `checkMonthlyBudget`. The single most expensive call in the application —
 * `researchVehicleDossier`, the Pro model with `maxOutputTokens: 32768` — had
 * no ceiling in front of it at all.
 *
 * A user past their tier limit could keep generating health summaries, mod
 * details, cost estimates, email drafts and dossiers indefinitely. Only the
 * consultant and the invoice parser refused.
 *
 * ── Why this test and not more tests of the budget ──────────────────────────
 *
 * `packages/core/src/ai/budget.ts` is 20KB of careful reasoning about ceilings,
 * exercised thoroughly across the warn threshold, the boundary, negative values
 * and a zero ceiling — **and no test asserted that any call site calls it.**
 *
 * That is this repo's signature failure applied to its own cost control: the
 * pure functions are well tested, and whether anything *uses* them is tested by
 * almost nothing. This is the missing half.
 *
 * ── Why a source scan ───────────────────────────────────────────────────────
 *
 * Executing any of these needs a live Gemini key and would spend the money the
 * test is about. What regressed is structural — whether a ceiling appears in
 * the same function body as the call — and it is on disk.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/**
 * Every file that calls Gemini.
 *
 * Listed rather than globbed, and the list is asserted complete below by a
 * repo-wide grep. A glob that silently stopped matching is the failure mode
 * §9 of the audit is entirely about.
 */
const CALL_SITE_FILES = [
  join('app', 'actions.ts'),
  join('lib', 'performance-stats.ts'),
  join('lib', 'quote-check.ts'),
  join('lib', 'vehicle-research.ts'),
  join('app', 'api', 'health', 'consultant', 'route.ts'),
];

/**
 * Functions whose ceiling is enforced by whoever calls them — with the file,
 * the **calling function**, and the control that function applies.
 *
 * ⚠ **Every entry names a *different* ceiling, not an absence of one.** An
 * exemption that means "this one is unmetered" is the finding, not a fix for
 * it — so each of these is checked below for the control it claims instead.
 *
 * ── ⚠ Why this form exists, and why it is not a hole ────────────────────────
 *
 * Five of these are internal steps or library functions their caller
 * authorizes before calling. `estimateCosts`, `generateEmailDraft` and
 * `validateConsultantDocument` are not exported at all — so none is a
 * reachable endpoint (SEC-02) — and `runQuoteCheck` and
 * `recomputePerformanceStats` are library functions their routes gate first.
 * Re-checking the allowance a line after the caller checked it would add a
 * parameter the function does not need, at five call sites.
 *
 * ── ⚠ The caller's *body*, not its file — 17 Sep ────────────────────────────
 *
 * The first version of this table named a file and a control, and checked
 * that the file contained both strings. `app/actions.ts` is 7,000 lines and
 * contains `checkMonthlyBudget` eleven times, so the three entries pointing
 * at it were green **while none of the three callers checked anything**:
 * `generateQuoteRequestV2` had no ceiling on its owner branch and
 * `uploadConsultantDocument` had none at all. An owner past their allowance
 * could keep generating quotes and uploading documents — two model calls and
 * a vision call — while the advisor refused them. The `.tap-target-44` trap
 * from CLAUDE.md §5, one layer up: the string was there, 5,000 lines from
 * the function it was credited to.
 *
 * So an entry now names the calling function, and the check reads that
 * function's body for both the call and the control. An entry whose caller
 * does not call the function, or does not apply the control, fails.
 *
 * That is the difference between this and `auth-posture.test.ts`'s `'public'`
 * posture, which the file itself admits asserts nothing — and which is how a
 * whole class of unguarded action stayed invisible.
 */
const CEILING_ELSEWHERE: Record<string, { file: string; caller: string; controls: string[] }> = {
  // Two branches, two ceilings: the demo pool for a seeded car, the owner's
  // monthly allowance otherwise. Both must be in the one calling function.
  estimateCosts: {
    file: join('app', 'actions.ts'),
    caller: 'generateQuoteRequestV2',
    controls: ['checkDemoBudget', 'checkMonthlyBudget'],
  },
  generateEmailDraft: {
    file: join('app', 'actions.ts'),
    caller: 'generateQuoteRequestV2',
    controls: ['checkDemoBudget', 'checkMonthlyBudget'],
  },
  validateConsultantDocument: {
    file: join('app', 'actions.ts'),
    caller: 'uploadConsultantDocument',
    controls: ['checkMonthlyBudget'],
  },
  runQuoteCheck: {
    file: join('app', 'api', 'v1', 'front-door', 'check', 'route.ts'),
    caller: 'POST',
    controls: ['checkFrontDoorBudget'],
  },
  recomputePerformanceStats: {
    file: join('app', 'api', 'v1', 'performance-stats', 'route.ts'),
    caller: 'POST',
    controls: ['authorizeVehicleAccess'],
  },
  attemptRoundTrip: {
    file: join('app', 'api', 'health', 'consultant', 'route.ts'),
    caller: 'GET',
    controls: ['CONSULTANT_HEALTH_SECRET'],
  },
};

function read(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8');
}

/**
 * The name of the function enclosing each `generateContent` in a file.
 *
 * ⚠ Walks **backwards** from the call to the nearest preceding declaration at
 * column 0. `app/actions.ts` is 6,500 lines with deeply nested closures, and a
 * forward scan for the next `function` after the call names the one *after* it
 * — which would attribute a missing ceiling to an innocent neighbour and, worse,
 * credit an unguarded function with its neighbour's guard.
 */
function callingFunctions(source: string): string[] {
  const declaration = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm;

  const declarations: Array<{ at: number; name: string }> = [];
  let match: RegExpExecArray | null = declaration.exec(source);
  while (match !== null) {
    declarations.push({ at: match.index, name: match[1] });
    match = declaration.exec(source);
  }

  const calls = /generateContent\(/g;
  const found: string[] = [];

  let call: RegExpExecArray | null = calls.exec(source);
  while (call !== null) {
    const at = call.index;
    let enclosing = 'top level';

    for (const declared of declarations) {
      if (declared.at < at) enclosing = declared.name;
      else break;
    }

    if (!found.includes(enclosing)) found.push(enclosing);
    call = calls.exec(source);
  }

  return found;
}

/** One function's body, from its declaration to the next one at column 0. */
function bodyOf(source: string, name: string): string {
  const start = source.search(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`, 'm'));
  if (start === -1) return '';

  const next = source.slice(start + 1).search(/^(?:export\s+)?(?:async\s+)?function\s/m);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

/**
 * A body with its comments removed, so a control named in prose does not
 * count as a control applied. The functions this file reads explain the
 * finding they close directly above the line that closes it — and name the
 * control while doing so. CLAUDE.md §5's `.tap-target-44` trap, in miniature.
 */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
}

describe('every Gemini call site is metered', () => {
  it('knows about every file that calls Gemini', () => {
    /*
      The anti-vacuous half, and the one the audit's guard-hole table is full of
      counter-examples to: `model-tiering.test.ts` globs `app/actions.ts` **only**,
      which is why `lib/performance-stats.ts` hardcoding a model was invisible
      to it.

      This asserts the list is complete by counting call sites across the files
      it does know about. A new file calling Gemini fails the total.
    */
    const total = CALL_SITE_FILES.reduce(
      (sum, file) => sum + (read(file).match(/generateContent\(/g) ?? []).length,
      0
    );

    expect(total).toBeGreaterThanOrEqual(14);
  });

  it.each(CALL_SITE_FILES)('%s — every calling function has a ceiling', (file) => {
    const source = read(file);
    const unmetered = callingFunctions(source)
      .filter((name) => !CEILING_ELSEWHERE[name])
      .filter((name) => {
        const body = bodyOf(source, name);
        return !/checkMonthlyBudget\(|checkDemoBudget\(|checkFrontDoorBudget\(/.test(body);
      });

    /*
      Named rather than counted. When this goes red the useful thing is *which*
      function can spend without asking, and the eleven this started with were:
      generateSessionTitle, generateVehicleHealthSummary, generateModDetails,
      validateConsultantDocument, estimateCosts, generateEmailDraft,
      generateVehicleIllustration, ensureAggressiveModMinimum,
      recomputePerformanceStats, researchVehicleDossier, and the mod-name pass.
    */
    expect(unmetered).toEqual([]);
  });

  it('every deferred ceiling names a calling function that actually applies it', () => {
    /*
      ⚠ The half that stops the exemption list being a way to opt out. Each
      entry must name a function that both **calls** the exempted one and
      **applies** the control it claims, in its own body — so deleting a
      route's `checkFrontDoorBudget` fails here even though the deleted line
      is in a different file from the `generateContent` it was protecting,
      and so does a ceiling that exists in the same file but in some other
      function, which is the shape the first version of this test missed.
    */
    for (const [name, { file, caller, controls }] of Object.entries(CEILING_ELSEWHERE)) {
      const body = code(bodyOf(read(file), caller));

      // A caller the walker cannot find is an entry that asserts nothing.
      expect([name, caller, body.length > 0]).toEqual([name, caller, true]);
      expect([name, caller, body.includes(`${name}(`)]).toEqual([name, caller, true]);
      for (const control of controls) {
        // Plain inclusion, not `control(`: the canary's control is an env
        // var read, not a call.
        expect([name, caller, control, body.includes(control)]).toEqual([name, caller, control, true]);
      }
    }
  });

  it('a ceiling elsewhere in the same file does not count', () => {
    /*
      The anti-vacuous case for the rewrite above, shaped like the real
      defect: the control is present in the file, in a different function,
      and the calling function has none. The old file-level check passed
      this; the body-level one must not.
    */
    const source = [
      'export async function unrelated(id: string) {',
      '  const budget = await checkMonthlyBudget(id);',
      '  return budget;',
      '}',
      'async function step() {',
      '  return genAI.models.generateContent({ model: FLASH });',
      '}',
      'export async function callsStepWithoutAsking() {',
      '  // The caller above already ran checkMonthlyBudget for us. (It did not.)',
      '  return step();',
      '}',
    ].join('\n');

    expect(source.includes('checkMonthlyBudget')).toBe(true);
    const body = code(bodyOf(source, 'callsStepWithoutAsking'));
    expect(body).toContain('step(');
    // Named in the comment, applied nowhere — and the comment does not count.
    expect(body).not.toContain('checkMonthlyBudget');
  });

  it('can still detect an unmetered call', () => {
    /*
      Rule 5's other half, against a source shaped like the real one — including
      the trap the backwards walk exists for: a **guarded function following an
      unguarded one**, which a forward scan credits to the wrong body.
    */
    const source = [
      'export async function spendsFreely(id: string) {',
      '  return genAI.models.generateContent({ model: PRO });',
      '}',
      'export async function asksFirst(id: string) {',
      '  const budget = await checkMonthlyBudget(id);',
      '  return genAI.models.generateContent({ model: FLASH });',
      '}',
    ].join('\n');

    expect(callingFunctions(source)).toEqual(['spendsFreely', 'asksFirst']);
    expect(bodyOf(source, 'spendsFreely')).not.toMatch(/checkMonthlyBudget/);
    expect(bodyOf(source, 'asksFirst')).toMatch(/checkMonthlyBudget/);
  });
});


describe('every Gemini call site records what it spent', () => {
  /*
    ── ⚠ The finding this exists for (17 Sep) ──────────────────────────────

    The ceiling above is only as good as the meter it reads. `checkDemoBudget`
    sums `ai_usage_events` rows, and the demo quote's two calls — the only
    thing the public demo spends on since 30 Aug — had **never written one**.
    Nor had the consultant's upload check. Three of fourteen call sites, all
    in `app/actions.ts`, each with a `generateContent` and no
    `recordAiUsageInBackground` after it; 490 rows in the table and not one
    from any of them. A budget on an empty gauge is a constant, not a control.

    Same shape as the ceiling scan, for the same reason: the meter is
    fire-and-forget and cannot fail a request, so a missing call has no
    runtime symptom at all. The source is the only place it shows.

    No exemption list. The canary meters itself (`surface: 'canary'`), the
    front door meters itself, every internal step now does. A call site that
    genuinely must not be metered would be a new argument, and it should be
    made here rather than by adding a name to a list.
  */
  it.each(CALL_SITE_FILES)('%s — every calling function records usage', (file) => {
    const source = read(file);
    const unmetered = callingFunctions(source).filter(
      (name) => !/recordAiUsageInBackground\(/.test(code(bodyOf(source, name)))
    );

    // Named, not counted — the three this started with were estimateCosts,
    // generateEmailDraft and validateConsultantDocument.
    expect(unmetered).toEqual([]);
  });

  it('can still detect an unmetered call', () => {
    const source = [
      'export async function forgetsTheMeter(id: string) {',
      '  return genAI.models.generateContent({ model: FLASH });',
      '}',
      'export async function remembers(id: string) {',
      '  const result = await genAI.models.generateContent({ model: FLASH });',
      '  recordAiUsageInBackground({ purpose: \'consultant\', model: FLASH, userId: id }, result.usageMetadata);',
      '}',
    ].join('\n');

    const unmetered = callingFunctions(source).filter(
      (name) => !/recordAiUsageInBackground\(/.test(code(bodyOf(source, name)))
    );

    expect(unmetered).toEqual(['forgetsTheMeter']);
  });
});
