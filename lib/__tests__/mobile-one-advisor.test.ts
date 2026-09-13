/**
 * The advisor is one place: every question from another tab lands in the
 * Advisor tab as a new thread, with a way back — and no dossier stack pushes
 * an advisor of its own.
 *
 * @jest-environment node
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * David, 12 Sep, from the catalogue's "Learn more": a second advisor opened
 * inside the Plan stack — *"this other 'what this car needs' advisor
 * environment which is not otherwise able to be navigated to, so user cannot
 * easily go back and read the discussion. it's also just disorienting to have
 * this new environment."* The push existed to dodge a real hazard (a question
 * asked once per mount is swallowed by a tab whose Advisor is already open),
 * and the fix is in the screen (`questionKey`, pinned by its own suite). This
 * guard holds the navigator's half by reading its source — the navigator is
 * React Native and this runner cannot load it; `advisor-thread.test.ts` in the
 * mobile suite pins the params a question travels with — and requires that
 * the only `Advisor` route left is the tab's.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAVIGATOR = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'navigation', 'RootNavigator.tsx');

/** Comments blanked, so the docblocks that tell the old story are not read as code. */
function stripComments(source: string): string {
  const blank = (m: string, lead: string) => lead + m.slice(lead.length).replace(/[^\n]/g, ' ');
  return source.replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s{(,;])\/\/[^\n]*/g, blank);
}

describe('the navigator', () => {
  const source = stripComments(readFileSync(NAVIGATOR, 'utf8'));

  it('mounts the Advisor screen in exactly one stack — the Advisor tab’s', () => {
    const mounts = source.match(/\{advisorScreen\(onSignOut\)\}/g) ?? [];
    expect(mounts).toHaveLength(1);
  });

  it('never pushes an Advisor onto the stack a question came from', () => {
    expect(source).not.toMatch(/navigate\('Advisor'/);
    // And the three places a question can leave from all go through the one door.
    expect((source.match(/askAdvisor\(navigation/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('can still see a push if one came back', () => {
    const relapse = source + "\nnavigation.navigate('Advisor', { vehicleId, ask });\n";
    expect(relapse).toMatch(/navigate\('Advisor'/);
  });
});
