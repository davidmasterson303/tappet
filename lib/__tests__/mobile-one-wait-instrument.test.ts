/**
 * Every wait on the phone is the wait instrument, and every exception says why.
 *
 * @jest-environment node
 *
 * ── What this ratchets ──────────────────────────────────────────────────────
 *
 * On 12 Sep the phone had four ways of saying "working": the platform
 * `ActivityIndicator` inside `Button`, `Suggest`, `VehiclePlate`, the invoice
 * scanner and the app's root gate (plus seven screens still importing it for
 * nothing); a pulsing `Skeleton` on ten page loads and under the advisor's
 * question; three loose sentences for the scanner's phases; and a text-only
 * "Loading prices…" on the paywall. Web had settled one family the day before
 * — `components/Working.tsx`, graded 9/10 — and `one-wait-instrument.test.ts`
 * keeps it that way there. This is the phone's copy of that scan.
 *
 * `apps/mobile/src/components/Working.tsx` is now the one family — full,
 * compact, and the control-scale mark — and this walks `apps/mobile/src` and
 * the app root for the markers the replaced indicators were built from,
 * requiring every hit to be on the allow-list below, with a reason.
 *
 * ── Two anti-vacuous cases, because a scanner that finds nothing is green ──
 *
 * The walk has to have found files (and the instrument among them), and every
 * pattern has to be proven against a fixture that contains the thing it
 * exists to catch. Both are asserted. And every allow-list entry has to still
 * match something: an entry whose site has been fixed is a stale exemption
 * waiting to cover the next one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { register } from '../../apps/mobile/src/theme';

const ROOT = join(__dirname, '..', '..');
const MOBILE = join(ROOT, 'apps', 'mobile');
const SURFACES = [join(MOBILE, 'src')];
const ROOT_FILES = [join(MOBILE, 'App.tsx')];

/**
 * The markers every replaced indicator was built from. Kept as separate
 * expressions so a failure names which kind it found.
 */
const MARKERS: Array<{ name: string; re: RegExp }> = [
  { name: 'platform spinner', re: /\bActivityIndicator\b/ },
  { name: 'retired skeleton', re: /<Skeleton(?:Card)?\b|components\/Skeleton'/ },
  { name: 'infinite animation loop', re: /\bAnimated\.loop\(/ },
  { name: 'stage on a clock', re: /\bsetInterval\(/ },
];

/**
 * Sites that keep a marker, and the reason each one is still there.
 *
 * ⚠ A reason is not a licence. The one entry is the instrument itself: its
 * sweep is the app's only `Animated.loop`, and the loop is the design — a
 * pip hunting between the terminals for as long as the work runs. Anything
 * else looping is a second instrument.
 */
const ALLOWED: Record<string, string> = {
  'apps/mobile/src/components/Working.tsx':
    'The wait instrument itself: the ignition sweep is an Animated.loop of two eased traverses, and it is the one loop the app draws.',
};

/**
 * Comments blanked, newlines kept, opener anchored — the same three lessons
 * web's `one-wait-instrument.test.ts` records: prose about a spinner is not a
 * spinner, a shortened source reports the wrong line, and an unanchored
 * opener eats everything after a `/*` inside a string.
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

const files = [...SURFACES.flatMap(sourceFiles), ...ROOT_FILES];
const hits = files.flatMap((file) =>
  scanSource(file.slice(ROOT.length + 1), readFileSync(file, 'utf8'))
);

describe('one wait instrument, on the phone', () => {
  it('walked the surfaces it claims to walk', () => {
    expect(files.length).toBeGreaterThan(60);
    // The instrument itself and the app root must be among them, or the scan
    // is looking at the wrong tree.
    expect(files.some((f) => f.endsWith(join('components', 'Working.tsx')))).toBe(true);
    expect(files.some((f) => f.endsWith(join('mobile', 'App.tsx')))).toBe(true);
  });

  it('can still detect each kind of indicator it was written against', () => {
    /*
      A fixture carrying one of each, run through the same scanner. If a
      marker regex quietly stops matching, this fails rather than the app
      silently passing forever — CLAUDE.md §5.
    */
    const fixture = [
      "import { ActivityIndicator, View } from 'react-native';",
      "import { SkeletonCard } from '../components/Skeleton';",
      '<SkeletonCard lines={2} />',
      'const loop = Animated.loop(Animated.sequence([a, b]));',
      'const timer = setInterval(() => setStage((s) => (s + 1) % 5), 1800);',
    ].join('\n');
    const found = new Set(scanSource('fixture.tsx', fixture).map((h) => h.marker));
    for (const { name } of MARKERS) expect(found).toContain(name);
  });

  it('does not count prose about a spinner as a spinner', () => {
    const commented = [
      '/* The old form swapped the label for an <ActivityIndicator />. */',
      '// <SkeletonCard lines={2} /> pulsed here until 12 Sep',
      '  /* Animated.loop( was the pulse; setInterval( was the clock */',
      'const x = 1;',
    ].join('\n');
    expect(scanSource('fixture.tsx', commented)).toEqual([]);
  });

  it('finds no indicator outside the allow-list', () => {
    const offenders = hits
      .filter((h) => !(h.file in ALLOWED))
      .map(
        (h) =>
          `${h.file}:${h.line}  ${h.marker} — use <Working>, <Working variant="compact"> or <WorkingMark> from apps/mobile/src/components/Working.tsx`
      );
    expect(offenders).toEqual([]);
  });

  it('keeps every allow-list entry honest', () => {
    // An exemption whose site no longer exists is a stale hole. Remove the
    // entry when the site is fixed.
    const stale = Object.keys(ALLOWED).filter((file) => !hits.some((h) => h.file === file));
    expect(stale).toEqual([]);
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(40);
    // And the instrument's own hit is the loop, and only the loop.
    const instrument = hits.filter((h) => h.file === 'apps/mobile/src/components/Working.tsx');
    expect(instrument.map((h) => h.marker)).toEqual(['infinite animation loop']);
  });

  it('the sweep swings and does not fill, and owns no clock of its own', () => {
    /*
      The loop animates the dash *offset* between two positions. If it ever
      animates `strokeDasharray` — a growing length — the instrument has
      become a progress bar, which is the indicator web removed on 30 Aug. And
      its delay is `Animated.delay`, not a `setTimeout` the reduced-motion
      still could not reach.
    */
    const source = stripComments(
      readFileSync(join(MOBILE, 'src', 'components', 'Working.tsx'), 'utf8')
    );
    expect(source).toMatch(/strokeDasharray=\{\[SEGMENT, ARC_LENGTH\]\}/);
    expect(source).toMatch(/strokeDashoffset=\{offset\}/);
    expect(source).toMatch(/Animated\.timing\(offset,/);
    expect(source).not.toMatch(/Animated\.timing\([^)]*strokeDasharray/);
    expect(source).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
    expect(source).toMatch(/Animated\.delay\(ENTER_DELAY_MS\)/);

    // The pip is drawn in the info blue the theme carries, and the flash in
    // its lit step — both read from the token layer, never spelled here.
    expect(source).toMatch(/register\.accent\b/);
    expect(source).toMatch(/register\.accentStrong\b/);
    expect(register.accentStrong).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('the twelve-o’clock frame is the reduced-motion frame, by construction', () => {
    /*
      Not a stopped animation: under `useReducedMotion` the effect sets the
      offset to `PIP_CENTRE` and the flashes to zero, the same values `frozen`
      holds for the specimen. One picture, two routes to it.
    */
    const source = stripComments(
      readFileSync(join(MOBILE, 'src', 'components', 'Working.tsx'), 'utf8')
    );
    expect(source).toMatch(/const live = !frozen && !reduced;/);
    expect(source).toMatch(/if \(!live\) \{[\s\S]*?offset\.setValue\(PIP_CENTRE\);/);
    expect(source).toMatch(/useReducedMotion\(\)/);
  });
});
