# The identifiers, and the half of the fact register the repo can prove

**This file is asserted, not maintained by hand.**
`lib/__tests__/identifiers-match-the-register.test.ts` reads every value below
out of the artefact that actually holds it and fails if this page disagrees.
Editing a value here without changing the code turns the suite red, which is the
entire point of the file existing.

---

## Why this is not a copy of the register

The fact register lives as a Cowork project file. On 6 Sep it grew a note at the
top recording its own flaw: it is the tiebreaker, and it lives where nothing can
check it — not the repo, not the shared folder, not disk. Every guard the
codebase gained that day applies to the code and none of it applied to the
document that adjudicates the code.

The first fix proposed was a copy in `docs/` the repo could diff against. Cowork
pushed it a step further, correctly: **a diff catches two copies disagreeing
with each other; an assertion catches a copy disagreeing with reality**, which
is the risk that matters.

So this is not a copy. A full copy would duplicate the entity, pricing and
App Store claims — none of which the repo can verify — and produce a second
unverifiable document, which is the drift the note was written about. This page
carries **only the rows a test can prove**, and the register keeps everything
else.

⚠ Where this page and the register disagree, **this one is right**, because this
one is asserted. Where this page and the *code* disagree, the code is right and
the suite says so.

---

## Identifiers

| What | Value | Held by |
|---|---|---|
| Apple bundle identifier | `com.southmoordigital.wellkept` | `apps/mobile/app.json` → `expo.ios.bundleIdentifier` |
| Android package | `com.southmoordigital.wellkept` | `apps/mobile/app.json` → `expo.android.package` |
| `APPLE_BUNDLE_ID` | `com.southmoordigital.wellkept` | `lib/apple-root-ca.ts` |
| IAP product id, monthly | `com.southmoordigital.wellkept.paid.monthly` | `packages/core/src/apple-subscription.ts` |
| IAP product id, annual | `com.southmoordigital.wellkept.paid.annual` | `packages/core/src/apple-subscription.ts` |
| Expo slug | `wellkept` | `apps/mobile/app.json` → `expo.slug` |
| URL scheme | `wellkept` | `apps/mobile/app.json` → `expo.scheme`, and three more — see below |
| Mobile API base | `https://wellkept.southmoordigital.com` | `apps/mobile/app.json` → `expo.extra.apiBaseUrl` |
| `PRODUCT_ORIGIN` | `https://wellkept.southmoordigital.com` | `lib/site-role.ts` |
| `DEMO_ORIGIN` | `https://wellkept-demo.davidmasterson.co` | `lib/site-role.ts` |
| Git remote | `git@github.com:davidmasterson303/wellkept.git` | `.git/config` |

⚠ The bundle id and both product ids become **permanent** the moment an App
Store Connect record exists. None does yet, which is the only reason the 6 Sep
rename was cheap.

The scheme is declared in four places across three packages;
`one-scheme-everywhere.test.ts` holds them together, and this page only pins the
value they must agree on.

## Names that must not come back

Superseded on 6 Sep, with no legitimate reason to appear in this file again:

- `co.davidmasterson.crewchief` — the old bundle id, and the product ids built on it
- `crewchief://` — the old scheme

⚠ Deliberately **not** on that list, because each is still live and correct:
`CREWCHIEF_DEMO_SITE` (the fallback half, until Netlify is renamed),
`crewchief.davidmasterson.co` and `crewchief-demo.davidmasterson.co` (both still
serving), and `crewchief-demo.netlify.app` (the Bolt stub the demo CNAMEs still
point at). A blanket ban on the old name would fail on all four and get switched
off, which is how a guard dies.
