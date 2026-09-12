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
| Apple bundle identifier | `com.southmoordigital.tappet` | `apps/mobile/app.json` → `expo.ios.bundleIdentifier` |
| Android package | `com.southmoordigital.tappet` | `apps/mobile/app.json` → `expo.android.package` |
| `APPLE_BUNDLE_ID` | `com.southmoordigital.tappet` | `lib/apple-root-ca.ts` |
| IAP product id, monthly | `com.southmoordigital.tappet.paid.monthly` | `packages/core/src/apple-subscription.ts` |
| IAP product id, annual | `com.southmoordigital.tappet.paid.annual` | `packages/core/src/apple-subscription.ts` |
| Expo slug | `tappet` | `apps/mobile/app.json` → `expo.slug` |
| Expo project id | `a3f958b8-44f6-4164-9548-77971c68e435` | `apps/mobile/app.json` → `expo.extra.eas.projectId` |
| URL scheme | `tappet` | `apps/mobile/app.json` → `expo.scheme`, and three more — see below |
| Mobile API base | `https://tappet.southmoordigital.com` | `apps/mobile/app.json` → `expo.extra.apiBaseUrl` |
| `PRODUCT_ORIGIN` | `https://tappet.southmoordigital.com` | `lib/site-role.ts` |
| `DEMO_ORIGIN` | `https://tappet-demo.davidmasterson.co` | `lib/site-role.ts` |
| Git remote | `git@github.com:davidmasterson303/tappet.git` | `.git/config` |

⚠ **The Git remote row moved last, and the suite is what noticed.** `gh` is not
installed here and Homebrew cannot install it (CLAUDE.md §9), so the GitHub-side
rename was done outside this repo — and the moment the local remote followed,
`identifiers-match-the-register.test.ts` went red against this page while every
other row still agreed. That is the file working: one row went stale, and it was
found by a test rather than by a reader.

⚠ The bundle id and both product ids become **permanent** the moment an App
Store Connect record exists. None does yet, which is the only reason the 6 Sep
rename was cheap.

⚠ **The Expo slug was already permanent, and that was learned the expensive
way.** A project id is bound to one slug for the life of the project — Expo's
own reference says it cannot be changed, the dashboard offers no control, and
`eas init` only ever rewrites the *local* config to match the server, so the
obvious remedy silently reverts the rename instead of applying it. Renaming the
slug therefore cost a **replacement project**, and the pair below must move
together or every `eas build`, `eas update` and `eas submit` hard-throws on the
mismatch. The old project is retired, not deleted, so the move stays reversible.

This row is here because that class of identifier — permanent from the moment
the account creates it — is exactly what this page is for, and the Expo pair was
not on it when it bit.

The scheme is declared in four places across three packages;
`one-scheme-everywhere.test.ts` holds them together, and this page only pins the
value they must agree on.

## Names that must not come back

Two renames, two dead identifier sets. **A list that knows only the older one is
worse than no list**: it reads green while the *newer* dead name sits in the
file, which is the failure `product-name.test.ts` was re-armed for on 7 Sep.

Superseded 6 Sep, when the product was renamed from CrewChief:

- `co.davidmasterson.crewchief` — the old bundle id
- `crewchief://` — the old scheme
- `com.southmoordigital.crewchief.paid.monthly` and
  `com.southmoordigital.crewchief.paid.annual` — the product ids built on it

Superseded 7 Sep, when Well Kept became Tappet:

- `com.southmoordigital.wellkept` — the bundle id and Android package
- `wellkept://` — the scheme
- `com.southmoordigital.wellkept.paid.monthly` and
  `com.southmoordigital.wellkept.paid.annual` — the product ids built on it
- `55451053-dc1a-481a-8257-76b476799f57` — the retired Expo project, whose
  server-side slug is permanently `crewchief`. Kept alive but never referenced;
  putting it back in `app.json` re-breaks every EAS command.

⚠ These may appear **in this section and nowhere else on the page**, and the
suite checks exactly that rather than counting occurrences. Counting was the
first version and it could not survive this list: `com.southmoordigital.wellkept`
is a prefix of both product ids beneath it, so a bare occurrence count reads
three where a reader sees one, and the guard fails on correct content — which is
how a guard gets switched off (CLAUDE.md §5).

⚠ Deliberately **not** banned, because each is still live and correct:
`CREWCHIEF_DEMO_SITE` and `WELLKEPT_DEMO_SITE` (both fallback halves, until
Netlify is renamed — see `lib/site-role.ts`), `crewchief-demo.davidmasterson.co`
and `wellkept-demo.davidmasterson.co` (both **301 to `tappet-demo.davidmasterson.co`**
once the 12 Sep `netlify.toml` rules reach `demo-live` — the first is the link
recruiters hold while David is job hunting, which is why it redirects rather
than dies), `crewchief-demo.netlify.app` (the Bolt stub the demo CNAMEs still
point at), and `wellkept.southmoordigital.com` and `crewchief.davidmasterson.co`,
**both still serving 200** — the product pair redirects second, after the demo
pair is verified live, because that host takes the app's API writes and a 301
turns a POST into a GET. Both projects' primary domains were flipped to the
Tappet hostnames on 12 Sep; that setting is inert for redirects (Netlify only
redirects apex↔`www`), so `netlify.toml` is the redirect. A blanket ban on
either dead name would fire on all of them and get switched off.
