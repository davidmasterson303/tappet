/**
 * What the app has to say before a person's data reaches a third-party AI.
 *
 * ── ⚠ Guideline 5.1.2(i), amended November 2025 (LEG-02) ────────────────────
 *
 * Apple now requires **explicit permission** before personal data is shared
 * with a third-party AI — not disclosure, permission. Tappet has the
 * disclosure: the privacy policy names Google and says what goes there. The
 * only *consent* was sign-up wrap, which is not what the amendment asks for.
 *
 * ── Why the copy lives in `core` ────────────────────────────────────────────
 *
 * Because it has to be identical on both clients, and because this codebase's
 * most repeated defect is a capability that lives in one client and is silently
 * absent from the other. A consent sheet whose wording differs between the web
 * upload dialog and `InvoiceScanScreen` is two different consents, and only one
 * of them is the one somebody actually gave.
 *
 * ── ⚠ It names Google, and it names what leaves ─────────────────────────────
 *
 * "Third-party AI services" is the phrasing that satisfies nobody. The
 * amendment is about a person being able to decide, and deciding needs to know
 * **who** and **what** — so the copy says Google, and says the invoice carries
 * a shop's name and address as well as the owner's own car.
 *
 * That last part is the one somebody would not think of: an invoice is not only
 * their data. `LEG-09` is the same fact from the retention side.
 */

export interface AiConsentCopy {
  title: string;
  body: string;
  /** What the person is agreeing to. Short, and each item is a real fact. */
  points: readonly string[];
  accept: string;
  decline: string;
  /** What declining costs, said plainly so the choice is a real one. */
  declineNote: string;
}

/**
 * The storage key both clients keep the answer under.
 *
 * ── ⚠ Audit 360 (1 Oct) — one answer, so every sheet has to say so ─────────
 *
 * Both clients keep a single answer (`granted` / `declined`) and every AI
 * path reads it: on the phone the advisor and the invoice scan, on the web
 * the advisor and the upload dialog. So a "yes" to the advisor sheet —
 * which said "No photographs and no documents are sent from here" — opened
 * the invoice scan with no sheet at all, and the photograph went to Google
 * on a consent that had promised no photographs. And the health score,
 * which sends the same records at add-a-car, read no answer at all
 * (LEGAL-1).
 *
 * The fix is to make the one answer an honest one: every sheet now carries
 * `AI_CONSENT_SCOPE`, which names everything a yes covers, and the score
 * waits for the answer like the rest. Because the old sheets did not say
 * that, an answer given under them is not this answer — the key is
 * versioned, and everyone is asked once more under the new words. Asking
 * twice is a mild annoyance; proceeding on a consent somebody never saw is
 * the thing the amendment is about.
 */
export const AI_CONSENT_STORAGE_KEY = 'tappet.aiConsent.v2';
/** The key the 13 Sep–1 Oct sheets wrote. Read by nothing; removed on sign-out. */
export const AI_CONSENT_LEGACY_KEY = 'tappet.aiConsent';

/**
 * The point every sheet carries: what one "yes" covers.
 *
 * Named, not summarised — the photograph is the part somebody would not
 * expect a "yes" to the health score to reach.
 */
export const AI_CONSENT_SCOPE =
  'One answer covers all of Tappet’s AI: the health score and the advisor send this car’s records, and an invoice you scan or a file you attach is sent as it is, photograph and all.';

/**
 * The sheet shown before the first invoice scan.
 *
 * ⚠ This screen photographs a document carrying **a third party's name and
 * business address**, sometimes a VIN, and sends it to Google. It said nothing
 * about that at all.
 */
export const INVOICE_AI_CONSENT: AiConsentCopy = {
  title: 'Reading an invoice uses Google’s AI',
  body:
    'To pull the line items off a photograph, Tappet sends the image to Google’s Gemini service. Before that happens, it is worth knowing what is in it.',
  points: [
    'The photograph goes to Google, not just the text we read from it.',
    'An invoice usually carries the shop’s name and address as well as your car’s.',
    AI_CONSENT_SCOPE,
    'We do not publish it, and we do not sell it.',
  ],
  accept: 'Scan invoices',
  decline: 'Not now',
  declineNote:
    'You can still add services by hand, and everything else in Tappet works the same. Ask again any time from a scan.',
};

/**
 * The sheet shown before the first advisor question on the phone.
 *
 * ⚠ What goes to Google from here is this car's own records and the question
 * typed — the phone's advisor attaches nothing. It used to say so ("No
 * photographs and no documents are sent from here"), and the same sentence
 * was rendered by the web's advisor, which **does** attach documents
 * (LEGAL-2). The web has its own sheet below; this one now carries the scope
 * point instead, because a yes here is a yes to the scan too.
 */
export const ADVISOR_AI_CONSENT: AiConsentCopy = {
  title: 'The advisor is Google’s AI',
  body:
    'Tappet sends your question and this car’s records — its service history, its open recalls, the mileage you have recorded — to Google’s Gemini service to answer.',
  points: [
    'Your question and this car’s records go to Google.',
    AI_CONSENT_SCOPE,
    'We do not publish it, and we do not sell it.',
  ],
  accept: 'Ask the advisor',
  decline: 'Not now',
  declineNote:
    'Everything else in Tappet works the same without it. Ask again any time from this screen.',
};

/**
 * The web advisor's sheet. ⚠ Audit 360, LEGAL-2 (1 Oct).
 *
 * The web composer has an attach control (up to three files) and
 * `sendConsultantMessage` sends each one inline to Gemini. It rendered the
 * phone's sheet, which said no documents are sent — so a person who accepted
 * on that sentence and then attached a shop's diagnostic printout gave a
 * narrower consent than what happened.
 */
export const WEB_ADVISOR_AI_CONSENT: AiConsentCopy = {
  ...ADVISOR_AI_CONSENT,
  body:
    'Tappet sends your question, anything you attach to it, and this car’s records — its service history, its open recalls, the mileage you have recorded — to Google’s Gemini service to answer.',
  points: [
    'Your question and this car’s records go to Google.',
    'A document or photo you attach goes too, as it is — with whatever names and addresses are on it.',
    AI_CONSENT_SCOPE,
    'We do not publish it, and we do not sell it.',
  ],
};

/**
 * The sheet shown before a car's first health score. ⚠ Audit 360, LEGAL-1.
 *
 * The score was the one path that sent an owner's records to Google with no
 * sheet in front of it: the phone posted `/health` the moment the research
 * landed after add-a-car, and the web generated it on the dashboard's first
 * view. Mileage, the service log and up to twelve invoice lines with their
 * shops' names and totals went into that prompt. It now waits for this.
 *
 * Declining leaves the score empty — "no score yet", never a zero — and the
 * car, its log and its recalls work the same.
 */
export const HEALTH_AI_CONSENT: AiConsentCopy = {
  title: 'The health score is written by Google’s AI',
  body:
    'To score this car, Tappet sends its records — the mileage you recorded, its service history, and the line items and shops on its invoices — to Google’s Gemini service.',
  points: [
    'This car’s records go to Google; no photographs are sent for the score.',
    AI_CONSENT_SCOPE,
    'We do not publish it, and we do not sell it.',
  ],
  accept: 'Score this car',
  decline: 'Not now',
  declineNote:
    'Everything else about this car works the same without it — the score stays empty until you say yes. Ask again from this car’s research.',
};
