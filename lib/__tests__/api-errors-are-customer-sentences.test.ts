/**
 * Every `error` an `/api/v1/*` route answers with is a customer sentence.
 *
 * @jest-environment node
 *
 * ⚠ **Audit 360, COPY-5 (1 Oct).** The phone shows a route's `error` in an
 * alert body as it came (`apps/mobile/src/api/client.ts`), and the routes said
 * "Internal server error", "Failed to create maintenance record", "Invalid
 * JSON body", "Missing vehicleId" and "Unknown source — one of dossier,
 * consultant, manual". Copy that only appears on failure is on no rendered
 * page — CLAUDE.md §1 records exactly this shape ("Failed to add item to
 * wishlist") — so a source scan is the only check that sees it.
 *
 * The rule is `isDeveloperSpeak` from `@tappet/core/customer-copy`, the same
 * function build 3 uses to refuse such a string on its side, so the scanner
 * and the phone cannot disagree about what developer-speak is.
 *
 * Scanned: a string literal on a line that sets `error:` or `errorMessage`,
 * comments removed, template holes blanked. Logger lines are skipped — their
 * strings are ours. Proven against a fixture with one of each shape, and
 * against the count of routes it walked (CLAUDE.md §5).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { customerSentence, isDeveloperSpeak } from '@tappet/core/customer-copy';
import { COULD_NOT_SAVE, UNREADABLE_REQUEST, couldNotLoad } from '@/lib/api-error-copy';

const ROOT = join(__dirname, '..', '..');

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : routes(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

/*
  The routes, and the two `lib` modules whose `error` a route forwards to the
  phone as it is: the photo store (upload-photo, its DELETE) and the filing
  replay's "still reading" answer.
*/
const FILES = [
  ...routes(join(ROOT, 'app', 'api', 'v1')),
  join(ROOT, 'lib', 'vehicle-photo.ts'),
  join(ROOT, 'lib', 'invoice-filing-replay.ts'),
];

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/g, (_m, lead: string) => lead);
}

const STRING_LITERAL = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;

interface Hit {
  file: string;
  line: number;
  text: string;
}

export function scan(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  withoutComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (/\blogger\.|\bconsole\./.test(line)) return;
      if (!/\berror\s*:|\berrorMessage\s*=/.test(line)) return;
      STRING_LITERAL.lastIndex = 0;
      for (let m = STRING_LITERAL.exec(line); m; m = STRING_LITERAL.exec(line)) {
        const text = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, '');
        if (isDeveloperSpeak(text)) hits.push({ file: rel, line: index + 1, text });
      }
    });
  return hits;
}

describe('route errors are customer sentences', () => {
  it('walked the routes the phone calls', () => {
    expect(FILES.length).toBeGreaterThan(30);
    for (const route of ['wishlist', 'wishlist/complete', 'tires', 'tires/rotations', 'invoice-pages', 'vehicles']) {
      expect(FILES).toContain(join(ROOT, 'app', 'api', 'v1', ...route.split('/'), 'route.ts'));
    }
  });

  it('can still find developer-speak (anti-vacuous)', () => {
    const fixture = [
      `return NextResponse.json({ error: 'Internal server error' }, { status: 500 });`,
      `{ error: 'Failed to create maintenance record' },`,
      `return Response.json({ success: false, error: 'Invalid JSON body' } as ApiResponse, {`,
      `return Response.json({ success: false, error: 'Missing vehicleId' } as ApiResponse, { status: 400 });`,
      "{ error: `Unknown source — one of ${WISHLIST_SOURCES.join(', ')}` },",
      `errorMessage = 'Failed to upload file to storage. Please try again.';`,
      // and what must pass
      `return NextResponse.json({ error: 'That rotation is not on record.' }, { status: 404 });`,
      `return NextResponse.json({ error: COULD_NOT_SAVE }, { status: 500 });`,
      `logger.error('TIRES_API:GET_EXCEPTION', { error: 'Internal server error' });`,
      `// { error: 'Internal server error' } was the old answer`,
    ].join('\n');
    expect(scan('fixture.ts', fixture).map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('holds for every route', () => {
    const offenders = FILES.flatMap((file) => scan(file.slice(ROOT.length + 1), readFileSync(file, 'utf8')));
    expect(offenders.map((h) => `${h.file}:${h.line}  ${JSON.stringify(h.text)}`)).toEqual([]);
  });

  it('holds for the shared sentences themselves', () => {
    for (const sentence of [UNREADABLE_REQUEST, COULD_NOT_SAVE, couldNotLoad('this car')]) {
      expect(isDeveloperSpeak(sentence)).toBe(false);
      // Our failure, so never the connection (L3).
      expect(sentence).not.toMatch(/connection/i);
    }
  });
});

describe('the phone’s side of the same rule', () => {
  it('shows a sentence and refuses developer-speak', () => {
    expect(customerSentence('Tappet could not save that just now.', 'fallback')).toBe('Tappet could not save that just now.');
    expect(customerSentence('Internal server error', 'fallback')).toBe('fallback');
    expect(customerSentence('Missing pagePaths or vehicleId', 'fallback')).toBe('fallback');
    expect(customerSentence(undefined, 'fallback')).toBe('fallback');
  });

  it('does not mistake a product word for a field name', () => {
    expect(isDeveloperSpeak('Open the iPhone Settings app.')).toBe(false);
    expect(isDeveloperSpeak('Requires iOS 16 or later.')).toBe(false);
    expect(isDeveloperSpeak('A car is missing its odometer.')).toBe(false);
  });
});
