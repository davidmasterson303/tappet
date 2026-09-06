# Runbook — move Well Kept onto its own hostnames

**For: Cowork.** Everything here is browser work in David's own accounts —
Netlify and Namecheap. Nothing in this runbook touches the repository. The
code side already landed (`3f1ee43`, 6 Sep) and is described at the end so you
know what you are unblocking, not so you do it.

```
wellkept.southmoordigital.com        the product   ← App Store URL + the app's API
wellkept-demo.davidmasterson.co      the demo      ← the link on David's portfolio
```

**Status: applied 6 Sep — one DNS item still open, see §6.** Both hostnames
resolve and serve over valid certificates. Checks 1–6 pass; check 7, the email,
is drafted and unsent and is still the one that matters.

⚠ **What is left is the demo's CNAME target.** It points at the wrong Netlify
project and works only by accident. §6 is the fix.

The steps below are kept as written — they are the record of what was done. The
status line originally read "neither resolves yet", which was true when this was
written and is not now.

**Why these two domains.** The product sits on the company domain that the
bundle id (`com.southmoordigital.wellkept`) and the privacy policy's `OPERATOR`
("Southmoor Digital LLC") already name. The demo stays in the portfolio's own
domain family, because a portfolio piece is what it is. `wellkept.app` and
`wellkept.com` are both registered to other people — checked against DNS on
6 Sep, not assumed.

---

## ⚠ Read this first — the one thing here that is genuinely dangerous

**`southmoordigital.com` carries live email.** Verified 6 Sep:

```
MX     10 mx01.mail.icloud.com   10 mx02.mail.icloud.com
TXT    "v=spf1 include:icloud.com ~all"
TXT    "apple-domain=4mQO2AU0mhyq8OCV"
A      (none — there is no website on this domain yet)
www    (none)
```

`support@southmoordigital.com` is the contact address in the **published
privacy policy**, the one App Review reads.

So: when Netlify offers to manage DNS for the whole domain — it will suggest
moving the nameservers to Netlify DNS — **decline it.** Moving the zone drops
the MX, SPF and Apple verification records above, and the address in the policy
silently stops receiving mail. A CNAME on one subdomain is all that is needed
and touches none of them.

The same rule that applied to `davidmasterson.co` applies to both domains here:

- **Do not touch apex (`@`), `www`, `MX` or `TXT` on either domain.**
  `davidmasterson.co`'s apex is David's personal site, on a *different* Netlify
  site. `southmoordigital.com`'s records are its email.
- You are **adding one new record per domain**, alongside what is already there.

---

## ⚠ And a naming trap, because this repo has one

⚠ **Resolved 6 Sep, and the answer is the opposite of what this section
implied.** `CLAUDE.md` is **correct**: `crewchief-demo-live` is the demo's
project. The misleading string is the *DNS target*, not the doc — see §6.

The original warning stands as a method even though its guess was wrong: a third
name, `crewchief-demo.netlify.app`, also resolves, because Netlify answers every
`*.netlify.app` from shared addresses and routes on the `Host` header.
**Resolving proves nothing about which site is which.**

⚠ In practice the **Add domain alias** flow — which is the right one to use, as
it never offers to take over the zone — presents **no CNAME target at all**. So
"copy it out of the dialog" was not available, and the targets were read from
live DNS instead. That is how the wrong target was inherited. If a dialog gives
you no target, verify what you copy with the check in §6 before trusting it.

---

## Steps

### 1. Netlify — add the product hostname

1. Netlify → **Sites** → open the site serving
   `effulgent-blancmange-6adfdf.netlify.app`. Its production branch is
   **`web-live`**. Verify both before continuing.
2. **Domain management** → **Domains** → **Add a domain**.
3. Enter `wellkept.southmoordigital.com` exactly. Subdomain only.
4. **Write down the exact CNAME target Netlify shows.**
5. ⚠ **Do not remove `crewchief.davidmasterson.co`.** Both hostnames can serve
   the same site at once, which is what makes this a no-cutover change.

### 2. Netlify — add the demo hostname

1. Open the **demo** site — production branch **`demo-live`**; today it answers
   on `crewchief-demo.davidmasterson.co`. Confirm you are on the right one.
2. **Add a domain** → `wellkept-demo.davidmasterson.co`.
3. **Write down its CNAME target too.** It will not be the same as step 1's.
4. ⚠ Do not remove `crewchief-demo.davidmasterson.co`.

### 3. Namecheap — two records, on two different domains

⚠ These are **different domains**. It is the easiest step to do twice on one.

**`southmoordigital.com`** → Domain List → Manage → **Advanced DNS** → Add New
Record:

- Type: **CNAME Record**
- Host: `wellkept`  ← the label only, not the full hostname
- Value: the target from **step 1**
- TTL: **Automatic**

**`davidmasterson.co`** → Manage → **Advanced DNS** → Add New Record:

- Type: **CNAME Record**
- Host: `wellkept-demo`
- Value: the target from **step 2**
- TTL: **Automatic**

Save. Leave every existing record on both domains alone.

### 4. Let both certificates issue

Netlify → **Domain management** → **HTTPS**, on each site. Let's Encrypt issues
automatically once the CNAME resolves — usually minutes, up to an hour.

If one does not appear, use **Verify DNS configuration** / **Renew certificate**
rather than removing and re-adding the domain.

### 5. The demo's environment variable

Netlify → the **demo** site → **Environment variables** → add:

```
WELLKEPT_DEMO_SITE = true
```

**Leave `CREWCHIEF_DEMO_SITE` exactly where it is.** The code reads
`WELLKEPT_DEMO_SITE ?? CREWCHIEF_DEMO_SITE`, so the two names can overlap
indefinitely and there is no moment where the demo loses its framing. Removing
the old one is a later, separate step.

⚠ **Set it on the demo site only.** On the product site it must stay unset —
unset means "this is the product", and that direction is deliberate: a missing
variable fails toward the App Store hostname looking correct.

It is read at **build time**, so it takes effect on the next deploy of that
site, not immediately.

### Not a step: `CORS_ALLOWED_ORIGINS`

An earlier note of mine said this would need updating. It does not. Checked on
6 Sep against the live product host:

```
OPTIONS /api/v1/vehicles   Origin: https://crewchief-demo.davidmasterson.co
  → HTTP 204, no access-control-allow-origin header
```

The same for every origin tried. The middleware runs and returns nothing,
which means `allowedOrigins()` is empty and the variable is unset. Nothing
browser-side depends on it, so moving the demo's hostname cannot break it. If
it is ever set, it must name the new demo origin.

### 6. ⚠ OPEN — repoint the demo's CNAME at the right project

Both demo hostnames currently CNAME to `crewchief-demo.netlify.app`. That
subdomain belongs to the **dead June Bolt project**, not to `crewchief-demo-live`.
Confirmed 6 Sep by asking each host what it serves:

```
crewchief-demo.netlify.app        <title>CrewChief - Your Personal Auto Ownership Consultant</title>
                                  /api/version returns HTML, not JSON
crewchief-demo-live.netlify.app   <title>Well Kept: Know Your Car</title>
                                  /api/version -> {"branch":"demo-live", ...}
```

The demo hostnames work anyway because Netlify routes on the `Host` header, and
both are registered as aliases on the right project. The CNAME only gets the
request to Netlify's edge.

⚠ **Why this is worth fixing rather than leaving.** If that Bolt project is ever
deleted, the `crewchief-demo.netlify.app` name is released — and then both
`crewchief-demo.davidmasterson.co` and `wellkept-demo.davidmasterson.co` stop
working. Worse, a released Netlify site name can be claimed by somebody else,
who would then control what those two hostnames serve. It is a dangling CNAME,
which is the standard subdomain-takeover shape.

**The fix**, at Namecheap → `davidmasterson.co` → Advanced DNS, editing the
value of two existing CNAME records and adding nothing:

- Host `wellkept-demo` → `crewchief-demo-live.netlify.app`
- Host `crewchief-demo` → `crewchief-demo-live.netlify.app`

Then re-run checks 3 and 5. Both must still show **"Shared demo garage"**, and
`/api/version` on each must return JSON naming `demo-live`.

---

## How you know it worked

Do these **before** anyone promotes. The new hostnames will serve the *current*
`web-live` / `demo-live` build, which still names the old hostnames in its own
metadata. That is expected — you are testing DNS and certificates here, not the
rename.

1. `https://wellkept.southmoordigital.com` loads Well Kept over a valid
   certificate — not a Netlify 404, not David's personal site.
2. `https://wellkept.southmoordigital.com/privacy` returns **200**, and
   `/terms` returns **200**.
3. `https://wellkept-demo.davidmasterson.co` loads over a valid certificate and
   shows the demo masthead — the words **"Shared demo garage"**.

Then re-check the four things you must not have broken:

4. `https://crewchief.davidmasterson.co` still loads. It has not been removed.
5. `https://crewchief-demo.davidmasterson.co` still loads and still shows
   "Shared demo garage".
6. `https://davidmasterson.co` still loads David's personal site.
7. **Send an email to `support@southmoordigital.com` and confirm it arrives.**
   This is the check for the failure this runbook opens with, and it is the one
   nothing else would catch.

⚠ A certificate warning counts as failure. A hostname serving the right content
over a bad certificate is worse than no hostname at all, because the mobile app
refuses the connection outright rather than degrading.

---

## What to report back

- Whether all seven checks pass.
- **The two exact CNAME targets Netlify asked for**, especially if either
  differs from the names guessed above.
- Whether Netlify pushed to take over DNS on `southmoordigital.com`, and
  confirmation that you declined.
- Whether the email in check 7 arrived.

---

## What happens next, so you know where the line is

**Not Cowork's, and not until the checks above pass.** Once both hostnames are
live on valid certificates, the promote sequence runs in order — each gate
separately, both dry-run first:

```
node scripts/promote-web.mjs             # dry run
node scripts/promote-web.mjs --apply
node scripts/promote-demo.mjs            # dry run
node scripts/promote-demo.mjs --apply
node scripts/verify-demo.mjs https://wellkept-demo.davidmasterson.co
```

⚠ **A promote publishes the API that shipped apps depend on.** It is not a
cosmetic act, and `web-live` must go first — `promote-demo` verifies the exact
build that is already live on `web-live`.

Only after that is it worth deciding whether to retire
`crewchief.davidmasterson.co` and `crewchief-demo.davidmasterson.co`. There is
no hurry: nothing external points at either yet, because there is still no App
Store Connect record. Leaving both attached costs nothing and keeps every
existing link working.

---

## What this unblocks, for context

`3f1ee43` (6 Sep) already moved every reference in the code:

- `apps/mobile/app.json` → `extra.apiBaseUrl`, and the matching fallback in
  `apps/mobile/src/config.ts`. ⚠ That setting is **not only** the legal links —
  it is the base URL for every API call the phone makes.
- `lib/site-role.ts` → `PRODUCT_ORIGIN` and `DEMO_ORIGIN`, which are what the
  canonical URL and the share card claim as their own origin.
- The four promote and verify scripts.

So please do not edit anything in the repository, and do report back rather than
assuming the handover happened.
