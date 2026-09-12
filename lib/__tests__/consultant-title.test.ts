/**
 * What a conversation may be called.
 *
 * @jest-environment node
 *
 * One rule read by both ends of a rename: the server action refuses with it,
 * the rail's field caps with it. These pin the rule itself; the action's use
 * of it is in `consultant-session-actions.test.ts`, and the field's `maxLength`
 * in `consultant-rail-rename-delete.test.tsx`, so the three cannot drift apart
 * without one of them noticing.
 */

import { CONSULTANT_TITLE_MAX, normalizeConsultantTitle } from '../consultant-title';

describe('a usable title', () => {
  it('passes through unchanged', () => {
    /*
      The anti-vacuous case — CLAUDE.md §5. A validator that refused
      everything would pass every "rejects" test below; this is the one that
      proves it also lets a real name through, byte for byte.
    */
    expect(normalizeConsultantTitle('CVT Fluid & Oil Dilution Questions')).toEqual({
      ok: true,
      title: 'CVT Fluid & Oil Dilution Questions',
    });
  });

  it('keeps punctuation, case and non-ASCII alone', () => {
    expect(normalizeConsultantTitle('Brakes — squeal at 40 km/h? (résumé)')).toEqual({
      ok: true,
      title: 'Brakes — squeal at 40 km/h? (résumé)',
    });
  });

  it('accepts a title of exactly the cap', () => {
    const atCap = 'x'.repeat(CONSULTANT_TITLE_MAX);
    const result = normalizeConsultantTitle(atCap);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.title).toHaveLength(CONSULTANT_TITLE_MAX);
  });
});

describe('whitespace', () => {
  it('trims the ends', () => {
    expect(normalizeConsultantTitle('  Oil change  ')).toEqual({ ok: true, title: 'Oil change' });
  });

  it('collapses runs and newlines to one space, so the stored title is the visible one', () => {
    // An <input> cannot show a newline; a pasted one would render differently
    // from what the field held.
    expect(normalizeConsultantTitle('Oil\n\nchange   and   filter')).toEqual({
      ok: true,
      title: 'Oil change and filter',
    });
  });

  it('measures the cap after collapsing, not before', () => {
    // 80 characters of content padded with whitespace is still 80 characters.
    const padded = `   ${'y'.repeat(CONSULTANT_TITLE_MAX)}   `;
    expect(normalizeConsultantTitle(padded).ok).toBe(true);
  });
});

describe('refusals', () => {
  it('refuses an empty title', () => {
    const result = normalizeConsultantTitle('');
    expect(result.ok).toBe(false);
  });

  it('refuses a title that is only whitespace', () => {
    expect(normalizeConsultantTitle('   \n\t ').ok).toBe(false);
  });

  it('refuses one character over the cap, and says by how much', () => {
    const over = 'z'.repeat(CONSULTANT_TITLE_MAX + 1);
    const result = normalizeConsultantTitle(over);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(CONSULTANT_TITLE_MAX));
    expect(result.error).toContain(String(CONSULTANT_TITLE_MAX + 1));
  });

  it('refuses a non-string rather than coercing it', () => {
    // A server action's argument is caller-supplied; `null` must not become
    // the title "null".
    expect(normalizeConsultantTitle(null).ok).toBe(false);
    expect(normalizeConsultantTitle(undefined).ok).toBe(false);
    expect(normalizeConsultantTitle(42).ok).toBe(false);
  });

  it('says what to do, not only what went wrong', () => {
    // refusalCopy's rule: a refusal that names none of that reads as a bug.
    for (const bad of ['', 'q'.repeat(CONSULTANT_TITLE_MAX + 5)]) {
      const result = normalizeConsultantTitle(bad);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toMatch(/name/i);
    }
  });
});

describe('the cap', () => {
  it('is the two-line rail, not the auto-title', () => {
    /*
      `generateSessionTitle` truncates at 40 characters plus an ellipsis. The
      cap must sit above that with room, or a title the product wrote itself
      would be refused the moment somebody opened it to edit one word.
    */
    expect(CONSULTANT_TITLE_MAX).toBeGreaterThan(43);
    expect(CONSULTANT_TITLE_MAX).toBe(80);
  });
});
