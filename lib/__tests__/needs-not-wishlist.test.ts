/**
 * The list is called Needs everywhere a customer can read; `wishlist` is an
 * address — the table, the route, the hook — and stays one.
 *
 * @jest-environment node
 *
 * ── Why a guard, and why now ────────────────────────────────────────────────
 *
 * The 8 Sep IA pass renamed the list (the segment says NEEDS, the card's
 * heading says Needs, `WishlistSection.tsx` carries the argument: a CVT
 * flush overdue by 15,000 miles is not a wish). The board then recorded
 * "Plan says Needs and nowhere says Wishlist" — verified by rendering the
 * pages, which is exactly where toasts, alerts, dialog titles, select
 * options, accessibility labels and API error strings do not appear. Five
 * days later the phone showed David "Failed to add item to wishlist" — the
 * route's own words, surfaced verbatim under the alert's title — and 40-odd
 * sentences across both clients and core still said wishlist. A rendered
 * check cannot see copy that only appears on failure; a source scan can.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * In every customer-facing tree, with comments removed and template holes
 * (`${…}`) blanked, a string literal or a JSX text node is copy when it
 *
 *   (a) contains the word `wishlist` (any case, plural allowed) *and* reads
 *       as a sentence — at least two words; or
 *   (b) is the capitalised word `Wishlist` on its own, not the start of an
 *       identifier (`WishlistAdd` is a route name; `Wishlist` is a label),
 *       and carries no `/` (an import or URL is an address).
 *
 * What that leaves alone, deliberately: `'wishlist_items'`, `'wishlist'` as
 * a status or a source, `'remove_from_wishlist'`, `/api/v1/wishlist`,
 * `queryKey: ['wishlist', id]`, `@/hooks/useWishlist`, `navigate('WishlistAdd')`,
 * `native-wishlist.spec.html`, and every comment — each is a name the code
 * answers to, and renaming data for a copy change is how a rename acquires
 * a migration (the section's own words). Console and logger lines are
 * skipped: nobody reads them but us.
 *
 * ⚠ Proven against a fixture that carries one of each — copy and address —
 * so the walker cannot silently return nothing (CLAUDE.md §5).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTEXT_KIND_LABELS } from '@tappet/core/consultant-context-kinds';
import { readPlanEntry } from '@/lib/plan-entry';

const ROOT = join(__dirname, '..', '..');
const SURFACES = ['app', 'components', 'lib', 'apps/mobile/src', 'packages/core/src'].map((d) =>
  join(ROOT, d)
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sourceFiles(full);
    }
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Block and line comments become spaces, so line numbers survive. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/g, (_m, lead: string) => lead);
}

const STRING_LITERAL = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;
const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</g;

export function isCopy(text: string): boolean {
  const blanked = text.replace(/\$\{[^}]*\}/g, '');
  const sentence = /\S\s+\S/.test(blanked.trim());
  if (sentence && /\bwishlists?\b/i.test(blanked)) return true;
  if (!blanked.includes('/') && /Wishlist(?![A-Za-z])/.test(blanked)) return true;
  return false;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

export function scanSource(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  withoutComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (/\b(console|logger)\./.test(line)) return;
      // `exec` loops: the root target predates `matchAll`.
      STRING_LITERAL.lastIndex = 0;
      for (let m = STRING_LITERAL.exec(line); m; m = STRING_LITERAL.exec(line)) {
        const text = m[1] ?? m[2] ?? m[3] ?? '';
        if (isCopy(text)) hits.push({ file: rel, line: index + 1, text });
      }
      JSX_TEXT.lastIndex = 0;
      for (let m = JSX_TEXT.exec(line); m; m = JSX_TEXT.exec(line)) {
        if (isCopy(m[1])) hits.push({ file: rel, line: index + 1, text: m[1].trim() });
      }
    });
  return hits;
}

const files = SURFACES.flatMap(sourceFiles);

describe('the word Needs', () => {
  it('walked the surfaces it claims to walk', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.endsWith('components/WishlistSection.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('app/api/v1/wishlist/route.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('apps/mobile/src/screens/WishlistScreen.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('packages/core/src/wishlist-completion.ts'))).toBe(true);
    expect(files.some((f) => /\.test\.tsx?$/.test(f))).toBe(false);
  });

  it('can still tell copy from an address', () => {
    const fixture = [
      `toast.error('Failed to add to wishlist');`,
      `<p className="x">Your wishlist is empty</p>`,
      `label: 'Wishlist',`,
      "Alert.alert('Remove from wishlist?', `\"${'${item.item_name}'}\" will be removed.`);",
      "accessibilityLabel={`Add ${'${typed}'} to the wishlist`}",
      `{ error: 'Wishlist item not found' }`,
      // addresses, all of which must pass
      `const res = await fetch('/api/v1/wishlist', { method: 'POST' });`,
      `await client.from('wishlist_items').delete();`,
      `queryKey: ['wishlist', vehicleId],`,
      `import { useWishlist } from '@/hooks/useWishlist';`,
      `navigation.navigate('WishlistAdd', { vehicleId });`,
      `<SelectItem value="remove_from_wishlist">Remove from Needs</SelectItem>`,
      "href={`/dashboard/${'${vehicleId}'}?tab=wishlist`}",
      "`${'${counts.wishlist.count}'} · ${'${money.format(counts.wishlist.total)}'}`",
      `// "Add to wishlist" was a full-width slab — a comment, not copy`,
      `/* the wishlist's catalogue — native-wishlist.spec.html */`,
      `console.warn('[Fetch Consultant] Wishlist error (non-critical):', e);`,
    ].join('\n');

    const hits = scanSource('fixture.tsx', fixture);
    expect(hits.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is what every customer-facing surface says', () => {
    const offenders = files.flatMap((file) =>
      scanSource(file.slice(ROOT.length + 1), readFileSync(file, 'utf8'))
    );
    expect(offenders.map((h) => `${h.file}:${h.line}  ${JSON.stringify(h.text)}`)).toEqual([]);
  });

  it('is the name the code itself gives the list', () => {
    // The advisor's "Sources" chip for the list, and the Plan tab's default
    // segment: the two places a machine names the list to a person.
    expect(CONTEXT_KIND_LABELS.wishlist).toBe('Needs');
    expect(readPlanEntry(null).segment).toBe('needs');
  });
});
