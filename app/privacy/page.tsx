import type { Metadata } from 'next';

import LegalDocument, { LegalSection } from '@/components/legal/LegalDocument';
import { CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { TRADEMARK_NOTICE } from '@tappet/core/brand';

export const metadata: Metadata = {
  title: 'Privacy Policy · Tappet',
  description: 'What Tappet collects, why, who else sees it, and how to delete it.',
};

/**
 * ⚠ **This is a draft and has not been reviewed by a lawyer.** It is written to
 * be *accurate* — every claim below was checked against the live database, the
 * tree, or `APP_STORE_PRIVACY_ANSWERS_2026-08-12.md`, which was itself derived
 * by audit rather than from a planning document. Accuracy is the part a lawyer
 * cannot supply and the part that is expensive to fix later; the legal framing
 * is the part they can.
 *
 * ── Why it exists now ───────────────────────────────────────────────────────
 *
 * App Store Connect requires a privacy policy URL as a mandatory listing field,
 * and guideline 3.1.2 requires a functional in-app link once auto-renewable
 * subscriptions ship (E8). Neither page existed anywhere in this product on
 * 14 Aug — not on web, not in the app — and the requirement was tracked only in
 * David's runbook, so it appeared in no effort total on the board.
 *
 * ── The specific claims that were checked, and how ──────────────────────────
 *
 * - **No tracking, no advertising, no analytics.** There is no IDFA, no
 *   `expo-tracking-transparency`, and no PostHog, Plausible, Mixpanel,
 *   Amplitude or Segment in the project. `privacy-manifest.test.ts` fails if a
 *   tracking SDK is added without the manifest changing with it.
 * - **The VIN leaves the product.** `app/actions.ts:139` sends it to NHTSA's
 *   public decoder. That is a real third-party disclosure and is named below
 *   rather than folded into "vehicle details".
 * - **Deletion purges storage before the row cascade** — `deleteAccount` in
 *   `lib/account-data.ts`, storage first so no object is orphaned by the
 *   cascade that would otherwise remove its only reference.
 *
 * ── What is still unsettled — the page is already published ─────────────────
 *
 * This heading used to read "before this is published", and that framing
 * expired on 17 Aug: the page went live on the product host — then
 * `crewchief.davidmasterson.co`, `tappet.southmoordigital.com` since the
 * 6 Sep rename — which is the privacy-policy URL in the App Store listing. It is not a draft waiting
 * for a launch date; it is what App Review reads.
 *
 * ✅ Both are named — `CONTACT_EMAIL` on 19 Aug, and `OPERATOR` twice: David
 * personally on 18 Aug, then **Southmoor Digital LLC on 30 Aug** once the
 * company existed. Nothing bracketed renders below any more, and `LAST_UPDATED`
 * moves with them because who operates a service and how to reach them is the
 * substance of the document rather than its trim. See `lib/legal.ts` for why
 * the contact is deliberately not a domain address.
 *
 * ✅ **The live page names the company — checked 6 Sep.** `/privacy` on the
 * product host serves "Southmoor Digital LLC" and no occurrence of "David
 * Masterson", so the document App Review reads is the current one. The 23 Aug
 * freeze this paragraph was written under has ended. The date in `lib/legal.ts`
 * is still written for the day it ships rather than the day it was edited, which
 * is exactly why it needed no moving.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="Tappet keeps records about your car so it can give you useful answers about it. It does not track you, does not show advertising, and does not sell anything about you to anybody."
    >
      <p>
        This policy describes what {OPERATOR} collects through the Tappet app and website, why,
        who else is involved, and how to get rid of it.
      </p>
      {/* 13 Sep: the trademark notice, beside the operator it names. */}
      <p>{TRADEMARK_NOTICE}</p>

      <LegalSection>What we collect</LegalSection>

      <p>
        <strong className="text-white/90">Your account.</strong> An email address and a password.
        The password is held by our authentication provider and is never visible to us. A display
        name is optional, free text, and never required — Tappet does not ask for your legal
        name.
      </p>

      <p>
        <strong className="text-white/90">Your vehicles.</strong> Year, make, model, trim, mileage,
        and — if you provide it — the VIN. On the website you can also type a ZIP code, which is
        used to fill in a quote request; the app has no ZIP field. Neither reads your location from
        your device; there is no location permission because nothing asks for one.
      </p>

      <p>
        <strong className="text-white/90">What you upload.</strong> Vehicle photographs and images of
        service invoices, plus the text extracted from those invoices. This is worth stating
        plainly rather than calling it &ldquo;photos&rdquo;: a repair invoice routinely carries your
        name, the shop&rsquo;s name and address, and sometimes the VIN. All of it is stored.
      </p>

      <p>
        <strong className="text-white/90">What you write.</strong> Conversations with the advisor,
        items on Needs, and notes on service records.
      </p>

      <p>
        <strong className="text-white/90">Notifications.</strong> If you allow them, a push token and
        a random identifier generated by the app on first install. That identifier is not a hardware
        ID, is not shared with anyone, cannot be matched to you in any other app, and disappears when
        you delete the app.
      </p>

      <p>
        <strong className="text-white/90">Use of the AI features.</strong> One record per request —
        what it was for, which model answered, and how many tokens it used. These exist to enforce a
        spending limit on each account. They are not product analytics, and there is no analytics
        service in this product.
      </p>

      {/*
        Audit 360, LEGAL-5 (1 Oct): the app's crash reports leave the device —
        to our own server, not a crash-reporting company — and nothing here
        said so. `app/api/v1/client-errors/route.ts` logs the fields named,
        attributed to the account when the report carries a sign-in (SEC-7).
        Netlify's log retention is not stated because nobody has read it.
      */}
      <p>
        <strong className="text-white/90">Crash reports.</strong> If the app fails unexpectedly,
        it sends our own server a short report — the error message, where in the app it happened,
        the app version and part of the technical trace — with your account&rsquo;s internal
        identifier if you are signed in. It is written to our server&rsquo;s log and to no one
        else.
      </p>

      <p>
        <strong className="text-white/90">Before you have an account.</strong> The public website
        records anonymous visit and scan events against a random browser identifier so we can tell
        whether the site works. There is no account attached, because there is not one yet.
      </p>

      {/*
        Audit 360, LEGAL-4 (1 Oct): the quote check sends a stranger's
        photographed estimate to Gemini, and this paragraph described only the
        visit events. `FRONT_DOOR_AI_NOTICE` (core/quote-check.ts) says the
        same on the page, with what each clause rests on.
      */}
      <p>
        <strong className="text-white/90">The quote check.</strong> If you use the &ldquo;Is this
        repair quote fair?&rdquo; page, the photo or text of your estimate is sent to Google&rsquo;s
        Gemini model to read it — and an estimate can carry your name, address, plate or VIN. We do
        not keep the photo. We keep the answer (the job, the car and the prices) against that random
        browser identifier, so it can be added to an account you create; answers nobody claims are
        deleted once they are more than 30 days old.
      </p>

      <LegalSection>What we do not collect</LegalSection>

      <p>
        No advertising identifier. No third-party analytics, attribution or crash-reporting service.
        No contacts, browsing history, or search history. No health data. No payment details of any
        kind — if you subscribe, Apple handles the payment and your card never reaches us. We do not
        track you across other companies&rsquo; apps or websites, and we do not sell or share your
        information with data brokers.
      </p>

      <LegalSection>Who else sees it</LegalSection>

      <p>
        Tappet is built on services that necessarily process your data to work:
      </p>

      {/*
        The bullets inherit their colour rather than carrying a dimmed one of
        their own. A separately tinted list marker reads as unclassifiable to
        the contrast scan, which cannot tell a bullet from body text — and the
        honest answer is that the rule needs no exemption here, because
        inheriting looks fine.
      */}
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong className="text-white/90">Supabase</strong> — database, file storage, and account
          authentication. Everything described above is stored here.
        </li>
        <li>
          <strong className="text-white/90">Netlify</strong> — hosting for the website and the app&rsquo;s
          backend.
        </li>
        {/*
          Audit 360, LEGAL-1/LEGAL-5 (1 Oct): this bullet named "the advisor and
          the dossier" while the health score, invoice reading, the quote check
          and the website advisor's attachments all reached Google too — and
          the photographs, which the consent sheet disclosed and this did not.
          Each path is a `generateContent` call in `app/actions.ts` or `lib/`.
          Round 02 (LEGAL-11, 12, 14): the performance figures send every
          `maintenance_line_items` description (`lib/performance-stats.ts`),
          the quote request the mileage and the owner's note as well as the
          ZIP (`estimateCosts`, `generateEmailDraft`), and modification
          guidance the owner's goal and `ownership_objective`
          (`generateModificationDetails`) — none of which this said.
          LEGAL-14 (1 Oct, the legal agent's call): the mod card no longer
          sends `ownership_objective`, so the clause naming it is gone; the
          advisor does send it (`- Ownership Goal:` in core/prompts.ts),
          behind the one answer, and now says so.
        */}
        <li>
          <strong className="text-white/90">Google</strong> — Tappet&rsquo;s AI features use
          Google&rsquo;s Gemini models: the health score, the advisor, reading invoices, quote
          requests on the website, the quote check, the research and pictures for your model, and
          performance figures for a modified car. For the health score and the advisor, Google receives your car&rsquo;s records — its
          mileage, service history, invoice line items and the shops named on them — and your
          question; the advisor also receives what you wrote about how you use the car and what
          you want out of it. For invoice reading and the quote check it receives the photograph itself, or
          the text you paste, which can show your name and address as well as the shop&rsquo;s; a
          document you attach to an advisor question on the website goes too. A quote request
          sends the work listed, the mileage, the ZIP code you typed and any note you add.
          Performance figures send the line items of your car&rsquo;s service history, to find
          the modifications among them. The research and the pictures use only the year, make and
          model; guidance on a modification also sends the performance goal you chose for the
          car.
        </li>
        <li>
          <strong className="text-white/90">Apple</strong> — handles billing if you subscribe, and
          delivers push notifications to your iPhone.
        </li>
        {/*
          Audit 360, LEGAL-5: the push token is an Expo token
          (`getExpoPushTokenAsync`) and every send goes to Expo's service
          (`lib/push-send.ts`, exp.host) carrying the car's name and the recall
          summary. Expo was named nowhere.
        */}
        <li>
          <strong className="text-white/90">Expo</strong> — the push service the app is built on. If
          you allow notifications, your device&rsquo;s push token and each notification&rsquo;s text —
          the car&rsquo;s name and, for a recall, its summary — pass through Expo on their way to
          Apple.
        </li>
        <li>
          <strong className="text-white/90">NHTSA</strong> — the US National Highway Traffic Safety
          Administration&rsquo;s public API. If you provide a VIN, it is sent to NHTSA to decode what
          the car actually is. Recall checks send the make, model and year only.
        </li>
      </ul>

      <LegalSection>Deleting your account</LegalSection>

      <p>
        We keep your vehicles, invoices, conversations and records for as long as your account
        exists, and delete them when you delete it. Nothing is kept on a timer while the account is
        open, and nothing is kept after it closes except the two things described below.
      </p>

      <p>
        You can delete your account from inside the app or the website, without asking anyone. It is
        immediate rather than scheduled.
      </p>

      <p>
        Deletion removes your uploaded files first, then your account and every record attached to
        it — vehicles, invoices, conversations, Needs, notifications and usage records. What
        survives is a line in our own operational log recording that an account was deleted, its
        internal account identifier, how many vehicles it held, and how many files were removed. It
        carries no name, email, vehicle or file, and exists so we can tell that deletion is working;
        if a step fails, the error line carries the same identifier.
      </p>

      {/*
        Audit 360, LEGAL-6 (1 Oct): this said nothing survives but the log
        line, while `recordOrphanedSubscription` (lib/account-data.ts) writes
        Apple's transaction id to `orphaned_apple_subscriptions` before the
        cascade and never expires it. The row is right; the sentence was wrong.
        Its columns (checked over PostgREST 1 Oct): transaction id, product,
        tier, expiry, environment, dates — no user id.
      */}
      <p>
        If you had an App Store subscription, we also keep Apple&rsquo;s transaction identifier for
        it, with the plan and its expiry date, so that a renewal or refund Apple tells us about after
        the account is gone can still be matched. It carries no name, email, device or vehicle.
      </p>

      <p>
        <strong className="text-white/90">Deleting your account does not cancel an App Store
        subscription.</strong> Only you can do that, through Apple — see the Terms.
      </p>

      <LegalSection>Children</LegalSection>

      <p>
        Tappet is not directed at children under 13 and we do not knowingly collect information
        from them.
      </p>

      <LegalSection>Changes</LegalSection>

      <p>
        If this policy changes in substance, the date at the top changes with it. That date does not
        move for corrections to wording or layout.
      </p>

      <LegalSection>Contact</LegalSection>

      <p>
        Questions about any of the above: <span className="text-white/90">{CONTACT_EMAIL}</span>.
      </p>
    </LegalDocument>
  );
}
