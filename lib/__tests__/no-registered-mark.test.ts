/**
 * Tappet is claimed, not registered: the trademark symbol is allowed, the
 * registered one is refused everywhere a customer can read.
 *
 * @jest-environment node
 *
 * ── Why a guard is worth more than the change ────────────────────────────────
 *
 * The mark will not be registered for about a year. Until a certificate
 * exists, the registered symbol is improper and can be held against the
 * application — and it is exactly the kind of thing a well-meaning copy edit
 * adds because it "looks more official". So: every customer-facing source
 * tree is scanned for the registered symbol in any spelling, the trademark
 * symbol is allowed, and the scan is proven against a fixture that carries
 * one of each. When the certificate arrives, `REGISTERED` is the one thing
 * to change, and this file says why.
 *
 * The second half pins where the trademark symbol goes and does not: the
 * notice line (core's, one sentence for every surface) is rendered by the
 * two web footers, the Terms, the Privacy policy and the phone's Account
 * screen; the symbol is on each web masthead once, as a layout sibling of
 * the wordmark; and it is nowhere it must not be — the page title, the OG
 * tags, the app's bundle name, the brand name itself, or the brand drawing.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRAND_NAME, TRADEMARK_NOTICE, TRADEMARK_OWNER, TRADEMARK_SYMBOL } from '@tappet/core/brand';
import { OPERATOR } from '@/lib/legal';

const ROOT = join(__dirname, '..', '..');
const SURFACES = ['app', 'components', 'apps/mobile/src', 'packages/core/src'].map((d) => join(ROOT, d));

/** The registered symbol in every spelling a source file could carry it. */
const REGISTERED: Array<{ name: string; re: RegExp }> = [
  { name: 'the character', re: /®/ },
  { name: '&reg;', re: /&reg;/i },
  { name: '&#174;', re: /&#174;/ },
  { name: '&#xAE;', re: /&#xae;/i },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(tsx?|mts|css|md|json)$/.test(entry.name) ? [full] : [];
  });
}

interface Hit {
  file: string;
  line: number;
  spelling: string;
}

function scanSource(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  source.split('\n').forEach((text, index) => {
    for (const { name, re } of REGISTERED) {
      if (re.test(text)) hits.push({ file: rel, line: index + 1, spelling: name });
    }
  });
  return hits;
}

const files = SURFACES.flatMap(sourceFiles);
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('the registered symbol', () => {
  it('walked the surfaces it claims to walk', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith('packages/core/src/brand.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('apps/mobile/src/screens/AccountScreen.tsx'))).toBe(true);
  });

  it('can still detect each spelling, and lets the trademark symbol through', () => {
    const fixture = ['Tappet®', 'Tappet&reg;', 'Tappet&#174;', 'Tappet&#xAE;'].join('\n');
    expect(new Set(scanSource('fixture.tsx', fixture).map((h) => h.spelling))).toEqual(
      new Set(REGISTERED.map((r) => r.name))
    );
    expect(scanSource('fixture.tsx', `${BRAND_NAME}${TRADEMARK_SYMBOL} and &trade; and ${TRADEMARK_NOTICE}`)).toEqual([]);
  });

  it('appears nowhere a customer can read — the mark is claimed, not registered', () => {
    const hits = files.flatMap((file) => scanSource(file.slice(ROOT.length + 1), readFileSync(file, 'utf8')));
    expect(hits.map((h) => `${h.file}:${h.line} — ${h.spelling}`)).toEqual([]);
  });
});

describe('the trademark symbol', () => {
  it('names the operator the policies name', () => {
    expect(TRADEMARK_OWNER).toBe(OPERATOR);
    expect(TRADEMARK_NOTICE).toBe(`${BRAND_NAME}${TRADEMARK_SYMBOL} is a trademark of ${OPERATOR}.`);
  });

  it('is printed as the notice line on every surface that carries one', () => {
    for (const rel of [
      'app/page.tsx',
      'components/DashboardLayout.tsx',
      'app/terms/page.tsx',
      'app/privacy/page.tsx',
      'apps/mobile/src/screens/AccountScreen.tsx',
    ]) {
      expect(read(rel)).toMatch(/\{TRADEMARK_NOTICE\}/);
    }
  });

  it('sits beside the wordmark on each web masthead, once, as layout and not as the drawing', () => {
    for (const rel of ['app/page.tsx', 'components/DashboardLayout.tsx']) {
      const source = read(rel);
      expect(source.match(/<BrandWordmark[^>]*\btrademark\b/g) ?? []).toHaveLength(1);
    }
    const lockup = read('components/brand/BrandLockup.tsx');
    // The symbol is a sibling `<sup>` the wordmark component renders; the SVG paths carry no glyph.
    expect(lockup).toMatch(/<sup[^>]*>\s*\{TRADEMARK_SYMBOL\}/);
    expect(read('packages/core/src/brand-geometry.ts')).not.toContain(TRADEMARK_SYMBOL);
  });

  it('is nowhere it must not be', () => {
    expect(BRAND_NAME).not.toContain(TRADEMARK_SYMBOL);
    const layout = read('app/layout.tsx');
    expect(layout).not.toContain(TRADEMARK_SYMBOL);
    const appJson = JSON.parse(read('apps/mobile/app.json')) as { expo: { name: string; ios?: { infoPlist?: Record<string, unknown> } } };
    expect(appJson.expo.name).not.toContain(TRADEMARK_SYMBOL);
    expect(JSON.stringify(appJson.expo.ios?.infoPlist ?? {})).not.toContain(TRADEMARK_SYMBOL);
    // The advisor's own voice: no prompt or persona text carries the symbol.
    for (const rel of ['lib/consultant-context.ts', 'lib/consultant-persona.ts']) {
      try {
        expect(read(rel)).not.toContain(TRADEMARK_SYMBOL);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  });
});
