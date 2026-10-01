/**
 * One password floor, said the same way everywhere it is said.
 *
 * @jest-environment node
 *
 * Audit 360, UX-10 (1 Oct). The phone's create form now states the floor
 * before the press, from `@tappet/core/password-rule`. The web's sign-up and
 * reset forms each carry their own `password.length < 6` — so the number is
 * written three times, and this holds the two web copies to the shared one.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PASSWORD_MIN_LENGTH } from '@tappet/core/password-rule';

const ROOT = join(__dirname, '..', '..');
const PAGES = ['app/signup/page.tsx', 'app/reset-password/page.tsx'];

/** The floor a page refuses under, from its `if (password.length < N)`. */
function floorIn(source: string): number | null {
  const found = /if \(password\.length < (\d+)\)/.exec(source)?.[1];
  return found === undefined ? null : Number(found);
}

describe('the password floor', () => {
  it('can still read a floor, and reports a page without one as none', () => {
    expect(floorIn('if (password.length < 8) {')).toBe(8);
    expect(floorIn('const ok = true;')).toBeNull();
  });

  it.each(PAGES)('%s refuses under the shared number', (page) => {
    const floor = floorIn(readFileSync(join(ROOT, page), 'utf8'));
    expect(floor).not.toBeNull();
    expect(floor).toBe(PASSWORD_MIN_LENGTH);
  });

  it('the phone states the shared number, not a copy', () => {
    const screen = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'screens', 'SignInScreen.tsx'), 'utf8');
    expect(screen).toMatch(/from '@tappet\/core\/password-rule'/);
    expect(screen).toMatch(/hint=\{isNew \? `at least \$\{PASSWORD_MIN_LENGTH\} characters`/);
  });
});
