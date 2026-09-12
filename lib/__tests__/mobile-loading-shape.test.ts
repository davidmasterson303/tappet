/**
 * `$rules.loadingShape` — a first load is the wait instrument, held for 350ms.
 *
 * @jest-environment node
 *
 * ── The rule, as it stood and as it stands ──────────────────────────────────
 *
 * The baseline's words were *"shaped like the content that is coming, not a
 * centred spinner"*, and this guard held every `state.kind === 'loading'`
 * early return to a `Skeleton`. That was right for an app with no wait
 * instrument: a blank second on a cold fetch is indistinguishable from broken,
 * and a placeholder in the content's shape was the honest way to say
 * "coming". Six of eight fetching screens opened on a dot until 16 Aug.
 *
 * ⚠ 12 Sep: the placeholder is retired and the rule moved with the system.
 * Web settled one wait instrument on 11 Sep (`components/Working.tsx`, graded
 * 9/10) and the phone joins it: a page-level load takes the **full instrument
 * with `delay`** — the dial's ignition sweep and a mono line saying what is
 * happening, held invisible for 350ms so a fetch that answers sooner never
 * paints anything at all. A pulsing skeleton was a wait drawn as content that
 * had not arrived, and on the phone its shapes had stopped matching the
 * screens (cards, on screens that became bands). `Skeleton.tsx` is deleted,
 * not deprecated, so it cannot come back one call site at a time.
 *
 * ── Why the rule is the *early return*, not the spinner ─────────────────────
 *
 * "No `ActivityIndicator` in a screen" is the rule someone means and it is
 * wrong for this guard's scope: a busy control is a different wait with a
 * different form (`Button`'s B7 form; `mobile-busy-controls-named`). What is
 * decidable here is the **initial load**: a `state.kind === 'loading'` early
 * return knows exactly what it is about to render and must say so. That
 * branch is what this checks. `mobile-one-wait-instrument.test.ts` refuses
 * the spinner and the pulse everywhere else.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { surface, register } from '../../apps/mobile/src/theme';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');
const WORKING = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'components', 'Working.tsx');

function screenFiles(): string[] {
  return readdirSync(SCREENS).filter((f) => f.endsWith('.tsx'));
}

/**
 * The body of an `if (state.kind === 'loading') { … }` early return.
 *
 * Crude on purpose — it takes everything to the closing brace at the same
 * indent. Over-reading can only make this scan *more* likely to spot a spinner
 * or a skeleton and complain; it cannot hide one. A parser that errs toward
 * false positives gets fixed; the other kind gets trusted.
 */
function loadingBranches(source: string): string[] {
  const found: string[] = [];
  const opener = /if \(state\.\w+ === 'loading'\) \{/g;

  let match: RegExpExecArray | null = opener.exec(source);
  while (match !== null) {
    const start = match.index;
    const end = source.indexOf('\n  }', start);
    found.push(source.slice(start, end === -1 ? source.length : end));
    match = opener.exec(source);
  }

  return found;
}

/** Does this branch render the delayed full instrument, with a line? */
function isInstrument(branch: string): boolean {
  return /<Working\b[^>]*\bdelay\b[^>]*\bline=/.test(branch.replace(/\s+/g, ' '));
}

describe('a screen’s first load is the wait instrument', () => {
  const screens = screenFiles().map((name) => ({
    name,
    code: readFileSync(join(SCREENS, name), 'utf8'),
  }));

  it('finds loading branches at all, so this cannot pass vacuously', () => {
    const withBranches = screens.filter((s) => loadingBranches(s.code).length > 0);

    // Ten screens carry one as of 12 Sep. A count near zero means the matcher
    // broke, not that the app stopped loading.
    expect(withBranches.length).toBeGreaterThan(3);
  });

  it('has no first load that is a bare spinner', () => {
    const offenders = screens.flatMap(({ name, code }) =>
      loadingBranches(code)
        .filter((branch) => branch.includes('<ActivityIndicator'))
        .map(() => name)
    );

    expect(offenders).toEqual([]);
  });

  it('has no first load that is a skeleton, which is a wait dressed as content', () => {
    const offenders = screens.flatMap(({ name, code }) =>
      loadingBranches(code)
        .filter((branch) => /<Skeleton/.test(branch))
        .map(() => name)
    );

    expect(offenders).toEqual([]);
  });

  it('renders the delayed full instrument with a line, in every loading branch', () => {
    /*
      `delay` is the half that keeps a warm fetch from painting a dial for one
      frame; `line` is the half that makes the wait say something. A branch
      with the instrument and neither is a spinner in the dial's clothes.
    */
    const offenders = screens.flatMap(({ name, code }) =>
      loadingBranches(code)
        .filter((branch) => !isInstrument(branch))
        .map(() => name)
    );

    expect(offenders).toEqual([]);
  });

  it('reaches for the primitive rather than a private instrument', () => {
    const offenders = screens
      .filter(({ code }) => loadingBranches(code).length > 0)
      .filter(({ code }) => !/from '\.\.\/components\/Working'/.test(code))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });

  it('has an instrument for those loads to be made of', () => {
    /*
      The other half, and the half a scanner cannot state: an app with no
      spinners, no skeletons and no instrument is not compliant, it is blank.
      The component cannot be imported here — it is React Native — so the
      file is read: it must exist, export the instrument, and hold the delay
      the rule names. The theme is imported so this suite still exercises
      shipped code, as its siblings do.
    */
    const source = readFileSync(WORKING, 'utf8');
    expect(source).toMatch(/export default function Working\(/);
    expect(source).toMatch(/export const ENTER_DELAY_MS = 350;/);
    expect(source).toMatch(/delay\?: boolean/);
    expect(surface.page).toMatch(/^#[0-9A-F]{6}$/i);
    // The pip's ink, which the instrument draws in and the theme must carry.
    expect(register.accent).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('can still detect one, so this is not vacuous', () => {
    const bare = `if (state.kind === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={text.muted} />
      </View>
    );
  }`;
    expect(loadingBranches(bare)).toHaveLength(1);
    expect(loadingBranches(bare)[0]).toContain('<ActivityIndicator');
    expect(isInstrument(loadingBranches(bare)[0])).toBe(false);

    const skeleton = `if (state.kind === 'loading') {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <SkeletonCard lines={2} />
      </ScrollView>
    );
  }`;
    expect(loadingBranches(skeleton)[0]).toMatch(/<Skeleton/);
    expect(isInstrument(loadingBranches(skeleton)[0])).toBe(false);

    // The instrument without its delay, or without its line, is refused too.
    const undelayed = `if (state.kind === 'loading') {
    return <Working line="Opening the garage" />;
  }`;
    expect(isInstrument(loadingBranches(undelayed)[0])).toBe(false);
    const wordless = `if (state.kind === 'loading') {
    return <Working delay />;
  }`;
    expect(isInstrument(loadingBranches(wordless)[0])).toBe(false);

    const shaped = `if (state.kind === 'loading') {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Opening the garage" />
      </ScrollView>
    );
  }`;
    expect(isInstrument(loadingBranches(shaped)[0])).toBe(true);
  });
});
