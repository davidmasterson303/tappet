/**
 * @jest-environment node
 *
 * Three failure states, three messages — and no message that tells someone to
 * retry something retrying cannot fix.
 *
 * ── What this guards, and why it was proven red first ───────────────────────
 *
 * Until 17 Sep `app/api/v1/consultant/route.ts` answered every decline that
 * was not a feature refusal with 502, the phone rendered 502 as "could not
 * answer that one — try again", and the web rendered every `success: false`
 * as "Sorry, I encountered an error. Please try again." with the server's
 * sentence discarded. So a spent monthly allowance, Google's
 * `RESOURCE_EXHAUSTED` (the project quota, or the prepay balance at $0 — one
 * throw, every key on the account), a rejected credential and the demo's
 * fixed list all invited a retry. One status was carrying three meanings.
 *
 * `@tappet/core/ai/advisor-failure` is the registry; this file is the ratchet.
 * It was made to fail before it passed — the generic branch deleted from the
 * route so `budget-exhausted` fell through to 502, the phone's code branch
 * moved below its 429 branch — and both runs went red naming the file and
 * line. A guard that has only ever been shown to pass is worth much less.
 *
 * Every scan below carries its anti-vacuous case (CLAUDE.md §5): the same
 * reader against the shape it replaced, so a reader that silently matches
 * nothing cannot report a clean tree.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@/app/actions', () => ({
  sendConsultantMessage: jest.fn(),
  createConsultantSession: jest.fn(),
  getConsultantSession: jest.fn(),
  generateSessionTitle: jest.fn(),
}));
jest.mock('@/lib/api-auth', () => ({ authorizeVehicleAccess: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/v1/consultant/route';
import { sendConsultantMessage } from '@/app/actions';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { classifyGeminiFailure } from '@/lib/gemini';
import {
  ADVISOR_FAILURE_CODES,
  ADVISOR_UNAVAILABLE_MESSAGE,
  isAdvisorFailureCode,
  retryCannotHelp,
} from '@tappet/core/ai/advisor-failure';
import { classifyModelFailure, CREDENTIAL_MARKERS, QUOTA_MARKER } from '@tappet/core/ai/model-failure';
import { CLIENT_ERROR_FALLBACK, classifyRoundTrip } from '@tappet/core/consultant-health';
import { DEMO_BUDGET } from '@tappet/core/ai/budget';
import { DEMO_VEHICLE_IDS } from '@tappet/core/demo';
import { ADVISOR_NAME } from '@tappet/core/prompts';

const ROOT = join(__dirname, '..', '..');
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8');

/** Source with its comments removed, so a scan cannot match prose. */
const rendered = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

const send = sendConsultantMessage as jest.Mock;
const authorize = authorizeVehicleAccess as jest.Mock;

/** The phone's retry line for a 502, and the web's fallback — the two strings no coded failure may reach. */
const PHONE_RETRY = 'The advisor could not answer that one. Your question is still here — try again.';

function post(body: unknown): NextRequest {
  return new NextRequest('https://tappet.test/api/v1/consultant', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const ask = () => post({ vehicleId: DEMO_VEHICLE_IDS[0], message: 'Is this quote fair?' });

beforeEach(() => {
  jest.clearAllMocks();
  authorize.mockResolvedValue({ ok: true, isDemo: true, userId: null });
});

describe('the registry', () => {
  it('knows the four codes and nothing else', () => {
    expect([...ADVISOR_FAILURE_CODES].sort()).toEqual(
      ['advisor-unavailable', 'budget-exhausted', 'demo-unanswered', 'needs-subscription'].sort()
    );
    for (const code of ADVISOR_FAILURE_CODES) expect(retryCannotHelp(code)).toBe(true);
    // The transient failure has no code, and that absence is the contract.
    expect(retryCannotHelp(undefined)).toBe(false);
    expect(retryCannotHelp(null)).toBe(false);
    expect(retryCannotHelp('')).toBe(false);
    expect(isAdvisorFailureCode('rate-limited')).toBe(false);
  });

  it('never says sorry, error or try again, and names the advisor from the constant', () => {
    expect(ADVISOR_UNAVAILABLE_MESSAGE.toLowerCase()).not.toMatch(/sorry|error|try again|please retry|later/);
    expect(ADVISOR_UNAVAILABLE_MESSAGE).toMatch(/retrying will not help/);
    expect(ADVISOR_UNAVAILABLE_MESSAGE.startsWith(`${ADVISOR_NAME} `)).toBe(true);
    // The literal may exist once, in `prompts.ts` — advice-says-it-is-generated.test.ts.
    expect(rendered(read('packages', 'core', 'src', 'ai', 'advisor-failure.ts'))).not.toMatch(/['"`]Jay\b/);
  });
});

describe('the route — one status per meaning', () => {
  it.each([
    ['budget-exhausted', 429, 'You have used this month’s AI allowance. It resets on October 1.'],
    ['advisor-unavailable', 503, ADVISOR_UNAVAILABLE_MESSAGE],
    ['demo-unanswered', 422, 'The demo answers a fixed set of questions about these three cars, written in advance.'],
  ])('%s leaves as %i with its code and its sentence, never as 502', async (code, status, sentence) => {
    send.mockResolvedValue({ success: false, error: sentence, code });

    const response = await POST(ask());
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.status).not.toBe(502);
    expect(body).toEqual({ success: false, error: sentence, code });
  });

  it('keeps the feature refusal on 402 with its feature', async () => {
    send.mockResolvedValue({
      success: false,
      error: 'The advisor is part of Tappet Plus.',
      code: 'needs-subscription',
      feature: 'advisor',
    });

    const response = await POST(ask());

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: 'needs-subscription', feature: 'advisor' });
  });

  it('still answers an uncoded decline with 502 — the one exit worth a retry', async () => {
    // Anti-vacuous: the retry path exists and the code is what keeps the
    // others off it, not the absence of a 502.
    send.mockResolvedValue({ success: false, error: 'Failed to get response from consultant' });

    const response = await POST(ask());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ success: false, error: 'Failed to get response from consultant' });
  });

  it('has no coded failure mapped to 502 in its table', () => {
    const source = read('app', 'api', 'v1', 'consultant', 'route.ts');
    const table = source.slice(source.indexOf('const FAILURE_STATUS'), source.indexOf('};', source.indexOf('const FAILURE_STATUS')));
    for (const code of ADVISOR_FAILURE_CODES) expect(table).toMatch(new RegExp(`'${code}': \\d{3}`));
    expect(table).not.toMatch(/: 502/);
  });
});

describe('the classifier — Google’s 429 is not our 429', () => {
  it('reads RESOURCE_EXHAUSTED as a quota nobody asking can fix', () => {
    const fromStatus = classifyModelFailure({ status: 429, message: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}' });
    const fromBodyOnly = classifyModelFailure({ status: null, message: `got status: ${QUOTA_MARKER}. {"error":{}}` });

    for (const failure of [fromStatus, fromBodyOnly]) {
      expect(failure.kind).toBe('quota');
      expect(failure.retryable).toBe(false);
      expect(failure.marker).toBe(QUOTA_MARKER);
    }
  });

  it.each(CREDENTIAL_MARKERS)('reads %s as a credential the visitor cannot fix', (marker) => {
    const failure = classifyModelFailure({ status: 400, message: `{"error":{"status":"${marker}"}}` });
    expect(failure.kind).toBe('credential');
    expect(failure.retryable).toBe(false);
  });

  it.each([401, 403])('reads a bare %i as a credential', (status) => {
    expect(classifyModelFailure({ status, message: 'nope' }).retryable).toBe(false);
  });

  it.each([500, 502, 503, 504])('reads %i as transient — retrying is honest advice', (status) => {
    const failure = classifyModelFailure({ status, message: '{"error":{"status":"UNAVAILABLE"}}' });
    expect(failure.kind).toBe('transient');
    expect(failure.retryable).toBe(true);
  });

  it('treats a throw it cannot name as transient, the safe default', () => {
    expect(classifyModelFailure({ status: null, message: 'ECONNRESET' }).retryable).toBe(true);
    expect(classifyModelFailure({}).retryable).toBe(true);
  });

  it('reads the SDK’s ApiError shape — status as a number, Google’s body as the message', () => {
    // What `@google/genai` throws: `new ApiError({ message: JSON.stringify(errorBody), status })`.
    const apiError = Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'), {
      name: 'ApiError',
      status: 429,
    });
    expect(classifyGeminiFailure(apiError)).toMatchObject({ kind: 'quota', retryable: false, status: 429 });
    expect(classifyGeminiFailure(new Error('fetch failed'))).toMatchObject({ kind: 'transient', retryable: true, status: null });
    expect(classifyGeminiFailure('a string')).toMatchObject({ kind: 'transient', retryable: true });
  });

  it('agrees with the canary about what a quota looks like', () => {
    // The monitor and the product read one table. A 429 carrying the marker
    // is `degraded` there and non-retryable here; if either stops, the
    // sentence below stops being honest.
    const health = classifyRoundTrip(
      { httpStatus: 429, errorText: `{"error":{"status":"${QUOTA_MARKER}"}}` },
      ['CVT']
    );
    expect(health.status).not.toBe('good');
    expect(health.detail).toContain(QUOTA_MARKER);
    expect(health.detail).toMatch(/balance/);
  });
});

describe('the action — which exits carry a code', () => {
  const actions = read('app', 'actions.ts');
  const body = rendered(
    actions.slice(
      actions.indexOf('export async function sendConsultantMessage('),
      actions.indexOf('export async function fetchAllVehicles(')
    )
  );

  it('codes the spent allowance, the demo’s list and the unreachable model', () => {
    expect(body).toMatch(/error: budgetMessage\(budget\), code: 'budget-exhausted'/);
    expect(body).toMatch(/error: DEMO_UNANSWERED, code: 'demo-unanswered'/);
    expect(body).toMatch(/const failure = classifyGeminiFailure\(error\);/);
    expect(body).toMatch(/if \(!failure\.retryable\)[\s\S]*?error: ADVISOR_UNAVAILABLE_MESSAGE, code: 'advisor-unavailable'/);
  });

  it('leaves the transient failure uncoded', () => {
    expect(body).toMatch(/return \{ success: false, error: 'Failed to get response from consultant' \};/);
  });

  it('can still detect the old shape, so this is not vacuous', () => {
    const before = "return { success: false, error: 'Failed to get response from consultant' };\n  }\n}";
    expect(rendered(before)).not.toMatch(/classifyGeminiFailure/);
    expect(body).not.toMatch(/return \{ success: false, error: budgetMessage\(budget\) \};/);
  });
});

describe('the web thread — the sentence, not the apology', () => {
  const chat = rendered(read('components', 'ConsultantChat.tsx'));
  const failureBranch = chat.slice(chat.indexOf('const refused = retryCannotHelp(result.code)'), chat.indexOf('isFailure: true,'));

  it('shows the server’s words for a coded failure and the fallback only otherwise', () => {
    expect(failureBranch).toMatch(/content: refused \? result\.error : CLIENT_ERROR_FALLBACK/);
    // The literal the canary matches on comes from the constant, never by hand.
    expect(chat).not.toContain(CLIENT_ERROR_FALLBACK);
    expect(chat).toMatch(/import \{ CLIENT_ERROR_FALLBACK \} from '@tappet\/core\/consultant-health'/);
  });

  it('renders the failure turn as the product speaking: no byline, no disclosure, no Copy', () => {
    expect(chat).toMatch(/msg\.role === 'assistant' && !msg\.isFailure && \(\s*<div className="mono flex items-center gap-2 mb-1\.5/);
    expect(chat).toMatch(/msg\.role === 'assistant' && msg\.content && !msg\.isFailure && \(\s*<p className="mono measure mt-3/);
    expect(chat).toMatch(/msg\.role === 'assistant' && msg\.content && !msg\.isFailure && \(\s*<div className="turn-actions/);
  });

  it('never replays a failure turn to the model as something the advisor said', () => {
    expect(chat).toMatch(/messageHistory: messages\.filter\(\(m: any\) => !m\.isFailure\)/);
  });

  it('can still detect the old shape, so this is not vacuous', () => {
    const before = `
      setMessages([
        ...optimisticMessages,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);`;
    expect(before).toContain(CLIENT_ERROR_FALLBACK);
    expect(before).not.toMatch(/retryCannotHelp/);
    expect(failureBranch.length).toBeGreaterThan(50);
  });
});

describe('the phone — the code before the status', () => {
  const screen = rendered(read('apps', 'mobile', 'src', 'screens', 'AdvisorScreen.tsx'));
  const client = rendered(read('apps', 'mobile', 'src', 'api', 'client.ts'));

  it('reads retryCannotHelp off the error, and reads it before any status branch', () => {
    const codeBranch = screen.indexOf('apiError.retryCannotHelp');
    const status429 = screen.indexOf("apiError.status === 429");
    const status502 = screen.indexOf("apiError.status === 502");

    expect(codeBranch).toBeGreaterThan(-1);
    expect(status429).toBeGreaterThan(codeBranch);
    expect(status502).toBeGreaterThan(codeBranch);
    // The retry line is still there for the one case it is honest in.
    expect(screen).toContain(PHONE_RETRY);
  });

  it('gets the getter from the registry, not from a list of its own', () => {
    expect(client).toMatch(/get retryCannotHelp\(\): boolean \{\s*return retryCannotHelp\(this\.code\);/);
    expect(client).toMatch(/from '@tappet\/core\/ai\/advisor-failure'/);
  });
});

describe('“we are alerted to it” is a claim, and this is what makes it true', () => {
  /*
    The sentence says someone is told. That is honest only while the canary
    runs on a schedule from the default branch, turns a non-good verdict into a
    red run, and classes the quota case as non-good. Retire any of the three
    and the clause must go with it.
  */
  const workflow = read('.github', 'workflows', 'consultant-canary.yml');

  it('the canary is scheduled and fails loudly on anything but good', () => {
    expect(workflow).toMatch(/^\s+- cron: '0 \*\/6 \* \* \*'/m);
    expect(workflow).toMatch(/node scripts\/consultant-canary\.mjs https:\/\/tappet-demo\.davidmasterson\.co/);
    expect(workflow).toMatch(/::error::/);
    expect(workflow).toMatch(/exit 1/);
  });

  it('the monitor and the product both class the quota case as one to act on', () => {
    expect(classifyModelFailure({ status: 429, message: QUOTA_MARKER }).retryable).toBe(false);
    expect(classifyRoundTrip({ httpStatus: 429, errorText: QUOTA_MARKER }, ['x']).status).toBe('degraded');
    expect(ADVISOR_UNAVAILABLE_MESSAGE).toMatch(/alerted/);
  });
});

describe('DEMO_BUDGET — the docblock’s arithmetic is the constants’', () => {
  /*
    Cowork's warning, 14 Sep: a docblock whose derivation dies while the
    assertion beneath it keeps passing is the `MIN_WIDTH.short` failure. So
    the two arithmetic lines are read back and checked against the constants,
    the per-call figure and the price — a number changed in one place and not
    the other fails here.
  */
  const source = read('packages', 'core', 'src', 'ai', 'budget.ts');
  const block = source.slice(source.indexOf("The public demo's own ceiling"), source.indexOf('export const DEMO_BUDGET'));
  /*
    The unit is "quotes" since 17 Sep — the per-quote figure was measured and
    the docblock stopped counting in single calls. "calls" is still accepted,
    and the per-unit figure may carry a thousands comma, so a re-tune that
    reverts to either shape is still read rather than silently unmatched.
  */
  const line = (window: 'daily' | 'monthly') => {
    const match = new RegExp(`\\*\\s+${window}\\s+([\\d,]+)\\s+≈\\s+([\\d,]+) (?:calls|quotes) of ~([\\d,]+)\\s+≈\\s+\\$([\\d.]+)/(day|month)`).exec(block);
    if (!match) throw new Error(`no arithmetic line for ${window}`);
    const n = (s: string) => Number(s.replace(/,/g, ''));
    return { tokens: n(match[1]), calls: n(match[2]), perCall: n(match[3]), dollars: Number(match[4]) };
  };

  it.each([
    ['daily', DEMO_BUDGET.dailyOutputTokens],
    ['monthly', DEMO_BUDGET.monthlyOutputTokens],
  ] as const)('%s: tokens, calls and dollars agree', (window, constant) => {
    const { tokens, calls, perCall, dollars } = line(window);
    expect(tokens).toBe(constant);
    expect(calls).toBe(Math.round(tokens / perCall));
    // Flash output at ~$7.50 per million output-equivalent tokens.
    expect(dollars).toBeCloseTo((tokens / 1_000_000) * 7.5, 2);
  });

  it('says what the pool bounds and does not — quotes, not the advisor, and a metered path', () => {
    expect(block).toMatch(/\*\*Not the advisor\.\*\*/);
    expect(block).not.toMatch(/eleven dollars/);

    /*
      Until 17 Sep this asserted "Neither call is metered" — true, and the
      docblock said so rather than passing over a dead derivation. The meter
      exists now, under two purposes, and the sentence that replaced it has
      to say two things: which rows the ceiling reads, and that they start
      only when the purpose migration is applied.
    */
    expect(block).not.toMatch(/Neither call is metered/);
    expect(block).toMatch(/quote_estimate/);
    expect(block).toMatch(/quote_email/);
    expect(block).toMatch(/20260917120000/);
    expect(block).toMatch(/AI_USAGE:WRITE_FAILED/);
  });

  it('the per-quote figure is measured, and the measurement is the one the calls run at', () => {
    /*
      The arithmetic lines are read back above; this pins their provenance.
      The docblock says the figure was measured at LOW, so both calls must
      actually run at LOW — a docblock measured at one level over code
      running at another is the `MIN_WIDTH.short` failure with a date on it.
    */
    expect(block).toMatch(/measured on 17 Sep/);
    expect(block).toMatch(/at the LOW level both calls now run at/);

    const actions = rendered(read('app', 'actions.ts'));
    const estimate = actions.slice(actions.indexOf('async function estimateCosts('), actions.indexOf('async function generateEmailDraft('));
    const email = actions.slice(actions.indexOf('async function generateEmailDraft('), actions.indexOf('function isSupabaseAuthError('));
    expect(estimate).toMatch(/withThinking\(flashStructuredConfig, FLASH_MODEL, 'LOW'\)/);
    expect(email).toMatch(/withThinking\(flashConfig, FLASH_MODEL, 'LOW'\)/);
  });

  it('the pool is the demo’s own surface', () => {
    const check = rendered(read('lib', 'ai-budget.ts'));
    const fn = check.slice(check.indexOf('export async function checkDemoBudget'), check.indexOf('export async function checkFrontDoorBudget'));
    expect(fn).toMatch(/\.is\('user_id', null\)\s*\.eq\('surface', 'demo'\)/);
  });

  it('can still read the shape it guards, so this is not vacuous', () => {
    const stale = ' *   daily      150,000 ≈   250 calls of ~600 ≈  $1.13/day';
    const match = /\*\s+daily\s+([\d,]+)\s+≈\s+([\d,]+) calls of ~(\d+)\s+≈\s+\$([\d.]+)\/(day|month)/.exec(stale);
    expect(match?.[1]).toBe('150,000');
    expect(Number(match![1].replace(/,/g, ''))).not.toBe(DEMO_BUDGET.dailyOutputTokens);
  });
});
