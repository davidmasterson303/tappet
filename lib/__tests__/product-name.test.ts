/**
 * The product is called **Tappet**, and this is what stops either dead name
 * coming back one call site at a time.
 *
 * ── Why a scanner rather than a checklist ───────────────────────────────────
 *
 * The 30 Aug rename touched 355 files; the 7 Sep one touched 1,136 occurrences
 * across 441. A rename that size is not finished when the suites pass — it is
 * finished when nothing can quietly reintroduce the old name, and the failure
 * mode is somebody copying a string from an older file, or a merge landing a
 * branch written before the rename.
 *
 * ⚠ **There are two dead names, and this scanner knowing only the older one
 * would be worse than having none.** It would sweep clean and report green
 * while `wellkept` sat in the source — the newer, far more numerous name. A
 * guard answering a question nobody is asking any more is indistinguishable
 * from a guard that is working. `OLD_NAMES` grows with each rename and nothing
 * is ever taken out of it.
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
 * is the record of what "CrewChief" and "Well Kept" still legitimately mean in
 * this tree.
 *
 * ⚠ One exemption protects **data** rather than prose: the superseded
 * `localStorage` keys in `lib/deletion-recovery.ts` have to name the dead
 * product, or the deletions queued under them are lost. A find-and-replace
 * "fixing" that line reinstates a silent data-loss bug and leaves this file
 * green — which is exactly what happened during this rename, and what the
 * exemption plus `deletion-queue-survives-a-rename.test.ts` now prevent.
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

/*
  ⚠ **Two dead names now, and the newer one is the dangerous one.**

  Until 7 Sep this was a single pattern, `/crew[-_ ]?chief/i`. After a second
  rename that is worse than no scanner at all: it sweeps clean, reports green,
  and says nothing about the 1,136 occurrences of the name the product had
  yesterday. A guard that answers a question nobody is asking any more reads
  exactly like a guard that is working.

  So the list grows with each rename and nothing is ever removed from it. The
  cost of carrying a dead name here is one regex; the cost of dropping one is
  that it can come back unobserved.
*/
const OLD_NAMES = [
  /crew[-_ ]?chief/i, // the product until 30 Aug
  /well[-_ ]?kept/i, // the product until 7 Sep
];

/** Whether a line names any product this one used to be called. */
const namesAnOldProduct = (line: string) => OLD_NAMES.some((re) => re.test(line));

type Exemption = { reason: string; pattern: RegExp };

/*
  Ordered loosest-last. Every entry is a thing that is NOT the product's name:
  an address that exists, an identifier something outside this repo already
  holds, or a character who has not been renamed yet.
*/
const EXEMPT: Exemption[] = [
  /*
    Per-site Netlify **dashboard** variables, and the code reads all three
    deliberately — see `lib/site-role.ts`. The repo cannot rename these; only
    the Netlify dashboard can, and until it does, deleting a rung points the
    product at a variable nobody sets. Unset means "this is the product", so
    that failure is silent and lands on the recruiter-facing host.
  */
  {
    reason: 'per-site Netlify environment variables — renamed only with Netlify',
    pattern: /(CREWCHIEF|WELLKEPT)_[A-Z_]+/,
  },
  /*
    A crew chief is a real job in motorsport. The advisor's system prompt reaches
    for it as the voice's *archetype*, and the advisor is called Jay — the
    persona is not the product, decided 30 Aug and unchanged by either rename.
  */
  {
    reason:
      'a crew chief is a real job in motorsport, and the phrase is the advisor persona\'s archetype — never the product',
    pattern: /NASCAR crew chief/i,
  },
  /*
    ⚠ Storage keys under dead names, which have to be *named in code* to be
    drained — see `lib/deletion-recovery.ts`. This is the one exemption that
    protects data rather than prose: each entry is a deletion the owner asked
    for and the browser promised to retry, and `localStorage` is addressed only
    by key, so a key nothing reads is a deletion that silently never completes.

    The 6 Sep rename swapped this string with no migration and orphaned every
    entry queued before it. Renaming these to the current name — which is
    exactly what a find-and-replace does, and did — reinstates that bug while
    leaving the scanner green.
  */
  {
    reason:
      'superseded localStorage keys, drained on load — they must name the dead product or the queue under them is lost',
    pattern: /-failed-deletions'/,
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
      if (!namesAnOldProduct(stripped)) return;
      const text = rawLines[i] ?? stripped;
      if (EXEMPT.some((e) => e.pattern.test(text))) return;
      out.push({ file: file.slice(ROOT.length + 1), line: i + 1, text: text.trim() });
    });
  }
  return out;
}

describe('the product is called Tappet everywhere it is named', () => {
  it('no shipped source names either old product outside the exemption list', () => {
    expect(findings()).toEqual([]);
  });

  /*
    ⚠ The anti-vacuous cases, one per dead name, and the second is the one this
    rename added. `findings()` returning `[]` is the pass condition — and it is
    also what a broken walker, a too-greedy stripper, an exemption that matches
    everything, or a pattern list missing a name would each produce.

    Written per name rather than as a loop on purpose: the failure being guarded
    against is a name silently absent from `OLD_NAMES`, and a loop over
    `OLD_NAMES` cannot detect that — it would iterate over whatever is left.
  */
  it('can still detect the name the product had until 30 Aug', () => {
    const planted = 'const heading = "What CrewChief does for your car";';
    expect(namesAnOldProduct(planted)).toBe(true);
    expect(EXEMPT.some((e) => e.pattern.test(planted))).toBe(false);
  });

  it('can still detect the name the product had until 7 Sep', () => {
    const planted = 'const heading = "What Well Kept does for your car";';
    expect(namesAnOldProduct(planted)).toBe(true);
    expect(EXEMPT.some((e) => e.pattern.test(planted))).toBe(false);

    // The spellings that actually occurred in the tree, not just the pretty one.
    for (const spelling of ['wellkept', 'WELLKEPT', 'well-kept', 'Well Kept', 'WELL KEPT']) {
      expect(namesAnOldProduct(`const x = '${spelling}';`)).toBe(true);
    }
  });

  it('does not fire on the current name', () => {
    // The other direction: a scanner that matched `tappet` would fail on every
    // correct file, and would be switched off by lunchtime.
    expect(namesAnOldProduct("const x = 'com.southmoordigital.tappet';")).toBe(false);
    expect(namesAnOldProduct("const u = 'https://tappet.southmoordigital.com';")).toBe(false);
  });

  it('strips comments in both directions', () => {
    // Too-greedy stripping is the other way this passes while checking nothing.
    expect(namesAnOldProduct(stripComments('/* CrewChief */ const a = 1;'))).toBe(false);
    expect(namesAnOldProduct(stripComments('const label = "CrewChief"; // note'))).toBe(true);
    // Both names, or the newer one is only covered in the unstripped case.
    expect(namesAnOldProduct(stripComments('/* Well Kept */ const a = 1;'))).toBe(false);
    expect(namesAnOldProduct(stripComments('const label = "Well Kept"; // note'))).toBe(true);
    // And line numbers survive, or a finding points at the wrong line.
    expect(stripComments('/* a\n b */\nconst x = 1;').split('\n')).toHaveLength(3);

    /*
      ⚠ The url cases, added 6 Sep with the fix they pin and carried forward
      here per the rename plan. Each one failed before that fix: the stripper cut
      at the scheme separator, so a hostname in code was not exempted, it was
      invisible — and `lib/` was not in ROOTS, which is where the origins live.
    */
    // A url in code survives, so a hostname naming an old product is findable.
    expect(
      namesAnOldProduct(stripComments("const u = 'https://crewchief.davidmasterson.co';"))
    ).toBe(true);
    expect(
      namesAnOldProduct(stripComments("const u = 'https://wellkept.southmoordigital.com';"))
    ).toBe(true);
    /*
      Both halves of the line survive, not just the part before the scheme. The
      character before `//` is put back by the capture, so the trailing space is
      expected — it is whitespace in stripped output, which nothing reads.
    */
    expect(stripComments("const u = 'https://example.com/x'; // note")).toBe(
      "const u = 'https://example.com/x'; "
    );
    // …and a genuine line comment is still stripped, url inside it or not.
    expect(
      namesAnOldProduct(stripComments('const a = 1; // https://crewchief.davidmasterson.co'))
    ).toBe(false);
    expect(namesAnOldProduct(stripComments('// CrewChief'))).toBe(false);
    expect(namesAnOldProduct(stripComments('// Well Kept'))).toBe(false);
  });

  it('sweeps the roots where the identity actually lives', () => {
    /*
      ⚠ Carried over from 6 Sep, when `lib/` was found missing from ROOTS. It is
      where `APPLE_BUNDLE_ID`, both origins and `CONTACT_EMAIL` live, so a rename
      could be complete everywhere this swept and still leave the bundle id
      naming the old product, green throughout. Asserted rather than trusted,
      because the regression is one deletion from this array.
    */
    expect(ROOTS).toContain('lib');
    expect(ROOTS).toContain('packages/core/src');
    expect(ROOTS).toContain('apps/mobile/src');
    expect(EXTRA_FILES).toContain('apps/mobile/app.json');
  });

  it('the archetype exemption covers the job and not either product', () => {
    /*
      ⚠ The persona exemption that used to be here is gone, and its absence is
      the point: the advisor was renamed to Jay on 30 Aug, so no shipped source
      says "CrewChief" as a character any more. An exemption that has stopped
      being true is how an allowlist rots — it silently re-permits the thing it
      was narrowly written for.

      What survives is narrower and is not a name at all. A crew chief is a real
      role in motorsport, and the system prompt reaches for it as the voice's
      archetype. That survives this rename untouched: the advisor keeps its
      crew-chief soul, only the product changed name.
    */
    const archetype = EXEMPT.find((e) => e.reason.startsWith('a crew chief is a real job'))!;
    expect(archetype.pattern.test('the love child of a grizzled NASCAR crew chief')).toBe(true);
    expect(archetype.pattern.test('Everything else in CrewChief works the same')).toBe(false);
    expect(archetype.pattern.test('Everything else in Well Kept works the same')).toBe(false);

    // And nothing here exempts the character's old name any more.
    expect(EXEMPT.some((e) => e.pattern.test("? 'Owner' : 'CrewChief'"))).toBe(false);
  });

  it('the storage-key exemption covers dead keys and not dead prose', () => {
    /*
      ⚠ The exemption that protects data rather than text, so it is the one worth
      pinning tightly. It must cover the drain in `lib/deletion-recovery.ts` —
      where naming the dead key IS the fix — without becoming a licence for the
      old name anywhere near the word "deletion".
    */
    const keys = EXEMPT.find((e) => e.reason.startsWith('superseded localStorage keys'))!;

    expect(
      keys.pattern.test(
        "  private legacyStorageKeys = ['wellkept-failed-deletions', 'crewchief-failed-deletions'];"
      )
    ).toBe(true);

    // Not a general pardon for the old name in deletion code.
    expect(keys.pattern.test("const msg = 'Well Kept could not delete this vehicle';")).toBe(false);
    expect(keys.pattern.test('// the CrewChief deletion queue')).toBe(false);
  });

  it('the exemption list does not pardon a plain occurrence of either name', () => {
    /*
      The loosest-last ordering is only safe if nothing in the list is actually
      loose. This is the check that an exemption has not been widened into a
      blanket permit — the failure CLAUDE.md §5 records, arrived at by drift
      rather than by decision.
    */
    for (const planted of [
      'const heading = "What CrewChief does for your car";',
      'const heading = "What Well Kept does for your car";',
      "const origin = 'https://wellkept.southmoordigital.com';",
      "const id = 'com.southmoordigital.wellkept';",
    ]) {
      expect(EXEMPT.some((e) => e.pattern.test(planted))).toBe(false);
    }
  });
});
