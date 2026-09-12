/**
 * Every wait on the web app is the wait instrument, and every exception says why.
 *
 * @jest-environment node
 *
 * ── What this ratchets ──────────────────────────────────────────────────────
 *
 * On 11 Sep the web app had twenty-odd ways of saying "working": Lucide's
 * `Loader2` spinning inside buttons, four hand-rolled `border-t-info
 * rounded-full animate-spin` rings on page loads, `animate-pulse` bars under a
 * mod nobody had analysed, three pulsing bars filled to 33/53/73% by
 * arithmetic on an array index, a framer glow behind a lightning glyph, and a
 * stage list advancing on `setTimeout`s. Each one shipped because the only way
 * to see it was to spend the call it waited on.
 *
 * `components/Working.tsx` is now the one family — full, compact, and the
 * button-scale mark — and this scan is what stops the twenty-first from
 * arriving. It walks `app/`, `components/` and `hooks/` for the markers those
 * indicators were built from and requires every hit to be on the allow-list
 * below, with a reason.
 *
 * ── Two anti-vacuous cases, because a scanner that finds nothing is green ──
 *
 * The walk has to have found files, and the pattern has to be proven against
 * a fixture that contains the thing it exists to catch. Both are asserted.
 * And every allow-list entry has to still match something: an entry whose
 * site has been fixed is a stale exemption waiting to cover the next one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SURFACES = ['app', 'components', 'hooks'].map((d) => join(ROOT, d));

/**
 * The markers every replaced indicator was built from. Kept as separate
 * expressions so a failure names which kind it found.
 */
const MARKERS: Array<{ name: string; re: RegExp }> = [
  { name: 'Tailwind spin', re: /\banimate-spin\b/ },
  { name: 'Tailwind pulse', re: /\banimate-pulse\b/ },
  { name: 'Tailwind bounce', re: /\banimate-bounce\b/ },
  { name: 'Lucide Loader2', re: /\bLoader2\b/ },
  { name: 'hand-rolled ring', re: /border-t-info rounded-full/ },
  { name: 'framer infinite loop', re: /repeat:\s*Infinity/ },
];

/**
 * Sites that keep a marker, and the reason each one is still there.
 *
 * ⚠ A reason is not a licence. The list held two files owned by another
 * worktree on 11 Sep; `components/ConsultantChat.tsx` came out on 12 Sep when
 * the advisor adopted the instrument (see the case below, which now refuses
 * a leftover in that file), and `app/consultant/[vehicleId]/page.tsx` — the
 * last two hand-rolled rings, on the page shell — came out the same day.
 * The list is empty, and that is the state it is meant to stay in: a new
 * entry needs a reason a reader would accept, and the anti-vacuous case
 * below keeps the scanner honest while it has nothing to allow.
 */
const ALLOWED: Record<string, string> = {};

/**
 * Comments blanked, newlines kept, opener anchored — the same three lessons
 * `text-contrast-floor.test.ts` records: prose about a spinner is not a
 * spinner, a shortened source reports the wrong line, and an unanchored
 * opener eats `accept="image/*"` and everything after it.
 */
function stripComments(source: string): string {
  const blank = (m: string, lead: string) =>
    lead + m.slice(lead.length).replace(/[^\n]/g, ' ');
  return source
    .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[\s{(,;])\/\/[^\n]*/g, blank);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

interface Hit {
  file: string;
  line: number;
  marker: string;
}

function scanSource(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  const lines = stripComments(source).split('\n');
  lines.forEach((text, index) => {
    for (const { name, re } of MARKERS) {
      if (re.test(text)) hits.push({ file: rel, line: index + 1, marker: name });
    }
  });
  return hits;
}

const files = SURFACES.flatMap(sourceFiles);
const hits = files.flatMap((file) =>
  scanSource(file.slice(ROOT.length + 1), readFileSync(file, 'utf8'))
);

describe('one wait instrument', () => {
  it('walked the surfaces it claims to walk', () => {
    expect(files.length).toBeGreaterThan(60);
    // The instrument itself must be among them, or the scan is looking at the
    // wrong tree.
    expect(files.some((f) => f.endsWith('components/Working.tsx'))).toBe(true);
  });

  it('can still detect each kind of indicator it was written against', () => {
    /*
      A fixture carrying one of each, run through the same scanner. If a
      marker regex quietly stops matching, this fails rather than the app
      silently passing forever — CLAUDE.md §5.
    */
    const fixture = [
      '<Loader2 className="h-4 w-4 animate-spin" />',
      '<div className="h-3 bg-white/10 rounded w-3/4 animate-pulse" />',
      '<div className="w-1 h-3 rounded-full animate-bounce" />',
      '<div className="w-10 h-10 border-2 border-info-border border-t-info rounded-full animate-spin" />',
      "transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}",
    ].join('\n');
    const found = new Set(scanSource('fixture.tsx', fixture).map((h) => h.marker));
    for (const { name } of MARKERS) expect(found).toContain(name);
  });

  it('does not count prose about a spinner as a spinner', () => {
    const commented = [
      '/* The old panel used <Loader2 className="animate-spin" /> and animate-pulse bars. */',
      '// border-t-info rounded-full was the hand-rolled ring',
      'const x = 1;',
    ].join('\n');
    expect(scanSource('fixture.tsx', commented)).toEqual([]);
  });

  it('finds no indicator outside the allow-list', () => {
    const offenders = hits
      .filter((h) => !(h.file in ALLOWED))
      .map((h) => `${h.file}:${h.line}  ${h.marker} — use <Working> or <WorkingMark> from components/Working.tsx`);
    expect(offenders).toEqual([]);
  });

  it('the advisor adopted the instrument, and the scan still reaches it', () => {
    /*
      `ConsultantChat.tsx` was the allow-list's largest entry: three Loader2
      spinners and a five-stage "thinking" list advanced by a 1.8s setInterval
      with a wrapping modulo — the invoice scanner's UX-15 defect in a chat.
      With the entry gone, any marker left in the file is an offender above;
      this pins the other half — that the file is still walked, still renders
      the instrument, and owns no clock — so a deleted or renamed file cannot
      pass as a clean one.
    */
    const advisor = files.find((f) => f.endsWith('components/ConsultantChat.tsx'));
    expect(advisor).toBeDefined();
    const source = stripComments(readFileSync(advisor!, 'utf8'));
    expect(source).toMatch(/<AdvisorWait\b/);
    expect(source).toMatch(/<WorkingMark\b/);
    expect(source).not.toMatch(/THINKING_STAGES|setInterval\(/);
    expect(hits.filter((h) => h.file === 'components/ConsultantChat.tsx')).toEqual([]);

    // And a leftover would be refused, not excused: the file with one spinner
    // put back, through the same filter the offenders case uses.
    const relapse = scanSource(
      'components/ConsultantChat.tsx',
      readFileSync(advisor!, 'utf8') + '\n<Loader2 className="h-3.5 w-3.5 animate-spin" />\n'
    ).filter((h) => !(h.file in ALLOWED));
    expect(relapse.map((h) => h.marker)).toEqual(['Tailwind spin', 'Lucide Loader2']);

    // The turn itself is the instrument, and it owns no clock either.
    const turn = stripComments(readFileSync(join(ROOT, 'components', 'AdvisorWait.tsx'), 'utf8'));
    expect(turn).toMatch(/<Working\b/);
    expect(turn).not.toMatch(/requestAnimationFrame|setInterval|setTimeout/);
  });

  it('keeps every allow-list entry honest', () => {
    // An exemption whose site no longer exists is a stale hole. Remove the
    // entry when the site is fixed.
    const stale = Object.keys(ALLOWED).filter((file) => !hits.some((h) => h.file === file));
    expect(stale).toEqual([]);
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(40);
  });

  it('the instrument’s motion is a CSS animation the reduced-motion rule reaches, and is stated there', () => {
    /*
      The sweep must be CSS, not a rAF loop: the blanket rule in globals.css
      is what stops it for a visitor who asked for less motion, and
      `reduced-motion.test.ts` only checks that rAF loops *ask*. Assert the
      keyframes exist, the live class binds them, and the reduced-motion block
      names the sweep explicitly — a designed still, not a side effect.
    */
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    expect(css).toMatch(/@keyframes workingSweep/);
    expect(css).toMatch(/\.working-sweep\.is-live\s*\{\s*animation:\s*workingSweep/);

    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.working-sweep\.is-live\s*\{\s*animation:\s*none/);

    /*
      The terminal flash (brief B5) is a second pair of CSS animations on the
      pip's clock — a 2600ms loop against the 1300ms alternating traverse, so
      the foot lights at 0% and the head at 50%. Both must exist, both must
      be bound to a live sweep and nothing else, and both must stop under
      reduced motion with the sweep.
    */
    expect(css).toMatch(/@keyframes workingTouchFoot/);
    expect(css).toMatch(/@keyframes workingTouchHead/);
    expect(css).toMatch(/\.working-sweep\.is-live\s*~\s*\.working-terminal\[data-end='foot'\]\s*\{\s*animation:\s*workingTouchFoot 2600ms/);
    expect(css).toMatch(/\.working-sweep\.is-live\s*~\s*\.working-terminal\[data-end='head'\]\s*\{\s*animation:\s*workingTouchHead 2600ms/);
    expect(css).toMatch(/\.working-sweep\.is-live\s*\{\s*animation:\s*workingSweep 1300ms/);
    expect(reduced).toMatch(/\.working-terminal\s*\{\s*animation:\s*none/);

    const component = stripComments(readFileSync(join(ROOT, 'components', 'Working.tsx'), 'utf8'));
    expect(component).not.toMatch(/requestAnimationFrame|setInterval|setTimeout/);
    expect(component).toMatch(/is-live/);
  });

  it('the sweep swings and does not fill', () => {
    /*
      The keyframes animate the dash *offset* between two positions. If they
      ever animate `stroke-dasharray` — a growing length — the instrument has
      become a progress bar, which is the indicator `b1e2baa` removed.
    */
    const css = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const start = css.indexOf('@keyframes workingSweep');
    const block = css.slice(start, css.indexOf('}\n}', start) + 3);
    expect(block).toMatch(/stroke-dashoffset/);
    expect(block).not.toMatch(/stroke-dasharray/);
  });
});
