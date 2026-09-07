/**
 * Which of the two Tappet sites this build is.
 *
 * One codebase, two Netlify projects, two hostnames:
 *
 *   tappet.southmoordigital.com     web-live    the product. App Store
 *                                                 listing URL, and the origin
 *                                                 every installed app calls
 *   tappet-demo.davidmasterson.co   demo-live   the portfolio piece
 *
 * Until 20 Aug nothing in the application knew the difference, and that was
 * fine while there was only one site — which there was, and it was the demo.
 * The 17 Aug hostname split made it wrong on one of the two and nothing
 * announced the change: `DemoBanner` kept rendering unconditionally, so the URL
 * App Review reads carried a **"PORTFOLIO DEMO · Shared demo garage"** masthead
 * above the privacy policy.
 *
 * ── ⚠ Unset means "the product", and that direction is the whole point ──────
 *
 * The variable enables the demo framing rather than disabling it, so a missing
 * or misspelled value degrades toward *the product site being unbranded as a
 * demo* — never toward the App Store's hostname claiming to be one.
 *
 * The two failures are not symmetrical, which is why this is not a coin toss:
 *
 *   forgotten on the demo    the portfolio piece loses its byline. Cosmetic,
 *                            and David looks at that page — he would notice
 *                            within a day.
 *   forgotten on the product Apple reads a privacy policy under a masthead
 *                            calling the service a demo. Invisible to us, and
 *                            discovered by a reviewer.
 *
 * Same rule as `CRON_SECRET` refusing to run unconfigured and
 * `verifyAppleSignedPayload` refusing an empty trust anchor: the unconfigured
 * state must be the safe one, because the realistic mistake is a deploy that
 * missed a variable.
 *
 * It also means **only one site needs configuring**, which sidesteps
 * `CLAUDE.md` §7 entirely — there is no second place to forget.
 *
 * ── Read on the server, and read at build time for static routes ────────────
 *
 * `app/layout.tsx` is a server component, so this never reaches the client
 * bundle and needs no `NEXT_PUBLIC_` prefix. For statically generated routes
 * Next resolves it during the build rather than per request — which is correct
 * here, because the two sites build separately with their own environments, but
 * it does mean **changing the value requires a redeploy, not a restart**.
 */

/** The literal that enables the demo framing. Nothing else does. */
const ENABLED = 'true';

/**
 * Whether this build should present itself as the portfolio demo.
 *
 * Takes the value rather than reading `process.env` so the rule is testable
 * without mutating the environment — the same shape as `readPinnedRoots`.
 *
 * Only the exact string `'true'` enables it. `'false'`, `'0'`, `'no'`, `''` and
 * anything else resolve to the product site, deliberately: a variable someone
 * set to `false` meaning to switch the banner off must not switch it on because
 * a non-empty string looked truthy.
 */
/*
  ── ⚠ Renamed twice, so three names are read ────────────────────────────────

  Call sites read `TAPPET_DEMO_SITE ?? WELLKEPT_DEMO_SITE ?? CREWCHIEF_DEMO_SITE`
  — 6 Sep added the second rung, 7 Sep the third. This is a transition, and it is
  deliberate rather than untidy.

  The variable is **not** in `netlify.toml` — it is set per-site in each Netlify
  project's own dashboard, so code and configuration move on different clocks and
  nothing in a deploy makes them move together. That is CLAUDE.md §7's "secrets
  are usually needed in two places, and setting one looks done", and here the
  half-done state is invisible: unset means "this is the product", so a demo
  whose variable no longer matches the name the code reads does not error, it
  quietly serves recruiters the product's signup call to action. That exact
  failure is what `promote-demo.mjs` checks the live demo host for.

  Reading every name removes the ordering requirement entirely: the dashboard can
  be renamed before this ships, after it ships, or never, and the demo keeps its
  framing throughout.

  ⚠ **The chain grew rather than moved, and that was the choice.** Replacing the
  name outright is what a find-and-replace does, and it would have pointed the
  code at a variable no Netlify dashboard sets — silently, because unset is a
  valid state here. The rung stays until something has proved it unreachable.

  ⚠ **These are the thing to delete, not to keep.** Each is only correct while
  that name might still be live. Once `TAPPET_DEMO_SITE` is set on `demo-live`
  and confirmed by `verify-demo.mjs` against the running host, drop the rungs
  beneath it at every call site — oldest first, one at a time — because an
  alternative that has stopped being reachable is the same rot as an exemption
  that has stopped being true. Three deep is the most this should ever get: a
  fourth would mean nobody is deleting them.
*/
export function isDemoSite(value: string | undefined | null): boolean {
  return value?.trim().toLowerCase() === ENABLED;
}

/**
 * ── The share card, which is the other thing that differs per site ──────────
 *
 * Found 20 Aug by Cowork, and it had been wrong on the App Store's hostname
 * since the 17 Aug split. The product host — `crewchief.davidmasterson.co`
 * until the 6 Sep rename — was serving:
 *
 *     og:url          https://crewchief-demo.davidmasterson.co/
 *     og:description  "…Live demo with sample vehicles — no signup required."
 *     og:image        https://crewchief-demo.davidmasterson.co/opengraph-image
 *
 * The **visible** page was correct throughout, which is exactly why it survived
 * every visual pass and both promotes. Metadata is the part of a page nobody
 * looks at and everybody else reads.
 *
 * Two costs, and the first is the expensive one. Apple reads this hostname, and
 * a support URL whose preview calls the product a "live demo … no signup
 * required" argues the Guideline 4.2 case against us in our own words. The
 * second: every share of the product link previewed as — and navigated to — the
 * recruiter demo.
 *
 * Derived from the same flag as the masthead rather than a second variable.
 * One fact about a deployment should have one source, and this one is already
 * set correctly on both sites.
 */

export const DEMO_ORIGIN = 'https://tappet-demo.davidmasterson.co';
export const PRODUCT_ORIGIN = 'https://tappet.southmoordigital.com';

/** The origin a build should claim as its own in canonical and share tags. */
export function siteOrigin(demo: boolean): string {
  return demo ? DEMO_ORIGIN : PRODUCT_ORIGIN;
}

/**
 * The share-card description.
 *
 * ⚠ The product copy must not describe Tappet as a demo, and
 * `site-role.test.ts` asserts the word is absent. That is not stylistic: it is
 * the sentence Apple would quote back.
 *
 * The demo copy keeps "no signup required" because on that host it is true and
 * it is the whole invitation — a recruiter following a portfolio link should
 * know they can look without an account.
 */
export function shareDescription(demo: boolean): string {
  return demo
    ? 'An AI consultant that knows your car. Live demo with sample vehicles — no signup required.'
    : 'Track your vehicles, log service history, and get answers from an AI consultant that knows your car — its issues, schedule, and history.';
}
