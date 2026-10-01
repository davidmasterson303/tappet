/**
 * The web's buttons, headings and labels are written in sentence case, and say
 * car.
 *
 * @jest-environment node
 *
 * ⚠ **Audit 360, COPY-34 (1 Oct).** The phone's controls read "Add a car",
 * "Remove", "Mark done"; the website's read "Create Account", "Add vehicle",
 * "Delete Vehicle", "Update Mileage", "Mark Fixed", "Error Loading Vehicle",
 * "Go Back" — 54 title-case lines outside `components/ui`, on the pages
 * COPY-24 had just brought into the sweep. Standard L8 is sentence case except
 * where the design system sets mono or condensed caps, and those are set by a
 * class (`uppercase`, `label-uppercase`), never by the source's own capitals —
 * so a line whose element carries that class is the design system's, and is
 * not read here. Standard L7 is one term per concept: the phone says car.
 *
 * Read: JSX text (on its line or alone on one), the `title`, `aria-label`,
 * `placeholder` and `alt` attributes, and a string literal that reads as a
 * phrase (starts with a capital, letters and spaces only — a dialog title
 * chosen by a ternary). Comments removed. Proven against the shipped lines
 * (anti-vacuous) and against the files it walked (CLAUDE.md §5).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DELETION_INVENTORY, deletionCarCount } from '@tappet/core/account-deletion';

const ROOT = join(__dirname, '..', '..');

const SKIPPED = new Set([
  join(ROOT, 'app', 'api'),
  join(ROOT, 'app', 'dev'),
  join(ROOT, 'components', 'ui'),
  /*
    The legal documents. Their headings are sentence case already; their
    prose says "vehicle" in the sense the Terms define, and their words are
    the legal lens's (standard L9), not chrome.
  */
  join(ROOT, 'app', 'terms'),
  join(ROOT, 'app', 'privacy'),
]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || SKIPPED.has(full) ? [] : sources(full);
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const FILES = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];

function withoutComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/g, (_m, lead: string) => lead);
}

/*
  Names that keep their capitals mid-phrase: the product's, its tabs and lists
  as the phone names them, the companies it names, the documents' titles. A
  name of two words is matched as a phrase, so "Account" alone is still a
  word ("Create Account") while "Apple Account" is a name. Acronyms are all
  caps and never read as title case.
*/
const PROPER_PHRASES = [
  'Apple Account', 'App Store', 'Privacy Policy', 'Terms of Use', 'Tappet Plus', 'Southmoor Digital',
  // Names a placeholder offers as examples: a shop, a tire, two trims.
  "Joe's Auto Repair", 'Pilot Sport', 'Sport, Limited',
];
const PROPER = new Set([
  'Tappet', 'Needs', 'Plan', 'Advisor',
  'Apple', 'Google', 'Gemini', 'iPhone', 'Safari', 'Chrome', 'WebP',
  'Forgot', // "Ask for a new link from Forgot password." names the link
  'I',
]);

/** True when a phrase capitalizes a word after its first that is not a name. */
export function isTitleCase(text: string): boolean {
  let plain = text.replace(/&[a-z]+;/gi, ' ').replace(/^[•+*\s]+/, '');
  for (const name of PROPER_PHRASES) plain = plain.split(name).join(name.replace(/ /g, '_'));
  const words = plain.trim().split(/\s+/);
  if (words.length < 2) return false;
  for (let i = 1; i < words.length; i++) {
    const word = words[i].replace(/^[("'‘“]+|[)"'’”.,:;!?…*]+$/g, '');
    if (!/^[A-Z][a-z]/.test(word) || word.includes('_')) continue;
    if (PROPER.has(word)) continue;
    if (/[.!?:—–-]$/.test(words[i - 1])) continue; // a new sentence or a label's value
    return true;
  }
  return false;
}

const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
const ATTRIBUTE = /\b(?:title|aria-label|placeholder|alt)="([^"]+)"/g;
const PHRASE_LITERAL = /'([A-Z][A-Za-z]*(?: [A-Za-z]+)+)'/g;
const PLURAL_CHOICE = /===\s*1\s*\?\s*'([a-z]+)'\s*:\s*'([a-z]+)'/g;
/*
  COPY-37: the shapes the four readers above could not see — a toast's
  literal, a sentence in a `desc:` / `summary:` / `body:` field, a fallback
  after `||` / `??` / a ternary's arms, and any literal of three words or more
  (a full stop or an ellipsis took a sentence out of PHRASE_LITERAL).
*/
const TOAST_LITERAL = /\btoast(?:\.\w+)?\(\s*(['"`])((?:(?!\1).)*[A-Za-z](?:(?!\1).)*)\1/g;
const FIELD_LITERAL = /\b(?:desc|summary|body)\s*:\s*(['"`])((?:(?!\1).)+)\1/g;
const FALLBACK_LITERAL = /(?:\|\||\?\?|\?|:)\s*'([A-Z][a-z]+(?: [a-z]+)+)'/g;
const SENTENCE_LITERAL = /(['"])([A-Za-z][^'"\n]*?\s[^'"\n]*?\s[^'"\n]*?)\1/g;

interface Piece {
  line: number;
  text: string;
  source: string;
}

/** Every piece of on-screen text in a `.tsx` source, with the line it sits on. */
export function chromeText(source: string): Piece[] {
  return readPieces(source).chrome;
}

/** A literal of three words or more — read for "vehicle" only (COPY-37), not for case. */
export function sentenceLiterals(source: string): Piece[] {
  return readPieces(source).sentences;
}

function readPieces(source: string): { chrome: Piece[]; sentences: Piece[] } {
  const out: Piece[] = [];
  const sentences: Piece[] = [];
  const lines = withoutComments(source).split('\n');
  let inImport = false;
  lines.forEach((line, index) => {
    // A multi-line import's names are identifiers, not words.
    if (/^\s*import\b/.test(line)) {
      inImport = !/\bfrom\b/.test(line);
      return;
    }
    if (inImport) {
      if (/\bfrom\b/.test(line)) inImport = false;
      return;
    }
    if (/\b(console|logger)\./.test(line)) return;
    const push = (text: string) => out.push({ line: index + 1, text: text.trim(), source: line });
    JSX_TEXT.lastIndex = 0;
    for (let m = JSX_TEXT.exec(line); m; m = JSX_TEXT.exec(line)) {
      // `useState<Set<string>>(new Set())` has a > and a < too.
      if (!/\bnew [A-Z]|=>|^\s*[=)]/.test(m[1])) push(m[1]);
    }
    ATTRIBUTE.lastIndex = 0;
    for (let m = ATTRIBUTE.exec(line); m; m = ATTRIBUTE.exec(line)) push(m[1]);
    PHRASE_LITERAL.lastIndex = 0;
    for (let m = PHRASE_LITERAL.exec(line); m; m = PHRASE_LITERAL.exec(line)) push(m[1]);
    // COPY-32: a plural chosen by a ternary — `{n === 1 ? 'vehicle' : 'vehicles'}`.
    PLURAL_CHOICE.lastIndex = 0;
    for (let m = PLURAL_CHOICE.exec(line); m; m = PLURAL_CHOICE.exec(line)) push(`${m[1]} ${m[2]}`.toLowerCase());
    // COPY-37: toasts, fields and fallbacks, and any literal of three words.
    for (const re of [TOAST_LITERAL, FIELD_LITERAL]) {
      re.lastIndex = 0;
      // A template's `${…}` is a value, not a word: `${vehicle.make}` is not "vehicle".
      for (let m = re.exec(line); m; m = re.exec(line)) push(m[2].replace(/\$\{[^}]*\}/g, 'X'));
    }
    FALLBACK_LITERAL.lastIndex = 0;
    for (let m = FALLBACK_LITERAL.exec(line); m; m = FALLBACK_LITERAL.exec(line)) push(m[1]);
    SENTENCE_LITERAL.lastIndex = 0;
    for (let m = SENTENCE_LITERAL.exec(line); m; m = SENTENCE_LITERAL.exec(line)) sentences.push({ line: index + 1, text: m[2].trim(), source: line });
    // A text node alone on its line, set by the tag on the lines above.
    const bare = line.trim();
    /*
      Parentheses are allowed — "Error Details (Development Mode)" sat on a
      line of its own — so a line that reads as a statement is refused by its
      first word instead.
    */
    if (
      bare !== '' &&
      /\s/.test(bare) &&
      !/[<>{}=;`'":_\[\]]/.test(bare) &&
      !/^(?:type|new|return|if|else|const|let|await|export|function|case|throw)\b/.test(bare) &&
      !/^\w+\(/.test(bare)
    ) {
      // The nearest tag above that opens an element (not a self-closing icon).
      const opener =
        lines
          .slice(Math.max(0, index - 4), index)
          .reverse()
          .find((l) => /<\w/.test(l) && !/\/>\s*$/.test(l)) ?? '';
      out.push({ line: index + 1, text: bare, source: `${opener} ${line}` });
    }
  });
  return { chrome: out, sentences };
}

/** Caps set by the design system: the element's class transforms the case. */
const SET_IN_CAPS = /\b(?:uppercase|label-uppercase)\b/;

export function titleCaseIn(source: string): Piece[] {
  return chromeText(source).filter((p) => !SET_IN_CAPS.test(p.source) && isTitleCase(p.text));
}

/** "vehicle" where the phone says car. */
const VEHICLE = /\bvehicles?\b/i;

export function vehicleIn(source: string): Piece[] {
  const { chrome, sentences } = readPieces(source);
  const seen = new Set<string>();
  return [...chrome, ...sentences]
    .filter((p) => VEHICLE.test(p.text))
    .filter((p) => !seen.has(`${p.line}:${p.text}`) && !!seen.add(`${p.line}:${p.text}`))
    .sort((a, b) => a.line - b.line);
}

const at = (file: string, p: Piece) => `${file.slice(ROOT.length + 1)}:${p.line}  ${JSON.stringify(p.text)}`;

describe('the web’s chrome is sentence case (COPY-34)', () => {
  it('walked the web’s pages and components', () => {
    expect(FILES.length).toBeGreaterThan(80);
    for (const f of [
      'app/signup/page.tsx',
      'app/reset-password/page.tsx',
      'app/dashboard/[vehicleId]/page.tsx',
      'components/VehicleCard.tsx',
      'components/SignedInShell.tsx',
      'components/DeleteAccountDialog.tsx',
    ]) {
      expect(FILES).toContain(join(ROOT, ...f.split('/')));
    }
  });

  it('can still see title case and vehicle (anti-vacuous)', () => {
    const fixture = [
      `            <h1 className="text-2xl font-bold text-white mb-4">Error Loading Vehicle</h1>`,
      `            <Button onClick={() => router.back()}>Go Back</Button>`,
      `              <span>`,
      `                Create Account`,
      `              </span>`,
      `            <AlertDialogTitle className="text-white">Delete Vehicle</AlertDialogTitle>`,
      `              ? 'Frame Your Vehicle'`,
      `            <Input placeholder="Shop Name" />`,
      `                    Error Details (Development Mode)`,
      // and what must pass
      `            <p className="mono text-xs uppercase tracking-[0.2em]">Total Spent</p>`,
      `            <Button>Add to Needs</Button>`,
      `            <a href="/privacy">Privacy Policy</a>`,
      `            <p>That did not save. Try again.</p>`,
      `            <Button>Sign in</Button>`,
      `            <Button>Open your Apple Account</Button>`,
      `  const [open, setOpen] = useState<Set<string>>(new Set());`,
      // COPY-32: the web's deletion dialog, as it shipped.
      `              {vehicleCount === 1 ? 'vehicle' : 'vehicles'} and their full history`,
    ].join('\n');
    expect(titleCaseIn(fixture).map((p) => p.line)).toEqual([1, 2, 4, 6, 7, 8, 9]);
    expect(vehicleIn(fixture).map((p) => p.line)).toEqual([1, 6, 7, 17]);
  });

  it('holds on every page and component', () => {
    const offenders = FILES.flatMap((file) => titleCaseIn(readFileSync(file, 'utf8')).map((p) => at(file, p)));
    expect(offenders).toEqual([]);
  });

  it('says car where the phone says car', () => {
    const offenders = FILES.flatMap((file) => vehicleIn(readFileSync(file, 'utf8')).map((p) => at(file, p)));
    expect(offenders).toEqual([]);
  });

  /*
    COPY-37: a server module's sentences that a page renders — the health
    card's parse-failure summary, the mismatch fallbacks. The prompts in the
    same file say vehicle to a model and are not read: only `desc:` /
    `summary:` / `body:` fields and `||` / `??` / ternary fallbacks.
  */
  it('says car in the sentences the actions hand a page', () => {
    // A log line is not said to anyone.
    const actions = withoutComments(readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8'))
      .split('\n')
      .filter((line) => !/\b(console|logger)\./.test(line))
      .join('\n');
    const said: string[] = [];
    for (const re of [FIELD_LITERAL, FALLBACK_LITERAL]) {
      re.lastIndex = 0;
      for (let m = re.exec(actions); m; m = re.exec(actions)) said.push(m[2] ?? m[1]);
    }
    expect(said.length).toBeGreaterThan(5);
    expect(said.filter((t) => VEHICLE.test(t))).toEqual([]);
  });

  it('can still see the six lines COPY-37 found (anti-vacuous)', () => {
    const shipped = [
      `    toast.loading('Researching vehicle information...', { id: 'research' });`,
      `      'Invoices, inspections and service records stored against the vehicle. The advisor reads them too.',`,
      `                    { value: 'Keep forever', label: 'Keep forever', desc: 'This is my long-term vehicle' },`,
      `      summary: 'We could not generate an assessment for this vehicle.',`,
      `        ].filter(v => v != null && v !== '').join(' ') || 'Unknown vehicle';`,
      `              ? 'Live demo with sample vehicles — no signup required'`,
    ].join('\n');
    expect(vehicleIn(shipped).map((p) => p.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  /*
    COPY-40: a working state or a placeholder ends in the ellipsis the phone
    and the web's newer lines write ("Saving…"), never three full stops.
  */
  const THREE_DOTS = /\.\.\.(?=['"<`])/;
  const threeDotsIn = (source: string) =>
    withoutComments(source).split('\n').flatMap((line, i) => (THREE_DOTS.test(line) ? [i + 1] : []));

  it('writes an ellipsis, not three full stops (COPY-40)', () => {
    const offenders = FILES.flatMap((file) =>
      threeDotsIn(readFileSync(file, 'utf8')).map((line) => `${file.slice(ROOT.length + 1)}:${line}`)
    );
    expect(offenders).toEqual([]);
  });

  it('can still see three full stops (anti-vacuous)', () => {
    const shipped = [
      `                  {isDeleting ? 'Deleting...' : 'Remove car'}`,
      `              placeholder="Search chats..."`,
      `            <p className="text-white/55 text-sm">Redirecting you to your garage...</p>`,
      `          // "Researching Vehicle..." was the label here`,
      `            <Button>Saving…</Button>`,
    ].join('\n');
    expect(threeDotsIn(shipped)).toEqual([1, 2, 3]);
  });

  it('holds on the shared copy the web renders, not only its source text', () => {
    const rendered = [...DELETION_INVENTORY, deletionCarCount(0), deletionCarCount(1), deletionCarCount(4)];
    expect(rendered.filter((t) => isTitleCase(t) || VEHICLE.test(t))).toEqual([]);
  });
});
