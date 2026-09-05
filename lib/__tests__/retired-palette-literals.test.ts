import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No retired palette value is spelled by hand.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The 4–5 Sep palette work moved the health ramp and the semantic families onto
 * two hues. Moving a token migrates every call site that reads the token — and
 * none of the call sites that had typed the value in by hand. Those were found
 * one at a time, by looking at rendered pages, over four rounds:
 *
 *   1. `health-band.ts` — the RN channels, caught by its own pin
 *   2. `VehicleCard` recall ribbon — `rgb(224 136 130)` / `rgb(224 164 104)`
 *   3. the specimen's swatch props, which named tokens that no longer existed
 *   4. `app/page.tsx` "Open recalls" count — `rgb(224 136 130)` again
 *   5. `app/page.tsx` hero — an inline `fontFamily` naming the display token
 *
 * Every one of them was silent. An inlined literal keeps rendering the old
 * design perfectly and nothing anywhere reports that it was left behind, so the
 * page simply goes on looking like the previous system in one small place.
 *
 * This is the cheap half of that problem: the values that have been retired can
 * be named, so a sixth site spelling one of them fails here instead of being
 * found by a design critique three rounds later.
 *
 * ⚠ It cannot catch a literal that happens to equal a *current* token — that
 * needs a different check, and the honest position is that this one is a net
 * rather than a wall.
 *
 * `CLAUDE.md` §5: the scanner asserts it found sources, and proves it can still
 * detect a planted value.
 */

const ROOT = join(__dirname, '..', '..');
const SURFACES = ['app', 'components', 'hooks'].map((d) => join(ROOT, d));

/**
 * Values this system used to hold, and no longer does.
 *
 * Spelled in both notations because a call site may write either, and written
 * as separate entries rather than one alternation so a failure names which
 * retired value it found.
 */
const RETIRED: ReadonlyArray<{ pattern: RegExp; was: string }> = [
  { pattern: /224[,\s]+136[,\s]+130/, was: '--ring-bad, before 4 Sep (#E08882)' },
  { pattern: /#E08882/i, was: '--ring-bad, before 4 Sep' },
  { pattern: /224[,\s]+164[,\s]+104/, was: '--ring-warn, before 4 Sep (#E0A468)' },
  { pattern: /#E0A468/i, was: '--ring-warn, before 4 Sep' },
  { pattern: /127[,\s]+206[,\s]+156/, was: '--ring-good, before 4 Sep (#7FCE9C)' },
  { pattern: /#7FCE9C/i, was: '--ring-good, before 4 Sep' },
  { pattern: /185[,\s]+199[,\s]+126/, was: '--ring-ok, before 4 Sep (#B9C77E)' },
  { pattern: /#B9C77E/i, was: '--ring-ok, before 4 Sep' },
  { pattern: /#F87171/i, was: '--critical-red, before the two-hue collapse' },
  { pattern: /#4ADE80/i, was: '--confirm-green, before the two-hue collapse' },
  { pattern: /#8FB4C4/i, was: '--info, before the two-hue collapse' },
];

/**
 * Comments are stripped before scanning.
 *
 * Every one of the sites above now carries a docblock naming the value it used
 * to hold, because that is the only way the next reader learns why the token
 * exists. Scanning the comments would make this guard fail on its own
 * documentation — and the fix a future reader would reach for is deleting the
 * explanation, which is the opposite of what should happen.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const files = SURFACES.flatMap((d) => tsxFiles(d));

describe('retired palette values', () => {
  it('found sources to scan, so this cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('can still detect a retired value', () => {
    // The anti-vacuous case. If this stops matching, the scan below is inert.
    const planted = stripComments("const c = 'rgb(224 136 130)';");

    expect(RETIRED.some((r) => r.pattern.test(planted))).toBe(true);
  });

  it('strips comments without eating the code around them', () => {
    const stripped = stripComments('const a = 1; /* rgb(224 136 130) */ const b = 2;');

    expect(stripped).toContain('const a = 1;');
    expect(stripped).toContain('const b = 2;');
    expect(stripped).not.toContain('224');
  });

  it('are spelled nowhere by hand', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const { pattern, was } of RETIRED) {
        if (pattern.test(source)) {
          offenders.push(`${file.replace(ROOT + '/', '')} — ${was}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
