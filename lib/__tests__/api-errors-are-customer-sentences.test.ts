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
import { COULD_NOT_SAVE, UNREADABLE_REQUEST, couldNotLoad, removedInvoice } from '@/lib/api-error-copy';

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
  /*
    Audit 360, COPY-15: the web's add-a-car flow — the server actions it calls
    and the wizard that shows their `error` and its own.
  */
  join(ROOT, 'app', 'actions.ts'),
  join(ROOT, 'components', 'OnboardingWizard.tsx'),
  join(ROOT, 'app', 'onboard', 'OnboardVinForm.tsx'),
];

/*
  Audit 360, COPY-19 (1 Oct): the web's components and pages. COPY-15 fixed
  the actions' sentences and the components overwrote them with their own
  ("Failed to mark issue as fixed") or showed an exception's text. Every
  `.ts`/`.tsx` under `components/` and `app/` is walked, except the routes
  (listed above), `app/dev` (never served to an owner) and `components/ui`
  (the primitives, which carry no copy).
*/
const SKIPPED_DIRS = new Set([
  join(ROOT, 'app', 'api'),
  join(ROOT, 'app', 'dev'),
  join(ROOT, 'components', 'ui'),
]);

function webSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || SKIPPED_DIRS.has(full) ? [] : webSources(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}
const WEB = [...webSources(join(ROOT, 'components')), ...webSources(join(ROOT, 'app'))].filter(
  (file) => !FILES.includes(file)
);

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/g, (_m, lead: string) => lead);
}

/*
  Audit 360, COPY-24: `setError(` alone on its line, its argument on the next
  four, read as nothing — the sign-in page's ternary that showed the auth
  library's message sat there. A `setError(` or `toast.error(` that ends its
  line is read together with the lines that close it (up to ten), and reported
  at the line that opened it. Only that shape: an `error:` inside a
  `Response.json({ … }, {` also leaves a parenthesis open, and joining it would
  pull the next statements' strings in under the wrong line.
*/
const OPENS_A_CALL = /\b(setError|toast\.error)\(\s*$/;
const TRIGGER = /\berror\s*:|\berrorMessage\s*=|\bsetError\(|\btoast\.error\(|type: 'SET_ERROR'/;

export function logicalLines(source: string): string[] {
  const lines = withoutComments(source).split('\n');
  return lines.map((line, index) => {
    if (!OPENS_A_CALL.test(line)) return line;
    let depth = 0;
    let joined = '';
    for (let i = index; i < Math.min(lines.length, index + 10); i++) {
      joined += (i === index ? '' : ' ') + lines[i].trim();
      for (const ch of lines[i]) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      if (depth <= 0) break;
    }
    return joined;
  });
}

const STRING_LITERAL = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;

interface Hit {
  file: string;
  line: number;
  text: string;
}

export function scan(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  logicalLines(source).forEach((line, index) => {
      if (/\blogger\.|\bconsole\./.test(line)) return;
      // COPY-15: `setError(` too — the web wizard shows what it is handed.
      // COPY-19: and what a web component shows — a toast, or the quote dialog's reducer.
      if (!TRIGGER.test(line)) return;
      STRING_LITERAL.lastIndex = 0;
      for (let m = STRING_LITERAL.exec(line); m; m = STRING_LITERAL.exec(line)) {
        const text = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, '');
        if (isDeveloperSpeak(text)) hits.push({ file: rel, line: index + 1, text });
      }
    });
  return hits;
}

describe('route errors are customer sentences', () => {
  it('walked the web’s add-a-car flow too (COPY-15)', () => {
    for (const file of ['app/actions.ts', 'components/OnboardingWizard.tsx', 'app/onboard/OnboardVinForm.tsx']) {
      expect(FILES).toContain(join(ROOT, ...file.split('/')));
      expect(readFileSync(join(ROOT, ...file.split('/')), 'utf8').length).toBeGreaterThan(1000);
    }
  });

  it('the VIN step does not call a VIN invalid for NHTSA having no record (COPY-15, §10)', () => {
    const actions = readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8');
    expect(actions).not.toMatch(/Invalid VIN or vehicle not found/);
    expect(actions).toMatch(/NHTSA has no record for that VIN/);
  });

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
      // COPY-15: the web's add-a-car flow, as it shipped.
      `return { success: false, error: 'Not authenticated' };`,
      `setError('Please select all powertrain options');`,
      `setError('Please wait while we check available configurations...');`,
      `return { success: false, error: 'An unexpected error occurred' };`,
      // COPY-19: the web's components, as they shipped.
      `toast.error('Failed to mark issue as fixed');`,
      "toast.error(`Failed to upload ${file.name}`);",
      `dispatch({ type: 'SET_ERROR', error: result.error || 'Failed to generate quote' });`,
      // COPY-24 / COPY-25: the auth pages' fallback and the quote's validation, as they shipped.
      `setError(err?.message || 'Something went wrong. Please try again.');`,
      `return { success: false, error: 'Please enter a valid 5-digit zip code' };`,
      // and what must pass
      `return NextResponse.json({ error: 'That rotation is not on record.' }, { status: 404 });`,
      `return NextResponse.json({ error: COULD_NOT_SAVE }, { status: 500 });`,
      `logger.error('TIRES_API:GET_EXCEPTION', { error: 'Internal server error' });`,
      `// { error: 'Internal server error' } was the old answer`,
    ].join('\n');
    expect(scan('fixture.ts', fixture).map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('reads a call that opens on one line and closes on another (COPY-24)', () => {
    const fixture = [
      `toast.error(`,
      `  'Failed to save the car'`,
      `);`,
      `setError(`,
      `  ok ? 'Tappet saved that.' : 'Tappet could not save that just now.'`,
      `);`,
    ].join('\n');
    expect(scan('fixture.ts', fixture).map((h) => h.line)).toEqual([1]);
  });

  it('walked the web’s components and pages (COPY-19)', () => {
    expect(WEB.length).toBeGreaterThan(80);
    for (const file of [
      'components/VehicleInsights.tsx',
      'components/ConsultantChat.tsx',
      'components/HealthSummary.tsx',
      'components/DocumentUploadDialog.tsx',
      'components/QuoteRequestDialogV2.tsx',
      'app/tires/[vehicleId]/page.tsx',
      // COPY-24: the door.
      'app/login/page.tsx',
      'app/signup/page.tsx',
      'app/forgot-password/page.tsx',
      'app/reset-password/page.tsx',
    ]) {
      expect(WEB).toContain(join(ROOT, ...file.split('/')));
    }
  });

  it('holds for the web’s components and pages (COPY-19)', () => {
    const offenders = WEB.flatMap((file) => scan(file.slice(ROOT.length + 1), readFileSync(file, 'utf8')));
    expect(offenders.map((h) => `${h.file}:${h.line}  ${JSON.stringify(h.text)}`)).toEqual([]);
  });

  /*
    A thrown exception's text is the browser's or the library's words —
    "Failed to fetch", "Load failed", "NetworkError when attempting…". None of
    the shapes above sees it, because it is not a literal.

    COPY-24 widened it: `signInError.message`, `resetError.message` and
    `err?.message` all walked past `\b(error|err|e)\.message` — no word
    boundary inside "signInError", and `?.` is not `.`. A `data.message` or
    `result.message` is a Tappet route's own answer and still passes.

    `customerSentence(error.message, …)` is the one sanctioned reading: the
    tire dialogs' `TireRequestError` carries a Tappet route's sentence, and
    `customerSentence` refuses it if it is not one. Seen only since the
    multi-line join (COPY-24) reached `app/tires/[vehicleId]/page.tsx:72`.
  */
  const throughTheFilter = (line: string) => line.replace(/\bcustomerSentence\([^)]*\)/g, 'SENTENCE');

  const SHOWS_EXCEPTION = /\b(toast\.error|setError|SET_ERROR)\b.*\b(?:\w*[Ee]rror|\w*[Ee]rr|e)\??\.message\b/;

  it('never shows an exception’s message in a toast or an error line (COPY-19)', () => {
    const offenders = WEB.flatMap((file) =>
      logicalLines(readFileSync(file, 'utf8'))
        .map((line, index) => ({ line, at: `${file.slice(ROOT.length + 1)}:${index + 1}` }))
        .filter(({ line }) => SHOWS_EXCEPTION.test(throughTheFilter(line)))
        .map(({ at, line }) => `${at}  ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });

  it('can still see an exception’s message on screen (anti-vacuous)', () => {
    expect(SHOWS_EXCEPTION.test(`toast.error(error instanceof Error ? error.message : 'That was not saved.');`)).toBe(true);
    expect(SHOWS_EXCEPTION.test(`dispatch({ type: 'SET_ERROR', error: error.message || 'x' });`)).toBe(true);
    expect(SHOWS_EXCEPTION.test(`toast.error(tireRefusal(error, 'That was not saved.'));`)).toBe(false);
    // COPY-24: the four auth pages, as they shipped — one of them across five lines.
    expect(SHOWS_EXCEPTION.test(`setError(resetError.message);`)).toBe(true);
    expect(SHOWS_EXCEPTION.test(`setError(updateError.message);`)).toBe(true);
    expect(SHOWS_EXCEPTION.test(`setError(err?.message || 'Something went wrong. Please try again.');`)).toBe(true);
    const login = logicalLines(
      [
        `setError(`,
        `  signInError.message === 'Invalid login credentials'`,
        `    ? 'Incorrect email or password.'`,
        `    : signInError.message`,
        `);`,
      ].join('\n')
    );
    expect(SHOWS_EXCEPTION.test(login[0])).toBe(true);
    expect(SHOWS_EXCEPTION.test(throughTheFilter(`toast.error(customerSentence(error.message, 'Not removed.'));`))).toBe(false);
    expect(SHOWS_EXCEPTION.test(throughTheFilter(`toast.error(error.message || customerSentence(x, 'y'));`))).toBe(true);
    // A Tappet route's own answer is not an exception's text.
    expect(SHOWS_EXCEPTION.test(`setError(data.message || 'That could not be read.');`)).toBe(false);
    expect(SHOWS_EXCEPTION.test(`setError(authErrorSentence(signInError, 'sign-in'));`)).toBe(false);
  });

  it('the rejected-file toast speaks in the product’s voice, not the first person (COPY-19)', () => {
    const chat = readFileSync(join(ROOT, 'components', 'ConsultantChat.tsx'), 'utf8');
    expect(chat).not.toMatch(/I've deleted it|I’ve deleted it/);
    expect(chat).toMatch(/does not look like it is about your car, so it was not kept\./);
  });

  /*
    COPY-23: megabytes were written four ways, two of them in one dialog.
    "10 MB", with the space, everywhere a customer reads a size.
  */
  const UNSPACED_MB = /\d(MB|mb)\b/;

  it('writes a size as "10 MB", with the space (COPY-23)', () => {
    const offenders = WEB.flatMap((file) =>
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .map((line, index) => ({ line, at: `${file.slice(ROOT.length + 1)}:${index + 1}` }))
        .filter(({ line }) => UNSPACED_MB.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
    // Anti-vacuous: the shapes it shipped with.
    expect(UNSPACED_MB.test('Maximum size is 10MB.')).toBe(true);
    expect(UNSPACED_MB.test('PNG, JPG, PDF up to 10 MB each.')).toBe(false);
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

describe('the history’s removal toast counts (COPY-26)', () => {
  it('says one line for one, and never "1 items"', () => {
    expect(removedInvoice(1)).toBe('Removed the invoice and its one line.');
    expect(removedInvoice(3)).toBe('Removed the invoice and its 3 lines.');
    expect(removedInvoice(0)).toBe('Removed the invoice.');
    for (const n of [0, 1, 2, 7]) expect(removedInvoice(n)).not.toMatch(/\b1 (items|lines)\b|Deleted/);
  });

  it('is what the history shows, counting the lines that went', () => {
    const history = readFileSync(join(ROOT, 'components', 'MaintenanceHistory.tsx'), 'utf8');
    expect(history).not.toMatch(/items from invoice/);
    expect(history).toMatch(/toast\.success\(removedInvoice\(itemsToDelete\.filter\(\(item\) => idsToDelete\.has\(item\.id\)\)\.length\)\)/);
  });
});

describe('the phone’s side of the same rule', () => {
  it('shows a sentence and refuses developer-speak', () => {
    expect(customerSentence('Tappet could not save that just now.', 'fallback')).toBe('Tappet could not save that just now.');
    expect(customerSentence('Internal server error', 'fallback')).toBe('fallback');
    expect(customerSentence('Missing pagePaths or vehicleId', 'fallback')).toBe('fallback');
    expect(customerSentence(undefined, 'fallback')).toBe('fallback');
    // COPY-24/25: a bare "Something went wrong." and "Please enter …" are refused;
    // a sentence that says whose fault it was still passes.
    expect(isDeveloperSpeak('Something went wrong. Please try again.')).toBe(true);
    expect(isDeveloperSpeak('Please enter a valid 5-digit zip code')).toBe(true);
    expect(isDeveloperSpeak('Something went wrong on our side. Try again in a moment.')).toBe(false);
  });

  it('does not mistake a product word for a field name', () => {
    expect(isDeveloperSpeak('Open the iPhone Settings app.')).toBe(false);
    expect(isDeveloperSpeak('Requires iOS 16 or later.')).toBe(false);
    expect(isDeveloperSpeak('A car is missing its odometer.')).toBe(false);
  });
});
