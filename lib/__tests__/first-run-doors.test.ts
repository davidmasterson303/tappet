/**
 * The first screen of adding a car is doors, not a form.
 *
 * @jest-environment node
 *
 * ── The redesign, as a rule ─────────────────────────────────────────────────
 *
 * 20 Sep: the car identifies itself. `AddVehicleScreen.tsx` is three doors —
 * the sticker, a document, the number typed — and **no form field in any
 * state**: no year, make or model field, no "enter manually" link. The
 * described car (`DescribeCarScreen.tsx`, the old fields kept whole) is
 * reached only after a decode fails or from the typed door's "I don't have
 * the VIN". That ordering is the whole redesign, and the failure it is
 * written against is the helpful edit: a field added "just for the people
 * who know the make", which is the old form growing back one input at a
 * time. `AddVehicleScreen.test.tsx` asserts the rendered absence; this reads
 * the source, so the rule is checked on every `npm test` from the root
 * without the mobile runner.
 *
 * ── Anti-vacuous ────────────────────────────────────────────────────────────
 *
 * The same scan is run over the typed door and the described car, which do
 * carry inputs, so a scan that finds nothing anywhere fails rather than
 * passing the doors by accident.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIN_LENGTH } from '@tappet/core/vehicle-catalog';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** The ways a screen in this app takes typed input. */
const INPUT = /\bTextInput\b|from '\.\.\/components\/Field'|from '\.\.\/components\/Suggest'|<Field\b|<Suggest\b/;
const MANUAL_LINK = /enter (it )?manually|don't have the VIN|type the details/i;

const read = (file: string) => code(readFileSync(join(SCREENS, file), 'utf8'));

describe('the doors carry no form field', () => {
  it('AddVehicleScreen.tsx takes no typed input and offers no manual-entry link', () => {
    const source = read('AddVehicleScreen.tsx');
    expect(source.length).toBeGreaterThan(500);
    expect(INPUT.test(source)).toBe(false);
    expect(MANUAL_LINK.test(source)).toBe(false);
  });

  it('offers the two doors that exist today, by name', () => {
    const source = read('AddVehicleScreen.tsx');
    expect(source).toMatch(/Scan the sticker/);
    expect(source).toMatch(/Type it/);
  });

  it('the scan can still see an input — the typed door and the described car carry one', () => {
    expect(INPUT.test(read('TypeVinScreen.tsx'))).toBe(true);
    expect(INPUT.test(read('DescribeCarScreen.tsx'))).toBe(true);
    // And the escape hatch is reachable from the typed door, not the doors.
    expect(MANUAL_LINK.test(read('TypeVinScreen.tsx'))).toBe(true);
  });

  it('the typed door caps its field at the catalogue’s length, not a literal', () => {
    // Seventeen lives in one place; a screen carrying its own `17` would be a
    // second opinion about what a VIN is.
    expect(VIN_LENGTH).toBe(17);
    expect(read('TypeVinScreen.tsx')).toMatch(/maxLength=\{VIN_LENGTH\}/);
    expect(read('TypeVinScreen.tsx')).not.toMatch(/maxLength=\{17\}/);
  });
});

describe('the decode narrates steps, never time', () => {
  /*
    The screens that draw the wait, and the one that does not. The described
    car keeps the old form's 350ms debounce on the model lookup — a request
    timer, not a stage, and a request timer is the one clock this rule
    allows — so it is held to the same scan with that one call named.
  */
  const NARRATED = ['ScanVinScreen.tsx', 'TypeVinScreen.tsx', 'OwnerAnswersScreen.tsx', 'AddVehicleScreen.tsx'];
  const CLOCKED = /setTimeout|setInterval|ActivityIndicator|progress:\s*\d|%\s*complete|Animated\.loop/;

  it.each(NARRATED)('%s sets no timer, spinner or percentage', (file) => {
    const source = read(file);
    const hit = CLOCKED.exec(source);
    expect(hit ? `${file}: "${hit[0]}"` : `${file}: clean`).toBe(`${file}: clean`);
  });

  it('the described car has exactly the debounce, and nothing that marks a stage', () => {
    const source = read('DescribeCarScreen.tsx');
    const timers = source.match(/setTimeout|setInterval/g) ?? [];
    expect(timers).toEqual(['setTimeout']);
    expect(source).toMatch(/MODEL_LOOKUP_DEBOUNCE_MS/);
    expect(/ActivityIndicator|progress:\s*\d|%\s*complete|Animated\.loop/.test(source)).toBe(false);
  });

  it('the reader would catch the shapes it exists to catch', () => {
    expect(CLOCKED.test("setTimeout(() => setStage('done'), 2500)")).toBe(true);
    expect(CLOCKED.test('<ActivityIndicator />')).toBe(true);
    expect(CLOCKED.test('Animated.loop(sweep)')).toBe(true);
  });
});
