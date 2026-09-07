/**
 * The product is called **Well Kept**, and this is what stops the old name
 * coming back one call site at a time.
 *
 * ── Why a scanner rather than a checklist ───────────────────────────────────
 *
 * The 30 Aug rename touched 355 files. A rename that size is not finished when
 * the suites pass — it is finished when nothing can quietly reintroduce the old
 * name, and the failure mode is somebody copying a string from an older file,
 * or a merge landing a branch written before the rename.
 *
 * ⚠ **This scans stripped source, not raw text.** Every exemption below is
 * explained in a comment directly above the line it exempts, so a raw-text
 * scan would pass for a file where somebody deleted the code and left the
 * paragraph — the `.tap-target-44` trap from CLAUDE.md rule 5, which this
 * project has already paid for once.
 *
 * ── The exemptions are the interesting half ─────────────────────────────────
 *
 * Each one names something the rename deliberately did not touch, with the
 * reason. A hit that matches none of them fails, and the fix is either to
 * rename it or to add it here with an argument — which is the point: the list
 * is the record of what "CrewChief" still legitimately means in this tree.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/*
  ⚠ `lib` was added 6 Sep and had been missing since this scan was written. It
  is where the product's identity actually lives — `apple-root-ca.ts` holds
  `APPLE_BUNDLE_ID`, `site-role.ts` holds both live origins, `legal.ts` holds
  `CONTACT_EMAIL` and `OPERATOR` — so a rename could have been completed
  everywhere this swept and still left the bundle id naming the old product,
  with the suite green. It sweeps clean today; the point is that it is now
  swept. `__tests__` is skipped by the walker, as before.
*/
const ROOTS = ['app', 'components', 'lib', 'packages/core/src', 'apps/mobile/src'];
const EXTRA_FILES = ['apps/mobile/app.json', 'public/manifest.json'];

const OLD_NAME = /crew[-_ ]?chief/i;

type Exemption = { reason: string; pattern: RegExp };

/*
  Ordered loosest-last. Every entry is a thing that is NOT the product's name:
  an address that exists, an identifier something outside this repo already
  holds, or a character who has not been renamed yet.
*/
const EXEMPT: Exemption[] = [
  {
    reason: 'per-site Netlify environment variables — renamed only with Netlify',
    pattern: /CREWCHIEF_[A-Z_]+/,
  },
  {
    reason:
      'a crew chief is a real job in motorsport, and the phrase is the advisor persona\'s archetype — never the product',
    pattern: /NASCAR crew chief/i,
  },
  {
    reason:
      'dead feedback address on a domain nobody here owns — flagged 30 Aug, David to decide whether it goes or moves',
    pattern: /feedback@crewchief\.app/i,
  },
];

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);

    /*
      ⚠ A walk is not an atomic snapshot. `readdirSync` lists names, and by the
      time `statSync` asks about one it may be gone — an editor's temp file, a
      bundler's cache write, anything touching the tree while this runs.

      Three source-scanning suites failed once each on 30 Aug and passed on an
      immediate re-run, which is the signature of exactly that. Not diagnosed,
      and this does not claim to be the diagnosis — but a tree walker that dies
      on a vanished entry is wrong on its own terms, and a guard that fails
      intermittently is worse than none: it teaches people to re-run a red
      result rather than read it.

      ⚠ It skips the entry rather than the file *class*. Anything that made the
      scan quietly cover less would defeat the point of the scan, so the
      anti-vacuous file-count assertion below still has to hold.
    */
    let isDirectory: boolean;
    try {
      isDirectory = statSync(full).isDirectory();
    } catch {
      continue;
    }

    if (isDirectory) sources(full, acc);
    else if (/\.(ts|tsx|json)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/* Comments carry the explanations, including this file's own reasoning about
   the old name. Scanning them would make every well-documented decision look
   like an unfinished rename.

   ⚠ A block comment is blanked in place rather than deleted. Deleting it
   collapses every line below it, so the line numbers stop matching the file —
   the first draft reported a docblock's `*` as a finding on the wrong line,
   which is a report nobody can act on. */
/**
 * Blank out comments, keeping every newline so a finding's line number survives.
 *
 * ⚠ `//` does not start a comment when a `:` sits immediately before it. That
 * one exception is what lets this scan see a url at all. Without it
 * `.replace(/\/\/.*$/gm, '')` eats from the scheme separator to end of line, so
 * `'https://crewchief.davidmasterson.co'` reached `OLD_NAME` as `'https:` and
 * matched nothing — the scanner was structurally blind to every url in
 * TypeScript, and the "live hostnames" exemption it carried until 6 Sep was
 * therefore never doing anything. JSON was only ever covered because the
 * stripper is not run on it.
 *
 * ⚠ The exception mis-fires in one direction only, and it is the loud one. A
 * comment opened with no space after a colon — `case 'x'://note` — is not
 * stripped, so a comment there would be read as code and *reported*. A false
 * finding is answerable; the silence it replaces was not. Protocol-relative
 * urls (`//host/path`, no scheme) stay invisible, which is the same trade at a
 * far rarer shape.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findings(): { file: string; line: number; text: string }[] {
  const files = [
    ...ROOTS.flatMap((r) => sources(join(ROOT, r))),
    ...EXTRA_FILES.map((f) => join(ROOT, f)),
  ];

  expect(files.length).toBeGreaterThan(300); // the walker returning nothing must not read as clean

  const out: { file: string; line: number; text: string }[] = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const code = file.endsWith('.json') ? raw : stripComments(raw);
    const rawLines = raw.split('\n');
    /*
      The stripped copy decides whether a hit is in code or in prose; the RAW
      line is what gets matched against the exemptions and reported.

      ⚠ Not interchangeable for reporting: the RAW line is what a finding
      shows, so a reader is given the text that is actually in the file rather
      than a truncated copy of it.

      ⚠ And a gap worth naming here, because it is the reason no hostname needs
      an exemption any more — not that the hostnames stopped containing the old
      name, though on 6 Sep they did, but that this scan could never see them.
      `stripComments` deletes from `//` to end of line, so a url literal in a
      `.ts` file loses its separator and everything after it:
      `'https://crewchief.davidmasterson.co'` reaches `OLD_NAME` as `'https:`
      and does not match at all. The scanner is blind to every url in
      TypeScript. JSON is untouched by the stripper, which is the only reason
      `app.json` was ever really covered.
    */
    code.split('\n').forEach((stripped, i) => {
      if (!OLD_NAME.test(stripped)) return;
      const text = rawLines[i] ?? stripped;
      if (EXEMPT.some((e) => e.pattern.test(text))) return;
      out.push({ file: file.slice(ROOT.length + 1), line: i + 1, text: text.trim() });
    });
  }
  return out;
}

describe('the product is called Well Kept everywhere it is named', () => {
  it('no shipped source names the old product outside the exemption list', () => {
    expect(findings()).toEqual([]);
  });

  it('can still detect one', () => {
    /*
      The anti-vacuous case. `findings()` returning `[]` is the pass condition,
      and an empty result is also what a broken walker, a too-greedy stripper
      or an exemption that matches everything would produce.
    */
    const planted = 'const heading = "What CrewChief does for your car";';
    expect(OLD_NAME.test(planted)).toBe(true);
    expect(EXEMPT.some((e) => e.pattern.test(planted))).toBe(false);
  });

  it('strips comments in both directions', () => {
    // Too-greedy stripping is the other way this passes while checking nothing.
    expect(stripComments('/* CrewChief */ const a = 1;')).not.toMatch(OLD_NAME);
    expect(stripComments('const label = "CrewChief"; // note')).toMatch(OLD_NAME);
    // And line numbers survive, or a finding points at the wrong line.
    expect(stripComments('/* a\n b */\nconst x = 1;').split('\n')).toHaveLength(3);

    /*
      ⚠ The url cases, added 6 Sep with the fix they pin. Each one failed before
      it: the stripper cut at the scheme separator, so a hostname in code was
      not exempted, it was invisible.
    */
    // A url in code survives, so a hostname naming the old product is findable.
    expect(stripComments("const u = 'https://crewchief.davidmasterson.co';")).toMatch(OLD_NAME);
    /*
      Both halves of the line survive, not just the part before the scheme. The
      character before `//` is put back by the capture, so the trailing space is
      expected — it is whitespace in stripped output, which nothing reads.
    */
    expect(stripComments("const u = 'https://example.com/x'; // note")).toBe(
      "const u = 'https://example.com/x'; "
    );
    // …and a genuine line comment is still stripped, url inside it or not.
    expect(stripComments('const a = 1; // https://crewchief.davidmasterson.co')).not.toMatch(
      OLD_NAME
    );
    expect(stripComments('// CrewChief')).not.toMatch(OLD_NAME);
  });

  it('the archetype exemption covers the job and not the product', () => {
    /*
      ⚠ The persona exemption that used to be here is gone, and its absence is
      the point: the advisor was renamed to Jay on 30 Aug, so no shipped source
      says "CrewChief" as a character any more. An exemption that has stopped
      being true is how an allowlist rots — it silently re-permits the thing it
      was narrowly written for.

      What survives is narrower and is not a name at all. A crew chief is a real
      role in motorsport, and the system prompt reaches for it as the voice's
      archetype.
    */
    const archetype = EXEMPT.find((e) => e.reason.startsWith('a crew chief is a real job'))!;
    expect(archetype.pattern.test('the love child of a grizzled NASCAR crew chief')).toBe(true);
    expect(archetype.pattern.test('Everything else in CrewChief works the same')).toBe(false);

    // And nothing here exempts the character's old name any more.
    expect(EXEMPT.some((e) => e.pattern.test("? 'Owner' : 'CrewChief'"))).toBe(false);
  });
});
