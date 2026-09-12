/**
 * A control that swaps its label for a busy mark still has a name.
 *
 * @jest-environment node
 *
 * The pattern was everywhere in this app and it was the right pattern:
 *
 *     <Pressable onPress={submit}>
 *       {busy ? <ActivityIndicator /> : <Text>Create account</Text>}
 *     </Pressable>
 *
 * React Native derives a control's accessible name from its `<Text>`
 * descendants when no `accessibilityLabel` is given. So the button above is
 * announced as "Create account" — right up until it is pressed, at which point
 * the `<Text>` is replaced by a spinner and **the control becomes an unnamed
 * button.** VoiceOver reads it as just "button".
 *
 * ⚠ 12 Sep: the spinner is gone and the rule is not. Every wait is the wait
 * instrument now (`components/Working.tsx`), and a busy control carries its
 * 14pt mark — `<WorkingMark>` — beside a mono status, with the rest label
 * hidden. The hazard is identical: a hand-rolled `Pressable` that swaps its
 * text for the mark is exactly as anonymous as one that swapped it for a
 * spinner. So the scan looks for both.
 *
 * That is the wrong moment to lose the name. Someone who cannot see the
 * spinner has no other signal that anything is happening, and the one control
 * that could tell them has just gone quiet. `accessibilityState.busy` is how
 * "working" is announced, and it needs something to be working *on*.
 *
 * Found on 8 Aug on the two controls that matter most: `SignInScreen`'s submit
 * — the front door, and the only way to become a user since the pivot — and
 * `AccountScreen`'s delete, which is App Store guideline 5.1.1(v)'s own
 * affordance.
 *
 * ── Why a source scan ───────────────────────────────────────────────────────
 *
 * A render test would need to catch the component mid-flight, in the busy
 * state, on every screen — and the states that reach it are the ones behind a
 * mocked network. The property is structural: does this `Pressable` name
 * itself, given that its text can disappear. That is on disk.
 *
 * Registered in `STATIC_ANALYSIS_SUITES`, like every other mobile scan, because
 * it imports nothing — the subject is React Native source this runner cannot
 * load.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');

function screenFiles(): string[] {
  return readdirSync(SCREENS).filter((f) => f.endsWith('.tsx'));
}

/**
 * Each `<Pressable …>` opening tag paired with the block it encloses.
 *
 * Deliberately crude — it takes everything up to the next `</Pressable>` — and
 * that is safe in the direction that matters. Over-reading the block can only
 * make this scan *more* likely to find a busy mark and demand a label; it
 * cannot hide one. A guard whose parser errs toward false positives is one
 * that gets fixed; the other kind is one that gets trusted.
 */
/** The two things a hand-rolled control could swap its label for. */
const BUSY_MARK = /<ActivityIndicator|<WorkingMark/;

function pressables(source: string): Array<{ line: number; block: string }> {
  const found: Array<{ line: number; block: string }> = [];
  let index = source.indexOf('<Pressable');

  while (index !== -1) {
    const close = source.indexOf('</Pressable>', index);
    const end = close === -1 ? source.length : close;
    found.push({ line: source.slice(0, index).split('\n').length, block: source.slice(index, end) });
    index = source.indexOf('<Pressable', index + 1);
  }

  return found;
}

const offenders = screenFiles().flatMap((file) => {
  const source = readFileSync(join(SCREENS, file), 'utf8');

  return pressables(source)
    .filter(({ block }) => BUSY_MARK.test(block))
    .filter(({ block }) => !block.includes('accessibilityLabel'))
    .map(({ line }) => `${file}:${line}`);
});

describe('a busy control keeps its name', () => {
  /*
    ── This rule finished migrating on 16 Aug, and the guard had to follow ────

    It began as "every hand-rolled busy `Pressable` must carry an
    `accessibilityLabel`", because a control named by its `<Text>` child goes
    anonymous the moment that child is swapped for a spinner — at exactly the
    point it has something to say.

    Every one of those controls is now a `Button`. The rule did not weaken; it
    moved into the primitive, where it is true by construction.

    ⚠ The anti-vacuous check chased that migration down and got it wrong twice.
    It first required **more than one** such control to exist; step 5 took the
    count to one and it failed while the app improved. Repaired to **at least
    one**; migrating `AccountScreen` took the count to zero and it failed again,
    for the same good reason.

    So the population is no longer the evidence. The end state is **zero**, and
    the two things that keep this honest are stated directly: the primitive
    carries the behaviour, and the detector still works when handed a control.
    A count is a bad guard when the correct answer is none.
  */
  it('no screen hand-rolls a busy control any more', () => {
    const marks = screenFiles().flatMap((file) =>
      pressables(readFileSync(join(SCREENS, file), 'utf8'))
        .filter(({ block }) => BUSY_MARK.test(block))
        .map(({ line }) => `${file}:${line}`)
    );

    expect(marks).toEqual([]);
  });

  it('keeps the behaviour in the primitive, which is where it went', () => {
    /*
      With the count at zero the scan alone proves nothing — an app with no
      busy controls would pass it. This is the half that says the capability
      still exists and still carries its name.

      ⚠ 12 Sep: the primitive's busy form is the wait instrument's mark, not
      the platform spinner — brief B7. The two accessibility props are the
      rule; the mark is the evidence the busy form still exists to need them.
    */
    const button = readFileSync(
      join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'components', 'Button.tsx'),
      'utf8'
    );

    expect(button).toMatch(/<WorkingMark/);
    expect(button).not.toMatch(/<ActivityIndicator/);
    expect(button).toMatch(/accessibilityLabel=\{accessibilityLabel \?\? label\}/);
    expect(button).toMatch(/accessibilityState=\{\{ disabled: inert, busy \}\}/);
  });

  it('can still detect one, so a new hand-rolled control would fail', () => {
    /*
      Guards the guard on a fixture rather than on live offenders — which is
      the only way left, now that there are none. If the walk or the mark
      match silently stopped working, the rule above would be trivially true
      forever. Both spellings, because both are the same defect.
    */
    const spinner = `
      <Pressable onPress={save}>
        {busy ? <ActivityIndicator /> : <Text>Save</Text>}
      </Pressable>
    `;
    const mark = `
      <Pressable onPress={save}>
        {busy ? <WorkingMark /> : <Text>Save</Text>}
      </Pressable>
    `;

    for (const offender of [spinner, mark]) {
      const found = pressables(offender).filter(({ block }) => BUSY_MARK.test(block));
      expect(found).toHaveLength(1);
      expect(found[0].block).not.toMatch(/accessibilityLabel/);
    }
  });

  it('every Pressable that can show a spinner carries an accessibilityLabel', () => {
    /*
      To fix one: use `Button` with `busy` — or, if it truly cannot be one, add
      `accessibilityLabel` naming the action and put `busy` in
      `accessibilityState`. Do not remove the mark; it is the right affordance
      for everyone who can see it. The label is what makes it work for
      everyone who cannot.
    */
    expect(offenders).toEqual([]);
  });
});
