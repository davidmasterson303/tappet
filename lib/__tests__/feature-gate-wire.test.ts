/**
 * E6's wire — a gate refusal the phone can act on.
 *
 * @jest-environment node
 *
 * The feature gate refused in prose: `featureRefusal` returned a sentence,
 * the actions returned `{ success: false, error }`, and `/api/v1/consultant`
 * answered every decline with 502 — which the advisor screen renders as "try
 * again". For a refusal that advice is wrong twice: nothing failed, and a
 * retry cannot help, because the answer is a subscription.
 *
 * So the refusal now carries `code` and `feature` beside `error`, from the
 * gate through the four call sites and the two routes to the phone. This
 * holds each link of that. `PAID_FEATURES_ENFORCED` is off and stays off —
 * `paid-features.test.ts` asserts the default — so every link here is
 * tested cold, which is the point: the wire has to be right before the
 * switch, not discovered after it.
 *
 * ── Why the sites and routes are read as source ─────────────────────────────
 *
 * Executing `sendConsultantMessage` means Supabase, Gemini and a session;
 * the property that matters — *does the refusal leave the action with its
 * code* — is one line, and readable. `paid-features.test.ts` already reads
 * the same four sites for the presence of the gate; this reads them for the
 * shape of its answer, and carries the same anti-vacuous case.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { featureRefusal, type FeatureRefusal } from '@/lib/feature-gate';
import { decideFeatureAccess, type FeatureDecision } from '@tappet/core/paid-features';

const ROOT = join(__dirname, '..', '..');
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8');

describe('featureRefusal', () => {
  it('returns the sentence, the code and the feature on a refusal', () => {
    const decision = decideFeatureAccess({ feature: 'advisor', tier: 'free', enforced: true });

    expect(featureRefusal(decision)).toEqual({
      error: expect.stringContaining('Tappet Plus'),
      code: 'needs-subscription',
      feature: 'advisor',
    });
  });

  it('returns nothing when the call may proceed', () => {
    expect(featureRefusal({ state: 'allowed' })).toBeNull();
    expect(featureRefusal({ state: 'not-enforced' })).toBeNull();
  });

  it('uses the decision’s own literal as the code, not a second string', () => {
    /*
      The gate and the wire name one state one way. This is a type-level
      fact made executable: the refusal's `code` is assignable to the
      decision's `state`, so renaming one without the other fails to compile
      here before it fails to match on the phone.
    */
    const refusal = featureRefusal(
      decideFeatureAccess({ feature: 'dossier', tier: 'free', enforced: true })
    ) as FeatureRefusal;
    const state: FeatureDecision['state'] = refusal.code;

    expect(state).toBe('needs-subscription');
  });
});

describe('the four call sites keep the code', () => {
  const SITES: Array<[string, string, string]> = [
    ['advisor', 'app/actions.ts', 'advisor'],
    ['dossier (mod detail)', 'app/actions.ts', 'dossier'],
    ['invoice scanning', 'app/actions.ts', 'invoice-scanning'],
    ['dossier (research)', 'lib/vehicle-research.ts', 'dossier'],
  ];

  /**
   * The early return that follows the gate call, wherever it is. Anchored on
   * the `checkFeatureAccess(…, 'feature')` call `paid-features.test.ts`
   * already pins, and read forward to the next `return`.
   */
  function refusalReturn(file: string, feature: string): string {
    const source = read(...file.split('/'));
    const call = source.indexOf(`checkFeatureAccess(`);
    expect(call).toBeGreaterThan(-1);

    const pattern = new RegExp(
      `featureRefusal\\(await checkFeatureAccess\\([^)]*'${feature}'\\)\\);[\\s\\S]*?return \\{[^}]*\\};`
    );
    const match = pattern.exec(source);
    expect(match).not.toBeNull();
    return match![0];
  }

  it.each(SITES)('%s returns code and feature beside the sentence', (_name, file, feature) => {
    const block = refusalReturn(file, feature);

    expect(block).toMatch(/success: false/);
    expect(block).toMatch(/error: \w+\.error/);
    expect(block).toMatch(/code: \w+\.code/);
    expect(block).toMatch(/feature: \w+\.feature/);
  });

  it('can still detect a site that dropped the code', () => {
    // Anti-vacuous: the same reader, against the prose-only shape it replaced.
    const prose = `
      const gate = featureRefusal(await checkFeatureAccess(access.userId, 'advisor'));
      if (gate) {
        return { success: false, error: gate };
      }`;
    expect(prose).not.toMatch(/code: \w+\.code/);
    expect(read('lib', 'vehicle-research.ts')).toMatch(/code\?: FeatureRefusal\['code'\]/);
  });
});

describe('the routes forward it', () => {
  const ROUTES = [
    ['consultant', join('app', 'api', 'v1', 'consultant', 'route.ts')],
    ['upload-document', join('app', 'api', 'v1', 'upload-document', 'route.ts')],
  ];

  it.each(ROUTES)('/api/v1/%s answers a refusal with 402, code and feature', (_name, file) => {
    const source = read(file);
    const at = source.indexOf("result.code === 'needs-subscription'");
    expect(at).toBeGreaterThan(-1);

    const branch = source.slice(at, source.indexOf('}', source.indexOf('status: 402', at)) + 1);
    expect(branch).toMatch(/code: result\.code/);
    expect(branch).toMatch(/feature: result\.feature/);
    expect(branch).toMatch(/status: 402/);
  });

  it('still answers every other decline the way it did', () => {
    // The 502 for a real failure to answer is unchanged; only the refusal moved.
    expect(read('app', 'api', 'v1', 'consultant', 'route.ts')).toMatch(/status: 502/);
  });

  it('is the only thing that opens the paywall on the phone: the code, not the status', () => {
    /*
      A screen that keyed on 402 would open a paywall on any future 402 that
      meant something else. `ApiRequestError.needsSubscription` reads the
      code, and the advisor screen reads that.
    */
    const client = read('apps', 'mobile', 'src', 'api', 'client.ts');
    expect(client).toMatch(/return this\.code === 'needs-subscription';/);
    expect(client).not.toMatch(/status === 402/);

    const advisor = read('apps', 'mobile', 'src', 'screens', 'AdvisorScreen.tsx');
    expect(advisor).toMatch(/apiError\.needsSubscription/);
    expect(advisor).toMatch(/requestUpgrade\('advisor'\)/);
  });
});
