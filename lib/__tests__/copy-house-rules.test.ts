/**
 * The words a customer must not read, held across every customer-facing tree.
 *
 * @jest-environment node
 *
 * Audit 360, copy lens, round 01 (1 Oct). Each rule below is a sentence that
 * shipped, and each is copy a rendered check would miss — a deletion list, a
 * spoken label, a paywall footnote, an error that only appears on failure
 * (CLAUDE.md §1). `needs-not-wishlist.test.ts` holds the list's name and
 * `product-name.test.ts` the product's; this holds the rest of the standard:
 *
 *   COPY-1   a recall repair is not promised free — the free remedy has a
 *            15-year limit (49 U.S.C. §30120(g)) and Tappet has never seen
 *            the car's sale date
 *   COPY-7   no frequency Tappet does not hold ("for most cars is never")
 *   COPY-4   "consultant" is a route and a table, never a word on screen
 *   COPY-12  service history, not service log; door jamb, not door-jamb
 *   COPY-13  Apple Account, not Apple ID (Apple's name since Sept 2024)
 *   COPY-14  no first-person apology, no "Failed to load"
 *
 * Scanned: string literals and JSX text, comments removed, template holes
 * blanked, logger lines skipped — the same reading `needs-not-wishlist`
 * makes. A text node alone on its line is read too (that suite's 23 Sep
 * lesson). Proven against a fixture holding every shipped sentence, and
 * against the files it walked (CLAUDE.md §5).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DELETION_INVENTORY } from '@tappet/core/account-deletion';
import { CLIENT_ERROR_FALLBACK } from '@tappet/core/consultant-health';
import { FREE_FEATURE_COPY, PAID_FEATURE_COPY } from '@tappet/core/paid-features';
import { PUSH_PRIMER_COPY } from '@tappet/core/push-priming';

const ROOT = join(__dirname, '..', '..');
const SURFACES = ['app', 'components', 'lib', 'apps/mobile/src', 'packages/core/src'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'node_modules', 'dev'].includes(entry.name) ? [] : sourceFiles(full);
    }
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

interface Rule {
  id: string;
  pattern: RegExp;
  /** Files whose matches are not customer copy, each with the reason. */
  exempt?: Record<string, string>;
}

/*
  Prompts are instructions to a model, never shown; the canary's `detail` is
  read by CI, never by an owner. Both name the role in our own vocabulary.
*/
const MODEL_AND_MONITOR: Record<string, string> = {
  'packages/core/src/prompts.ts': 'the advisor’s system prompt — read by the model',
  'packages/core/src/research-prompts.ts': 'the dossier prompt — read by the model',
  'app/actions.ts': 'model prompts ("You are an expert automotive consultant")',
  'app/api/health/consultant/route.ts': 'the canary’s probe prompt',
  'packages/core/src/consultant-health.ts': 'the canary’s verdict detail, read in CI',
};

const RULES: Rule[] = [
  { id: 'COPY-1 free recall repair', pattern: /free to fix|repair is free|whatever the age/i },
  { id: 'COPY-7 invented frequency', pattern: /\bmost cars\b/i },
  {
    id: 'COPY-4 consultant',
    // A word, not an identifier: `consultant_conversations`, `/consultant`
    // and `'consultant'` (a source value) are addresses.
    pattern: /\bconsultants?\b(?![_/-])(?=[^'"`]*\s)|\s\bconsultants?\b(?![_/-])/i,
    exempt: MODEL_AND_MONITOR,
  },
  {
    id: 'COPY-12 service log',
    pattern: /\bservice log\b/i,
    exempt: {
      'app/layout.tsx':
        'mirrors the App Store subtitle "Service log with an AI advisor" (30 of 30 characters) — held for David',
    },
  },
  { id: 'COPY-12 door-jamb', pattern: /door-jamb/i },
  { id: 'COPY-13 Apple ID', pattern: /\bApple ID\b/ },
  { id: 'COPY-14 apology', pattern: /sorry, i encountered|^\s*failed to load\b/i },
];

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/g, (_m, lead: string) => lead);
}

const STRING_LITERAL = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;
const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</g;

/** Every piece of copy on a source, with its line. */
export function copyIn(source: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  withoutComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (/\b(console|logger)\./.test(line)) return;
      STRING_LITERAL.lastIndex = 0;
      for (let m = STRING_LITERAL.exec(line); m; m = STRING_LITERAL.exec(line)) {
        out.push({ line: index + 1, text: (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, '') });
      }
      JSX_TEXT.lastIndex = 0;
      for (let m = JSX_TEXT.exec(line); m; m = JSX_TEXT.exec(line)) out.push({ line: index + 1, text: m[1] });
      /*
        A JSX text node alone on its line. Unlike `needs-not-wishlist`'s
        reading, a comma is allowed: the COPY-1 footnote's second line was
        "dealer, whatever the age of the vehicle." and a comma-blind scan
        could not see it. Object keys and import aliases still carry `:` or `_`.
      */
      const bare = line.trim();
      if (bare !== '' && /\s/.test(bare) && !/[<>{}=;()`'":_]/.test(bare)) out.push({ line: index + 1, text: bare });
    });
  return out;
}

interface Violation {
  rule: string;
  file: string;
  line: number;
  text: string;
}

export function violations(rel: string, source: string): Violation[] {
  const copy = copyIn(source).filter((c) => !c.text.includes('/') || /\s/.test(c.text));
  return RULES.flatMap((rule) => {
    if (rule.exempt?.[rel]) return [];
    const seen = new Set<number>();
    return copy
      .filter((c) => rule.pattern.test(c.text) && !seen.has(c.line) && seen.add(c.line))
      .map((c) => ({ rule: rule.id, file: rel, line: c.line, text: c.text.trim() }));
  });
}

const files = SURFACES.flatMap((d) => sourceFiles(join(ROOT, d)));

describe('the copy lens’s house rules', () => {
  it('walked the surfaces it claims to walk', () => {
    expect(files.length).toBeGreaterThan(300);
    for (const f of [
      'packages/core/src/account-deletion.ts',
      'packages/core/src/push-priming.ts',
      'apps/mobile/src/screens/RecallDetailScreen.tsx',
      'apps/mobile/src/screens/PaywallScreen.tsx',
      'packages/core/src/consultant-health.ts',
    ]) {
      expect(files).toContain(join(ROOT, f));
    }
  });

  it('can still find every sentence that shipped (anti-vacuous)', () => {
    const fixture = [
      `body: 'Contact your dealer before driving it again — the repair is free.',`,
      '    ? `${worstComponent} — free to fix at a franchised dealer.`',
      `          dealer, whatever the age of the vehicle.`,
      `detail: 'A recall arrives when the manufacturer issues one, which for most cars is never.',`,
      `  'Every consultant conversation',`,
      `  'An AI consultant that knows your car.',`,
      `return 'Check the service log before scanning it again.';`,
      `cancel any time in your Apple ID settings — deleting`,
      `export const CLIENT_ERROR_FALLBACK = 'Sorry, I encountered an error. Please try again.';`,
      `<p className="x">Failed to load vehicles. Please try refreshing.</p>`,
      // addresses and comments, which must pass
      `const res = await apiRequest('/consultant', { method: 'POST' });`,
      `await client.from('consultant_conversations').select();`,
      `export const WISHLIST_SOURCES = ['dossier', 'consultant', 'manual'] as const;`,
      `// "the repair is free" was the old banner`,
      `logger.error('Failed to load vehicles', error);`,
    ].join('\n');
    expect(
      violations('fixture.tsx', fixture)
        .map((v) => v.line)
        .sort((a, b) => a - b)
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('holds everywhere a customer reads', () => {
    const offenders = files.flatMap((file) => violations(file.slice(ROOT.length + 1), readFileSync(file, 'utf8')));
    expect(offenders.map((v) => `${v.rule} · ${v.file}:${v.line}  ${JSON.stringify(v.text)}`)).toEqual([]);
  });

  it('holds in the permission strings, which are not TypeScript', () => {
    const app = readFileSync(join(ROOT, 'apps', 'mobile', 'app.json'), 'utf8');
    expect(app).toMatch(/NSCameraUsageDescription/);
    expect(app).not.toMatch(/door-jamb/i);
    expect(app).toMatch(/door jamb/);
  });

  it('holds on the shipped values themselves, not only their source text', () => {
    // The scan reads files; these are what the screens render.
    const rendered = [
      ...DELETION_INVENTORY,
      CLIENT_ERROR_FALLBACK,
      PUSH_PRIMER_COPY.body,
      PUSH_PRIMER_COPY.detail,
      ...Object.values(FREE_FEATURE_COPY).flatMap((c) => [c.label, c.blurb]),
      ...Object.values(PAID_FEATURE_COPY).flatMap((c) => [c.label, c.blurb]),
    ];
    expect(rendered.length).toBeGreaterThan(10);
    for (const rule of RULES) {
      expect(rendered.filter((t) => rule.pattern.test(t))).toEqual([]);
    }
    expect(DELETION_INVENTORY).toContain('Every conversation with the advisor');
    expect(FREE_FEATURE_COPY['service-log'].label).toBe('Service history');
  });
});
