/**
 * `docs/identifiers.md` has to agree with the code, or it is worse than absent.
 *
 * @jest-environment node
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * The fact register is the tiebreaker for anything about naming, identifiers or
 * deploy state, and on 6 Sep it acquired a note recording its own flaw: it lives
 * as a Cowork project file, so it is not in the repo, not in the shared folder
 * and not on disk. Every guard the codebase gained that day covers the code, and
 * none of them covered the document that adjudicates the code. Its claims were
 * checkable on demand and nothing detected drift.
 *
 * A copy in `docs/` was the first suggestion. The better one, and the reason
 * this file is a test rather than a second document: **a diff catches two copies
 * disagreeing with each other; an assertion catches a copy disagreeing with
 * reality.** Only the second is the risk. A register that has quietly drifted
 * still reads as authoritative, and it is consulted precisely when nobody has
 * time to re-derive the facts — which is the worst moment to be confidently
 * wrong.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 *
 * It says nothing about the entity, the pricing or the App Store state. Those
 * are the register's and cannot be proved from here; duplicating them into the
 * repo would have produced a second unverifiable document, which is the failure
 * being fixed rather than a fix for it.
 *
 * ── Why static analysis ─────────────────────────────────────────────────────
 *
 * The subject is a correspondence between prose on disk and literals in source
 * and JSON. Three of the holders are React Native or config files this runner
 * cannot import. Registered in `tests-test-real-code.test.ts` for that reason.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const PAGE = 'docs/identifiers.md';

/**
 * The table row whose first cell is exactly `label`.
 *
 * ⚠ Per row, not per page. A whole-page `includes()` was the first version of
 * this and it was too weak to be worth having: the bundle id is a prefix of both
 * product ids, so the bundle id row could go stale and the page would still
 * "contain" the right string — from a different row. The drift case below found
 * that, which is the argument for writing one.
 */
function rowFor(page: string, label: string): string | undefined {
  return page.split('\n').find((line) => {
    if (!line.startsWith('|')) return false;
    // Compare the first cell, with markdown code ticks removed: three of these
    // labels are code identifiers and are correctly backticked on the page.
    return line.split('|')[1]?.replace(/`/g, '').trim() === label;
  });
}

/** `app.json`'s expo block, which holds five of the eleven values. */
const expo = JSON.parse(read('apps/mobile/app.json')).expo;

/** One literal per row of the table, read from whatever actually holds it. */
function actual(): { what: string; value: string | undefined }[] {
  const appleRootCa = read('lib/apple-root-ca.ts');
  const subscription = read('packages/core/src/apple-subscription.ts');
  const siteRole = read('lib/site-role.ts');

  const grab = (src: string, re: RegExp) => src.match(re)?.[1];

  return [
    { what: 'Apple bundle identifier', value: expo?.ios?.bundleIdentifier },
    { what: 'Android package', value: expo?.android?.package },
    { what: 'APPLE_BUNDLE_ID', value: grab(appleRootCa, /APPLE_BUNDLE_ID = '([^']+)'/) },
    {
      what: 'IAP product id, monthly',
      value: grab(subscription, /'([a-z0-9.]+\.paid\.monthly)'/i),
    },
    { what: 'IAP product id, annual', value: grab(subscription, /'([a-z0-9.]+\.paid\.annual)'/i) },
    { what: 'Expo slug', value: expo?.slug },
    { what: 'URL scheme', value: expo?.scheme },
    { what: 'Mobile API base', value: expo?.extra?.apiBaseUrl },
    { what: 'PRODUCT_ORIGIN', value: grab(siteRole, /PRODUCT_ORIGIN = '([^']+)'/) },
    { what: 'DEMO_ORIGIN', value: grab(siteRole, /DEMO_ORIGIN = '([^']+)'/) },
    {
      what: 'Git remote',
      value: execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT })
        .toString()
        .trim(),
    },
  ];
}

describe('the identifiers page agrees with the code', () => {
  it('reads a real value for every row', () => {
    /*
      The anti-vacuous half, and it comes first for the usual reason: an
      extraction that matches nothing yields `undefined`, and a page that does
      not mention `undefined` would then "agree" with it. Without this, the test
      below passes hardest at the moment the guard has gone blind — CLAUDE.md §5.
    */
    const missing = actual()
      .filter((f) => typeof f.value !== 'string' || f.value.length === 0)
      .map((f) => f.what);

    expect(missing).toEqual([]);
    expect(actual()).toHaveLength(11);
  });

  it('names every value the code actually holds', () => {
    const page = read(PAGE);

    // The page itself must be real, or "contains nothing" reads as "contains no errors".
    expect(page.length).toBeGreaterThan(500);

    // Every row named in the code must exist on the page, or the check below
    // has nothing to compare and silently passes.
    const noRow = actual().filter((f) => rowFor(page, f.what) === undefined).map((f) => f.what);
    expect(noRow).toEqual([]);

    const wrong = actual()
      .filter((f) => !rowFor(page, f.what)!.includes(f.value!))
      .map((f) => `${f.what} — code says ${f.value}, its row does not`);

    expect(wrong).toEqual([]);
  });

  it('does not still name the identifiers that were replaced', () => {
    /*
      ⚠ Narrow on purpose. A blanket ban on the old product name would fire on
      `CREWCHIEF_DEMO_SITE`, on both live `crewchief*.davidmasterson.co`
      hostnames and on the `crewchief-demo.netlify.app` stub the demo CNAMEs
      still point at — all four correct, all four still in the page. A guard
      that fails on correct content is one somebody switches off, which is the
      `.tap-target-44` lesson in CLAUDE.md §5.

      These two have no such excuse: nothing legitimate names them any more.
    */
    const page = read(PAGE);
    const gone = ['co.davidmasterson.crewchief', 'crewchief://'];

    const stillNamed = gone.filter((s) => {
      // The "must not come back" list quotes them once each, by design.
      const quotedInTheBanList = page.includes(`\`${s}\``);
      const occurrences = page.split(s).length - 1;
      return quotedInTheBanList ? occurrences > 1 : occurrences > 0;
    });

    expect(stillNamed).toEqual([]);
  });

  it('can still detect a page that has drifted', () => {
    /*
      Proves the comparison is load-bearing rather than trivially satisfied. The
      real regression is one row going stale while the other ten stay right —
      a rename applied to the code and not to the page, which is exactly what
      happened to the register on the afternoon it was written.
    */
    const page = read(PAGE);

    // Stale one row only, leaving the other ten right — the realistic shape.
    const drifted = page
      .split('\n')
      .map((l) => (l.startsWith('| Apple bundle identifier |') ? l.replace(expo.ios.bundleIdentifier, 'com.example.stale') : l))
      .join('\n');

    const wrong = actual().filter((f) => {
      const row = rowFor(drifted, f.what);
      return row === undefined || !row.includes(f.value!);
    });
    expect(wrong.map((f) => f.what)).toEqual(['Apple bundle identifier']);

    // …and the untouched page has no such rows.
    expect(actual().filter((f) => !rowFor(page, f.what)!.includes(f.value!))).toEqual([]);
  });
});
