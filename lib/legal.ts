/**
 * The two facts these documents cannot be written without, and one date.
 *
 * ── `OPERATOR` — an entity, from 30 Aug ────────────────────────────────────
 *
 * **Southmoor Digital LLC**, on David's instruction. This is a substance
 * change rather than a wording one: the party a reader is contracting with,
 * and the party accountable for what this product says about their car, is now
 * a company rather than a person. `LAST_UPDATED` moves with it — that is the
 * rule this file already carried, not a courtesy.
 *
 * The entry it replaces read `David Masterson` and its reasoning is kept
 * because it was right about the mechanism and wrong about the timing. It
 * argued the entity question "did not need answering", since the Apple
 * membership is Individual and the seller name is David's either way — and
 * then predicted that forming one "would change who operates the service,
 * which is a substance change that bumps `LAST_UPDATED` on its own terms".
 * That is what has happened.
 *
 * ⚠ **The Apple half has not moved with it.** The membership submitted 16 Aug
 * is Individual, so the App Store listing still names David personally. A
 * privacy policy naming an LLC beside a store listing naming a person is a
 * disagreement anybody can read in one sitting, and closing it means enrolling
 * as an Organization — D-U-N-S, a fresh enrolment, an app transfer. Nothing in
 * this file can fix that. It is recorded here because this is where the next
 * person will be standing when they notice.
 *
 * ⚠ **No company address appears in either document, and that is not an
 * oversight.** Nobody has given one, and what Colorado publishes is the
 * registered agent's address rather than a mailing address. Apple's DSA trader
 * flow demands one the moment EU distribution is on — US-only at launch is
 * what currently keeps that off the table. Naming an address is a decision,
 * not a lookup, so this file does not guess at one.
 *
 * ── `CONTACT_EMAIL` — settled 19 Aug, and unchanged by the entity ──────────
 *
 * The company does not change this and it was checked rather than assumed: the
 * argument below is about what a *customer* can reach, and a gmail an LLC
 * monitors is reachable in exactly the way a gmail a person monitors is. What
 * an entity does add is somewhere for `support@` to live once a domain exists.
 *
 * ── The domain arrived, so it moved: 30 Aug ────────────────────────────────
 *
 * **`support@southmoordigital.com`** — iCloud Mail on the company's own domain,
 * live and verified from an external sender on 30 Aug. It replaces
 * `crewchief.support@gmail.com`, which still receives and is no longer the
 * public identity.
 *
 * Three reasons, and the third is the one that made it urgent rather than
 * tidy. It carries the **operator's** name now that the operator is a company,
 * so the address and `OPERATOR` above agree instead of a policy signed by an
 * LLC pointing at a free mailbox named after a product that no longer exists.
 * It is not free-mail on a page App Review reads and scrapes permanently. And
 * it does not carry the old product name — which is the part that could not
 * wait, because the rename went through the copy on 30 Aug and this string
 * would have been the last "crewchief" on a public legal page.
 *
 * The argument this replaces is kept because it was right at the time and its
 * reasoning still governs the choice: a *product* address rather than
 * `support@davidmasterson.co`, which carries David's name and gives back most
 * of what the separation was for. Apple requires a support **URL** in the
 * listing and does not require the contact address to be domain-based, so the
 * free-mail form was a deliberate acceptance rather than a shortcut. What
 * changed is not that the old answer became wrong; it is that the entity and
 * the domain that made a better one possible now exist.
 *
 * ⚠ The property that actually matters on a privacy policy is unchanged and was
 * re-checked rather than assumed: the address is **verified receiving from an
 * outside sender**. An address that exists and is not answered is worse than a
 * free-mail one that is.
 *
 * These live here rather than in the pages because a privacy policy and terms
 * of service that disagree about who is operating the service is a defect that
 * reads as boilerplate, which is the one thing these documents cannot afford to
 * look like.
 *
 * `LAST_UPDATED` is shown to the reader and is the date the *content* changed.
 * Bump it when the substance changes, not when the styling does — a policy
 * whose date moves for a CSS edit teaches people the date means nothing.
 */

/**
 * The legal name the service is operated under — confirmed by David, 30 Aug.
 *
 * ── 13 Sep · the company exists ──────────────────────────────────────────────
 *
 * From 30 Aug to 13 Sep this named a company that had not been formed: the
 * Colorado registry had no such entity while the live privacy page named it
 * as operator, and `prepare/revert-operator-to-individual` stood ready to
 * put the person back. Southmoor Digital LLC was formed on 13 Sep 2026 —
 * Colorado SOS ID `20268142644`, Good Standing, filed 09:29 MT; EIN
 * `42-5051703` issued the same morning (Cowork's record, verified against
 * the primary sources). The name is true now and the revert branch is
 * deleted. The standing instruction — not to move this line to the LLC
 * until the filing was confirmed — is satisfied rather than violated: the
 * line moved early, and the filing caught up.
 *
 * `LAST_UPDATED` moves with it (Cowork's ruling, 14 Sep): for a reader the
 * document's claim about who operates the service became true on 13 Sep,
 * and the date says from which publication that is so.
 */
export const OPERATOR = 'Southmoor Digital LLC';

/**
 * A monitored address on the operator's own domain — confirmed by David, 30 Aug,
 * and verified receiving from an external sender the same day.
 */
export const CONTACT_EMAIL = 'support@southmoordigital.com';

/**
 * The date the substance of these documents last changed.
 *
 * ⚠ **This is a ship date, not an edit date**, and on 30 Aug it is a promise
 * rather than a fact. It read `18 August` once while the contact was still
 * bracketed, because that was the day the operator landed on `main` — and
 * nothing deploys from `main`, so no reader ever saw it. The 19 August value
 * was correct because the promote happened that day.
 *
 * ✅ **Published — checked 6 Sep against the live product host.** `/privacy`
 * serves "Southmoor Digital LLC" and contains no occurrence of "David
 * Masterson"; `/api/version` reports `web-live` built 5 Sep. The freeze this
 * paragraph was written under has ended, so `30 August 2026` is now a date a
 * reader can actually see.
 *
 * The instruction it carried — *if the promote slips past 30 August, move this
 * line to the day it runs* — is discharged rather than deleted: the promote did
 * not slip, so the literal stands as written.
 *
 * ⚠ It does not move again for the contact address changing later the same day.
 * Two substance changes shipping together are one publication, and a date that
 * ticks per edit rather than per publication is the same defect in the other
 * direction.
 *
 * ── 13 September · the operator exists ──────────────────────────────────────
 *
 * Moved once more, and for the same reason as 30 August: the substance of the
 * document is who operates the service. From 30 Aug to 13 Sep the pages named
 * a company that was not yet in the Colorado registry; on 13 Sep it was
 * formed, and this is the publication from which the named operator is the
 * operator that exists. Shipped the same evening (MT), so the literal is the
 * formation date as well as the ship date — a coincidence, not a rule: the
 * rule is still the day the promote runs.
 */
export const LAST_UPDATED = '13 September 2026';

/**
 * Where Apple sends someone to stop a subscription.
 *
 * Re-exported from core rather than restated. The terms and the in-app deletion
 * notice must send people to the same place — if they drift, one of them is
 * telling somebody the wrong way to stop being charged, and the one they read
 * is whichever they happened to open. Importing makes that impossible; a test
 * asserting two copies match only tells you afterwards.
 */
export { SUBSCRIPTION_CANCEL_PATH } from '@tappet/core/account-deletion';
