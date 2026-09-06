/**
 * The deep-link scheme is declared in four places, and they must be one word.
 *
 * @jest-environment node
 *
 * ── ⚠ Why this exists, and why it did not before ────────────────────────────
 *
 * `crewchief://` became `wellkept://` on 6 Sep. Until that rename the scheme
 * had never moved, so nothing needed to hold the four declarations together:
 *
 *   apps/mobile/app.json                       `expo.scheme` — what iOS
 *                                              registers the app to answer
 *   apps/mobile/src/navigation/RootNavigator   `linking.prefixes` — what the
 *                                              navigator agrees to parse
 *   apps/mobile/src/notifications/push.ts      the receiving allowlist
 *   packages/core/src/notifications.ts         what the server *sends*
 *
 * A rename is exactly when a set like that comes apart, because the four live
 * in three packages and nothing imports across them.
 *
 * ── ⚠ The failure it pins is silent, which is the point ─────────────────────
 *
 * Every way these can disagree is quiet. If `app.json` and the navigator
 * disagree, iOS hands the app a url the navigator will not parse: the app opens
 * on its root and the tap looks like a mis-tap. If the server's `APP_SCHEME`
 * drifts from the phone's allowlist, `push.ts` returns `null` and the
 * notification opens the app with the deep link discarded — the flagship recall
 * path from CLAUDE.md §6, delivering the user to the garage instead of the
 * recall, with no error anywhere. None of it throws, and no existing suite
 * compares the four: `mobile-push-routing` and `push-notification-links` each
 * assert one side against a literal they carry themselves, so both stay green
 * while the app in the store is broken.
 *
 * ── Why static analysis ─────────────────────────────────────────────────────
 *
 * There is nothing to import. Three of the four are React Native source this
 * runner cannot load, and the fourth is JSON; the property is a correspondence
 * between four literals on disk. Registered in `tests-test-real-code.test.ts`
 * for that reason.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Each declaration, with the pattern that lifts the scheme out of it.
 *
 * ⚠ Every pattern is anchored to the **code** form, not to the bare string.
 * `push.ts` and `RootNavigator.tsx` both discuss the scheme in prose a few
 * lines from the line that implements it, and a pattern loose enough to match
 * the paragraph would keep passing after somebody deleted the rule — the
 * `.tap-target-44` trap from CLAUDE.md §5.
 */
const DECLARATIONS: { file: string; what: string; pattern: RegExp }[] = [
  {
    file: 'apps/mobile/app.json',
    what: 'expo.scheme — what iOS registers',
    pattern: /"scheme":\s*"([a-z0-9.-]+)"/i,
  },
  {
    file: 'apps/mobile/src/navigation/RootNavigator.tsx',
    what: 'linking.prefixes — what the navigator parses',
    pattern: /prefixes:\s*\[\s*'([a-z0-9.-]+):\/\/'/i,
  },
  {
    file: 'apps/mobile/src/notifications/push.ts',
    what: 'the receiving allowlist',
    pattern: /startsWith\('([a-z0-9.-]+):\/\/'\)/i,
  },
  {
    file: 'packages/core/src/notifications.ts',
    what: 'APP_SCHEME — what the server sends',
    pattern: /APP_SCHEME\s*=\s*'([a-z0-9.-]+):\/\/'/i,
  },
];

function declaredSchemes(): { what: string; file: string; scheme: string | null }[] {
  return DECLARATIONS.map(({ file, what, pattern }) => ({
    what,
    file,
    scheme: read(file).match(pattern)?.[1] ?? null,
  }));
}

describe('one deep-link scheme, declared four times', () => {
  it('finds a scheme in every one of the four places', () => {
    /*
      The anti-vacuous half, and it has to come first. A pattern that matches
      nothing yields `null`, and four `null`s are all equal — so without this
      the agreement test below passes hardest exactly when the guard has gone
      blind, which is the shape CLAUDE.md §5 says to write the assertion for.
    */
    const missing = declaredSchemes()
      .filter((d) => d.scheme === null)
      .map((d) => `${d.file} — ${d.what}`);

    expect(missing).toEqual([]);
  });

  it('declares the same scheme in all four', () => {
    const found = declaredSchemes();
    const distinct = [...new Set(found.map((d) => d.scheme))];

    // Reported as the full picture: which file says what, not just "2 !== 1".
    expect([distinct.length, found.map((d) => `${d.scheme} @ ${d.file}`)]).toEqual([
      1,
      found.map((d) => `${d.scheme} @ ${d.file}`),
    ]);
  });

  it('is the scheme the product actually ships', () => {
    // Pins the value itself, so a coordinated rename is a deliberate edit here
    // rather than something four files can drift into together.
    expect(declaredSchemes().map((d) => d.scheme)).toEqual([
      'wellkept',
      'wellkept',
      'wellkept',
      'wellkept',
    ]);
  });

  it('can still detect a disagreement', () => {
    /*
      Proves the comparison is load-bearing. Three files agreeing and one not is
      the real regression — a rename applied everywhere but the one file another
      session happened to be holding open.
    */
    const drifted = ['wellkept', 'wellkept', 'crewchief', 'wellkept'];
    expect([...new Set(drifted)].length).toBe(2);

    const agreed = ['wellkept', 'wellkept', 'wellkept', 'wellkept'];
    expect([...new Set(agreed)].length).toBe(1);
  });

  it('does not match the scheme where it is only discussed', () => {
    /*
      The patterns must read the rule, not the paragraph above it. Both mobile
      files explain the scheme in a docblock, so a pattern that matched prose
      would survive the deletion of the line it is meant to guard.
    */
    const prose = ' * Only `wellkept://` is accepted. See the header: this field arrives';
    for (const { pattern } of DECLARATIONS) expect(pattern.test(prose)).toBe(false);

    // …and still matches the real thing.
    expect(DECLARATIONS[2].pattern.test("if (!url.startsWith('wellkept://')) return null;")).toBe(
      true
    );
  });
});
