/**
 * The strings that feed every prompt are bounded, and the fuse sees input.
 *
 * @jest-environment node
 *
 * Audit 360, SEC-2 (1 Oct). `make`/`model`/`trim` on the phone's create
 * route and every wishlist field were stored unbounded; all of them reach
 * the advisor's system prompt on every turn; and the monthly fuse counted
 * output tokens only. A 500 KB `make` was ~125k input tokens a message that
 * no ceiling saw. Three layers now, each tested here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boundPromptContext,
  clipForPrompt,
  PROMPT_FIELD_MAX_CHARS,
  vehicleNameProblem,
  wishlistFieldProblem,
  WISHLIST_LIMITS,
} from '@tappet/core/input-bounds';
import { CONSULTANT_SYSTEM_PROMPT } from '@tappet/core/prompts';
import { decideBudget, INPUT_TOKENS_PER_OUTPUT_EQUIVALENT, TIERS } from '@tappet/core/ai/budget';

const ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');
const HUGE = 'x'.repeat(500_000);

describe('refused at the door', () => {
  it('a car name past 50 characters, with the field named', () => {
    expect(vehicleNameProblem({ make: 'Honda', model: 'Accord', trim: 'EX-L' })).toBeNull();
    expect(vehicleNameProblem({ make: 'M'.repeat(50), model: 'Accord' })).toBeNull();
    expect(vehicleNameProblem({ make: HUGE, model: 'Accord' })).toMatch(/^Make must be 50/);
    expect(vehicleNameProblem({ make: 'Honda', model: 'Accord', trim: HUGE })).toMatch(/^Trim/);
    // Non-strings are another check's business, not this one's.
    expect(vehicleNameProblem({ make: 42, model: undefined })).toBeNull();
  });

  it('wishlist fields past their limits, including the size of source_data', () => {
    expect(
      wishlistFieldProblem({
        itemName: 'Replace the charge pipe',
        itemIdentifier: 'mod:replace-the-charge-pipe',
        description: 'A sentence the dossier wrote. '.repeat(20),
        sourceData: { note: 'every 5,000 mi', value: '5,000 MI / 12 MO' },
      })
    ).toBeNull();
    expect(wishlistFieldProblem({ description: HUGE })).toMatch(/^The description/);
    expect(wishlistFieldProblem({ notes: 'n'.repeat(WISHLIST_LIMITS.notes + 1) })).toMatch(/^The notes/);
    expect(wishlistFieldProblem({ sourceData: { note: HUGE } })).toMatch(/^The attached detail/);
  });

  it('the phone’s create route asks before the insert', () => {
    const route = read('app', 'api', 'v1', 'vehicles', 'route.ts');
    const post = route.slice(route.indexOf('export async function POST'));
    const check = post.indexOf('vehicleNameProblem({ make, model, trim: body.trim })');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(post.indexOf(".from('vehicles')"));
  });

  it('the wishlist route and the web action ask before the insert', () => {
    const route = read('app', 'api', 'v1', 'wishlist', 'route.ts');
    const post = route.slice(route.indexOf('export async function POST'));
    const check = post.indexOf('wishlistFieldProblem(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(post.indexOf(".from('wishlist_items')"));

    const action = read('lib', 'actions', 'wishlist.ts');
    const add = action.slice(action.indexOf('export async function addItemToWishlist'));
    expect(add.indexOf('wishlistFieldProblem({ itemName })')).toBeGreaterThan(-1);
    expect(add.indexOf('wishlistFieldProblem({ itemName })')).toBeLessThan(add.indexOf('.insert('));
  });
});

describe('clipped at the prompt', () => {
  it('cuts strings and list items, keeps every item and every non-string', () => {
    const bounded = boundPromptContext({
      make: HUGE,
      year: 2003,
      score: null,
      items: ['short', HUGE],
    });
    expect(bounded.make).toHaveLength(PROMPT_FIELD_MAX_CHARS + 1);
    expect(bounded.make.endsWith('…')).toBe(true);
    expect(bounded.year).toBe(2003);
    expect(bounded.score).toBeNull();
    expect(bounded.items).toEqual(['short', clipForPrompt(HUGE)]);
  });

  it('the advisor’s system prompt stays small with a 500 KB make and a 500 KB Need', () => {
    const empty: string[] = [];
    const prompt = CONSULTANT_SYSTEM_PROMPT({
      year: 2003, make: HUGE, model: 'Accord', trim: '', mileage: 120_000, objective: 'Keep it',
      ownershipDetails: '', drivingStyle: '', performanceGoal: '', avgMilesPerMonth: 900, color: '',
      engineType: '', transmissionType: '', drivetrain: '', vin: '', stockHp: null, stockTorque: null,
      modifiedHp: null, modifiedTorque: null, wishlistItems: [HUGE], modWishlistItems: empty,
      recentWork: empty, knownIssues: empty, maintenanceHistory: empty, trackedIssues: empty,
      trackedMods: empty, fluidSpecs: '', maintenanceSchedule: empty, recalls: empty,
      recallsChecked: true, healthScore: null, healthRedFlags: empty, healthRecommendations: empty,
      reliabilityScore: null, interestingFacts: empty, documentsOnFile: 0, invoiceTotals: empty,
    });
    // Anti-vacuous: the prompt really carries the field it was given.
    expect(prompt).toContain('x'.repeat(PROMPT_FIELD_MAX_CHARS));
    expect(prompt.length).toBeLessThan(20_000);
  });
});

describe('counted at the fuse', () => {
  const limit = TIERS.free.monthlyOutputTokens;

  it('input tokens count at their output-equivalent weight', () => {
    expect(decideBudget({ inputTokens: 0, outputTokens: 100 }, TIERS.free).usedOutputTokens).toBe(100);
    expect(
      decideBudget({ inputTokens: 10 * INPUT_TOKENS_PER_OUTPUT_EQUIVALENT, outputTokens: 100 }, TIERS.free)
        .usedOutputTokens
    ).toBe(110);
  });

  it('a month of inflated prompts and almost no output is stopped — the finding', () => {
    // 40 turns at ~125k input and ~2k output each: 80k output, 5M input.
    const d = decideBudget({ inputTokens: 40 * 125_000, outputTokens: 40 * 2_000 }, TIERS.free);
    expect(d.allowed).toBe(false);
    // And the shape that shipped (input read as nothing) would have let it through.
    expect(decideBudget({ inputTokens: 0, outputTokens: 40 * 2_000 }, TIERS.free).allowed).toBe(true);
    expect(limit).toBeGreaterThan(40 * 2_000);
  });

  it('the monthly check reads prompt_tokens and passes them in', () => {
    const src = read('lib', 'ai-budget.ts');
    const monthly = src.slice(src.indexOf('export async function checkMonthlyBudget'));
    expect(monthly).toMatch(/\.select\('prompt_tokens, output_tokens, thoughts_tokens'\)/);
    expect(monthly).toMatch(/decideBudget\(\{ inputTokens, outputTokens \}/);
    expect(monthly).not.toMatch(/inputTokens: 0/);
  });
});
