/**
 * Every form on the phone clears the keyboard and asks before a back gesture
 * drops what was typed.
 *
 * @jest-environment node
 *
 * Audit 360, UX-2 and UX-3 (1 Oct). Seven pushed forms carried a
 * `KeyboardAvoidingView` with no `keyboardVerticalOffset`, so under the
 * native header the padding came up short by the header's height and SAVE or
 * CONTINUE sat behind the keyboard — and none of them intercepted removal, so
 * an edge swipe discarded typed answers without a word. Neither failed
 * anything; the form rendered and the gesture worked.
 *
 * So, mechanically:
 *
 *   1. every `<KeyboardAvoidingView` in the app declares its offset — the
 *      pushed-form hook, or an explicit `0` where the view is its own window;
 *   2. every form that is not exempt below uses `usePushedFormKeyboardOffset`
 *      and `useConfirmDiscard`.
 *
 * The behaviour is proven in the mobile suite
 * (`src/navigation/__tests__/form-guards.test.tsx`); this file is the
 * coverage — that no form is missed and a new one cannot be added without
 * choosing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', 'apps', 'mobile', 'src');

/**
 * Forms that are not pushed under a native header, and why each needs no
 * discard question. Each must still say `keyboardVerticalOffset={0}`.
 */
const OWN_WINDOW: Record<string, string> = {
  'screens/SignInScreen.tsx': 'the signed-out gate — no header above it, nothing to go back to',
  'screens/MarkDoneSheet.tsx': 'a Modal, its own window, with an explicit Cancel',
  'screens/AdvisorScreen.tsx': 'a tab root — no back; the composer keeps the question on every path',
};

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      found.push(...sources(path));
    } else if (/\.tsx?$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

/** Strip comments, so a docblock naming the prop cannot satisfy the rule. */
function code(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Each `<KeyboardAvoidingView …>` opening tag's attribute text, depth-counted. */
function openingTags(source: string): string[] {
  const tags: string[] = [];
  const marker = '<KeyboardAvoidingView';
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
    let depth = 0;
    let end = at + marker.length;
    for (; end < source.length; end += 1) {
      const c = source[end];
      if (c === '{' || c === '(') depth += 1;
      else if (c === '}' || c === ')') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(source.slice(at + marker.length, end));
  }
  return tags;
}

const forms = sources(SRC)
  .map((path) => ({ file: relative(SRC, path), source: code(readFileSync(path, 'utf8')) }))
  .filter(({ source }) => source.includes('<KeyboardAvoidingView'));

describe('the scanner', () => {
  it('found the app’s forms', () => {
    // Ten at the time of writing; a walker that silently returns nothing
    // would otherwise report a clean app forever (CLAUDE.md §5).
    expect(forms.length).toBeGreaterThanOrEqual(10);
    expect(forms.map((f) => f.file)).toEqual(
      expect.arrayContaining(['screens/VehicleProfileScreen.tsx', 'screens/DescribeCarScreen.tsx'])
    );
  });

  it('can still see a tag with no offset, and is not fooled by a comment', () => {
    const shipped = code(`
      /* keyboardVerticalOffset={headerHeight} */
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >`);
    expect(openingTags(shipped)).toHaveLength(1);
    expect(openingTags(shipped)[0]).not.toMatch(/keyboardVerticalOffset=/);
  });

  it('lists no exemption for a file that is gone', () => {
    for (const file of Object.keys(OWN_WINDOW)) {
      expect(forms.map((f) => f.file)).toContain(file);
    }
  });
});

describe.each(forms.map((f) => [f.file, f.source] as const))('%s', (file, source) => {
  it('declares the keyboard offset on every KeyboardAvoidingView', () => {
    for (const tag of openingTags(source)) {
      expect(tag).toMatch(/keyboardVerticalOffset=\{/);
    }
  });

  if (file in OWN_WINDOW) {
    it(`is its own window (${OWN_WINDOW[file]}), so the offset is 0`, () => {
      for (const tag of openingTags(source)) {
        expect(tag).toMatch(/keyboardVerticalOffset=\{0\}/);
      }
    });
  } else {
    it('is pushed under the header: takes its height and asks before discarding', () => {
      expect(source).toMatch(/usePushedFormKeyboardOffset\(\)/);
      expect(source).toMatch(/useConfirmDiscard\(/);
    });
  }
});
