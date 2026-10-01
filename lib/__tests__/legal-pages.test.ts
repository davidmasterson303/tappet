/**
 * The two documents that make promises the rest of the product has to keep.
 *
 * @jest-environment node
 *
 * A privacy policy is not prose. It is a set of factual claims about what the
 * software does, published at a URL Apple requires and a reviewer will open —
 * and every one of those claims can be falsified by a later commit that nobody
 * connects to a legal page. That is the failure this file exists to catch: not
 * a typo, but the day someone adds an analytics SDK and the policy quietly
 * becomes untrue.
 *
 * ── Why these are source assertions rather than rendered ones ───────────────
 *
 * `text-contrast-floor.test.ts` already reads these files as markup and holds
 * the AA floor on them, and the pages are server components whose value is
 * their *content*. Rendering them would prove React works. Reading them proves
 * the claims are still there.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_CANCEL_PATH } from '@tappet/core/account-deletion';

import { CONTACT_EMAIL, LAST_UPDATED, OPERATOR } from '@/lib/legal';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * Collapse whitespace before matching prose.
 *
 * JSX wraps sentences at the print margin, so a claim that reads as one line
 * on screen is split across three in the source with indentation in between.
 * The first version of this file asserted against the raw text and two guards
 * failed on sentences that were present and correct — a test that goes red for
 * the formatter is a test people learn to re-run rather than read.
 */
const flat = (s: string) => s.replace(/\s+/g, ' ');

const privacy = read('app/privacy/page.tsx');
const terms = read('app/terms/page.tsx');
const privacyText = flat(privacy);
const termsText = flat(terms);

describe('the legal pages exist where the App Store listing will point', () => {
  /*
    The privacy policy URL is a mandatory App Store Connect field and 3.1.2
    requires a reachable terms link in the binary once subscriptions ship.
    Both were absent from this product entirely until 14 Aug — not missing
    links, missing pages — so "does the route exist" is a real assertion here
    rather than a tautology.
  */

  it('serve a privacy policy and terms of use', () => {
    expect(privacy).toContain('export default function PrivacyPolicyPage');
    expect(terms).toContain('export default function TermsPage');
  });
});

describe('claims the rest of the codebase has to keep true', () => {
  it('does not promise anything about tracking that the manifest contradicts', () => {
    /*
      The policy tells people there is no advertising identifier and no
      cross-app tracking. `app.json`'s privacy manifest is the machine-readable
      version of the same claim, and Apple cross-checks it.

      If a future commit flips tracking on, `privacy-manifest.test.ts` catches
      the manifest — and this catches the sentence, which is the half a
      reviewer reads and no manifest test covers.
    */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const appJson = require('../../apps/mobile/app.json');
    const manifest = appJson.expo.ios.privacyManifests;

    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);

    expect(privacyText).toMatch(/No advertising identifier/i);
    expect(privacyText).toMatch(/do not track you across other/i);
  });

  it('names the VIN disclosure, which is the one nobody expects', () => {
    /*
      `app/actions.ts` sends the VIN to NHTSA's public decoder. It is the least
      obvious thing that leaves the product, it is more identifying than "car
      details" suggests, and it is exactly the line an edit tightening the prose
      would drop as detail.
    */
    expect(privacy).toContain('NHTSA');
    expect(privacyText).toMatch(/VIN, it is sent to NHTSA/i);
  });

  it('describes deletion in the order deletion actually happens', () => {
    // `deleteAccount` purges storage *then* cascades the rows, because the
    // cascade removes the only reference to the objects. A policy describing
    // the reverse would be claiming a guarantee the code does not make.
    expect(privacyText).toMatch(/removes your uploaded files first/i);
  });
});

describe('the two documents cannot contradict the app', () => {
  it('sends people to the same place to cancel as the in-app notice', () => {
    /*
      The terms page imports this string from core rather than restating it, so
      this asserts the import was not later "simplified" into a literal that
      then drifted. Someone reading only one of the two surfaces must not be
      told a different way to stop being charged.
    */
    expect(SUBSCRIPTION_CANCEL_PATH).toBeTruthy();
    expect(terms).toContain('SUBSCRIPTION_CANCEL_PATH');
    expect(terms).not.toContain('Settings → your name → Subscriptions');
  });

  it('agrees with the app that deleting an account does not cancel billing', () => {
    // `subscriptionNotice` says this in the app. Both documents say it too,
    // because it is the one thing here that costs money to get wrong.
    expect(termsText).toMatch(/deleting your tappet account does not stop the/i);
    expect(privacyText).toMatch(/does not cancel an App Store subscription/i);
  });
});

describe('the training promise is tied to the evidence for it', () => {
  /*
    ── LEG-01 ─────────────────────────────────────────────────────────────────

    The Terms tell every reader "We do not use your content to train models."
    Nothing in this codebase can enforce that. It is true only while the Gemini
    key sits on a Cloud project with **active billing** — Google's terms make
    the API a Paid Service on exactly that condition, and unbilled they reserve
    the right to have humans read the input and output. The input here includes
    invoices carrying an owner's name and a shop's street address.

    So the claim's evidence lives outside the repo, in a billing console, and
    the only durable link between them is a dated note beside the client that
    uses the key. This asserts the two stay together: make the promise, carry
    the receipt.

    It deliberately does not assert the billing is *currently* live — no test
    can know that. It asserts that somebody wrote down when they last looked,
    which is the difference between an unverified claim and a stale one.
  */
  const gemini = read('lib/gemini.ts');

  it('the Terms still make the claim this is all about', () => {
    expect(flat(read('app/terms/page.tsx'))).toMatch(
      /We do not use your content to train models/i
    );
  });

  it('names the Cloud project the key belongs to', () => {
    // The project id, not just "it's billed" — a claim nobody can re-check is
    // the same as no claim, and this is the string you paste into the console.
    expect(gemini).toMatch(/gen-lang-client-\d{10}/);
  });

  it('records when the billing state was last verified', () => {
    expect(gemini).toMatch(/\b\d{1,2} \w+ 20\d{2}\b/);

    // Anti-vacuous: a file that merely mentions Google must not satisfy this.
    expect(/gen-lang-client-\d{10}/.test('const genAI = new GoogleGenAI({ apiKey });')).toBe(
      false
    );
  });
});

describe('who operates the service, and who to write to about it', () => {
  /*
    ── Both constants are now real, and the guard changed shape with them ──────

    This block was a countdown for five days. `OPERATOR` was filled in on 18 Aug
    — the Apple membership is **Individual, not Organization**, so the seller
    name is David's legal name whatever the entity question (Q2) decides — and
    `CONTACT_EMAIL` on 19 Aug. Both were bracketed placeholders rendering as
    literal body text on a page App Review reads, and both are now named.

    **What the assertions guard has inverted, and deliberately.** While the
    values were absent the risk was somebody replacing them with something that
    merely *read* finished. Now that they are present the risk is the reverse: a
    later edit quietly putting a placeholder, an empty string or an unmonitored
    address back. So each one asserts a real value and separately asserts that a
    placeholder would still be caught.

    ⚠ A green run here does not mean the public page is fixed. Nothing deploys
    from `main`; `tappet.southmoordigital.com` serves `web-live`, and these
    values reach a reader only after a promote.
  */

  it('names a real operator rather than a bracketed placeholder', () => {
    /*
      ⚠ Changed 30 Aug: the operator is **Southmoor Digital LLC**, not a person.

      The pin is the point. This value decides who a reader is contracting with
      and who is accountable for what the product says about their car, so it
      moves only when David says it moves — an entity appearing or disappearing
      here through a merge, a refactor or a find-and-replace is the failure this
      exact literal exists to stop.
    */
    expect(OPERATOR).toBe('Southmoor Digital LLC');

    // Anti-vacuous: this must still be able to catch a placeholder coming back.
    expect(OPERATOR).not.toMatch(/[[\]]|TBD|not yet|to be decided/i);
    expect(OPERATOR.trim().length).toBeGreaterThan(0);
  });

  it('every mailto in the product points at that address and no other', () => {
    /*
      ⚠ Found 30 Aug, and it had been live for months: the dashboard footer's
      "Feedback" link was `mailto:feedback@crewchief.app` — a domain nobody
      here owns. Mail sent from it went nowhere and told the sender nothing,
      which is the worst shape a support channel can have: it looks answered.

      It also survived the rename, because a find-and-replace on the product
      name would have produced `feedback@tappet.app` — the same dead address
      wearing the new name. An address is not copy.

      So the rule is one address, from one constant. This walks the tree rather
      than watching that one file, because the next invented address will be in
      a different component.
    */
    const walk = (dir: string, acc: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '__tests__') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (/\.tsx?$/.test(entry)) acc.push(full);
      }
      return acc;
    };

    const files = [...walk(join(root, 'app')), ...walk(join(root, 'components'))];
    expect(files.length).toBeGreaterThan(50); // a walker that finds nothing is not a clean tree

    /*
      ⚠ Comments are stripped first, and this file learned that the hard way:
      the paragraph above quotes the dead address, and the component that used
      to carry it explains itself the same way. Scanning raw text reported both
      explanations as the defect they document.

      Block comments are blanked rather than deleted so nothing else shifts.
    */
    const strip = (code: string) =>
      code
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\/.*$/gm, '');

    const literals = new Set<string>();
    for (const file of files) {
      // `Array.from`, not a spread or a for-of over the iterator: the root
      // tsconfig targets es5, so iterating one directly is TS2802. Same trap
      // the ramp guard hit, and the house pattern is this.
      for (const [, address] of Array.from(
        strip(readFileSync(file, 'utf8')).matchAll(/mailto:([^"'`\s]+)/g)
      )) {
        // `mailto:${CONTACT_EMAIL}?subject=…` is the shape that passes: the
        // address came from the constant. A literal is what this is looking for.
        if (address.startsWith('${')) continue;
        literals.add(address.split('?')[0]);
      }
    }

    expect(Array.from(literals)).toEqual([]);
  });

  it('the landing page — the App Store Support URL — shows the address and links it', () => {
    /*
      ⚠ 24 Sep, Guideline 1.5: the Support URL must carry contact information.
      It is `/` on the product host, and its footer linked Privacy and Terms
      and nobody. The policy pages named the address; the page Apple reads
      first did not. Both hosts render this file, so one assertion covers both.

      Comments are stripped, so an explanation that mentions the address (this
      file's own habit) cannot satisfy it.
    */
    const page = read('app/page.tsx')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const footer = page.slice(page.indexOf('<footer'), page.indexOf('</footer>'));
    expect(footer.length).toBeGreaterThan(0); // no footer found is not a pass

    // Linked, and shown as text rather than only in the href: the listing's
    // reader reads it.
    const carriesContact = (markup: string) =>
      markup.includes('href={`mailto:${CONTACT_EMAIL}`}') && />\s*\{CONTACT_EMAIL\}\s*</.test(markup);
    expect(carriesContact(footer)).toBe(true);

    // Anti-vacuous: the same predicate refuses the footer as it was on 23 Sep,
    // and a link whose visible text hides the address.
    expect(
      carriesContact('<p>Tappet — Southmoor Digital · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>')
    ).toBe(false);
    expect(carriesContact('<a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>')).toBe(false);
  });

  it('names a contact address somebody actually reads', () => {
    /*
      ⚠ Moved 30 Aug: `crewchief.support@gmail.com` → `support@southmoordigital.com`,
      iCloud Mail on the company's own domain, verified receiving from an
      external sender that day.

      The old address was a considered choice rather than a compromise, and its
      reasoning still governs: a *product* address rather than
      `support@davidmasterson.co`, which carries David's name and gives back
      most of what the separation was for. What changed is that the entity and
      the domain that make a better answer possible now exist.

      The part that could not wait is the name. The rename went through the copy
      on 30 Aug, and this string would otherwise have been the last "crewchief"
      rendering on a public legal page — under a policy signed by an LLC.
    */
    expect(CONTACT_EMAIL).toBe('support@southmoordigital.com');

    // It has to be on the operator's domain, or the policy and the address are
    // signed by different parties. Asserted as a property, not just a literal.
    expect(CONTACT_EMAIL.endsWith('@southmoordigital.com')).toBe(true);
    expect(CONTACT_EMAIL).not.toMatch(/gmail|crewchief/i);
  });

  it('would still catch a placeholder or an unreachable address coming back', () => {
    /*
      Anti-vacuous, and the direction of the risk has flipped. While these were
      empty the hazard was a plausible-looking fake; now that they are filled it
      is a regression putting a bracket, a blank or a bare word back — none of
      which would look wrong in a diff.
    */
    expect(CONTACT_EMAIL).not.toMatch(/[[\]]|TBD|not yet|to be decided/i);
    expect(CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it('interpolates both constants rather than restating them in the pages', () => {
    /*
      Asserting the sources were found at all. Without this, both guards above
      keep passing while a page renders a hardcoded literal beside them — the
      constant would be correct and the published document wrong, which is the
      exact defect `lib/legal.ts` centralises these to prevent.
    */
    for (const [name, source] of [['privacy', privacy], ['terms', terms]] as const) {
      expect(`${name}: ${source.includes('{OPERATOR}')}`).toBe(`${name}: true`);
      expect(`${name}: ${source.includes('{CONTACT_EMAIL}')}`).toBe(`${name}: true`);
    }
  });

  it('carries a last-updated date no earlier than the operator being named', () => {
    /*
      `LAST_UPDATED` is the date the content changed *for a reader*, which is
      the ship date rather than the commit date — nothing deploys from `main`,
      so a date moved on 18 August described a change nobody could see. Operator
      and contact reach the public page together on 19 August.

      Pinned to an exact literal rather than a floor, deliberately. A floor
      would let any edit drag the date forward, including a styling one, and the
      file's own docblock is explicit that a date which moves for a CSS change
      teaches people the date means nothing. An exact pin makes every bump a
      line somebody had to write on purpose.

      ⚠ Moved to 30 August with the operator becoming Southmoor Digital LLC.
      Unlike the 19 August bump, this one was written ahead of its own promote —
      and that promote then happened. Checked 6 Sep: the live policy serves
      "Southmoor Digital LLC" and names David nowhere.

      ⚠ Moved to 13 September when that company was formed (Colorado SOS
      `20268142644`, EIN issued the same morning) — the claim the pages had
      carried for two weeks became true, which is the substance changing for a
      reader (Cowork's ruling, 14 Sep). Promoted the same evening, MT.

      ⚠ Moved to 1 October with audit 360's legal round: the policy now names
      Expo, every Gemini path, crash reports, the quote check and the
      transaction id kept after deletion — substance for a reader. Written
      ahead of its promote, like 30 Aug; if the promote lands on a later day,
      move it to that day.
    */
    expect(LAST_UPDATED).toBe('1 October 2026');
    expect(new Date(LAST_UPDATED).getTime()).not.toBeNaN();
    expect(new Date(LAST_UPDATED).getTime()).toBeGreaterThanOrEqual(
      new Date('14 August 2026').getTime(),
    );
  });
});

/**
 * ── Audit 360, legal round 01 (1 Oct) — what the policy said less than ────────
 *
 * Each claim below was checked against the code that makes it true, and each
 * anchor is the code, not the page: if the code stops doing the thing, the
 * sentence is what has to go.
 */
describe('the policy names every path and every processor (LEGAL-1, 4, 5, 6)', () => {
  const src = (p: string) => read(p);
  const google = privacyText.slice(privacyText.indexOf('<strong className="text-white/90">Google</strong>'));

  it('found the Google bullet at all', () => {
    expect(google.length).toBeGreaterThan(200);
  });

  it.each([
    ['the health score', 'app/actions.ts', /export async function generateVehicleHealthSummary/, /the health score/],
    ['reading invoices', 'app/actions.ts', /export async function parseInvoiceLineItems/, /reading invoices/],
    ['the quote check', 'lib/quote-check.ts', /inlineData: \{ mimeType, data: fileBase64 \}/, /the quote check/],
    ['web advisor attachments', 'app/actions.ts', /data: buffer\.toString\('base64'\)/, /document you attach to an advisor question on the website/],
    ['quote requests and the ZIP', 'app/actions.ts', /Location Zip Code: \$\{zipCode\}/, /the ZIP code you typed/],
  ])('Google: %s', (_name, file, code, sentence) => {
    expect(src(file)).toMatch(code);
    expect(google).toMatch(sentence);
  });

  it('names Expo, because every push goes through exp.host', () => {
    expect(src('lib/push-send.ts')).toMatch(/exp\.host/);
    expect(privacyText).toMatch(/<strong className="text-white\/90">Expo<\/strong>/);
  });

  it('says crash reports leave the device, and to whom', () => {
    expect(src('apps/mobile/src/api/client-errors.ts')).toMatch(/'\/client-errors'/);
    expect(privacyText).toMatch(/Crash reports\.<\/strong> If the app fails unexpectedly/);
    // The third-party claim stays true: no crash SDK (privacy-manifest.test.ts).
    expect(privacyText).toMatch(/No third-party analytics, attribution or crash-reporting service/);
  });

  it('says the quote check sends the estimate to Google and keeps the answer, not the photo', () => {
    expect(privacyText).toMatch(/photo or text of your estimate is sent to Google/);
    expect(privacyText).toMatch(/We do not keep the photo/);
    expect(src('lib/quote-check.ts')).toMatch(/export const UNCLAIMED_SCAN_TTL_DAYS = 30;/);
  });

  it('discloses what survives a deletion: the transaction id, and the id in the log line', () => {
    expect(src('lib/account-data.ts')).toMatch(/from\('orphaned_apple_subscriptions'\)\.upsert/);
    expect(privacyText).toMatch(/keep Apple&rsquo;s transaction identifier/);
    expect(src('lib/account-data.ts')).toMatch(/'ACCOUNT_DELETE:COMPLETE', 'Account deleted', \{\s*userId,/);
    expect(privacyText).toMatch(/its internal account identifier/);
    expect(privacyText).not.toMatch(/except the operational line described below/);
  });

  /*
    LEGAL-21 (1 Oct): log lines carrying an account id were disclosed one at a
    time, and new ones (PUSH_TOKEN:CLAIMED, two ids) arrived undisclosed. The
    policy now states the rule; this holds the rule true of the code.
  */
  describe('operational logs, as a rule rather than a list (LEGAL-21)', () => {
    const serverSources = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : serverSources(rel);
        return /\.tsx?$/.test(entry.name) ? [rel] : [];
      });
    const sources = [...serverSources('app'), ...serverSources('lib')];
    /*
      A logger call's context object, read to its closing parenthesis on the
      next few lines. LEGAL-22: and a `console.*` call — the rule is about the
      log, not the helper that writes to it.
    */
    const LOG_CALL = /(?:logger|console)\.(?:info|warn|error|debug|log)\([\s\S]{0,400}?\);/g;
    const logCalls = sources.flatMap((file) => src(file).match(LOG_CALL) ?? []);

    it('found the log lines that carry an account id', () => {
      expect(sources.length).toBeGreaterThan(100);
      expect(logCalls.filter((call) => /userId/.test(call)).length).toBeGreaterThan(5);
      expect(src('app/api/v1/push-token/route.ts')).toMatch(/displacedUserId/);
    });

    it('states the rule: an internal identifier may be logged, a name or email is not', () => {
      expect(flat(privacyText)).toMatch(/Operational logs\.<\/strong> Our server keeps a running log/);
      expect(flat(privacyText)).toMatch(/may carry your account&rsquo;s internal identifier/);
      expect(flat(privacyText)).toMatch(/we do not write your name or email to it/);
      expect(flat(privacyText)).toMatch(/not removed when you delete your account/);
    });

    it('keeps the rule true: no log line carries an email or a name', () => {
      const offenders = logCalls.filter((call) => /\b(email|displayName|display_name|fullName|full_name)\s*[:,}]/.test(call));
      expect(offenders).toEqual([]);
    });

    it('can still see an email in a log line (anti-vacuous)', () => {
      const shipped = `logger.warn('X', 'y', { userId, email: user.email });`;
      expect(shipped.match(LOG_CALL)?.some((call) => /\b(email|displayName|display_name)\s*[:,}]/.test(call))).toBe(true);
      // LEGAL-22: written through console instead, it is still seen.
      const viaConsole = `console.error('[X] failed', { userId, email: user.email });`;
      expect(viaConsole.match(LOG_CALL)?.some((call) => /\b(email|displayName|display_name)\s*[:,}]/.test(call))).toBe(true);
    });

    it('found console lines as well as logger lines', () => {
      expect(logCalls.filter((call) => call.startsWith('console.')).length).toBeGreaterThan(20);
      expect(logCalls.filter((call) => call.startsWith('logger.')).length).toBeGreaterThan(100);
    });

    /*
      LEGAL-22: the quote path's failure lines wrote the model's raw reply
      (and so the owner's typed note) to the log. They carry ids and lengths
      now; a value written from the owner's words is never an argument.
    */
    describe('the quote path logs lengths, not what the owner wrote (LEGAL-22)', () => {
      const actions = src('app/actions.ts');
      const body = (name: string) => {
        const start = actions.indexOf(`async function ${name}(`);
        expect(start).toBeGreaterThan(-1);
        const next = actions.indexOf('\nasync function ', start + 10);
        const nextExport = actions.indexOf('\nexport ', start + 10);
        return actions.slice(start, Math.min(...[next, nextExport].filter((i) => i > -1)));
      };
      // A raw value as a log argument: `, result)`, `, emailDraft)`, `{ estimateData }`, `, error)`.
      const RAW = /[,{]\s*(result|emailDraft|emailText|text|estimateData|additionalNotes|apiError|error|item)\s*[,})]/;
      const calls = (name: string) => body(name).match(LOG_CALL) ?? [];

      it.each(['estimateCosts', 'generateEmailDraft'])('%s writes no console line and no raw value', (name) => {
        expect(body(name).length).toBeGreaterThan(1000);
        expect(calls(name).length).toBeGreaterThan(3);
        expect(body(name)).not.toMatch(/console\./);
        expect(calls(name).filter((call) => RAW.test(call.replace(/^[^(]*\(\s*'[^']*'\s*/, '')))).toEqual([]);
      });

      it('can still see the lines that shipped (anti-vacuous)', () => {
        const shipped = [
          `console.error('[Generate Email Draft] Email draft too short or empty:', emailDraft);`,
          `console.error('[Generate Email Draft] Full error object:', error);`,
          `logger.error('ESTIMATE:INVALID_STRUCTURE', new Error('x'), { estimateData });`,
        ];
        for (const line of shipped) {
          const [call] = line.match(LOG_CALL) ?? [];
          expect(call).toBeDefined();
          expect(RAW.test((call ?? '').replace(/^[^(]*\(\s*'[^']*'\s*/, ''))).toBe(true);
        }
      });
    });
  });

  it('can still detect the sentences that shipped', () => {
    // Anti-vacuous: the 13 Sep text, which every assertion above must reject.
    const shipped =
      'Google — the advisor and the dossier are generated by Google&rsquo;s Gemini models. ' +
      'Apple — delivers push notifications. nothing is kept after it closes except the operational line described below';
    expect(shipped).not.toMatch(/the health score/);
    expect(shipped).not.toMatch(/Expo/);
    expect(shipped).toMatch(/except the operational line described below/);
  });
});

describe('the Terms carry an age line, and the web asks at the door (LEGAL-10)', () => {
  it('sets a minimum age consistent with the policy', () => {
    expect(termsText).toMatch(/You must be at least 13 to use Tappet/);
    expect(privacyText).toMatch(/not directed at children under 13/);
  });

  it.each([
    ['web sign-up', 'app/signup/page.tsx'],
    ['web sign-in', 'app/login/page.tsx'],
    ['phone sign-in', 'apps/mobile/src/screens/SignInScreen.tsx'],
  ])('%s links both documents', (_name, file) => {
    const body = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).toMatch(/\/terms/);
    expect(body).toMatch(/\/privacy/);
  });

  it('web sign-up says creating an account is agreeing', () => {
    expect(flat(read('app/signup/page.tsx'))).toMatch(/By creating an account you agree to the/);
  });

  it('can still detect a door with no links', () => {
    const shipped = '<Button type="submit">Create Account</Button></form>';
    expect(shipped).not.toMatch(/\/terms/);
  });
});

describe('the front door says where the estimate goes, before the press (LEGAL-4)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FRONT_DOOR_AI_NOTICE } = require('@tappet/core/quote-check');
  // Comments anchored to a line start: `accept="image/*"` opens an unanchored `/*` (text-contrast-floor.test.ts).
  const page = read('app/check/page.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\*[\s\S]*?\*\//gm, '');
  const route = read('app/api/v1/front-door/check/route.ts');

  it('names Google and says the photo is not kept', () => {
    expect(FRONT_DOOR_AI_NOTICE).toMatch(/Google’s Gemini/);
    expect(FRONT_DOOR_AI_NOTICE).toMatch(/We do not keep the photo/);
  });

  it('renders the notice and a privacy link under the button that sends, before any answer', () => {
    const notice = page.indexOf('{FRONT_DOOR_AI_NOTICE}');
    const button = page.indexOf('Check this quote');
    const answer = page.indexOf('{answer && <AnswerCard');
    expect(button).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(button);
    expect(answer).toBeGreaterThan(notice);
    expect(page.slice(notice, notice + 400)).toMatch(/href="\/privacy"/);
    expect(page).toMatch(/adviceDisclosure\('estimate'\)/);
  });

  it('is true of the route: the upload is never written anywhere', () => {
    // Anchored to the code: if the route ever stores the image, "We do not keep the photo" must go.
    expect(route).toMatch(/fileBase64 = Buffer\.from\(await file\.arrayBuffer\(\)\)/);
    expect(route).not.toMatch(/\.storage\b|\.upload\(/);
    expect(read('lib/quote-check.ts')).not.toMatch(/\.storage\b|\.upload\(|fileBase64,?\s*\}\)\s*;?\s*$/m);
  });

  it('can still detect a page that says nothing', () => {
    const shipped = "Photograph the estimate. We'll tell you what that job typically costs. No account, no sign-up.";
    expect(shipped).not.toMatch(/Google/);
  });
});

/**
 * ── Audit 360, legal round 02 (1 Oct) ─────────────────────────────────────────
 *
 * Three paths the Google bullet named without saying what they send: the
 * performance figures (every service line on the car), the quote request
 * (the mileage and the owner's note as well as the ZIP), and a modification's
 * guidance (the owner's goal and what they wrote they want out of the car),
 * under a sentence saying the research uses only the year, make and model.
 * Anchored to the prompt text that makes each sentence true.
 */
describe('the Google bullet says what the figures, the quote and a mod card send (LEGAL-11, 12, 14)', () => {
  const start = privacyText.indexOf('<strong className="text-white/90">Google</strong>');
  const bullet = privacyText.slice(start, privacyText.indexOf('</li>', start)).replace(/\s+/g, ' ');
  const src = (p: string) => read(p);

  it('found the bullet, and only the bullet', () => {
    expect(start).toBeGreaterThan(0);
    expect(bullet.length).toBeGreaterThan(400);
    expect(bullet).not.toMatch(/Expo/);
  });

  it.each([
    ['performance figures', 'lib/performance-stats.ts', /from\('maintenance_line_items'\)[\s\S]*Service history:/, /Performance figures send the line items of your car&rsquo;s service history/],
    ['quote requests', 'app/actions.ts', /Current Mileage:[\s\S]*Location Zip Code: \$\{zipCode\}[\s\S]*Additional Notes from Owner/, /A quote request sends the work listed, the mileage, the ZIP code you typed and any note you add\./],
    ['modification guidance', 'app/actions.ts', /Owner's Performance Goal: \$\{performanceGoal\.toUpperCase\(\)\}/, /guidance on a modification also sends the performance goal you chose for the car\./],
    ['the advisor', 'packages/core/src/prompts.ts', /- Ownership Goal: \$\{context\.objective\}/, /the advisor also receives what you wrote about how you use the car and what you want out of it\./],
  ])('%s', (_name, file, code, sentence) => {
    expect(src(file)).toMatch(code);
    expect(bullet).toMatch(sentence);
  });

  it('can still detect the round-01 bullet', () => {
    const shipped =
      'A quote request sends the work listed and the ZIP code you typed. The research and the pictures use only the year, make and model.';
    expect(shipped).not.toMatch(/Performance figures send/);
    expect(shipped).not.toMatch(/any note you add/);
    expect(shipped).toMatch(/use only the year, make and model\.$/);
  });
});

/**
 * ── Audit 360, legal round 03 (1 Oct) — the calls the legal agent made ───────
 *
 * David: "let legal agent make those calls". Each sentence below is tied to
 * the constant or the code that makes it true; the reasons are in
 * `design-loop/audit-360/held-for-david.md` → "legal — decided".
 */
describe('the calls the legal agent made (round 03)', () => {
  const { GOVERNING_STATE, APPLE_STANDARD_EULA_URL } = require('@/lib/legal');
  const { RECALL_ALERTS_AFTER_LAPSE } = require('@tappet/core/access');

  it('LEGAL-14: the policy no longer says a mod card sends what the owner wrote', () => {
    expect(privacyText).not.toMatch(/guidance on a modification also sends[^.]*what you wrote/);
    const actions = read('app/actions.ts');
    const fn = actions.slice(actions.indexOf('export async function generateModificationDetails'));
    const prompt = fn.slice(fn.indexOf('You are an expert automotive consultant'), fn.indexOf('Format as valid JSON only'));
    expect(prompt.length).toBeGreaterThan(400);
    expect(prompt).not.toMatch(/ownership_objective/);
  });

  it('governing law and courts: Colorado, from the constant, with a small-claims carve-out', () => {
    expect(GOVERNING_STATE).toBe('Colorado');
    expect(termsText).toMatch(/governed by the laws of the State of \{GOVERNING_STATE\}/);
    expect(termsText).toMatch(/United States District Court for the District of\{' '\} \{GOVERNING_STATE\}/);
    expect(termsText).toMatch(/you and \{OPERATOR\} agree to their jurisdiction/);
    expect(termsText).toMatch(/small-claims court where you live/);
    expect(termsText).toMatch(/does not allow to be waived/);
  });

  it('no arbitration and no class waiver — a decision, so a change to it is deliberate', () => {
    // What renders, not what the comments discuss (CLAUDE.md §5).
    const shown = termsText.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(shown).toMatch(/LegalSection>Disputes</);
    expect(shown).not.toMatch(/arbitrat/i);
    expect(shown).not.toMatch(/class action/i);
    // And no county was invented (lib/legal.ts: none has been given).
    expect(shown).not.toMatch(/County/);
  });

  it('age: 13 to use it, and a parent or guardian for anyone under 18', () => {
    expect(termsText).toMatch(/You must be at least 13 to use Tappet/);
    expect(termsText).toMatch(/If you are under 18, use it with a parent&rsquo;s or guardian&rsquo;s permission/);
    expect(termsText).toMatch(/including any subscription bought on your Apple Account/);
  });

  it('recall notifications may stop at lapse — tied to the constant that stops them', () => {
    /*
      If RECALL_ALERTS_AFTER_LAPSE flips to true, a lapsed account keeps its
      recall pushes and this sentence overstates what it loses: rewrite it.
    */
    expect(RECALL_ALERTS_AFTER_LAPSE).toBe(false);
    expect(termsText).toMatch(/Recall notifications are part of Tappet Plus and may stop when a subscription ends/);
    expect(read('packages/core/src/access.ts')).toMatch(/export const RECALL_ALERTS_AFTER_LAPSE = false;/);
  });

  it('LEGAL-17: the Terms the paywall opens name and link Apple’s standard EULA', () => {
    expect(APPLE_STANDARD_EULA_URL).toBe('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
    expect(termsText).toMatch(/href=\{APPLE_STANDARD_EULA_URL\}/);
    expect(termsText).toMatch(/standard Licensed Application End User License Agreement/);
    // The paywall's Terms link is the page that now carries it.
    const paywall = read('apps/mobile/src/screens/PaywallScreen.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(paywall).toMatch(/label="Terms of Use" path="\/terms"/);
  });

  it('both pages show an effective date', () => {
    expect(read('components/legal/LegalDocument.tsx')).toMatch(/>Effective \{LAST_UPDATED\}</);
  });

  it('can still detect Terms with none of it (anti-vacuous)', () => {
    const shipped = flat(
      '<LegalSection>Changes</LegalSection><p>You must be at least 13 to use Tappet. Keep your password to yourself.</p>'
    );
    expect(shipped).not.toMatch(/governed by the laws of the State of/);
    expect(shipped).not.toMatch(/under 18/);
    expect(shipped).not.toMatch(/APPLE_STANDARD_EULA_URL/);
  });
});

/*
 * Audit 360, round 04 polish (1 Oct).
 *
 * LEGAL-19: the Terms said Apple's EULA "applies alongside" them and gave no
 * rule for a conflict — the one place the two documents meet decided nothing.
 * UX-14: the legal pages had no <main> landmark while the landing page did.
 */
describe('the Terms say which document decides, and the pages carry a landmark', () => {
  const precedence = (text: string) =>
    /governs the app itself[^.]*where it and these terms differ about the app, it wins/.test(text) &&
    /These terms govern the service behind the app[^.]*these terms win/.test(text);

  it('LEGAL-19: the EULA decides about the app, these Terms about the service', () => {
    expect(precedence(termsText)).toBe(true);
    expect(termsText).not.toMatch(/applies alongside these terms/);
  });

  it('LEGAL-19: can still detect the sentence that shipped (anti-vacuous)', () => {
    const shipped = flat(
      'End User License Agreement </a> , which applies alongside these terms. These terms cover the service behind the app: your account, what you upload and your subscription.'
    );
    expect(precedence(shipped)).toBe(false);
  });

  it('UX-14: the document sits in a <main>, opened and closed', () => {
    const shell = read('components/legal/LegalDocument.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(shell).toMatch(/<main className="mx-auto w-full max-w-2xl/);
    expect(shell).toMatch(/<\/main>/);
    // Both pages use the shell, so both get it.
    expect(privacy).toMatch(/<LegalDocument/);
    expect(terms).toMatch(/<LegalDocument/);
  });

  it('UX-14: can still detect a shell with no landmark (anti-vacuous)', () => {
    const shipped = '<div className="min-h-screen"><div className="mx-auto w-full max-w-2xl px-5 py-14"><h1>x</h1></div></div>';
    expect(shipped).not.toMatch(/<main className="mx-auto w-full max-w-2xl/);
  });
});
