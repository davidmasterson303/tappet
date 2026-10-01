/**
 * The primer's rule is right; this asserts the app actually obeys it.
 *
 * @jest-environment node
 *
 * Phase 5, C5. `push-priming.test.ts` proves *when* to ask. It would stay green
 * against an app that ignored the answer entirely — which is the exact failure
 * this repo has recorded before: eleven green tests in `security.test.ts`
 * asserting protection the exported middleware did not have.
 *
 * The property here is a wiring one — which module calls what, and in what
 * order — so it is a source scan. React Native cannot be rendered by this
 * runner, and the one thing that matters most (that iOS's dialog is not raised
 * uninvited) is not observable at runtime on any machine we have.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const NAVIGATOR = 'apps/mobile/src/navigation/RootNavigator.tsx';
const HOOK = 'apps/mobile/src/notifications/usePushPrimer.ts';
const HUB = 'apps/mobile/src/screens/VehicleDetailScreen.tsx';
const PRIMER = 'apps/mobile/src/notifications/PushPrimer.tsx';

/** Source with comments removed — prose about a rule is not the rule. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('the permission prompt is no longer raised uninvited', () => {
  it('the navigator does not call registerForPush unconditionally', () => {
    /*
      The defect C5 exists to fix. `registerForPush` asks iOS for permission as
      its first act, so calling it on entry to the signed-in stack spends the
      one irreversible ask before the person has seen the product.

      Asserted as: any call must sit behind `shouldRegisterSilently`.
    */
    const source = code(NAVIGATOR);

    if (source.includes('registerForPush(')) {
      expect(source).toContain('shouldRegisterSilently');
      const gate = source.indexOf('shouldRegisterSilently');
      const call = source.indexOf('registerForPush(');
      expect(gate).toBeLessThan(call);
    }
  });

  it('a device that already granted permission still registers', () => {
    /*
      The upgrade path, and the regression a careless fix would introduce:
      removing the call entirely would leave every existing user's token
      unfiled, and notifications would stop for exactly the people who had
      already said yes.
    */
    expect(code(NAVIGATOR)).toContain('shouldRegisterSilently');
    expect(code(NAVIGATOR)).toContain('registerForPush');
  });

  /*
    ── 23 Sep · the primer had no host, and this file said it did ───────────

    The cases below used to read `GarageScreen`. The 22 Sep ship removed the
    Garage tab and the 23 Sep switcher took `GarageScreen` out of the
    navigator's imports — so the one `<PushPrimer>` in the app was on a screen
    nothing rendered, a fresh install was never asked, and no token was ever
    filed. Every case here stayed green, because the garage's *source* still
    said all the right things. CLAUDE.md §5: a guard that checks a file
    nothing mounts checks nothing.

    So the property now has two halves: the rule is obeyed by whoever hosts
    the primer, **and the host is reachable** — imported by the navigator,
    not merely present on disk.
  */
  it('the primer is rendered by a screen the navigator actually mounts', () => {
    const host = code(HUB);
    expect(host).toContain('<PushPrimer');
    expect(host).toContain('usePushPrimer(');

    const navigator = code(NAVIGATOR);
    expect(navigator).toMatch(/from '\.\.\/screens\/VehicleDetailScreen'/);
  });

  it('can still tell a host on disk from a host in the tree', () => {
    // Anti-vacuous: the garage still renders the primer and still is not
    // imported. The case above must be able to fail on exactly that shape.
    const garage = code('apps/mobile/src/screens/GarageScreen.tsx');
    expect(garage).toContain('<PushPrimer');
    expect(code(NAVIGATOR)).not.toMatch(/from '\.\.\/screens\/GarageScreen'/);
  });

  it('the host decides with the shared rule rather than its own', () => {
    const source = code(HOOK);

    expect(source).toContain('shouldShowPushPrimer');
    expect(source).toContain('@tappet/core/push-priming');
    // The vehicle count is why the rule lives with the car at all.
    expect(source).toMatch(/vehicleCount/);
    // And the hub passes it a real count, never zero-while-loading.
    // (UX-16: a second argument, the hold, may follow the count.)
    expect(code(HUB)).toMatch(/usePushPrimer\(\s*state\.status === 'ok' \? [^:]+ : null\s*[,)]/);
  });

  it('the hub asks one thing at a time (audit 360, UX-16)', () => {
    /*
      The primer, iOS's dialog and the health score's sheet stacked on the
      first open of a researched car. The hub holds the primer while the
      score's sheet is wanted or this visit's research runs, and the sheet
      waits for the primer and for the system dialog it raises.
      `usePushPrimer.test.tsx` and `VehicleDetailScreen.test.tsx` hold the
      behaviour; this holds the wiring the behaviour depends on.
    */
    const hub = code(HUB);
    const call = hub.slice(hub.indexOf('usePushPrimer('), hub.indexOf('usePushPrimer(') + 300);
    expect(call).toContain('research.consentNeeded');
    // Anti-vacuous: the primer is asked after the runner exists, or it could not read it.
    expect(hub.indexOf('usePushPrimer(')).toBeGreaterThan(hub.indexOf('useResearchRunner('));
    expect(code(HOOK)).toMatch(/hold = false/);
  });

  it('both asks present through one coordinator, only while the page is focused (audit 360, UX-19 / UX-20)', () => {
    /*
      A *Not now* on the score's sheet raised the primer in the next render,
      and both asks could rise over another tab. Each Modal's \`visible\` is now
      the coordinator's answer, never its own state: \`useAskTurns\` presents
      one at a time, after the last has left, and only while focused. The
      behaviour is held by \`useAskTurns.test.tsx\` and the hub's suite; this
      holds the wiring — a \`visible={primer.open}\` put back would pass both.
    */
    const hub = code(HUB);
    expect(hub).toMatch(/<PushPrimer[^>]*visible=\{asks\.presenting === 'primer'\}/);
    expect(hub).toMatch(/<AiConsentSheet[^>]*visible=\{asks\.presenting === 'score'\}/);
    expect(hub).toMatch(/<PushPrimer[^>]*onDismiss=\{asks\.dismissed\}/);
    expect(hub).toMatch(/<AiConsentSheet[^>]*onDismiss=\{asks\.dismissed\}/);
    // The sheet still waits for iOS's own dialog.
    expect(hub).toMatch(/\['score', research\.consentNeeded && !primer\.priming\]/);
    // Focus gates the coordinator and the primer's latch.
    const turns = hub.slice(hub.indexOf('useAskTurns({'), hub.indexOf('useAskTurns({') + 200);
    expect(turns).toMatch(/focused/);
    const call = hub.slice(hub.indexOf('usePushPrimer('), hub.indexOf('usePushPrimer(') + 300);
    expect(call).toContain('!focused');
    expect(hub.indexOf('useScreenFocused()')).toBeGreaterThan(-1);
    // Anti-vacuous: the old self-gated shapes are refused.
    expect(hub).not.toMatch(/visible=\{primer\.open\}/);
    expect(hub).not.toMatch(/visible=\{research\.consentNeeded/);
  });

  it('accepting the primer is what raises the system prompt', () => {
    /*
      The whole mechanism in one assertion. If `registerForPush` were called
      from anywhere in the hook other than the accept path, the primer would
      be decoration in front of a dialog that fires regardless.
    */
    const source = code(HOOK);
    expect(source).toContain('registerForPush');

    const accept = source.indexOf('const accept = useCallback');
    const call = source.indexOf('registerForPush(');
    expect(accept).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(accept);
  });

  it('declining records a date, so the cooldown can expire', () => {
    /*
      A boolean would make the first "not now" permanent, and somebody who was
      busy once would never be asked again — leaving the system ask unspent
      forever, which is a worse outcome than having no primer.
    */
    const source = code(HOOK);
    expect(source).toContain('recordPrimerDismissed');
    expect(source).toMatch(/recordPrimerDismissed\(\s*new Date\(\)/);
  });

  it('the primer writes none of its own copy', () => {
    /*
      Every string comes from `PUSH_PRIMER_COPY`, which is marked as David's to
      replace in Phase 5.5. A hard-coded sentence here would be a second place
      the wording lives, and the reviewed screen would drift from the shared
      one silently.
    */
    const source = code(PRIMER);
    expect(source).toContain('PUSH_PRIMER_COPY');

    /*
      Checked as "every rendered <Text> is an expression, not prose".

      ⚠ The first version of this scanned for long string literals anywhere in
      the file, and it matched almost the entire component — a regex counting
      `'` cannot tell an import path from a colour from a JSX attribute
      delimited with `"`, so one quote in an import opened a match that a quote
      in a StyleSheet closed. It reported the styles as copy.

      The property that actually matters is narrower and exactly expressible:
      nothing the user reads is written here.
    */
    // `exec` in a loop rather than spreading `matchAll` — this project's
    // tsconfig target predates downlevel iteration of a RegExp iterator, and
    // the spread compiles under SWC but fails `tsc` (TS2802).
    const rendered: string[] = [];
    const pattern = /<Text[^>]*>([\s\S]*?)<\/Text>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      rendered.push(match[1].trim());
    }

    expect(rendered.length).toBeGreaterThan(0);
    for (const body of rendered) {
      expect(body).toMatch(/^\{[\s\S]*\}$/);
      expect(body).toContain('PUSH_PRIMER_COPY');
    }
  });

  it('the primer offers a real way out', () => {
    // A modal with no decline path is a trap, and a trap gets answered at the
    // system level — permanently.
    const source = code(PRIMER);
    expect(source).toContain('onDecline');
    expect(source).toContain('onRequestClose');
  });
});
