import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every token the design-system specimen asks for must exist.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * `app/dev/system` paints each swatch with `var(--<name>)` and prints the value
 * `getComputedStyle` gives back. When the token does not exist, **both halves
 * degrade to nothing**: the chip paints no colour and the caption prints the
 * empty string. There is no error, no warning, and no failing assertion
 * anywhere — the page simply renders a blank square captioned with a token
 * nobody defines.
 *
 * That is not hypothetical. On 4 Sep the three hue-named families were renamed
 * (`--confirm-green*` → `--confirm*`, and two more) with a pass that matched
 * `--attention-amber`. The specimen asks for its tokens **without** the prefix,
 * as `name="attention-amber"`, so five props were skipped, and the build
 * shipped five blank swatches still captioned with the dead names. It was
 * caught by a design critique reading a screenshot, which is the most expensive
 * way this repository has ever caught a one-line defect.
 *
 * `CLAUDE.md` §5 asks every scanner here to carry an anti-vacuous case and to
 * assert it found sources at all. Both are below: the parser must find a
 * realistic number of swatches and of declarations, and it must still be able
 * to detect a name that is not defined.
 */

const ROOT = join(__dirname, '..', '..');
const PAGE = join(ROOT, 'app', 'dev', 'system', 'page.tsx');
const CSS = join(ROOT, 'app', 'globals.css');

/** `<Swatch name="foo" …>` — the names the specimen asks the cascade for. */
function requestedTokens(source: string): string[] {
  return Array.from(source.matchAll(/<Swatch\s+name="([^"]+)"/g)).map((m) => m[1]);
}

/**
 * Custom properties this stylesheet defines, anywhere.
 *
 * Deliberately not scoped to `:root`. A token defined only under
 * `[data-register='sport']` is still a token the specimen may legitimately
 * show, and `register-tokens.test.ts` is what holds the separate rule that a
 * sport override must have a `:root` counterpart. Two guards, two questions.
 */
function declaredTokens(css: string): Set<string> {
  return new Set(
    Array.from(css.matchAll(/^\s*--([a-z0-9-]+)\s*:/gim)).map((m) => m[1])
  );
}

const page = readFileSync(PAGE, 'utf8');
const css = readFileSync(CSS, 'utf8');

describe('the design-system specimen', () => {
  it('found swatches and declarations at all, so this cannot pass vacuously', () => {
    /*
      Without these two, a rename of the component or a change to the token
      syntax turns this whole file into a scan over an empty list that reports
      a clean page forever — the failure §5 of CLAUDE.md describes.
    */
    expect(requestedTokens(page).length).toBeGreaterThan(25);
    expect(declaredTokens(css).size).toBeGreaterThan(60);
  });

  it('can still detect a token that is not defined', () => {
    // The anti-vacuous case. If this stops failing, the check below is inert.
    const declared = declaredTokens(css);
    expect(declared.has('a-token-nobody-declares')).toBe(false);
    expect(
      requestedTokens('<Swatch name="a-token-nobody-declares" />')
    ).toEqual(['a-token-nobody-declares']);
  });

  it('asks for no token the stylesheet does not define', () => {
    /*
      The real assertion. A miss here renders as a blank chip with an empty
      caption and nothing else — see the header for the five that shipped.
    */
    const declared = declaredTokens(css);
    const missing = requestedTokens(page).filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });
});
