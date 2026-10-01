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
import {
  CAR_NOT_FOUND,
  CAR_NOT_ON_FILE,
  COULD_NOT_SAVE,
  NOT_ON_THIS_ACCOUNT,
  NOT_SIGNED_IN,
  UNREADABLE_REQUEST,
  carPageSentence,
  couldNotLoad,
  isCarNotFound,
  removedInvoice,
} from '@/lib/api-error-copy';

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
    Audit 360, COPY-38: the authorizer's denials, which every route sends as
    they are (`access.response`). Read at `deny(` — see TRIGGER.
  */
  join(ROOT, 'lib', 'api-auth.ts'),
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
const TRIGGER = /\berror\s*:|\berrorMessage\s*=|\bsetError\(|\btoast\.error\(|type: 'SET_ERROR'|\bdeny\(/;

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

  /*
    COPY-29: the same text rendered as a JSX child — `<p>{error.message}</p>`
    on the dashboard, the specifications and the advisor, beside a heading
    that said "Error Loading Vehicle". A `useQuery` throw is the database
    client's error: "TypeError: Failed to fetch" on a dropped connection,
    PostgREST's "JWT expired" otherwise. Neither toast nor setError, so the
    rule above never read it.

    One exemption, by file and text: the error boundary's details block,
    which renders only under `showDetails`, defaulting to development.
  */
  const RENDERS_EXCEPTION = /\{[^{}]*\b(?:\w*[Ee]rror|\w*[Ee]rr|e)\??\.message\b[^{}]*\}/;
  const DEV_ONLY = { file: 'components/ErrorBoundary.tsx', text: '{this.state.error.name}: {this.state.error.message}' };

  it('never renders an exception’s message as page text (COPY-29)', () => {
    const offenders = WEB.flatMap((file) =>
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .map((line, index) => ({ line, rel: file.slice(ROOT.length + 1), at: index + 1 }))
        .filter(({ line }) => /<|\/>|^\s*\{/.test(line) || /^\s*[^=:(]*\{/.test(line))
        .filter(({ line }) => !/\b(logger|console)\./.test(line) && !/\b(?:setError|toast\.error|SET_ERROR)\b/.test(line))
        .filter(({ line }) => RENDERS_EXCEPTION.test(line.replace(/\$\{[^}]*\}/g, '')))
        .filter(({ line, rel }) => !(rel === DEV_ONLY.file && line.includes(DEV_ONLY.text)))
        .map(({ rel, at, line }) => `${rel}:${at}  ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });

  it('the one exemption is still behind showDetails, which defaults to development', () => {
    const boundary = readFileSync(join(ROOT, ...DEV_ONLY.file.split('/')), 'utf8');
    expect(boundary).toContain(DEV_ONLY.text);
    expect(boundary).toMatch(/const showDetails = this\.props\.showDetails \?\? isDevelopment;/);
    expect(boundary).toMatch(/\{showDetails && this\.state\.error && \(/);
  });

  it('can still see an exception rendered as text (anti-vacuous)', () => {
    for (const shipped of [
      `          <p className="text-gray-400 mb-6">{error.message}</p>`,
      `            <p className="text-red-200/60 mb-5 text-sm">{error.message}</p>`,
      `                  Error ID: {this.state.error?.message?.substring(0, 16)}...`,
    ]) {
      expect(RENDERS_EXCEPTION.test(shipped)).toBe(true);
    }
    expect(RENDERS_EXCEPTION.test(`<p>{carPageSentence(error, 'this car')}</p>`)).toBe(false);
    expect(RENDERS_EXCEPTION.test(`<p>{data.message}</p>`)).toBe(false);
  });

  /*
    COPY-31: an exception's text spliced into a sentence — `Delete failed:
    ${error.message}`, `Vehicle not found (${vehicleError?.message})`. The
    literal scan blanks a template's holes, so it read "Vehicle not found ()"
    and passed. And the plainer shape beside it: `error: error.message`,
    returned by 25 actions and two routes, which reached the screen through
    `answerSentence` because "JWT expired" is not developer-speak to a filter
    that looks for phrases. An `error:` (not a logger's) never carries one.
  */
  const SPLICES_EXCEPTION = /\berror\s*:\s*`[^`]*\$\{[^}]*(?:\.message\b|\b\w*Msg\b)/;
  const RETURNS_EXCEPTION = /\berror\s*:\s*\(?\s*[\w.?]*?(?:[Ee]rror|[Ee]rr|\be)\b[^,}]*?\??\.message\b/;
  const SERVER_SOURCES = [...FILES, join(ROOT, 'lib', 'actions', 'wishlist.ts')];

  /** Whether line `n` sits inside a `logger.x(` / `console.x(` call opened on it or up to three lines above. */
  function insideALoggerCall(lines: string[], n: number): boolean {
    if (/\b(?:logger|console)\.\w+\(/.test(lines[n])) return true;
    for (let start = n - 1; start >= Math.max(0, n - 3); start--) {
      const opened = lines[start].search(/\b(?:logger|console)\.\w+\(/);
      if (opened === -1) continue;
      // Still open at the end of the line before `n`?
      let depth = 0;
      for (const ch of [lines[start].slice(opened), ...lines.slice(start + 1, n)].join('\n')) {
        depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
      }
      return depth > 0;
    }
    return false;
  }

  it('never answers with an exception’s text, whole or spliced (COPY-31)', () => {
    const offenders = SERVER_SOURCES.flatMap((file) => {
      const lines = withoutComments(readFileSync(file, 'utf8')).split('\n');
      return lines
        .map((line, index) => ({ line, at: `${file.slice(ROOT.length + 1)}:${index + 1}` }))
        .filter(({ line }) => SPLICES_EXCEPTION.test(line) || RETURNS_EXCEPTION.test(line))
        // A logger's context object is ours to read: a call still open on this line.
        .filter(({ at }) => !insideALoggerCall(lines, Number(at.split(':').pop()) - 1))
        .map(({ at, line }) => `${at}  ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it('can still see a spliced or returned exception (anti-vacuous)', () => {
    const shipped = [
      "      error: `Delete failed: ${error.message || 'Unknown error'}`,",
      '      error: `Database connection failed: ${errorMsg}`',
      "        return { success: false, error: `Vehicle not found (${vehicleError?.message || fallback.error?.message || 'unknown'})` };",
      '        return { success: false, error: `Database error: ${error.message}` };',
      '      return { success: false, error: error.message, vehicles: [] };',
      "    return { success: false, error: error?.message || 'Unknown error' };",
      '      return { success: false, error: vehicleResult.error.message };',
      "      error: (error as Error)?.message || 'Validation failed',",
      '      return Response.json({ success: false, error: vehicleError.message } as ApiResponse, { status: 500 });',
    ];
    for (const line of shipped) expect(SPLICES_EXCEPTION.test(line) || RETURNS_EXCEPTION.test(line)).toBe(true);
    // The filter: a logger's context is exempt; a return after a closed console call is not.
    const logged = ["logger.warn('VEHICLE:KB_FAILED', 'Failed to create knowledge base', {", '  error: kbError.message,', '});'];
    expect(insideALoggerCall(logged, 1)).toBe(true);
    const returned = ["console.error('[Fetch Vehicle] Error:', error);", 'return { success: false, error: error.message };'];
    expect(insideALoggerCall(returned, 1)).toBe(false);
    for (const fine of [
      '      return { success: false, error: COULD_NOT_REMOVE };',
      '      return { success: false, error: firstReading.message };',
      '      return { success: false, error: decision.message, reason: decision.reason };',
      "      error: `Tappet could not read ${what}.`,",
    ]) {
      expect(SPLICES_EXCEPTION.test(fine) || RETURNS_EXCEPTION.test(fine)).toBe(false);
    }
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

describe('the web’s car pages say why they could not open (COPY-29)', () => {
  // What postgrest-js hands back, as it ships (`dist/index.cjs`, the fetch catch).
  const DROPPED = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };
  const SAFARI = { message: 'TypeError: Load failed', details: '', hint: '', code: '' };
  const LAPSED = { message: 'JWT expired', details: null, hint: null, code: 'PGRST301' };
  const REFUSED = { message: 'permission denied for table vehicles', details: null, hint: null, code: '42501' };

  it('never says the library’s words', () => {
    for (const error of [DROPPED, SAFARI, LAPSED, REFUSED, new Error('boom'), undefined]) {
      const said = carPageSentence(error, 'this car');
      expect(said).not.toMatch(/TypeError|Failed to fetch|Load failed|JWT|permission denied|boom/);
      expect(isDeveloperSpeak(said)).toBe(false);
    }
  });

  it('sends a lapsed session to sign in, and a dropped request to reload', () => {
    expect(carPageSentence(LAPSED, 'this car')).toBe(NOT_SIGNED_IN);
    expect(carPageSentence(DROPPED, 'this car')).toBe('Tappet did not answer, so this car did not open. Reload the page to try again.');
    expect(carPageSentence(SAFARI, 'the advisor')).toMatch(/^Tappet did not answer, so the advisor did not open\./);
    expect(carPageSentence(REFUSED, 'the specifications')).toBe(
      'Tappet could not open the specifications just now. Reload the page to try again.'
    );
    // Not the connection unless the request never answered (L3).
    expect(carPageSentence(REFUSED, 'this car')).not.toMatch(/connection/);
  });

  it('reads the authorizer’s denials (COPY-38) — and can still see the ones that shipped', () => {
    const auth = readFileSync(join(ROOT, 'lib', 'api-auth.ts'), 'utf8');
    expect((auth.match(/\bdeny\(/g) ?? []).length).toBeGreaterThan(8);
    expect(scan('lib/api-auth.ts', auth)).toEqual([]);
    const shipped = [
      `    return deny('Missing vehicleId', 400);`,
      `    return deny('Invalid vehicleId format', 400);`,
      `    return deny('Failed to verify vehicle access', 500);`,
      `    return deny('Missing id', 400);`,
      `    return deny('Failed to verify access', 500);`,
    ].join('\n');
    expect(scan('fixture', shipped).map((h) => h.line)).toEqual([1, 2, 3, 4, 5]);
  });

  /*
    COPY-39: one customer sentence for "not there" and "not yours", for a car
    and for a row id — the same constant at every site, so no branch can
    drift into an oracle.
  */
  it('answers not-there and not-yours in one sentence, at every site (COPY-39)', () => {
    const auth = readFileSync(join(ROOT, 'lib', 'api-auth.ts'), 'utf8');
    expect(auth).toMatch(/export const NOT_FOUND_MESSAGE = NOT_ON_THIS_ACCOUNT;/);
    expect(isDeveloperSpeak(NOT_ON_THIS_ACCOUNT)).toBe(false);
    expect(NOT_ON_THIS_ACCOUNT).not.toMatch(/vehicle/i);
    // Both branches of each authorizer: the vehicle that is not owned, and the row that is not there.
    expect((auth.match(/deny\(NOT_FOUND_MESSAGE, 404\)/g) ?? []).length).toBe(2);
    const sites = [
      'lib/consultant-context.ts',
      'lib/performance-stats.ts',
      'app/api/v1/vehicle-removal/route.ts',
      'app/api/v1/vehicles/route.ts',
      'app/api/v1/load-vehicle/route.ts',
      'app/actions.ts',
    ];
    for (const site of sites) {
      const source = readFileSync(join(ROOT, ...site.split('/')), 'utf8');
      expect(source).toMatch(/error: NOT_FOUND_MESSAGE/);
      // The old literal, said to someone (a log line's is not).
      expect(source.split('\n').filter((l) => /'Vehicle not found'/.test(l) && !/logger\.|console\./.test(l))).toEqual([]);
    }
    // anti-vacuous: the literal as it shipped is seen.
    const shipped = `    return { ok: false, error: 'Vehicle not found' };`;
    expect(shipped.split('\n').filter((l) => /'Vehicle not found'/.test(l) && !/logger\.|console\./.test(l))).toHaveLength(1);
  });

  it('knows its own not-found throw, and nothing else', () => {
    expect(isCarNotFound(new Error(CAR_NOT_FOUND))).toBe(true);
    expect(isCarNotFound(new Error('Vehicle not found'))).toBe(false);
    expect(isCarNotFound(DROPPED)).toBe(false);
    expect(isDeveloperSpeak(CAR_NOT_ON_FILE)).toBe(false);
  });

  it.each([
    ['app/dashboard/[vehicleId]/page.tsx', 'this car'],
    ['app/vehicle-info/[vehicleId]/page.tsx', 'the specifications'],
    ['app/consultant/[vehicleId]/page.tsx', 'the advisor'],
    ['app/tires/[vehicleId]/page.tsx', 'this car'],
    ['app/plan/[vehicleId]/page.tsx', 'this car’s plan'],
  ])('%s shows the sentence and sends a missing car to the garage', (file, what) => {
    const page = readFileSync(join(ROOT, ...file.split('/')), 'utf8');
    expect(page).toContain(`carPageSentence(`);
    expect(page).toContain(`'${what}')`);
    expect(page).toContain('throw new Error(CAR_NOT_FOUND)');
    expect(page).not.toMatch(/Error Loading Vehicle|\{error\.message\}/);
    // COPY-36: the title's second half, asserted on every page it names.
    expect(page).toMatch(GARAGE_REDIRECT);
  });

  /* The redirect, read as the pages write it: the not-found test, then the replace. */
  const GARAGE_REDIRECT = /isCarNotFound\([\w.]+\)[\s\S]{0,120}?router\.replace\('\/garage'\)/;

  it('anti-vacuous: the tire and plan pages as they shipped had no redirect', () => {
    const tiresShipped = `if (!data) throw new Error(CAR_NOT_FOUND);
      if (vehicleQuery.error || !vehicleQuery.data) {
        return <p>{carPageSentence(vehicleQuery.error, 'this car')}</p>;
      }`;
    const planShipped = `{error ? <p>Could not load this car&apos;s plan.</p> : null}`;
    expect(tiresShipped).not.toMatch(GARAGE_REDIRECT);
    expect(planShipped).not.toMatch(GARAGE_REDIRECT);
    expect(`if (error && isCarNotFound(error)) {\n    router.replace('/garage');`).toMatch(GARAGE_REDIRECT);
  });

  it('the dashboard takes the garage redirect too', () => {
    const page = readFileSync(join(ROOT, 'app', 'dashboard', '[vehicleId]', 'page.tsx'), 'utf8');
    expect(page).toMatch(/if \(error && isCarNotFound\(error\)\) \{\s*router\.replace\('\/garage'\);/);
  });
});
