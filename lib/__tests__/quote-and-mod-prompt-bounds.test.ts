/**
 * What a caller can put into a model prompt, executed rather than read.
 *
 * @jest-environment node
 *
 * Audit 360, security round 4 (1 Oct).
 *
 *   - SEC-17 · `generateQuoteRequestV2` is the public demo's one model path,
 *     open with no session. Its wishlist branch took the caller's own `items`
 *     (description, category) and `additionalNotes` into two prompts with no
 *     bound, and `checkDemoBudget` summed output tokens only — so a megabyte
 *     of input cost the demo's day a few hundred tokens.
 *   - SEC-18 · `generateModificationDetails` built its prompt, the shared
 *     cache key and the shared cache row from a client-sent `vehicle` object,
 *     and took `modName` at any length.
 *
 * Every test here drives the real action against a fake client and a fake
 * model, and reads the prompt the model was actually handed.
 */

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
jest.mock('@/lib/gemini', () => ({
  ...jest.requireActual('@/lib/gemini'),
  genAI: { models: { generateContent: jest.fn() } },
}));
jest.mock('@/lib/ai-budget', () => ({
  ...jest.requireActual('@/lib/ai-budget'),
  checkDemoBudget: jest.fn(),
  checkMonthlyBudget: jest.fn(),
}));
jest.mock('@/lib/rate-limit', () => ({
  ...jest.requireActual('@/lib/rate-limit'),
  checkRateLimit: jest.fn(),
}));
jest.mock('@/lib/feature-gate', () => ({
  ...jest.requireActual('@/lib/feature-gate'),
  checkFeatureAccess: jest.fn(),
}));
jest.mock('@/lib/ai-usage', () => ({ recordAiUsageInBackground: jest.fn() }));
jest.mock('next/headers', () => ({ headers: async () => new Map([['x-nf-client-connection-ip', '203.0.113.9']]) }));

import { getServiceRoleClient } from '@/lib/supabase';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { genAI } from '@/lib/gemini';
import { checkDemoBudget, checkMonthlyBudget } from '@/lib/ai-budget';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkFeatureAccess } from '@/lib/feature-gate';
import { generateModificationDetails, generateQuoteRequestV2 } from '@/app/actions';
import { DEMO_VEHICLE_IDS } from '@tappet/core/demo';
import { DEMO_BUDGET, INPUT_TOKENS_PER_OUTPUT_EQUIVALENT, outputEquivalentTokens } from '@tappet/core/ai/budget';
import { clipQuoteItem, PROMPT_FIELD_MAX_CHARS, QUOTE_LIMITS, quoteInputProblem } from '@tappet/core/input-bounds';

const DEMO_ACCORD = DEMO_VEHICLE_IDS[0];
const OWN_CAR = 'b1000000-0000-0000-0000-00000000000b';
const STORED_CAR = { id: OWN_CAR, year: 2003, make: 'HONDA', model: 'Accord', trim: 'EX', current_mileage: 120_000, performance_mindedness: 'mild' };

interface Query { table: string; op: string; payload?: unknown; columns?: string; filters: Array<[string, unknown]> }

let log: Query[];
let usageRows: Array<Record<string, unknown>>;

function fakeClient() {
  return {
    from(table: string) {
      const q: Query = { table, op: 'select', filters: [] };
      log.push(q);
      const one = async () => {
        if (table === 'vehicles') return { data: { ...STORED_CAR, id: q.filters.find(([c]) => c === 'id')?.[1] }, error: null };
        return { data: null, error: null };
      };
      const builder: any = {
        select: (columns?: string) => ((q.columns = columns), builder),
        insert: (p: unknown) => ((q.op = 'insert'), (q.payload = p), builder),
        update: (p: unknown) => ((q.op = 'update'), (q.payload = p), builder),
        upsert: (p: unknown) => ((q.op = 'upsert'), (q.payload = p), builder),
        delete: () => ((q.op = 'delete'), builder),
        eq: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        is: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        in: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: one,
        single: one,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: table === 'ai_usage_events' ? usageRows : q.op === 'select' ? [] : null, error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
}

const ESTIMATE = JSON.stringify({
  items: [{ description: 'x', parts_cost_low: 10, parts_cost_high: 20, labor_hours_low: 1, labor_hours_high: 2, labor_cost_low: 100, labor_cost_high: 200, notes: 'n' }],
  regional_labor_rate: 'r',
  total_low: 110,
  total_high: 220,
});

const prompts = (): string[] =>
  (genAI.models.generateContent as jest.Mock).mock.calls.map(([req]: [{ contents: unknown }]) =>
    typeof req.contents === 'string' ? req.contents : JSON.stringify(req.contents)
  );

beforeEach(() => {
  log = [];
  usageRows = [];
  jest.clearAllMocks();
  (getServiceRoleClient as jest.Mock).mockReturnValue(fakeClient());
  (authorizeVehicleAccess as jest.Mock).mockResolvedValue({ ok: true, isDemo: true, userId: null });
  (checkDemoBudget as jest.Mock).mockResolvedValue({ allowed: true, exhausted: null, usedToday: 0, usedThisMonth: 0 });
  (checkMonthlyBudget as jest.Mock).mockResolvedValue({ state: 'ok', allowed: true });
  (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  (checkFeatureAccess as jest.Mock).mockResolvedValue({ allowed: true });
  (genAI.models.generateContent as jest.Mock).mockImplementation(async (req: { contents: unknown }) => ({
    text: typeof req.contents === 'string' && req.contents.includes('cost estimation') ? ESTIMATE : 'Hello,\n\nI would like a quote for the work listed below on my car, at your earliest convenience. Thank you for your time.\n\nBest regards',
    usageMetadata: {},
  }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

// ── SEC-17 · the demo quote ────────────────────────────────────────────────

describe('SEC-17 · the demo quote bounds the caller’s text before either prompt', () => {
  const MEGA = 'A'.repeat(900_000);

  it('clips a 900 KB item description in both prompts', async () => {
    const result = await generateQuoteRequestV2(DEMO_ACCORD, ['x'], '80302', undefined, undefined, [
      { id: 'x', description: MEGA, category: MEGA },
    ]);
    expect(result.success).toBe(true);
    const sent = prompts();
    expect(sent).toHaveLength(2);
    for (const prompt of sent) {
      expect(prompt.length).toBeLessThan(8_000);
      expect(prompt).toContain('A'.repeat(PROMPT_FIELD_MAX_CHARS));
      expect(prompt).not.toContain('A'.repeat(PROMPT_FIELD_MAX_CHARS + QUOTE_LIMITS.category + 10));
    }
  });

  it('refuses notes over the schema’s 2,000 with a sentence, and calls no model', async () => {
    const result = await generateQuoteRequestV2(DEMO_ACCORD, ['x'], '80302', MEGA, undefined, [
      { id: 'x', description: 'Brake pads', category: 'repair' },
    ]);
    expect(result).toEqual({ success: false, error: 'The notes must be 2,000 characters or fewer.' });
    expect(genAI.models.generateContent).not.toHaveBeenCalled();
  });

  it('refuses more than 50 items, and calls no model', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `i${i}`, description: 'Oil', category: 'maintenance' }));
    const result = await generateQuoteRequestV2(DEMO_ACCORD, many.map((m) => m.id), '80302', undefined, undefined, many);
    expect(result).toEqual({ success: false, error: 'Choose 50 items or fewer for one quote.' });
    expect(genAI.models.generateContent).not.toHaveBeenCalled();
  });

  it('refuses a quote name over 100, and a non-string note', async () => {
    const item = [{ id: 'x', description: 'Oil', category: 'maintenance' }];
    expect(await generateQuoteRequestV2(DEMO_ACCORD, ['x'], '80302', undefined, 'n'.repeat(101), item))
      .toEqual({ success: false, error: 'The quote name must be 100 characters or fewer.' });
    expect(await generateQuoteRequestV2(DEMO_ACCORD, ['x'], '80302', ['x'.repeat(10)] as never, undefined, item))
      .toMatchObject({ success: false });
    expect(genAI.models.generateContent).not.toHaveBeenCalled();
  });

  it('drops every field but the three the quote reads', () => {
    expect(clipQuoteItem({ id: 'x', description: 'Oil', category: 'maintenance', notes: MEGA, vehicle_id: DEMO_ACCORD }))
      .toEqual({ id: 'x', description: 'Oil', category: 'maintenance' });
    expect(clipQuoteItem({ id: 7, description: ['a'], category: null })).toEqual({ id: '', description: '', category: '' });
  });

  it('anti-vacuous: an ordinary quote is unchanged — its words reach both prompts whole', async () => {
    const result = await generateQuoteRequestV2(DEMO_ACCORD, ['x'], '80302', 'Prefer OEM parts.', undefined, [
      { id: 'x', description: 'Front brake pads and rotors', category: 'repair' },
    ]);
    expect(result).toMatchObject({ success: true });
    const [estimate, email] = prompts();
    expect(estimate).toContain('1. Front brake pads and rotors (Category: repair)');
    expect(email).toContain('1. Front brake pads and rotors (repair)');
    expect(email).toContain('Prefer OEM parts.');
  });

  it('anti-vacuous: the old shape, a raw interpolation, would have carried the megabyte', () => {
    const item = { description: MEGA, category: 'x' };
    const shipped = `1. ${item.description} (Category: ${item.category})`;
    expect(shipped.length).toBeGreaterThan(800_000);
    expect(quoteInputProblem({ selectedItemIds: ['x'], items: [item], additionalNotes: 'ok' })).toBeNull();
  });
});

describe('SEC-17 · the demo fuse counts input, on the owner’s scale', () => {
  const { checkDemoBudget: realCheckDemoBudget } = jest.requireActual('@/lib/ai-budget') as typeof import('@/lib/ai-budget');
  const now = () => new Date().toISOString();

  it('closes the day on input alone', async () => {
    // Three quotes of ~225k input tokens and a near-empty answer — the attack.
    usageRows = Array.from({ length: 3 }, () => ({ prompt_tokens: 225_000, output_tokens: 5, thoughts_tokens: 0, created_at: now() }));
    const decision = await realCheckDemoBudget();
    expect(decision.allowed).toBe(false);
    expect(decision.exhausted).toBe('day');
    const read = log.find((q) => q.table === 'ai_usage_events');
    expect(read?.columns).toMatch(/\bprompt_tokens\b/);
  });

  it('weights input exactly as the owner’s fuse does', async () => {
    usageRows = [{ prompt_tokens: 10_000, output_tokens: 300, thoughts_tokens: 200, created_at: now() }];
    const decision = await realCheckDemoBudget();
    expect(decision.usedToday).toBe(500 + 10_000 / INPUT_TOKENS_PER_OUTPUT_EQUIVALENT);
    expect(decision.usedToday).toBe(outputEquivalentTokens({ inputTokens: 10_000, outputTokens: 500 }));
  });

  it('anti-vacuous: the shipped sum (output only) would have left the attack open', () => {
    const rows = Array.from({ length: 3 }, () => ({ prompt_tokens: 225_000, output_tokens: 5, thoughts_tokens: 0 }));
    const shipped = rows.reduce((sum, r) => sum + r.output_tokens + r.thoughts_tokens, 0);
    expect(shipped).toBeLessThan(DEMO_BUDGET.dailyOutputTokens);
  });

  it('an ordinary demo day stays open', async () => {
    usageRows = Array.from({ length: 5 }, () => ({ prompt_tokens: 700, output_tokens: 1_000, thoughts_tokens: 1_200, created_at: now() }));
    expect((await realCheckDemoBudget()).allowed).toBe(true);
  });
});

// ── SEC-18 · mod details ───────────────────────────────────────────────────

describe('SEC-18 · mod details describe the authorized row, not the client’s object', () => {
  beforeEach(() => {
    (authorizeVehicleAccess as jest.Mock).mockResolvedValue({ ok: true, isDemo: false, userId: 'u1' });
    (genAI.models.generateContent as jest.Mock).mockResolvedValue({ text: '{"performanceImpact":"p"}', usageMetadata: {} });
  });

  const forged = { year: 2024, make: 'Porsche', model: '911 GT3 RS', performance_mindedness: 'aggressive' };

  it('builds the prompt and both cache columns from the stored car', async () => {
    await generateModificationDetails(OWN_CAR, 'Cold air intake', forged, 'moderate');
    const [prompt] = prompts();
    expect(prompt).toContain('2003 HONDA Accord');
    expect(prompt).not.toMatch(/Porsche|GT3/);
    const vehicleRead = log.find((q) => q.table === 'vehicles');
    expect(vehicleRead?.filters).toEqual([['id', OWN_CAR]]);
    const cacheRow = log.find((q) => q.table === 'mod_detail_cache' && q.op === 'upsert');
    expect(cacheRow?.payload).toMatchObject({ year: 2003, make: 'HONDA', model: 'Accord', mod_name: 'Cold air intake' });
  });

  it('refuses a mod name over 200 characters, and calls no model', async () => {
    const result = await generateModificationDetails(OWN_CAR, 'x'.repeat(201), forged, 'moderate');
    expect(result).toEqual({ success: false, error: 'The name must be 200 characters or fewer.' });
    expect(genAI.models.generateContent).not.toHaveBeenCalled();
    expect(log.filter((q) => q.op !== 'select')).toEqual([]);
  });

  it('refuses an empty or non-string name', async () => {
    expect((await generateModificationDetails(OWN_CAR, '   ', forged, 'moderate')).success).toBe(false);
    expect((await generateModificationDetails(OWN_CAR, { a: 1 } as never, forged, 'moderate')).success).toBe(false);
    expect(genAI.models.generateContent).not.toHaveBeenCalled();
  });

  it('anti-vacuous: a 200-character name is still answered', async () => {
    const result = await generateModificationDetails(OWN_CAR, 'y'.repeat(200), null, 'moderate');
    expect(result.success).toBe(true);
    expect(prompts()[0]).toContain('y'.repeat(200));
  });
});
