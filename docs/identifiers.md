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
| URL scheme | `tappet` | `apps/mobile/app.json` → `expo.scheme`, and three more — see below |
| Mobile API base | `https://tappet.southmoordigital.com` | `apps/mobile/app.json` → `expo.extra.apiBaseUrl` |
| `PRODUCT_ORIGIN` | `https://tappet.southmoordigital.com` | `lib/site-role.ts` |
| `DEMO_ORIGIN` | `https://tappet-demo.davidmasterson.co` | `lib/site-role.ts` |
| Git remote | `git@github.com:davidmasterson303/wellkept.git` | `.git/config` |

⚠ **The Git remote row is the one value the 7 Sep rename did not move, and it
is deliberately not pre-updated.** `gh` is not installed on this machine and
Homebrew cannot install it (CLAUDE.md §9), so the GitHub-side rename is David's,
in the web UI. This page states what is true *now*; writing the intended value
early would be the exact drift the file exists to catch, and the suite would go
red on a claim nobody could satisfy. When the repo is renamed, one command
finishes it:

```
git remote set-url origin git@github.com:davidmasterson303/tappet.git
```

…and this row moves with it, in the same commit.

⚠ The bundle id and both product ids become **permanent** the moment an App
Store Connect record exists. None does yet, which is the only reason the 6 Sep
rename was cheap.

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

⚠ These may appear **in this section and nowhere else on the page**, and the
suite checks exactly that rather than counting occurrences. Counting was the
first version and it could not survive this list: `com.southmoordigital.wellkept`
is a prefix of both product ids beneath it, so a bare occurrence count reads
three where a reader sees one, and the guard fails on correct content — which is
how a guard gets switched off (CLAUDE.md §5).

⚠ Deliberately **not** banned, because each is still live and correct:
`CREWCHIEF_DEMO_SITE` and `WELLKEPT_DEMO_SITE` (both fallback halves, until
Netlify is renamed — see `lib/site-role.ts`), `crewchief-demo.davidmasterson.co`
and `wellkept-demo.davidmasterson.co` (still serving, and the first is
recruiter-facing while David is job hunting), `crewchief-demo.netlify.app` (the
Bolt stub the demo CNAMEs still point at), and the Git remote above. A blanket
ban on either dead name would fire on all of them and get switched off.
