/**
 * The advisor and the health score say "stop driving it" before anything else.
 *
 * @jest-environment node
 *
 * ── Audit 360, LEGAL-3 (1 Oct) ──────────────────────────────────────────────
 *
 * The advisor's system prompt had no physical-harm rule, and told the persona
 * "If they're selling soon, talk them out of spending money. Match their
 * energy." An owner selling within the year who asked whether a grinding brake
 * could wait for the sale was talking to a character told to keep their money
 * in their pocket. `STOP_DRIVING_RULE` (`packages/core/src/prompts.ts`) is the
 * rule; this file holds three things about it:
 *
 *   1. it is in the **built** prompt — whatever the owner's profile says — and
 *      ahead of the persona's habits, with a line saying it outranks them;
 *   2. the selling line no longer reaches safety work;
 *   3. the built prompt is what reaches the model: the advisor's
 *      `systemInstruction` and the health score's prompt text, traced in the
 *      action that sends them (CLAUDE.md §5 — the template is not the call).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSULTANT_SYSTEM_PROMPT, STOP_DRIVING_RULE } from '@tappet/core/prompts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** Source without comments, so a scan cannot match prose about the rule. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** The body of one exported function, up to the next export. */
function fn(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
}

function build(overrides: Partial<Parameters<typeof CONSULTANT_SYSTEM_PROMPT>[0]> = {}) {
  return CONSULTANT_SYSTEM_PROMPT({
    year: 2016, make: 'BMW', model: 'M235i', trim: '', mileage: 48_200,
    objective: 'Keep it forever', ownershipDetails: '', drivingStyle: '', performanceGoal: '',
    avgMilesPerMonth: 600, color: '', engineType: '', transmissionType: '', drivetrain: '', vin: '',
    stockHp: null, stockTorque: null, modifiedHp: null, modifiedTorque: null,
    wishlistItems: [], modWishlistItems: [], recentWork: [], knownIssues: [], maintenanceHistory: [],
    trackedIssues: [], trackedMods: [], fluidSpecs: '', maintenanceSchedule: [], recalls: [],
    recallsChecked: true, healthScore: null, healthRedFlags: [], healthRecommendations: [],
    reliabilityScore: null, interestingFacts: [], documentsOnFile: 0, invoiceTotals: [],
    ...overrides,
  });
}

describe('the rule says what it has to', () => {
  it('names the systems, says stop driving and have it inspected, and puts cost after it', () => {
    for (const system of ['brakes', 'steering', 'tires', 'airbags', 'fuel leak', 'stalling', 'overheating']) {
      expect(STOP_DRIVING_RULE).toContain(system);
    }
    expect(STOP_DRIVING_RULE).toMatch(/stop driving it and have it inspected/);
    expect(STOP_DRIVING_RULE).toMatch(/before anything about cost or timing/);
  });

  it('outranks the budget, the sale and the energy-matching by name', () => {
    expect(STOP_DRIVING_RULE).toMatch(/overrides every other instruction/);
    expect(STOP_DRIVING_RULE).toMatch(/budget/);
    expect(STOP_DRIVING_RULE).toMatch(/plans to sell/);
    expect(STOP_DRIVING_RULE).toMatch(/matching their energy/);
  });

  it('never lets the model call a car safe', () => {
    expect(STOP_DRIVING_RULE).toMatch(/Never tell the owner a car is safe to drive/);
  });
});

describe('the advisor prompt carries it, for every owner', () => {
  it.each([
    ['selling soon', { objective: 'Selling within the year', performanceGoal: 'mild' }],
    ['keeping it', { objective: 'Keep it forever', performanceGoal: 'aggressive' }],
    ['nothing said', { objective: 'Not specified', performanceGoal: '' }],
  ])('%s', (_name, owner) => {
    const prompt = build(owner);
    expect(prompt).toContain(STOP_DRIVING_RULE);
    // Ahead of the persona's own rules, where "these override" is read first.
    expect(prompt.indexOf(STOP_DRIVING_RULE)).toBeLessThan(prompt.indexOf('**YOUR RULES:**'));
    expect(prompt.indexOf(STOP_DRIVING_RULE)).toBeLessThan(prompt.indexOf('Match their energy'));
  });

  it('the selling line no longer reaches safety work', () => {
    const prompt = build({ objective: 'Selling within the year' });
    expect(prompt).not.toMatch(/If they're selling soon, talk them out of spending money\. Match their energy\./);
    expect(prompt).toMatch(/never out of anything under WHEN IT COULD HURT SOMEONE/);
  });

  it('can still detect the line that shipped', () => {
    // Anti-vacuous: the 30 Sep prompt, verbatim.
    const shipped = "- If performance goal is aggressive, get excited about mods. If they're selling soon, talk them out of spending money. Match their energy.";
    expect(shipped).toMatch(/If they're selling soon, talk them out of spending money\. Match their energy\./);
    expect(shipped).not.toContain(STOP_DRIVING_RULE);
  });
});

describe('the built prompts are what reach the model', () => {
  const actions = code(read('app/actions.ts'));

  it('the advisor: CONSULTANT_SYSTEM_PROMPT → systemPrompt → systemInstruction of the call', () => {
    const body = fn(actions, 'export async function sendConsultantMessage');
    const built = body.indexOf('const systemPrompt = CONSULTANT_SYSTEM_PROMPT(');
    const call = body.indexOf('genAI.models.generateContent(');
    expect(built).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(built);
    // The instruction inside that call is the built prompt, not a copy of it.
    expect(body.slice(call)).toMatch(/^[\s\S]*?config: \{[\s\S]*?systemInstruction: systemPrompt,/);
  });

  it('the health score: the rule is interpolated into the prompt the call sends', () => {
    const body = fn(actions, 'export async function generateVehicleHealthSummary');
    const prompt = body.indexOf('const prompt = `');
    const rule = body.indexOf('${STOP_DRIVING_RULE}');
    const call = body.indexOf('genAI.models.generateContent(');
    expect(prompt).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(prompt);
    expect(call).toBeGreaterThan(rule);
    expect(body.slice(call)).toMatch(/^[^;]*parts: \[\{ text: prompt \}\]/);
    expect(body).toMatch(/No summary, red flag or recommendation may say or imply that the car is safe to drive/);
  });

  it('can still detect a health prompt without the rule', () => {
    const shipped = 'const prompt = `You are an expert…`;\n    const result = await genAI.models.generateContent({';
    expect(shipped.indexOf('${STOP_DRIVING_RULE}')).toBe(-1);
  });
});
