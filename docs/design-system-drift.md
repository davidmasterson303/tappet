# Design system ↔ build: drift register

**Raised:** 23 Aug 2026 · **last updated:** 23 Aug, after Design's rulings and
the v8.3 ten-screen UI review (§2b).

**⚠ Before reading a value out of any export, check `$meta.version`.** Design
added `$meta.$selfCheck` — six identifying values — for exactly this, because a
stale copy is otherwise invisible: a v2 file says `#0B0E12` where v8 says
`#100F0D`. The copy this repository was last shown stamps **6.0.0**; Design has
shipped **8.1.0**. Anything below marked ⬜ was not verifiable against that
newer file.

This file exists because of a standing instruction from David:

> the mobile details in current design system need to be adhered to, unless
> we're intentionally overriding, in which case we need to inform Design to
> update design system (ie need build and design system to avoid drift)

So: **§1** is the three conflicts and how each was settled — one fixed in the
export, one fixed in the app, one accepted with its reasoning written down.
**§2** is what the build changed to match the specs. **§3** is where the build
knowingly differs, with the reason, for Design to bless or overrule. **§4** is
the state of the export's own lint rules.

Every claim below was checked against the artefact — the spec file, the token
file, or the live database — rather than read off a summary. Where something was
not checkable, it says so.

---

## 1. The three conflicts — resolved 23 Aug

Design's rulings came back the same day. Two were the export's to fix, one was
mine to fix, and one was accepted rather than fixed.

⚠ **The export in this machine's Downloads still stamps `$meta.version` 6.0.0.**
Design has shipped 8.1.0. So §1.1 and the wording changes in §1.2 are recorded
here **as reported, not as verified** — checking them needs the new zip. This is
the first use of the rule Design added for exactly this: check `$meta.version`
before copying anything out of a token file. It took two seconds and stopped a
stale copy being read as current.

### 1.1 The filled primary — fixed in the export ⬜ not yet verified here

`tokens.json` never received the pairing the readme's override table decided. It
kept `#0891B2` and the stale `$rule` justifying it, so **the file that calls
itself the real token layer was arguing against the readme.**

Now `button: #0E7490` / `onBrandFill: #F2FBFD`, carrying a `$pairing` note
stating that the fill and the ink move together or not at all, and a `$citation`
recording that 5.36 was measured against pure white.

The app already shipped that pair, so there is nothing to change here — the
error was that an implementer importing the token file would have got the
failing one.

### 1.2 The collision was real, and it was in the **app**, not the export ✅ fixed

I reported this as a conflict between the export and the app. Design's read is
sharper and correct: **the export never had them equal.** `semantic.attention`
has always been `#FB923C` and the health ramp's `warn` has always been
`#E0A468`. What collides in the *system* is the **word** — the `warn` band
abbreviates to "Attention", so a reviewer meets that word twice in two different
ambers and reasonably reads one as a bug. Both families now carry an
anti-collision note naming both hexes.

**What that leaves is a real defect in this repository**, and it was worse than
one token:

| Token | Was | Is | Note |
|---|---|---|---|
| `status.attention` | `#E0A468` | **`#FB923C`** | `#E0A468` *is* the health ramp's `warn`. Live in eight places. |
| `status.critical` | `#E08882` | **deleted** | `#E08882` *is* the ramp's `bad`. **Zero call sites** — the critical chip reads `dangerText` (`#F87171`, already the system's value). |
| `status.attentionWash` | `rgba(251,191,36,…)` | `rgba(251,146,60,0.14)` | amber-400 was a **third** amber in the family; chips drew orange type on a yellow tint. |
| `status.attentionWashBorder` | `rgba(251,191,36,0.35)` | `rgba(251,146,60,0.35)` | follows the ink. |

The docblock above those tokens said they *"happen to share hues with two
bands"*. They did not share hues — they were the same hex, and the sentence
asserting otherwise sat directly above the values. That is the shape §5 of
`CLAUDE.md` is about: a claim that stops the next reader checking.

Design's reason is the argument for fixing it rather than documenting it: *a
gauge reading and a status chip are different claims, and sharing a colour makes
a 61 look like something you can dismiss.* The garage bay had it live — a dial
reading in warn amber, with a recall chip beside it in the same amber the dial
uses for Critical.

`status.critical` was **deleted rather than recoloured**. A dead token holding a
colliding hex is how a collision comes back.

⚠ **Now guarded.** `lib/__tests__/status-ramps-distinct.test.ts` fails if any
status ink equals any health band hex, and separately if the attention wash
drifts off the attention ink's hue. It samples the ramp through `healthBandHex`
rather than a private table, and carries its own anti-vacuous case. Mutation-
tested: restoring `#E0A468` fails it with *"status.attention (#E0A468) is the
health ramp's warn"*.

The solid banner pair (`attentionFill` `#4A3308` / `attentionBorder` `#854D0E`)
is deliberately exempt and stays — this app's own measured values, with white
already measured on them, documented at the token.

### 1.3 The text ramp — accepted, not fixed ✅ closed

Design's ruling, and it is better than the fix I proposed. Every step below
primary is `#F5F3F0` at an alpha, so **hue holds at ~36° but chroma collapses
under 2%**: quiet text composites to neutral grey, not warm. Now documented in
the export with the composited values.

The reason not to substitute a solid warm hex is the one that already made
`border.field` translucent: a hex sampled against one surface goes wrong on the
other four. Nothing to change in the app.

---

## 2. Brought into adherence, 23 Aug

Recorded so Design can see the specs are being implemented rather than
reinterpreted.

| Spec | What changed |
|---|---|
| `native-vehicle-detail` — *"a hub, not tabs"* | Vehicle detail is now photo → identity → score → recall → one list of destinations → one filled primary. The health drivers, the score history and the build dial left the screen and became pushed routes. |
| `native-vehicle-detail` — *"one filled primary per screen, and it is this one"* | "Ask the advisor" is the only filled control. The recall banner is a card affordance. |
| `native-vehicle-detail` — subtitle *"61,240 mi · xDrive"* | The odometer moved from a "Details" card five rows down into the identity line. |
| `native-vehicle-detail` — *"2 open recalls / One is a fuel pump that can cut power"* | The banner names the worst open recall instead of describing itself. |
| `native-recall-detail` — *"Find a dealer near me" / "Mark as repaired"*, above the explanation | Both built. `/api/v1/recalls` is new; `recall_actions` already existed and web already wrote to it. |
| `progression-ladder` — rows with role, difficulty and the sentence | The ladder now renders `nextRungs`' full output. It was rendering `rungs[0].role` and discarding name, purpose, difficulty and rationale. |
| `native-wishlist` — *"a count that disagrees with what is on screen…"* | The recall chip counts what the recall screen will actually draw, minus what the owner has marked. |
| `native-add-vehicle` — VIN leads, year/make/model under an *"or"* | Was a collapsed "Have the VIN?" row above a primary year/make/model form. Now inverted to match. |
| `native-vehicle-detail` — the hub's **rows** | ⚠ Rebuilt 23 Aug after David's *"still really bad UI and UX, ugly and uninviting"*. The first attempt fixed the ink ramp and shipped no icons. Reading the **rendered** spec rather than its text: every row carries a Lucide mark, the group is an inset block with the label *outside* it, and the dividers are inset to the label column. All three now match. |
| `icons` — *"real Lucide icons only"* | `Icon.tsx` ports the export's own path map to `react-native-svg`. Geometry copied unaltered, per that component's rule: *"do not redraw or approximate."* |
| `native-wishlist` — the whole screen | Was a free-text box. Now the summary line, divided rows with neutral-unless-urgent chips, and Add in the nav bar. |
| `native-wishlist` — suggestions | New `WishlistAddScreen`: the three knowledge-base sources as a filterable catalogue with Add and Learn more per row. |
| `native-hero-pullback` — the whole screen | The vehicle hero is pinned at 62% of the display with the sheet rising over it. Four planes in render order (never `zIndex`), the dial climbing at 1.6× so it docks before the sheet edge arrives, and a crossfade to a nav chip rather than a shrink. Constants mirrored into `theme/hero-motion.ts` from `tokens/hero.css`. |
| `native-hero-pullback` §4.4 — the compact branch | Below a 500pt hero the dial drops to `card` @104 in a 124pt plinth and the title to 28pt. Only the 4.7″ display takes it; the mini clears by 3pt. |

---

## 2b. The v8.3 UI review, 23 Aug — what landed and what did not

A full ten-screen review came back the same day this file was raised. Its
findings are cited by number throughout the code (`R1`, `R28`, `R57`…) so the
argument sits beside the change rather than in a document that drifts from it.

**Three of the four ship blockers were real, and the fourth was not in the app.**

- **R1** — the dev access-token block on the garage. Already `__DEV__`-gated and
  already guarded; the placement was the finding. Moved to `Account`.
- **R2** — a floating gear on every screen. **Not in the app** — see §3.18.
- **R3** — the health verdict contradicting the service history. **Real, and
  confirmed against the live database**: the M235i's summary row was generated
  30 Jul, its five line items were filed 6 Aug, and `last_generated` is a
  `2000-01-01` sentinel. Nothing on the mobile read path recomputes, so it had
  been stale for three weeks with no mechanism that would ever fix it. The
  screen no longer presents an out-of-date verdict as a current one; the
  recompute itself is §6 below.
- **R12** — back buttons reading `‹ VehicleDetail`. Real, and caused by
  `headerShown: false` landing on 23 Aug with no `title` beside it. Fixed, with
  a guard.

**Two findings did not reproduce**, and both are recorded rather than quietly
dropped: R2 above, and R5's contrast claim (§3.22 — measured on every surface,
nothing off-token).

**R44 also did not reproduce.** The build dial's redline *is* painted on the
unlit face from 82 to 100 at `--build-redline-track`'s 0.22, exactly as
specified — visible at a reading of zero. It is faint by design, which is
presumably why a screenshot read as missing it.

**R23 likewise.** `HeroBed` is present, it is the fixed contrast floor the hero
title sits on, and it is a **sibling** of the scaled photograph rather than a
child — so the pullback's transform cannot take it with it.

---

## 3. Deliberate differences — for Design to bless or overrule

### 3.1 Two routes the hub spec does not list

`native-vehicle-detail` names five destinations: RecallDetail, Wishlist,
InvoiceScan, ServiceMilestone, Advisor. The build adds **Health** and **Build**.

Both are the spec's own logic applied one step further: the drivers and the
chart needed room to explain themselves, and the build could not be made useful
in a card — which is the case David made directly ("let's make Build its own
page that you tap into, so we have real estate to house the functionality we
want"). If the hub is right, these are hub rows; the spec simply predates the
question.

### 3.2 Recall banner position — followed the spec, flagging the counter-argument

The spec's order is score → recall banner. The shipped code had the banner
**first**, with a comment arguing that a recall is the one time-critical thing
on the screen and that burying it under the mileage inverted the screen's
priorities. `native-recall-detail` separately says *"critical outweighs
attention … so a scan lands on red first."*

The build now follows the spec. Both orderings keep the banner above the fold.
**Design should confirm** — this is the one place where two of the system's own
statements point in different directions and the build picked one.

### 3.3 `native-add-vehicle`: "Scan an invoice instead" is **not built**

The spec puts it beside the VIN field, on the reasoning that a typed VIN and a
scanned one are the same fidelity and the scan returns the service record in the
same pass.

Not a disagreement — a sequencing constraint. It needs vehicle extraction with
no vehicle to attach to; `/api/v1/upload-document` requires a `vehicleId` and
authorizes against it. That is a new route, and per `CLAUDE.md` §8 a mobile build
depending on a new route has to wait for a `web-live` promote. It is queued with
the VIN-storage change so one promote carries both.

### 3.4 The garage bay carries one reading, not two

`native-garage-bay` shows **Health** *and* **Build / Modified** side by side on
the bay. The build ships Health only.

Deliberate, and the reason is data rather than design: `modification_tracking`
holds **no rows anywhere in the product** — re-confirmed against the live
database on 23 Aug — so a Build reading on the garage home screen would say
"Stock" on every car, for every user, permanently. It is on the Build route
where there is room to explain what that means.

### 3.5 The bay's photo treatment is not verifiable from the export

The garage bay spec is a live prototype; the text extraction carries its
content, not its geometry. The build moved the bay photo from a 112pt inset
panel to a full-bleed hero (168–240pt, clamped to window height) using
**contain-over-blur**, lifted from web's `VehicleIdentity` rather than invented.

Flagging rather than claiming drift: **Design should check the prototype against
the built screen**, because a 112pt room and a full-bleed hero are different
designs and only one of them is in the repository.

### 3.6 Icons: Lucide geometry, no Lucide package

The rule is *"real Lucide icons only · no emoji, no glyph stand-ins"*. There is
no icon package in `apps/mobile`. The one mark the app needs — a disclosure
chevron — is drawn in `react-native-svg` from **Lucide's own path**
(`m9 18 6-6-6-6`), unmodified.

Complies in geometry, not in dependency. When a second icon is needed,
`Chevron.tsx` becomes `Icon.tsx` with a path map, which is the point at which
adding the package should be reconsidered.

### 3.7 The wishlist spec's own render disagrees with its own note ⚠ Design

Not a build decision — a defect **inside** `native-wishlist.spec.html`, and it
is the one the spec's own note warns about.

The note reads: *"The total sums to $4,980 and the four rows are all four rows.
Stated because this system has shipped 'Wishlist · 4 items' over three rows
before; a count that disagrees with what is on screen is the fastest way to lose
a user's trust in every other number."*

The render above it shows **three rows**, headed **`4 ITEMS · ESTIMATED $4,180`**.
The three visible prices sum to $4,660. The note is right — $1,140 + $2,200 +
$1,320 + $320 is $4,980 with the Charge pipe row included — so the render is
missing a row *and* carries a total that matches neither count.

The build follows the note, not the render: the count and the total are derived
from the same array in one pass, which is the only version where they cannot
disagree.

**Ask:** re-render the spec. It is a small thing, and it is the exact failure the
spec exists to prevent, in the spec.

### 3.8 Buttons are pills on native, not `radius.md`

The system's five-step radius map assigns `full` to chips, filter pills, status
badges and avatars, and `md` to buttons. **Every native spec draws a full-width
primary as a pill** — the vehicle hub's "Ask the advisor", the recall screen's
two actions, the wishlist's add.

The build now follows the native specs, so `Button` is `radius.pill`. A 12pt
corner on a 52pt-tall full-bleed control reads as a web form submit; the phone's
idiom is the pill.

**Ask:** confirm the map should carry a native exception, or that the native
specs should be redrawn at `md`.

### 3.10 The docked chip's arc — `variant="row"` differs between the two systems ⚠ Design

`HERO_PULLBACK_PROMPT.md` §4.4 specifies the docked chip as *"a 26pt arc
(`variant="row"` geometry, no needle, no readout) plus the numeral at 16pt"*,
and §6 says not to change `ClusterGauge`'s internals because *"you need
`variant="hero"` at a custom `size` and `variant="row"`; both already exist."*

They exist, but this repo's `row` is **text only** — a 30pt numeral over a 12pt
verdict, no arc at all. It is that way because of `DIAL_MIN`: *"below this a
dial stops being a dial. Under ~88pt the ticks stop resolving and the instrument
is decoration."* A 26pt `ClusterGauge` resolves to `row` and returns two lines
of text at the wrong size for a nav bar.

The build draws the arc in `DialChip` from `@tappet/core/cluster-geometry` —
the same `TRACK` path and viewBox the real dial uses, so it cannot drift — and
does not touch `ClusterGauge`. `DIAL_MIN` is not being dodged: that floor
governs a dial somebody reads a value *from*, and this arc has no needle, no
ticks and no readout by design, with the numeral beside it carrying the value.

**Ask:** either the design system's `row` variant should be reconciled with this
one, or the chip's spec should stop naming `row` and describe the mark directly.

### 3.11 The hero's settings control has no destination ⚠ Design

`native-hero-pullback` and `native-vehicle-detail` both draw a settings gear at
the hero's top right, and §4.6 lays the nav row out around it — *"left of the
settings control, at `right: 56`"*.

There is no vehicle-settings screen in the app and nothing for that control to
open. The build ships the back pill and the score chip and leaves the slot out
rather than shipping a gear that does nothing.

**Ask:** what does it open? If it is the account surface, that already lives one
tap from the garage and duplicating it here needs an argument; if it is
per-vehicle settings, that is a screen nobody has specified.

### 3.12 Buttons on native are pills, and the hero made that visible

Already logged at §3.8 and repeated here only because the hero pullback is where
it shows: every native spec draws the full-width primary as a pill, and the
system's radius map assigns `md` to buttons. `Button` is `radius.pill` on
native.

### 3.14 The hero dial is removed ⚠ Design — this is a real departure

`native-hero-pullback.spec.html` is built around the health dial's flight: it
belongs to neither plane, climbs at 1.6× so it docks before the sheet edge
arrives, and crossfades to a nav chip. That is the spec's hardest idea and the
one the exploration got wrong twice.

**It is gone.** David, 23 Aug, after using it on a device:

> we can lose the dial with health score overlaying car image. The animation is
> fun but info is redundant and it might cover important part of car image
> people care about.

Both halves hold. The redundancy was partly self-inflicted — the health card
gained its own reading earlier the same day, so the score appeared three times —
but the covering is the deciding argument: the photograph is the only place in
the product an owner sees their own car, and a 160pt plinth sat over the
roofline of most 3:4 phone snapshots. An instrument that obscures the subject it
reports on has its priorities inverted.

What went with it: `HERO_DIAL_RATE`, `dialFlight`, `dialClearsSheet`, the
crossfade, and **the layering invariant** — the regression test that caught the
bug the design itself had twice. There is no travelling instrument left to
collide with the sheet, so those guards would be assertions that can never fail,
which reads as coverage and is not.

What remains is the pullback: a pinned hero drifting at a third of scroll speed
under a rising sheet, the score persisting as the nav chip.

**Ask:** the spec should either drop the dial's flight or state where a score
belongs when the photograph is the hero. The compact branch survives on its own
merits — it still sizes the title — but its dial half is dead.

### 3.15 The wishlist's Add lives in two places, by state

`native-wishlist.spec.html`: *"Add is in the nav bar, not a floating action
button."* On an **empty** list that leaves a 22pt glyph in the corner as the only
way in, which David flagged as the wrong resolution of a redundancy I had fixed
backwards.

Now: empty list → the empty state's filled button, and the nav `+` stands down.
Populated list → the `+`, and no empty state to compete. One control per state
rather than one per screen.

**Ask:** the spec does not cover the empty state. Worth adding, since "Add is in
the nav bar" reads as absolute and is wrong on a blank screen.

### 3.16 No spec exists for the typeahead

`Suggest` — a text field with an inline suggestion panel — was added on 23 Aug
for make/model/year on the add-a-car screen. There is no spec for it.

Design note worth carrying into one: it is deliberately **a field with a list**
and not a picker, because a picker asserts its list is complete and neither the
make catalogue nor NHTSA's model list is. Every field still accepts free text.

---

### 3.17 The white filled primary is retired ✅ fixed in the app

Raised by the v8.3 UI review as **R4**, and it was a real conflict rather than
an oversight.

The readme's override register says *"Advisor CTA — white fill → `.btn-primary`;
a white button is a foreign colour here."* The app shipped a `Button` variant
called `inverse` that was exactly that white fill, and it was the CTA on **six**
screens — sign-in, add-a-car, the wishlist, the advisor, the invoice scan and
the service milestone — while `See suggestions` on the empty wishlist was
correctly cyan. Two filled primaries in one product, and the commoner one was
the one the register forbids.

**The build's side of the argument was not nothing**, and it is worth recording
because it is why this took a ruling rather than a find-and-replace.
`theme/index.ts` carried four tokens that existed for this treatment alone —
`surface.inverse`, `surface.inverseDisabled`, `text.onInverse`,
`text.onInverseMuted` — one of which was moved to 0.60 to fix a **measured**
4.47:1 failure that no source scan could see. `Button`'s docblock already stated
that `inverse` and `primary` share the one-filled-per-screen rule. Until 15 Aug
the treatment lived as six diverging private copies, and the primitive was built
to end that.

**Design is the authority, so it went.** Every filled control is
`brand.primary` `#0E7490` with `text.onPrimary` `#F2FBFD`. The four tokens are
**deleted rather than left unused** — the same rule `status.critical` was
removed under: a dead token holding a retired treatment is how the treatment
comes back, one call site at a time, with its argument already written beside
it. The selected states on the profile, add-a-car and wishlist type chips moved
with it.

`primitives.test.tsx` now asserts the absence directly, so restoring the variant
fails a test rather than passing review.

### 3.18 §3.11's gear was independently read as *shipped* ✅ no change

Recorded because it is evidence that the entry above it is doing its job. The
v8.3 review's **R2** reports "a floating gear button overlays content on all ten
screens" and files it as a ship blocker.

Checked: `apps/mobile/src` contains no gear, cog or settings control of any kind
— the whole tree greps clean — which is §3.11's decision holding. What is in the
captures is not the app's; it belongs to the device or the capture, and the most
likely candidate is iOS AssistiveTouch, which floats a round grey control at a
fixed right-centre position over every screen.

The review's underlying point still stands and is already this file's: **the
system draws a control the app has nothing to open.** That ask is §3.11.

### 3.19 The recall card's action order ⚠ Design — two of the system's own statements

The same shape as §3.2, and it deserves the same treatment.

`native-recall-detail` says this card's *"job is to drive an action, not to
explain a notice"*, and the build put `Find a dealer` and `Mark as repaired`
immediately under the component name. The v8.3 review's **R27** reads that as a
defect: *"the user is offered 'mark as repaired' before being told what could
happen."*

**Both are right, and they are about different things** — the spec is about
prominence, the review is about sequence. The card now leads with the component
name, then three lines of the notice, then the two actions, then the rest behind
one disclosure. The actions are still above every detail section and above the
advisor row; what is above *them* is one paragraph saying what is wrong.

**Design should confirm.** If the spec means the actions must be the first thing
under the title with nothing between, say so and the summary moves below them.

### 3.20 The tab bar is hand-rolled ⚠ Design and Code — R13

**R13** is built: three destinations — Garage, Advisor, Account — on a bar that
is a sibling of the navigator rather than a child of any screen. That is what
makes App Store 5.1.1(v) structural instead of something `GarageScreen` has to
remember on every return path.

⚠ It is **not** `@react-navigation/bottom-tabs`. That package is JS-only and
would cost no EAS build, but installing it runs an install across this
workspace, and `package.json`'s own notes record what that has cost: a full
workspace install hoists `apps/mobile`'s jest 29 to the root and splits the web
app's jest 30 across two trees, which killed every web suite before its first
test.

What bottom-tabs buys over the hand-rolled bar is **per-tab stacks** — each tab
remembering its own history. That is real and it is not what R13 is about. When
a tab genuinely needs its own history, that is the moment to spend the install
and verify it with `rm -rf node_modules && npm ci`.

### 3.21 R26's inline mileage edit is **not built** ⚠ Design

**R26** asks for the hero's meta line — `66,000 mi · xDrive · Daily Driver` — to
make the mileage an `InlineEdit`, "so the one thing that changes looks
changeable".

Not built, and the reason is a collision with a design this file already
records. The hero's identity block is `pointerEvents="none"` and **fades out on
scroll** (§3.14, the pullback): a text field there cannot be tapped, and if it
could, it would fade while somebody was typing into it.

The half of R14 that depends on it *is* built, and it is the half that removes a
screen: `Service → Due` now carries a confirm banner with the field and `That is
right` inline, so the odometer question is answered where the answer is used.
`ServiceMilestoneScreen` no longer gates the whole screen on it.

**Ask:** does the mileage belong on the hero at all, given it cannot be
interactive there? The alternatives are an editable row on `What you told us`,
or the meta line linking to `Service → Due` where the edit already lives.

### 3.22 R5's contrast finding did not reproduce ✅ measured, no change

**R5** reported five strings across four screens as "materially lighter-weight
than `--text-muted`" and asked for an audit. Every one of them is `text.muted`
exactly — `EmptyState`'s body, the advisor's examples, `RecallDetailScreen.meta`,
`ServiceHistoryScreen.meta`. Nothing is off-token and nothing is composited by a
parent `opacity`; that trap was closed app-wide on 7 Aug and every remaining
`opacity` in the tree is a scroll-driven hero transform.

Measured on every surface and pinned in `surface-contrast.test.tsx`:

| | page | nav | raised | card | well |
|---|---|---|---|---|---|
| `text.muted` | 5.34 | 5.34 | 5.24 | **5.13** | **4.99** |
| `text.secondary` | 10.07 | 10.15 | 9.57 | 9.21 | 8.79 |
| `text.nonText` | 3.81 | 3.80 | 3.82 | 3.78 | 3.72 |

The reviewer's own figure for the floor — 5.13:1 — is `muted` on a **card**, so
they measured it correctly and read the render as lighter than the number.

Two things follow. `muted` on `well` is **4.99:1**, the thinnest margin in the
app and the reason `well` must never gain a lighter value without re-running
that suite. And `nonText` fails on every surface, which is exactly why there is
no step between it and `muted` to reach for.

⚠ What is real in R5 is not contrast, it is **hierarchy**: a lot of this app's
content sits on the ramp's floor because the floor is where descriptions,
provenance and intervals all landed. R41's ladder — description at
`--text-secondary`, interval at `--text-muted` — is the fix, and it is applied.

### 3.23 R48's camera-first scan is **not built** — a native module

**R48** asks `Scan an invoice` to open the **camera preview** with `Take a photo`
as the shutter, rather than offering two ways to start. It is right: it removes a
tap and makes the screen's purpose self-evident.

A live preview needs `expo-camera`. The current flow uses `expo-image-picker`'s
`launchCameraAsync`, which hands the OS camera UI over and takes a file back —
there is no preview to embed. `expo-camera` is a **native module**, so adopting
it costs an EAS build out of a monthly allowance of about fifteen (§9).

Queued with the next build that is being spent anyway, alongside
`expo-document-picker` (§3.3's PDF gap) and `react-native-gesture-handler` for
swipe-to-delete on service history (R9). Three findings, one build.

What did land on that screen: the duplicate H1 is gone (R47), the block is
optically centred (R57), and it now says what the model is about to do with the
photograph (R49) — in words that are true, which the review's suggested line was
not: line items are written as soon as extraction succeeds, and only a vehicle
mismatch is held back for confirmation.

### 3.11 ⚠ The palette collapsed to two hues — David's F&F direction, 4 Sep

**This is the largest single departure in this file and Design has not seen
it.** It comes from a locked design brief, written by an independent critic
against a north-star image David approved, under a stated aesthetic direction:
the original *Fast and Furious* look revived for 2026 — sodium streetlight
against cold cyan, carried by photography, with the interface flat and matte.
Brief line **B3** allows those two hues and no others. David chose "move the
default register" over "wire up the sport register", so this lands in `:root`
rather than behind `[data-register='sport']`.

`design-loop/design-system/brief.md` holds the locked brief in full.

What moved, and what each one cost:

| Token family | Was | Is | Note |
|---|---|---|---|
| `--info*` | `#8FB4C4` slate-blue | `#7EC8DC` cold cyan | Brief names blue-info directly. 10.20:1, up from 8.66:1 |
| `--confirm-green*` | `#4ADE80` | `#EDE7DF` **ink, no hue** | "Good is carried by off-white." The chip still has a check and the word |
| `--critical-red*` | `#F87171` salmon | `#FF7A5C` hot sodium | ⚠ see below |
| `--destructive` | `#DC2626` | `#C2350B` | Same value as `--critical-red-solid`, on purpose. 5.28:1 vs the ink, up from 4.63:1 |
| `--ring-*` | green → red | off-white → hot sodium | The 3 Sep note is preserved and strengthened |
| `--build-*` | steel → amber | steel → bright cyan | ⚠ inverted, see below |

**Three things Design should rule on rather than inherit:**

1. **Attention and critical are now separated by intensity alone.** They used
   to differ by hue — orange versus salmon — and by fill weight. Both are
   sodium now, so only intensity and fill area remain. The brief asks for
   exactly this ("severity carried by intensity and fill") and it is a
   genuinely thinner distinction than the one it replaces. Neither is ever the
   only signal: both chips carry an icon and a word. But §1.2 of this document
   is about precisely this shape of collision, and this reintroduces a version
   of it deliberately.

2. **`--ring-warn` `#DE8A3A` sits close to `--attention-amber` `#FB923C`.**
   Under a two-hue brief there is no third hue to separate the ramp from the
   chip family with. They are held apart by ~1.3:1 of luminance and by never
   appearing on the same element — the ramp draws arcs, the chip sets text.

3. **The build ramp was inverted from warm to cool, and this is the change most
   likely to be read as a mistake.** It ran steel → cyan → amber → orange.
   Sodium is now the entire warning axis, so a build dial that warmed as it
   climbed would draw "more modified" in the same language as "more wrong" — on
   a dial whose own docblock says *nothing here is a failure state*. Heat is
   surrendered to the warning axis and the ramp climbs into cold instead. A
   consequence worth stating: `[data-register='sport']` sets
   `--register-accent: var(--build-far)`, so the sport register's accent moved
   from orange to cyan along with it.

**Two files, one decision.** `packages/core/src/health-band.ts` carries the
ramp as `r,g,b` channels for React Native and for the web glow; `app/globals.css`
carries it as `--ring-*` for the stroke. They moved together, and
`health-band.test.ts` pins them to each other — it failed on this edit, which
is what it is for. **So this change reaches the iOS app too**, and the phone has
not been looked at since.


### 3.12 ✅ The iOS app has been ported — audit 5 Sep, closed 5 Sep

**Resolved for colour; the radius row is deliberately still open.** The audit
below is kept as written, because the table is the record of what diverged and
the argument for the build ramp is the reason the port was worth doing.

What was done, later the same day, on David's instruction to port before
spending an EAS slot:

- **Every colour row above is closed.** `status.confirm`, `status.dangerText`,
  `status.danger` and its pressed state, the critical banner pair, and the whole
  `build` ramp now hold the web values. The green success banner went with them:
  `confirmFill` was a hue, and under the collapse good news is off-white ink, so
  the fill is a neutral step and a new `confirmBorder` carries the identity.
- **Two contrast defects fell out of it.** `text.primary` on the old
  `status.danger` measured **4.36:1** — under AA — and on the green
  `confirmFill` **2.98:1**. Nothing asserted either pair; `AlertBanner`'s
  `confirm` tone is rendered by no test. Both are now comfortably over the
  floor (5.68:1 and 14.47:1) as a side effect of the hue change.
- **Option 2 was taken in part.** `retired-palette-literals.test.ts` now scans
  `apps/mobile/src`, which is the hole that let this run for a day — it was
  scoped to the web surfaces because that is where the migration started, so it
  reported clean on the client that had not moved. It is proven against a
  planted value in a mobile file.
- **`status-ramps-distinct.test.ts` was narrowed rather than relaxed.** It
  fired on a *correct* change: `--confirm` and `--ring-good` are one value on
  web by design, so "the two families never share a colour" stopped being true
  the moment mobile was right. The rule now covers the warning axis, where its
  stated reason — severity blurring — actually lives, and the historic
  `attention == warn` collision still fails it.

⚠ **Still open: the radius row.** 8/12/14 on native against 0/5/8-plus-chamfer
on web is the one row that is plausibly option 3 — a dialect may round its
corners where the other mills them — and it is a visual call rather than a
token sync, so it is Design's to make and is not being made here.

⚠ **Still true: nothing here is on the phone.** The port is JS-only and so is
free of a native rebuild, but it reaches a device only through an EAS build.

The audit, as originally written:

No build was made and nothing on the phone was changed. This is the comparison
David asked for after the web palette moved, and it is worse than expected.

**Exactly one thing crossed to mobile: the health ramp.** It crossed because
`packages/core/src/health-band.ts` is a genuinely shared module and
`health-band.test.ts` pins its channels to the web tokens — that pin failed on
the edit, which is what forced the two to move together.

Everything else in `apps/mobile/src/theme/index.ts` is a **separate copy of the
whole system** with nothing pinning it to `app/globals.css`, so none of it
moved. `mobile-color-literals.test.ts` proves the app names no colour outside
its own token layer, and `status-ramps-distinct.test.ts` compares mobile's
status family to mobile's health ramp. Both are good guards and neither asks
the question that matters here: *does the phone agree with the web?*

| | mobile (unchanged) | web (4–5 Sep) | consequence |
|---|---|---|---|
| `status.confirm` | `#4ADE80` green | `--confirm` `#EDE7DF` off-white | the brief's banned hue, still shipping |
| `status.dangerText` | `#F87171` salmon | `--critical` `#FF8A3D` sodium | ditto |
| `status.danger` | `#DC2626` red | `--destructive` `#B85410` | ditto |
| `build.mild/warm/far` | `#9FC8D8` → `#E0C168` → `#F0A35E` | `#8FB6C6` → `#6FC9E4` → `#3ED0F0` | ⚠ **the dial climbs in opposite directions** |
| `build.redline` | `#FF4436` hue 5 | `#FF5A0A` hue 20 | true red vs top-of-sodium |
| `radius.well/button/card` | 8 / 12 / 14 | 0 / 5 / 8 + chamfer | rounded vs milled |

⚠ **The build ramp is the serious one, because it is a semantic inversion
rather than a colour difference.** On the web the ramp climbs into cold, and it
does so *because* sodium now owns the entire warning axis — a dial that warmed
as it climbed would draw "more modified" in the same language as "more wrong".
On the phone it still climbs into heat. The same dial, on the same account,
means opposite things depending on which client the owner opens.

**Three ways to close it, for Design and David rather than for me:**

1. **Port the values.** Cheapest, and it re-creates the problem the day the web
   moves again.
2. **Pin them.** A test in the shape of `health-band.test.ts` asserting the
   mobile theme's status, build and radius scales against `globals.css`. That
   is the mechanism that made the health ramp the one thing that crossed, and
   it is the only option that keeps working without anyone remembering.
3. **Decide they are allowed to differ**, and say so by name — the design brief
   already calls for "one language, two dialects", and a dialect may legitimately
   round its corners where the other mills them. What it may not do is invert a
   ramp's direction silently.

⚠ Whichever is chosen, **nothing here is on the phone yet.** JS-only changes are
free; per `CLAUDE.md` §9 a native rebuild costs one of ~15 monthly EAS slots.


### 3.13 ✅ One of the two refresh controls went after all — 5 Sep, revised

⚠ **The first version of this entry was wrong about one of the two, and the
correction is the interesting part.** It argued both controls should keep their
capability because they are two different actions. That is true, and it is not
sufficient: `fetchPerformanceStats()` **already runs on mount**, so the
Performance glyph re-triggered a fetch that happens anyway. Deleting it costs
nothing, and the locked brief lists "the floating refresh icon" among the cuts
it explicitly accepts — so it was never a deviation to begin with. It is gone.

`ResearchButton` is the real case and it stands: it triggers work nothing else
triggers, so it moved rather than went — unframed, mono, at the foot of the
page beside the disclosure, where a critique's own suggestion put it. What
follows is the original entry, which still holds for that control:

---

### 3.13a ⚠ The critique cut both refresh controls; one capability stayed

`/vehicle-info`'s Cut list asked for both refresh controls to go, and offered a
replacement: *"If freshness must show, it is one mono line: `RESEARCHED
2026-08-30`."* The reasoning is sound as design — the page had a labelled
button on one section and a ghost icon on another, which reads as one action
wearing two costumes, and a read-only owner page does not need two.

**They are not one action.** `ResearchButton` re-runs vehicle research and
writes `vehicle_knowledge_base`; the Performance glyph calls
`fetchPerformanceStats(true)`, which refetches the figures alone. Deleting them
removes two capabilities, and David's standing boundary on this design work is
that nothing is off limits *except* functionality changes.

So the **treatment** moved and the **capability** did not: both now sit on the
band head's baseline through `SpecBand`'s `action` slot, so they are the same
kind of thing in the same place instead of two different affordances competing
down the page.

⚠ **This is a real deviation and it is Design's to settle**, not mine. If the
critique's position is that an owner should never trigger research from this
page, that is a product call about what the button is for — and the honest
version of that change deletes the endpoint call too, rather than hiding the
control and leaving the capability stranded behind it.

## 4. The export's five adherence rules, against what this repo already runs

`specs/adherence-rules.spec.html` proposes five oxlint rules and says *"ship them
into `.oxlintrc.json` in the app repo"*. Four already have Jest equivalents that
run on every `npm test`; they are scans rather than lint rules, which the spec's
own argument permits — *"a rule a build enforces is a rule"*.

| Proposed rule | Status here |
|---|---|
| `cc/no-color-literal` | ✅ `lib/__tests__/mobile-color-literals.test.ts` |
| `cc/type-floor` | ✅ `lib/__tests__/mobile-type-floor.test.ts` |
| `cc/touch-target-floor` | ✅ `lib/__tests__/viewport-floors.test.ts` (mobile side); the wrapped-row qualifier is enforced by review, not by the scan |
| `cc/hover-parity` | ✅ `lib/__tests__/inclusive-affordances.test.ts`, `touch-parity.test.ts` |
| `cc/md-without-sm` | ⬜ **not automated.** RB0 rule 1 is documented and unchecked |
| `cc/container-scale` | ⬜ **not automated.** RB0 rule 2, same |

Two additional scans exist that the spec does not propose and that have caught
real defects: `mobile-font-faces.test.ts` (a `fontWeight` with no `fontFamily`
renders San Francisco, not Inter — silently) and `mobile-busy-controls-named.test.ts`
(a control that swaps its label for a spinner loses its accessible name). Both
fired during this session's work. Worth adding to the system's rule set.

---

## 5. One thing the system got right that the build had lost

Not drift — a note, because it is the kind of finding that argues for keeping
this file.

`GarageBay` has drawn a "next service" row since it was built, and every car in
the product rendered its **unknown** branch. The component's docblock said the
migration adding `next_service_*` was *"written and not applied, verified against
the live database"*.

That was true when written and had stopped being true. The columns are applied
and carry data — the 2003 Accord reads `Engine Oil and Filter Change` at 170,000
miles. What was actually missing was the **route's column list**: neither
`GARAGE_COLUMNS` nor `VEHICLE_COLUMNS` selected them, so the payload never
carried an answer.

Fixed on 23 Aug. The note that named the wrong blocker is corrected in place —
a docblock pointing at a migration that already ran sends the next reader to
write it again.

---

## 6. One thing this review found that is not a design question

**R3's other half, and it needs David's call because it spends money.**

The vehicle detail screen no longer presents a stale health verdict as a current
one — it says what the reading predates, and names its inputs. That makes the
contradiction impossible to ship silently. It does **not** make the number
right.

Nothing on the mobile read path recomputes a health summary.
`generateVehicleHealthSummary` learned to read `maintenance_line_items` on
5 Aug, and `uploadInvoice` fires a best-effort refresh — but
`/api/v1/load-vehicle` and `/api/v1/vehicles` only ever **select** the stored
row. So a summary that went stale before that fix, or whose fire-and-forget
refresh failed, stays stale forever. The M235i is that case.

The fix is one call, and the precedent is already in `uploadInvoice`: fire
`generateVehicleHealthSummary(vehicleId, true)` best-effort from the read path
when the stored row predates the newest filed record.

⚠ **It puts a Gemini call on a route hit every time a car is opened.** §9 says
cap every spending path and make exhaustion degrade the feature rather than
break it. `last_generated` only advances on success, so a persistently failing
generation would retry on every read — `checkRateLimit(userId, 'ai')` bounds
that, and it is the same limiter `uploadInvoice` uses before recomputing stats.

Not implemented on a review line. It is a cost decision, not a design one.

---

## 7. The rename — two things Design owns, added 30 Aug

The product became **Tappet** on 30 Aug. The name is drawn in two places and
only one of them was safe to change without Design.

**7.1 · The wordmark is now two words in a slot cut for one.** `Logo.tsx` on
both clients renders the name as real text beside the mark, so it now reads
"Tappet". The tracking beside it does not follow: `-0.035em` horizontal and
`-0.03em` stacked were cut for *CrewChief* — one nine-letter word with two
capital humps and no space to hold open. They are untouched rather than
re-guessed, because tightening a two-word mark is the decision that closes the
gap between the words, and that is a drawing judgement.

**7.2 · ⚠ `public/brand/crewchief-lockup-{horizontal,stacked}.svg` still spell
the old name, and are unchanged on purpose.** Both draw the wordmark as vector
outlines, not text, so there is no string to rename — the letters are paths.
Their `aria-label` is left saying "CrewChief" with them: relabelling artwork
that visibly reads *CrewChief* would make the accessible name disagree with the
render, which is the one failure this project keeps paying for.

The five mark-only assets (`mark`, `mark-small`, `mark-mono`, `favicon`,
`icon-1024`) draw the dial and no letterforms, so their labels moved to
"Tappet" and nothing about them is stale.

**What Design owns:** a new lockup in the new name, and the tracking that goes
with it. Until then the app's own `Logo` is correct and the two lockup files in
`public/brand` are the old brand.

### 7.3 · Design answered both, 30 Aug

**The lockups are replaced, not edited.** Design's `REBRAND_PROMPT.md` §7: both
current files draw "CrewChief" as vector outlines, so there is nothing to
rename — they are deleted and `lockup-full.svg` / `lockup-short.svg` from the
brand package take their place. Design makes the same point this register did,
from the other side: *"outlined type is also why the rename cannot be a
find-and-replace: grep will report those files clean."*

**The tracking goes back to 0.1em and is not optical.** It was cut to fit one
nine-letter word; "Tappet" is nine characters including the space and sets at
0.1em small caps without touching the plate's inner step. Design's rule, worth
keeping because it settles the question rather than answering it once: *"a plate
carries engraved type — the letterspacing is the engraving, and it does not get
tuned per word. If a longer string ever has to fit, the plate widens; the
tracking does not close."*

So §7.1 and §7.2 are closed. What replaces them is a build task rather than a
drift: one `BrandLockup` component, the plate mark at 28px with Newsreader small
caps beside it, and the type outlined at PNG-export time because every SVG in
the package declares `Newsreader, Georgia, serif` and a rasteriser without the
webfont silently substitutes Georgia.

### 7.4 · ⚠ Reversed again — David overruled both, recalls are paid

**Final, 30 Aug: recalls sit behind the subscription.** Design gated them, then
reversed and endorsed `paid-features.ts`; David overruled both. `PaidFeature`
carries `recalls` now and the test asserts it in the opposite direction.

⚠ The argument against is deliberately kept in the module and in the test rather
than deleted, because it is the instinct the next reader will have: a federal
defect notice an owner cannot see because their card expired. What it costs, in
one sentence, is that a lapsed owner stops getting new recall notifications for a
car they still own and keeps every recall already stored against it.

Design's §4.5 gate list is otherwise unchanged. The three sections below record
how the question moved, because a decision that reversed twice is one somebody
will try to reverse a third time.

### 7.4b · Design's second pass, 30 Aug — superseded within the hour

Design revised `REBRAND_PROMPT.md` the same afternoon and reversed this one
themselves: *"Recalls are free, and `paid-features.ts` is right. The first pass
of this document gated them; that was wrong and the shipped argument is the
correct one… It is also the one item on the list that is not ours to sell: NHTSA
publishes it. Keep the test that asserts it."*

The added reason is better than the one the code carried. `paid-features.ts`
argues from consequence — an owner who cannot see a defect notice because their
card expired. Design argues from ownership: it is a federal record, and selling
access to it is selling something that is not ours. Both hold; the second is
harder to talk yourself out of.

**Nothing in the build changes.** The gate list becomes AI consultant, invoice
scanning, second vehicle, factory build specs and full history — recalls out of
it, which is where the code already had them.

The original entry is kept below, because a disagreement that resolved is worth
being able to see resolve.

### 7.4a · ⚠ The finding as it stood, before Design's second pass

Design's §4.5 lists the paywall's gates as *"AI consultant, invoice scanning,
second vehicle, VIN specs + recalls, full history"*, with free as *"one car,
health score, its recalls, manual log"*.

**That contradicts a shipped decision, and the part that matters is recalls.**
`paid-features.ts` puts recalls in the free tier with an argument the code
states plainly — a federal defect notice an owner cannot see because their card
expired is not a version of this product that should exist — and
`paid-features.test.ts` asserts it rather than trusting the list. Gating the
second vehicle and full history are ordinary product calls; gating recalls is
the one that is not.

Not implemented, not silently reconciled. It is David's call, and it is recorded
here rather than in a commit message because it is a disagreement between two
current documents rather than a defect in either.

### 7.5 · The truck that was not there

Design's first pass said *"retire the truck glyph — it described a crew chief."*
There is no truck in this app: the nav ships the Sweep dial mark, and a grep for
`truck` returns vehicle-illustration prose and nothing else.

Their second pass accepts it and makes the instruction sharper than the
correction was: the car icon is in the **templates**, not the build, so the work
is to replace the dial mark in the nav with the plate lockup and drop the car
icon from template chrome — while keeping it where it means *a car*, on the
consultant composer's vehicle-context line.

Worth recording as a pattern rather than a one-off: Design writes against the
templates, this repo is the build, and the two have drifted before. A "was →
is" table in a handoff is describing the template's *was*.

### 7.2a · ✅ Closed 1 Sep — the old lockups are deleted

Design's §7 said to delete rather than edit them, and they are gone:
`public/brand/crewchief-lockup-horizontal.svg` and `-stacked.svg`, along with
both `Logo.tsx` files that drew the dial. Nothing references any of them.

⚠ **What is left in `public/brand` is the dial's icon masters** — `favicon`,
`icon-1024`, `mark`, `mark-small`, `mark-mono` — and they are still the source
for `app/favicon.ico`, `app/apple-icon.png` and the manifest's two PNGs. Those
binaries have not been regenerated, because doing it needs a rasteriser with
Newsreader loaded (the outlining step the package README describes). `app/icon.svg`
carries the plate as of 1 Sep, so a browser tab shows the new mark while a
pinned shortcut still shows the dial. That is the visible symptom, and it closes
when the export runs.

### 7.6 · The lockup, implemented 30–31 Aug — one departure to bless

The plate is built on both clients from `packages/core/src/brand.ts`, whose
every value `brand.test.ts` asserts against Design's own SVG files. Geometry is
imported rather than copied, for the reason `Icon.tsx` already states about
Lucide: *"do not redraw or approximate."*

**⚠ The one departure: small caps on mobile.** `font-variant: small-caps` has no
`react-native-svg` equivalent. The web renders the name exactly as the package
does; the native lockup sets it in **capitals** at Design's tracking instead.

The alternative was drawing large and small capitals by hand as two font sizes,
which is the approximation this project forbids for glyphs and would drift from
the web the first time either changed. So: same letters, same tracking, same
plate — the small-capital forms are the difference, and they are the part a
rasteriser cannot fake honestly.

For Design: if the distinction matters at nav size, the fix is a drawn wordmark
in the package rather than a runtime approximation here.

**Newsreader 500 was added to the app**, which the mark needed and the app did
not have — it bundled 700 alone, and rendering the plate a weight heavier is
exactly the silent substitution `mobile-font-faces` exists to catch. Free: the
face comes out of a package already installed.

⚠ **Not yet done, and both need the native build:** the app icon set and the
iOS display name. `app.json` names them; Metro cannot move either.

---

## 9. The garage's look, reworked against a design critic — 3 Sep

David asked for the site's look and feel to be raised page by page, judged by an
independent critic that sees only a screenshot. Four rounds on the landing
garage so far: **4 → 6 → 5 → 6**. The dip is the loop working — fixing the data
defect made three new problems visible that a blank card had been hiding.

Most of what changed is ordinary craft and needs nothing from Design. **Three
items touch the design system and are Design's to bless or overrule.**

### 9.1 · ⚠ The sharp photograph is now graded

`VehicleIdentity`'s header states *"nothing is printed over a photograph — no
tint, no scrim, no vignette"*, and `vehicle-identity-component.test.ts` enforced
it as *exactly one filter in the component*.

**A colour grade is now applied to the sharp layer:** `saturate(0.55)
brightness(0.92) contrast(1.06) hue-rotate(-4deg)`.

The rule's stated evidence is a hero that composited six layers and let ~1.7% of
each 700 KB photograph do any visual work — that is about **obscuring**, and it
is still enforced. A grade hides nothing. What it fixes is the thing every one
of the four critiques named first: owner photographs arrive at whatever
temperature they were taken at, and a golden-hour Accord beside a cold
industrial-dock WRX reads as a scrapbook rather than a collection.

Deliberately **not a duotone** — that would make every car the same object and
throw away the one thing a photograph is for. The guard now pins the exact
filter list, so a third treatment or a different grade still fails.

⚠ Writing that assertion found the header **overstates its own rule**: the
component already composites `.machined` over the photograph. That is sanctioned
and long-standing; the sentence is simply absolute where the practice is not.

### 9.2 · ⚠ The batten's bloom is cut and the room runs dim

`.bay-batten`'s outer halo (`70px 16px`) threw cyan a third of the way down the
page; two critiques named it and the wall seams as the most obviously generated
elements on screen. The **line stays** — it is the fixture, and 2b's ambient
hairline collapses into it — the halo does not, and the landing page runs
`.service-bay-dim`, whose `--bay-led` also drops 0.4 → 0.22.

### 9.3 · ⚠ The identity field's chroma is cut by two thirds

`0.048/0.024` → `0.016/0.008`. BMW hashes into the violets, so an unphotographed
card rendered as a **purple wash** — the single most recognisably generated look
on the web, on the one surface of this product that is pure decoration. The hue
survives, so cards still differ by make; it now reads as a lit dark room.

## 10 · The dashboard pass, 3 Sep

Driven by a design critic run against screenshots of the rendered page at 390px
and 1440px, in a fresh context each round, scoring against a studio bar. Three
consecutive rounds raised the same two system-level objections, so they are
changes to the system rather than to the screen.

### 10.1 · ⚠ The serif is licensed for section heads, not one element per screen

The rule read *"for exactly one element per screen — a vehicle title or the
single largest hero number"*. On a dashboard that meant the serif appeared on
the vehicle's name and in the nav wordmark and nowhere else, and the third
critique put it plainly: *"that's not a pairing, it's a veneer. Commit the serif
to section heads, or drop it."*

Now: the page title and its section heads. **Still never UI chrome, never
labels, and never tabular data** — the cluster reading counts up, and Newsreader
would reflow the digits mid-animation.

### 10.2 · ⚠ The `ok` band moves off cyan — `#5FAEC0` → `#B9C77E`

`--ring-ok` was a desaturated cyan, and cyan is the product's accent: the active
tab, links, the focus ring, the batten. So one hue meant both "this is
interactive" and "this car is middling", most visibly as a 48px cyan **61**
sitting under a cyan tab.

The ramp now steps green → yellow-green → orange → red, which a reader can order
without a legend. 10.5:1 on `--background`, the same margin the other three
carry. `packages/core/src/health-band.ts` and `health-band.test.ts`'s React
Native pin move with it — the web token and the value the Expo app reads cannot
drift apart.

### 10.3 · ⚠ The batten is a flat rule, not a gradient

`.bay-batten::after` was a five-stop gradient — transparent, cyan, a near-white
centre, cyan, transparent — under every nav. Four consecutive critiques named
it, the last flatly: *"the full-viewport cyan gradient under the tab bar is the
most AI-generated element on the page — a decorative flourish attached to
nothing."*

The **fixture stays**; the whole `.service-bay` idea rests on one light. A lit
tube is an even line, so it is now flat cyan at 0.34 across the bar it lights.
§9.2 cut this element's bloom for the same reason.

### 10.4 · ⚠ Interactive text is cyan, not the `info` family

The same critique counted six hues doing accent work. Cyan already meant "you
can act on this" — the active tab, the focus ring — and links were a second,
quieter blue saying the same thing. Links take the accent; `info` keeps the
washes and informational glyphs it was made for.

### 10.5 · ⚠ The beltline's brushed-metal grain is deleted

`.cockpit-belt`'s third layer was a `repeating-linear-gradient` — 1px on, 2px
off, full width, in an 11% band pinned at `--belt-y`. Its own comment claimed it
"reads as grain not stripes", and at 1440px on a short page it did.

**Four critiques, across three pages, reported it as a rendering fault** — the
last calling it "the single most damaging flaw… on a design whose whole pitch is
meticulous, an artifact like this is fatal to the premise". They were describing
it accurately: a 1px repeating gradient over a near-black ground cannot survive a
device pixel ratio it was not authored at, so at 2x and 3x the phase shifts and
the grain resolves into visible banding. On any page long enough to scroll, that
band also lands in the middle of the content and starts and stops at arbitrary
heights.

The beltline keeps its ambient strip, its shading and its ground. What went is
the one layer that was texture for its own sake.

### 10.6 · ⚠ The active tab's underline is white, not cyan

`.bay-batten` draws a cyan hairline along the bottom of the nav, and the active
tab's underline sat two pixels above it. Two critiques on two pages read the pair
as a fault — "one of them is leftover". Neither is: the batten is the room's
light and runs the full width, the underline marks one tab. They could not both
be cyan and remain two things.

## 11 · The accent, settled — 4 Sep

⚠ **David's call, on the critic's conviction.** Five rounds across three pages
named cyan as the thing standing between this product and studio work, in terms
that sharpened each time: "kill the cyan"; "the teal hairline under the nav
reads as a leftover from another theme"; "an accent so timid it reads as an
artifact — give it to the actions or cut it."

### 11.1 · The batten's line is cut, and the class with it

`.bay-batten::after` had already been narrowed twice — §9.2 took its bloom,
§10.3 flattened its five-stop gradient — and the critiques kept finding it. It is
gone from the nav on every surface, and since that rule was the class's only
declaration the class came off the markup too.

### 11.2 · ⚠ "Chartreuse + red and stop" is declined, and the reason is invisible from a screenshot

The critic's proposal was to promote the score's chartreuse to the interactive
accent. **`#B9C77E` is `--ring-ok` — the health band for *Fair*.** Making it the
accent would put a link and a middling score in one hue: precisely the collision
that moved this band off cyan in §10.2, transposed rather than solved.

Its own alternative stands instead — links are an underlined neutral — so the
palette is three jobs and three hues:

| job | hue |
| --- | --- |
| what you can act on | white, underlined |
| what the car is doing | the health ramp |
| an alarm | red |

plus the mark, which is cyan and appears once per screen.

### 11.3 · ⚠ The mark keeps its glow, and Design owns that — **superseded, see §12**

`BRAND_COLOR.glow` is `#22D3EE`, pinned to Design's own SVG files by
`brand.test.ts`. A critique called the plate's backlight "the AI tell". Whether
the package follows this decision is Design's to make — it is not a thing to do
to their files from here.

The OG card also keeps its batten, deliberately: what was cut is a *chrome*
element competing with a page's accents, and that card is a single composed
frame with no chrome in it.

### Not design-system changes, listed so Design can see the whole pass

Model as the card's name with year/make as the eyebrow · "67,400 mi mileage" →
"67,400 mi" · the "Daily Driver" chip only for a declared, non-default status ·
the repeated "View Dashboard" row dropped (the card was already a stretch-link)
· the recall ribbon welded to the plate's edge so it stops breaking the grid's
horizontal registers · summaries cut to a whole first sentence instead of a
ragged clamp · garage ordered by attention · the empty plate designed as a plate
rather than a clip-art car · a fleet readout in the hero's dead space.

### The dashboard pass, in the same spirit

The empty photo plate sized to its content rather than to a photograph's height,
and moved below the reading on a phone · the vehicle named once (the heading)
rather than twice · the model's summary printed once, where its "generated by
AI" line is · the breadcrumb score chip reading the band table instead of its
own thresholds · "Reliability" relabelled "Model reliability" with its competing
verdict chip deleted · one block per subject instead of a driver panel and a
tile grid naming the same subjects · the cluster's hub removed and its reading
moved into the well · dial numerals only at the ends and the three points where
the verdict changes · NHTSA's recall text no longer clamped on a phone · all
four tabs fitting a 390px screen · alert capsules becoming hairline rows behind
one rule · chevrons no longer used as bullets.

---

## 6. The iOS design port — 6 Sep 2026

Raised by the mobile design loop (`design-loop/mobile-ios/`), whose brief was
written by the critic in BRIEF mode against the settled web system and locked by
David on 6 Sep. Everything here is the phone joining the system, so most of it is
drift being *closed*. Three items are new deviations Design should rule on.

### 6.1 The condensed slot is Archivo **Narrow**, not Archivo ⚠ needs a ruling

The system's display voice is Archivo driven along its `wdth` axis — 62% for the
masthead, 72% for page heads, 88% for the standard instrument voice, requested in
`app/layout.tsx` as `Archivo:wdth,wght@62..100,500..800` and applied with
`font-stretch`.

**React Native has no `font-stretch`.** A variable font loaded on the phone
renders at its default instance and the width axis is unreachable — so bundling
Archivo itself would have produced regular-width heads while every stylesheet
claimed to set a condensed one: no error, no symptom, and it reads as a design
decision. That is the defect class `CLAUDE.md` §6 exists for.

David ruled on 6 Sep for `@expo-google-fonts/archivo-narrow`. **It is a different
family, not the same family at a narrower stop** — its metrics are its own and it
will not match web glyph for glyph. The three-widths-one-voice idea collapses to
one width on the phone.

The alternative considered and rejected was shipping no condensation at all,
which would have put mobile titles in regular-width Archivo beside web's 72%.

### 6.2 The mono slot is web's own face ✅ closed

`@expo-google-fonts/jetbrains-mono` at 400 and 500 — the same family and the same
two cuts `app/layout.tsx` requests. The app previously had **no mono face at
all**; every value, date, index and state label was Inter.

### 6.3 The radius scale is zeroed, and the cut is drawn in SVG ✅ closed, with a note

Brief B4: *"Every container corner is a 45° cut at zero radius."* The five-step
native radius scale (8 / 12 / 14 / 20 / 999) is now all zeroes, and a `cut` scale
replaces it — 8 on the plate, 12 on a control.

⚠ **The tokens survive as zeroes rather than being deleted**, because sixty-seven
call sites reference them and the honest fix at each is a per-surface design
question ("does this corner take a cut?"). A surviving `borderRadius: radius.card`
is therefore a *marker for work not yet done*, not a bug.

⚠ **This retires the 23 Aug native pill override** recorded earlier in this file,
which argued that "a 12pt corner on a 52pt-tall full-bleed control reads as a web
form submit; the phone's own idiom is the pill". The new system has no pills on
either client, so the override's premise is gone.

### 6.4 The health dial no longer spends the band colour at every score ⚠ needs a ruling

Brief B3 forbids gold on the dial; B7 restricts sodium to genuine warnings. The
dial previously stroked itself in the band colour at every reading, which put
`#D6BE9B` — the `ok` band — on screen for every score between 60 and 79.

**The band table is untouched**, and must stay untouched: thresholds, wording and
colour are owned by `@tappet/core/health-band` and shared with web, and the
phone holding a second opinion about what "Fair" looks like is the defect that
ownership prevents. What changed is only *when the dial spends a hue*: `good` and
`ok` now draw in off-white ink, `warn` and `bad` keep their sodium.

Design should confirm this matches web, where `ClusterGauge` strokes the settled
arc `#EDE7DF` while `--ring-ok` remains a live token.

### 6.5 The blurred letterbox is gone from the phone ✅ closed

`BayRoom` carried CC-142's contain-over-blur — an over-scanned `blurRadius={32}`
fill under a `contain`ed sharp layer. Web retired that treatment ("blurred
letterbox fill gone"); the phone had kept it. Now a single `cover` layer,
edge to edge.

⚠ **The cost CC-142 named is real and now accepted:** `cover` on a tall phone
photograph crops to a band through the middle. `focal_point_x` / `focal_point_y`
still exist on the `vehicles` table and are the fix if owners start losing their
cars to the crop — not a return of the blur.

### 6.6 Outstanding, not yet built

Brief B8 asks for four tab roots with their own stacks and no back chevron.
`createBottomTabNavigator` appears **nowhere** in `apps/mobile`: there is one
`createNativeStackNavigator` with a custom `TabBar` drawn over it. This is a
navigation rebuild rather than a styling change and is the one checklist line
that is not a design edit.

### 6.7 Two brief lines collide with shipped guards — **superseded the same day, see the note at the end of this section**

Attempted on 6 Sep, reverted the same session. Both are real conflicts between
the locked iOS brief and decisions this codebase already enforces in tests, and
neither is the implementer's to break.

**a) B7's off-white primary vs. `Button — one filled treatment › wears the brand
fill, not white`.** The studio paragraph asks for *"primary off-white fill with
graphite mono caps"*. There is a guard asserting the opposite by name, backed by
the 23 Aug removal of `surface.inverse` ("a white button is a foreign colour
here") after the app reached six screens of white CTAs against one cyan fill.

The brief's reasoning is sound for the new system — under the two-hue collapse a
*hue* fill is reserved for hover and critical, so a teal block is now the foreign
colour. But a guard that names its opposite is a decision with an argument, and
overwriting it quietly is how the white button came back last time.

**b) B4's cut on buttons vs. the rendered contrast suite.** Drawing the 45° cut
requires the fill to move from `backgroundColor` into an SVG path (see
`CutSurface` — RN has no `clip-path`). **The contrast suite walks style objects
to find the surface each string is measured against**, so the moment the fill
leaves `backgroundColor` it stops being able to see any button's ground: ~20
cases across the app failed, and the ones that did not fail would have been
measuring against the wrong surface silently.

That suite is the one the theme docblock credits with catching the 4.47:1
`onInverseMuted` defect that no source scan could see. Making it blind to every
filled control in the app is not a cost worth a corner.

**What would unblock it:** teaching the contrast helper to read a `CutSurface`
fill as the surface beneath its siblings. That is a change to a load-bearing
accessibility guard and should be made deliberately, not as a side effect of a
design port.

Until both are ruled on, buttons keep `brand.primary`, `radius.pill` at 0 (so
square, not capsule) and their existing ink.

> **⚠ Superseded, 6 Sep, by the session that wrote it — found 11 Sep.** Both
> halves were resolved later the same day in `c509f35` and this section was
> never updated, so for five days it said the opposite of the code (CLAUDE.md
> §1). What is true:
>
> - **(a) is done, not blocked.** `primitives.test.tsx › Button — one filled
>   treatment › wears the off-white fill, and still never pure white` now asserts
>   the reversal by name: the fill is `text.primary` used as a ground, the ink is
>   `surface.page`, `#FFFFFF` and the retired `inverse` tokens stay banned. The
>   guard's own comment records why the 23 Aug decision moved. Design's blessing
>   is still wanted; the code did not wait for it.
> - **(b) is done, not blocked.** `Button.tsx` draws the fill in a `CutSurface`
>   that **wraps** the label rather than sitting behind it, because
>   `test-support/contrast.ts` composites down the ancestor chain — an
>   absolutely-positioned sibling is invisible to it and every label measured at
>   1.00:1 against the page. The audit was not taught anything; the tree was
>   shaped so the ground is where the walk looks. `ghost` gets the same wrapper
>   and paints nothing with it, so every variant has the same ancestor path.
>
> Nothing here needs a ruling any more. It needs Design to read (a).

### 6.8 ✅ §6.6 closed — the tab navigation is rebuilt, 11 Sep

`@react-navigation/bottom-tabs` is installed (JS only — it sits on
`react-native-screens` and `react-native-safe-area-context`, both already in
the dev client, so no EAS build) and `RootNavigator` is a tree: a root native
stack holding the tabs and `Account`, four tabs in the order the last graded
round used — **Garage, Service, Plan, Advisor** — each with its own native
stack. The dossier (Garage → Vehicle → Health / Service / Plan / scan) lives
under the first tab, as the brief's studio paragraph says. `backBehavior="none"`
is what keeps a root chevron-less: with the library default, `canGoBack()`
answers yes on every tab but the first and the roots would have grown a header
pointing sideways at the garage. `lib/__tests__/mobile-tab-roots.test.ts` pins
the three things that fail silently there.

⚠ **The first tab is labelled GARAGE, not CAR.** David's 30 Aug instruction
("the garage link in bottom nav should be replaced with car detail view") was
made against a garage that was a list of cards; the locked brief's garage *is*
the car — the dossier header re-stacked, plate and dial included — so the tab
and its root now agree on a name, the way the critique made Service agree with
its screen. The traffic argument survives as structure: a tab keeps its own
stack, so leaving the car for Service and coming back lands on the car.

⚠ **B8's collapse is the screen's own, not UIKit's.** `ScreenTitle`'s docblock
records why `headerLargeTitle` could not be used (it draws over the pinned
rail, search field and context line three roots carry above their scroller).
`RootScreen` now holds both titles in one band and animates the band between
the 34pt condensed height and the 44pt mono nav height once the content has
scrolled past a threshold — a threshold rather than a scroll-tracked height,
because a band above the scroller that shrinks under the finger moves the
content at twice the finger's speed. The pushed instance of a root (Service
and Plan reached from the hub) draws no large title; the native header's mono
title names it instead, so one screen carries one name in either position.

⚠ **`headerTitleAlign: 'left'` does nothing on iOS**, and the navigator's own
comment claimed otherwise. native-stack's types: *"Not supported on iOS. It's
always `center`."* Pushed screens keep UIKit's centred mono title; a
left-aligned one would need a custom `headerLeft` carrying the title beside
the back control. Recorded here rather than built, since it is not on the
five graded screens.

**Guards re-pointed, claims kept:** `mobile-account-reachable` (the bar is the
tab navigator's own `tabBar` — its old "after `</Stack.Navigator>`" assertion
was passing against the first of five closing tags), `mobile-push-routing`
(the cold-start seed is pinned to the object registering `vehicle/:vehicleId`,
inside the garage tab's config, where a hoisted one would type-check and seed
nothing), `push-notification-links` (reads the nested config tree). A
`tests-test-real-code` registry entry was added for the new scan.

⚠ **Two things the loop's own instructions had wrong.** `apps/mobile/.env`
carried `EXPO_PUBLIC_DESIGN_FIXTURES=0`, not `1`; since `.env*` is not the
implementer's to edit, `.claude/launch.json` gained an `expo-mobile-fixtures`
configuration that sets the flag in the process environment (which `@expo/env`
never overrides). And the installed dev client registers `crewchief://`, not
`tappet://`, so deep links cannot be exercised on the simulator until the next
EAS build — the linking config is covered by the source guards instead.

### 6.9 The design loop, rounds 20–22 — what closed, and what is blocked, 11 Sep

Three graded rounds after the rebuild (`critique-20.md` … in `design-loop/`,
which is gitignored; the commits are the record): 6 → 7 → the round after
this note. What closed: **B2**'s plate is the house image — a rendered night
street, `apps/mobile/scripts/render-night-plate.mjs`, committed as a JPEG —
with the 8pt cut now painted *through* the image (`CutSurface`'s `ground`,
opt-in, the plate only); the vehicle's recall box became the spec-table band
(**B5**, **B7**); the recollection row gave back its sodium (**B7**); the
service summary is one label and one numeral on one baseline (**B6**); the
empty states on Plan, Advisor and the record are top-aligned under their
rails (R54/R57 superseded on the roots, where a title and a rail sit above
the content and the void the centring left was what the critique named as
the score's ceiling); a stale health verdict no longer prints "Based on 5
recorded services" beneath a sentence saying it read none of them — that one
is in `packages/core/health-claims.ts`, and the design fixture that had been
storing the app's own stale sentence *as* the stored summary is fixed to hold
a real one with the dates that make it stale.

**B9 — owner photos are graded ✅; the viewfinder and the capture haptic
~~are blocked on a build~~ — built 12 Sep, see §6.16.** `PhotoGrade` lays the house grade over an owner's
photograph as four blended layers (lifted blacks, sodium→cyan split tone,
vignette, the plate's own grain), which the new architecture composites
natively — no image pipeline, no native module. ⚠ The layers must be
*siblings* of the image, not children of a wrapper: Core Animation blends a
layer within its group, and a wrapper turned the first version into an opaque
near-black rectangle over the car. The viewfinder ("hairline corner brackets
and a mono readout") and the "one firm haptic on capture" both need native
modules the dev client does not carry — `expo-camera` and `expo-haptics`;
today the scan opens the system camera through `expo-image-picker`, which is
the viewfinder iOS provides. Each is one EAS build (CLAUDE.md §9); logged here
rather than built, the same way §3.23 logged the camera-first scan. Until
then B9 grades 🟡 whatever the loop does.

⚠ **Corrected 12 Sep — the paragraph above is history.** `expo-camera` and
`expo-haptics` were installed on `main` in `0bdaf9f` and both are bundled in
Expo Go, so the viewfinder needed no build to be *built* and run: it is
`components/Viewfinder.tsx` (§6.16), graded ✅ on Expo Go in rounds 34–36,
and the one device build (`docs/runbook-eas-device-build.md`) carries it
natively the same as everything else. What a build still gates is only the
old CrewChief dev client, which cannot load a bundle that imports
`expo-camera` at all — and is not the runtime any more.

⚠ **The fixtures launch config carries a design photo.** `expo-mobile-fixtures`
also sets `EXPO_PUBLIC_DESIGN_PHOTO_URL` to a file Metro serves from the
gitignored `design-loop/mobile-ios/owner-photo.jpg` (a square crop of the
north star's own frame — the only car photograph the repository is entitled
to show). With the file absent the bay shows a dark plate, not the house one,
because a `photo` prop that fails to load is still a photo to the component;
regenerate the crop from `north-star.png` before running the loop.

**Two parking-lot items for David, from the critic.** The stat strip reads
MILEAGE · TRIM · USE where the studio paragraph says MILEAGE · AVG ·
RELIABILITY (do AVG and RELIABILITY exist on the phone's payload?); and the
Vehicle plate runs under the status bar, so its top-right cut has nowhere to
live — which corner, if any, the Vehicle plate cuts is one sentence from
David.

### 6.10 The loop stopped at round 23 — 8 of 9 lines ✅, B9 ~~on a build~~ (built 12 Sep, §6.16), 11 Sep

Scores after the rebuild: 6 → 7 → 8 → 7. Round 23 marked **B2 ✅** (the cut
measured present at native resolution, 24px legs at 45° — see
`critique-22.md`'s footnote) and everything else ✅ except **B9 🟡**, and said
`Continue: no`: *"the only open line (B9) closes with a viewfinder frame,
not another design round."* That frame needs `expo-camera` (§6.9). So the
loop stops on the critic's own rule, one line short of the 9 David asked
for, and the line it is short by is a build rather than a design.

⚠ **Corrected 12 Sep:** it was not a build. The modules were installed on
`main` the same morning (`0bdaf9f`) and Expo Go carries both; the viewfinder
was built that afternoon and graded ✅ in round 34 (§6.16).

⚠ The 8 → 7 step is the critic's variance, not a regression: round 23's
checklist is strictly better than round 22's (B2 moved 🟡 → ✅, nothing moved
the other way), and its three gaps are all things round 22 had graded
without raising. They are recorded, not built:

- **Garage's recalls chip vs. Vehicle's band.** Two treatments of one fact.
  The critic wants Garage's NEXT SERVICE and OPEN RECALLS as two hairline
  band rows with the triangle beside the count, and the chip deleted (B5, B7).
- **Garage's plate crop.** The band's `cover` shows the car's flank and the
  dissolve under the name covers the road; the critic wants the crop biased
  toward the asphalt, or ~60pt more plate (B2). ⚠ This is the fixture's
  square photograph as much as the layout — a 3:4 phone snapshot crops
  differently — and `focal_point_x/y` on `vehicles` is the honest lever.
- **Service's search field** is a second full-width slab under SCAN INVOICE;
  the critic wants a hairline band row (magnifier, placeholder, rule, no
  fill) so the primary is the only slab (B9).

**Parking lot, consolidated across rounds 20–23**, for David and not applied:
MILEAGE · AVG · RELIABILITY vs. the strip's MILEAGE · TRIM · USE; which corner
the Vehicle plate cuts, if any, given it runs under the status bar; whether
Plan's empty state should carry the brief's "one button" (it says "See what
we already know" with a button below — the critic read the copy as pressable
and found nothing); whether the garage's empty bottom third should carry
"What's driving this score" the way web's dial band does; whether ACCOUNT
needs a home other than all four root headers; and whether the T mark's
corners, if rounded, should take the 45° cut. Two cut items the critic
raised and this loop did not take: the `sliders` icon on "What is driving
this score", and the search field's fill (the third gap above).

### 6.11 Every root opens on the night — the masthead plates, 11 Sep

David, looking at the phone after round 23: *"the tabs with images look
dramatically better right now … let's add images"* — Garage and Vehicle carry
the plate, Service, Plan and Advisor opened on graphite. The direction agrees
with him: the film is *"carried by imagery and colour grade while the
interface itself stays flat"*, and a root with no imagery had nothing carrying
it. So the three roots' title band takes a plate (`MastheadPlate`): the night
runs under the status bar to the band's bottom edge, the root's name sits over
its lower third in condensed caps — the grammar B2 gives the model name on
the garage's plate — with one 8pt 45° cut, and the plate fades out with the
large title as the band collapses, so the mono nav title lands on graphite
like the native header a pushed Service arrives under. The band's height and
every screen's layout are unchanged; the night is *added* as the title's
ground.

**The frames** are three generated 21:9 stills — the closed workshop's wet
apron (Service), the road ahead under receding lamps (Plan), the street's
lights through a rain-covered windscreen from the driver's seat (Advisor) —
one shared prompt in the brief's vocabulary, the mobile north star as the
reference, US$0.80 for six candidates (`design-loop/cost-log.jsonl`). None
holds a car, a badge, a person or a word, so the trademark question
`public/vehicles/CREDITS.md` raises about the demo cars does not arise.
`apps/mobile/scripts/build-mastheads.mjs` records the prompt, the crop and
the grade; the three committed JPEGs are 1206 × 351 and 50–70 KB each, and
are the artefact — the frames stay in the gitignored loop folder.

⚠ **Type is printed straight onto these plates, and that is a deliberate
reading of a rule, not a breach of it.** `HeroBed`'s docblock: the rule was
never "no type on photographs" but *"no type whose contrast depends on the
photograph"*. The vehicle hero satisfies it with an opaque bed because its
photograph is the owner's and unknown; a masthead is a *known* file, so it is
made to carry the floor itself — a multiply ramp baked into the lower half by
the build script — and `lib/__tests__/mobile-masthead-plates.test.ts` decodes
the shipped pixels under the title and under ACCOUNT and measures the ink
against them (≥ 4.5:1 for both, held to the normal floor rather than the
large-text one). Neither rendered contrast suite can see this: an `Image` has
no `backgroundColor`, so the title measures against the page there and would
pass at a ratio it does not achieve. A scrim was rejected because it would
dissolve the plate's edge and the cut that round 22 fought to make visible.

⚠ **The masthead's cut is bottom-right, and this answers half of a
parking-lot question.** The garage plate cuts top-right (B2's words); a
masthead's top edge *is* the screen's, so its only corners on the page are
the bottom two, and bottom-right is the corner every control cuts. The
Vehicle plate — the other half of the question, "which corner, if any, given
it runs under the status bar" — is unchanged and still for David.

⚠ **Why the band did not grow.** A taller plate was tried on paper and
rejected for two structural reasons: `AccountControl` floats on the nav row
from *outside* the navigator, so air added above the title would leave
ACCOUNT alone in the plate's lit upper half; and the collapse is a threshold
flip, so every point added to the band is a point the content jumps by on
the first scroll (`RootScreen`'s docblock says why it cannot track the
finger). At 117pt on the 16 Pro the image is a masthead strip; the lamps sit
behind the status bar the way the vehicle plate's bokeh does.

**Two things the loop's tooling had wrong, fixed in passing.** An agent's
worktree links `node_modules` and `design-loop` into the main checkout, and
Metro refused the first import (`Unable to resolve "expo"`) because the real
paths fell outside its one watch folder — `metro.config.js` now watches the
real path of each link when it differs, which in the main tree adds nothing.
And `expo-mobile-fixtures` in `.claude/launch.json` hard-coded port 8081 —
David's phone's Metro — in both its port and the owner-photo URL; it is
`autoPort` now, with the photo URL following `$PORT`.

⚠ **Seen and not taken:** Service's *Due* segment opens on a bordered card
("Still around 66,000 miles?") — B5 says cards become hairline bands. It is
not in the five graded frames, which shoot History; it is for the next loop.

### 6.12 The loop over the mastheads — round 24 onward, 11 Sep

**Round 24 — 7/10, 4 ✅ / 5 🟡 / 0 ❌, `Continue: yes`.** The critic took the
mastheads without objection — *"Service (one lit door) and Advisor (a wet
windscreen) have a light source and a reason"* — and named the Plan frame the
one AI tell left: an open road with sodium down one side and cyan down the
other *"reads as a grade swatch, not a place"*. It asked for *"one night place
with one light source (underpass, forecourt canopy)"*, which is what the Plan
plate is now: the road entering an underpass under one sodium lamp, the exit
a cyan haze — two more candidates, US$0.27, US$1.07 in all. The four 🟡 lines
are frames the five screens cannot show (draw-in, factors, the collapse, the
viewfinder) and the plate's cut *"not resolvable at this scale"*, which round
22 already measured at native resolution; round 23 had marked the same lines
✅ with the same caveats. Critic variance, recorded rather than chased.

**Taken, with measurements first:**

- **Garage runs strip → dial → readings** (gap 1, `[B2][B3][B6]`). NEXT
  SERVICE and the recalls chip sat between the strip and the dial and ~140pt
  of graphite sat under FAIR. The dial now comes straight off the strip, as
  the studio paragraph writes it, and the two facts sit beneath it as a
  two-row spec table — mono label left, value right, hairline per row, the
  sodium `△` beside OPEN RECALLS, the count in the numeral column; the chip
  is gone. ⚠ **This supersedes R19's placement** (23 Aug: *"an open airbag
  recall outranks a fair score"*, so the alert went above the instrument).
  R19 was written against a 22pt chip under a 110pt dial; what it argued for
  — the recall seen, full width, above the fold — survives, and what it
  argued *with* — a position above the dial — gives way to the locked brief.
  `GarageScreen.test.tsx`'s hierarchy case is re-pointed to the new order and
  now also holds the mark beside the row and nowhere else.
- **Spec rows are 56pt** (gap 4, `[B6]`, measured). The service record's lines
  measured 44 — `TARGET_MIN` plus the paddings they carried, in a card with a
  12pt gap. They sit in their own container now, each row `SPEC_ROW` tall
  with the text centred. `SPEC_ROW` lives beside `TARGET_MIN`, not in
  `rhythm`: `theme-backdrop.test.tsx` holds every rhythm slot to the 4pt
  scale and fired on 56, and it was right — a row height is not a gap.
- **The numeral was measured and left alone** (gap 4). The bay dial's reading
  is `0.34 ×` the dial's width — 56pt on the 164pt bay dial — which is the
  north star's own ratio (its 68 sits at ~0.32 of its arc). The studio
  paragraph's *"88pt"* was written against the web hero dial; on a 164pt dial
  88pt would nearly touch the arc. B3's checklist line says *dominant*, and
  the reading is the largest thing on the screen. Not changed.

**A real defect the screenshots found.** After the second visit to Plan or
Service the list sat ~60pt low under its rail, with nothing in the gap.
`useRefetchOnFocus` passed the caller's `load` straight to
`addListener('focus', …)`, so the focus *event* arrived as `load(isRefresh)`
and every return to a tab ran as a pull-to-refresh; with a response that
resolved in the same frame — the fixtures do, a cached answer would — iOS's
refresh control began and ended before drawing and left its inset behind.
Fixed in the hook (`() => reload()`), guarded in
`screens-refetch-on-focus.test.ts`. It survived four graded rounds because
each tab was shot on its first visit.

**Parking lot — for David, with the facts the loop found:**

- *The strip: MILEAGE · AVG · RELIABILITY* (gap 2, asked in four rounds).
  `avg_miles_per_month` **is** on both the garage and the vehicle payloads;
  `reliability_score` is on the vehicle payload only (`load-vehicle` selects
  the whole knowledge-base row) and not on the garage list, and it is the
  researcher's 1–10 with a `.default(5)` — a guessed value §10 would not
  print. Web's mobile dossier shows the trim **in the model name** ("ACCORD
  SPORT 1.5T") and the strip as MILEAGE · AVG · RELIABILITY with DAILY DRIVER
  as a chip. Moving TRIM off the phone's strip therefore means moving it into
  the name line, and RELIABILITY needs `GARAGE_COLUMNS` to embed the
  knowledge base — an API change that must promote before a build can rely
  on it (CLAUDE.md §8). Two decisions, neither the loop's.
- *The Vehicle plate's height* (gap 3). Round 23 praised the tall crop;
  round 24 called it *"the poster the direction warns against"* and asked
  for the garage's height. The hero mirrors web's `--hero-h: clamp(400,
  62svh, 560)` and carries the pullback's whole motion design; the
  web-reference *mobile* dossier, though, places a contained plate under the
  identity rather than a 62svh hero. Which of the two the phone follows is a
  design call; both critics cannot be satisfied by a number.
- *The sliders icon on "What is driving this score"* — cut twice (rounds 23
  and 24). `NavRow` makes `icon` required for a stated reason (an optional
  icon gets omitted under deadline; a lone bare row reads as a fault), so
  dropping it there is a contract change, not a deletion.
- *ABOUT 2015 BMW M235I on Advisor* — cut once. R52 argued it in: the line
  names what the thread is about, which matters in a two-car garage.
- *Whether three tabs need three stills* — the critic's own question, and
  David's to answer; the loop built what he asked for.
- *Which screen owns the dial* — the reading appears on Garage as the dial
  and on Vehicle as `70 FAIR`; the critic asks which is the instrument.

**Round 25 — 7/10, 3 ✅ / 6 🟡 / 0 ❌, `Continue: yes`.** Flat, and the loop's
own rule says two flat rounds stop it. It ran one more, deliberately: the
critic's top gap was not taste but a measurement it asked for and this
implementer had refused the round before — *"the dial is under-scaled … the
web dial fills about two-thirds of the phone width … measure, do not
eyeball"* — and the critic said one more round *"should close rather than
drift"*. Measured against `web-reference/dossier-dashboard-mobile.png`, it
was right: the web dial on a phone-width viewport spans ~62% of the width
(~240pt) with a numeral of 48 in a 200-unit viewBox (~86pt), and the bay's
dial was 164pt with a 56pt reading — the same *ratio* as the north star, at
two-thirds of the web's *size*. §6.12's earlier note ("left alone") had
measured the ratio and not the dial. `BAY_DIAL` is 240 and
`ClusterGauge.HERO_NUMERAL` is `88 / 240`, so the reading is the brief's 88
on the dial the web draws; the cyan `BayLightPool` under it is gone (B7
lists cyan's three jobs and a decorative pool is not one; on every graded
frame it was invisible air), and the readings table lost its own top margin.
On the 16 Pro the second reading row still ends 40pt above the tab bar; on a
4.7″ display the dial is whole above the fold and the two rows scroll.

The two cuts the critic could not resolve were measured at native resolution
from `25-screens/`: the garage plate's top-right notch recedes one page-
coloured pixel per row over 24px (8pt at 3×), and the search field's
bottom-right is a 36px diagonal (12pt) carrying its hairline stroke. Both
present; nothing changed. The collapsed mono nav title was shot as an extra
frame for round 26 (`03b-service-collapsed.png`, Service scrolled to its
foot: SERVICE in mono on graphite, the plate gone with the large title, the
rail and the primary risen with the band). The factors table cannot be shown
from the fixtures (the health summary carries no drivers), the viewfinder is
a build, and pull-to-refresh is a gesture; three frames the loop cannot
supply, recorded rather than staged.

Gap 3 — *"grotesk label, mono value"* for the two rows under the Vehicle
plate, and one slot for OPEN RECALLS on both screens — was checked against
the web reference and not taken: web's own spec table (`vehicle-record.png`)
labels its rows in **mono** caps with mono values right, which is exactly
what Garage's readings are; round 24 asked for that, round 25 reads B6's
"grotesk label" the other way. The Vehicle hub's `NavRow`s are a different
object (sans label, icon, chevron) and are where the mismatch actually
lives; it joins the parking lot with the sliders glyph rather than being
re-voiced on the strength of one reading.

### 6.13 Rounds 26–28 — the off-frame states, and the two rows they exposed, 12 Sep

Scores: 8 → 7 → 8, and the loop stops on the critic's `Continue: no` at
round 28 — the second time it has said so at 8, which is the plateau
`design-critic-loop-plateaus-at-seven` describes, one point higher.
Checklists: round 26 **7 ✅ / 2 🟡** (B2 the cut, B9 the viewfinder); round
27 **6 ✅ / 3 🟡** (B1, B5, B9); round 28 **7 ✅ / 2 🟡** (B1, B9). The dip
in the middle is not a regression and the critic did not name one: round 27
was the first round handed the frames §6.12 recorded as unsupplied — the
Vehicle screen scrolled past its plate, and the factors table — and two
things the loop had graded ✅ on the first fold for twenty rounds were sitting
under it.

**Round 26 — 8/10, `Continue: no`, graded as it stood.** The previous
implementer's last commit re-shot the dial at the web's size and the
collapsed Service title; the critic closed B3, B4, B6 and B8 on them and
left B2 at *"the plate cut does not read"* and B9 on the viewfinder. Its gap
3 was the fourth consecutive round naming "What is driving this score" — a
bold sentence-case sans row with a sliders glyph directly above OPEN RECALLS
in condensed caps — this time with the instruction *"set it like its
neighbour, drop the icon, keep the chevron."* The loop ran on past the
`Continue: no`, deliberately and for a stated reason: the caller had asked
for the off-frame states to be shot rather than argued about, and the one
visible gap left was four rounds old.

**Round 27 — what was taken, measured first.**

- **The score row is a row of the table** (`[B1]`). `BandRow` is
  `RecallBand`'s drawing with the recall taken out — a hairline per row and
  one under the last, a condensed caps label, an optional sans line, an
  optional mono value at the right, a chevron — and `RecallBand` is now a
  thin wrapper that owns the noun, the count and the reader's sentence. The
  two sit under the reading as a two-row spec table, the same shape the
  garage draws under its dial; `cardExit` (R24's rule between a card and
  its way out) went with the row it separated. ⚠ The web reference settles
  the "grotesk label, mono value" question §6.12 left open: the web's
  *destination* rows on the dossier (VEHICLE DOSSIER, WISHLIST) are
  condensed caps with a chevron, while its *fact* rows on the record are
  mono-labelled. A row that goes somewhere is condensed; a row that states a
  value is mono. Both screens' OPEN RECALLS rows go somewhere, and the
  garage's mono one is left as it is — the critic did not raise it again.
- **The two cuts were handed to the critic as pixels** (`[B2][B4]`). Round
  25 had measured both at native resolution and written the numbers into a
  commit message the critic cannot read; two rounds later it still marked
  B2 🟡 *"not resolvable at this scale"*. Two 4× nearest-neighbour crops of
  the shipped frames — the garage plate's top-right and the search field's
  bottom-right — went into the set as evidence, not a re-shoot, and B2 went
  ✅ on them in rounds 27 and 28. A measurement the critic can see is worth
  three it cannot.
- **The Vehicle's collapsed title is mono** (`[B8]`). `navTitle` was
  `type.uiStrong` — Inter semibold, sentence case — beside a "‹ GARAGE"
  already in `monoNav`; the same token as the roots and the back control
  now. Never in frame before, because no graded frame had scrolled the car.
- **`ListGroup` is a band** (`[B5]`). It was `surface.raised` inside a
  hairline frame with a sans (`type.label`) eyebrow — the one filled,
  outlined block on a screen of bands, twice on the scrolled Vehicle sheet.
  Two hairlines now, the eyebrow in `displayLabel`. `WishlistAddScreen`
  still groups its suggestions in it.
- **The factors table can be shot.** `fixtures.ts`'s `/load-vehicle` answer
  carries `health_drivers`, computed by `driversForVehicle` from the
  fixture's own facts rather than written by hand — no schedule on this
  fixture, so Maintenance scores nothing and says so; two recalls; a light
  mileage load. B6 was already ✅ on the service rows; the frame made it
  ✅ on the factors as well.

**Round 27 — 7/10, and what the frames exposed.** The critic took the score
row and the B2 crops, and named two things the new frames put in front of it
for the first time: the hub — *"an iOS settings list inside a spec-table app:
glyph, sans title-case label, sans value … inset separator"* — and the nav
chrome one push apart, *"a thin hairline '< GARAGE' under a '2015 BMW M235I'
mono-caps title; Health's is the system's heavy chevron with 'BMW M235i' in
mixed case."* It asked for one more pass scoped to those two and then a stop.

**Round 28 — taken, both.**

- ⚠ **The hub's rows are `BandRow`s, and this supersedes David's 23 Aug
  decision.** `NavRow` — glyph, sans label, sans count, inset seam — was his
  correction (*"'This car' section is still really bad UI and UX, it's ugly
  and uninviting to engage with"*) against a hub of four bare sans words in
  a card, and the Lucide glyph was made *required* so it could not be
  dropped under deadline. That decision predates the locked brief, and the
  first scrolled frame showed its cost under it: values ("No schedule yet",
  "5", "Daily Driver") in sans where the garage and the strip set the same
  strings in mono, and the clock and wrench meaning Plan and Service in the
  tab bar while meaning Service and History one screen up. The rows are now
  condensed caps, mono value right-aligned, every chevron on the right edge,
  no glyph — the web dossier's own destination rows — under condensed
  eyebrows (`SectionHeader`). What the 23 Aug correction argued for survives
  as structure: the label outside the group, 56pt rows the eye can count,
  each carrying what is behind it. `NavRow.tsx` is deleted rather than left
  as a dead component with its argument attached; the argument is in
  `BandRow`'s docblock. **For David to overrule** — it is his decision being
  superseded, on the strength of a brief he approved after it.
- **One back control** (`[B1][B8]`). `BackControl` is the hairline chevron
  and the `monoNav` label the vehicle screen always drew; `screenOptions.
  headerLeft` now hands it to every pushed screen (native-stack hides its
  own button when `headerLeft` is given and passes the previous screen's
  `title` as `label`), and the vehicle screen renders the same component.
  ⚠ The 6 Sep note that *"a hairline SVG chevron per screen is a bigger
  change than this line"* was right about the size and wrong about the
  need: `headerBackTitleStyle` could put the native label in mono but never
  in caps, because the `UILabel` it becomes ignores `textTransform`, so the
  seam was always going to be visible the first time a pushed screen was in
  frame. A JS `Text` honours the transform; "BMW M235i" lands as BMW M235I
  with no change to the string the route publishes. `mobile-tab-roots`
  gained the guard, with the two silent regressions as its anti-vacuous
  cases (the option gone; the option rendering something else).
- "How you use this car" is **"How you use it"**: at the section head's size
  the longer label truncated to "HOW YOU USE THIS…" beside its value, and a
  destination's name is the one thing on the row that must not.

**Round 28 — 8/10, `Continue: no`.** B5 ✅ on the hub; B1 🟡 on a reading
that does not survive measurement: the critic put THIS CAR / WHAT YOU TOLD
US / WHAT IS DRIVING IT "in the sans" and asked for every eyebrow in mono.
They are `type.displayLabel` — Archivo Narrow 600 at 12pt, the token
`SectionHeader` moved to on 6 Sep for exactly the reason the critic gives —
and at 12pt on a scaled frame the condensed face and Inter are not
distinguishable, which is the misread the loop's memory note predicts past
7. Its other two gaps are decisions and not design: the Vehicle sheet's one
filled primary is ASK THE ADVISOR by the screen spec's own sentence (*"one
filled primary per screen, and it is this one"*), and the critic's proposal
to give the fill to SCAN INVOICE and demote the advisor is an IA call for
David; the strip's AVG · RELIABILITY is §6.12's standing item, an API
change before a design one. Neither is taken, and the loop stops where the
critic says it should: *"the next round worth a critique is the one with the
viewfinder in it."*

**Three frames, and the one that could not be taken.** `06-vehicle-
collapsed` and `07-vehicle-factors` are in every round from 27 on and did
the work above. Pull-to-refresh is not: the fixtures answer in the same
frame, so there is no refreshing state to hold, and a pull held under the
simulator's injected touches does not engage the scroller at all. ⚠ And
the brief's refresh — *"a cyan hairline ramp along the top rule with mono
REFRESHING"* — is not built; the app uses the system `RefreshControl`. It
is the studio paragraph, not a checklist line, so no round has graded it;
it is recorded here as unbuilt rather than as unphotographed.

**Two defects the frames found, flagged and not fixed here.** The Health
screen prints the stored health sentence verbatim, where the Vehicle screen
runs it through `healthVerdict` — on the fixtures the two screens
contradict each other one tap apart, and the critic's round-28 Cut list
caught it (*"carry the caveat, drop the paragraph"*). And `load-vehicle`
selects `plate_key` but does not hand it to `resolveVehiclePhoto`, so after
a photo is removed the Vehicle screen refetches the stock image or the house
plate where the garage list resolves the generation plate — the two-screens-
disagree shape `lib/vehicle-photo.ts` warns about, one line away. Both are
spawned as their own tasks; neither is in the loop's lane.

**Also in these rounds, not a design change: Remove photo.** David, on the
phone: *"i can't delete the image i uploaded on the app, so i can't revert
to seeing the new default images for my car."* The API had gained the route
(c876ad2); the screen now offers Remove from the one photo control as an
`ActionSheetIOS` (Change photo / Remove photo / Cancel) and asks once —
"Remove this photo? The car will stand on its plate." — then shows the plate
optimistically and puts the photograph back with a banner if the removal
fails. ⚠ A sheet, not a second control beside CHANGE PHOTO, and not a
standing sodium-hairline REMOVE: the nav row over the photograph holds one
control (the score chip was cut from that slot for crowding the title), a
permanent destructive control would spend B7's warning axis on something
present whenever the car has a picture, and the web's own dialog holds
Remove *inside* Change. The sheet and the confirm are UIKit's surfaces, so
the graded frames did not change. Commit `9929b7f`.

**Parking lot — for David, added by these rounds:**

- *The hub's glyphs* — superseded above; one sentence from David restores
  `NavRow` from `git`, or blesses the table.
- *Which control is the Vehicle sheet's primary* — ASK THE ADVISOR (the
  screen spec) or SCAN INVOICE (the critic's reading of B9's "headline act").
- *The three root mastheads* — the critic has now called them outside the
  brief in two rounds (*"imagery has one job here, the plate"*); David asked
  for them (§6.11). If they stay, the brief wants a line for them.
- *The Health screen's summary* — spawned as a task; the fix is the Vehicle
  screen's `healthVerdict` pattern with the service count.
- *The strip's AVG · RELIABILITY* — unchanged from §6.12; an API decision.
- *A plate that is still drawing* — the phone could say "Drawing this car's
  plate" (`plateStatusLine`) if a mobile route carried the plate's status;
  none does, and reading `vehicle_plates` from the device is the second
  answer to one question `api/client.ts` exists to prevent. Not built.
- *Search on a five-item history*, *root titles collapse left while pushed
  titles collapse centred* — the critic's, repeated; both are
  react-navigation facts (§6.8) rather than choices.

**Guards.** `mobile-tab-roots` gained "the way back is one control";
`primitives.test.tsx` gained `BandRow` (the condensed label, the warning as
the only glyph, the closing rule on the last row, the reader's sentence);
`VehicleDetailScreen.test.tsx` gained the sheet, the confirm and the
optimistic removal with its revert. Nothing was relaxed; `GarageScreen`'s
hierarchy case and the hero suite were untouched by the hub change because
they pin order and photographs, not row components.

### 6.14 The phone adopts the wait instrument — round 29, 12 Sep

Web settled one wait instrument on 11 Sep (§14: `components/Working.tsx`,
the health dial's ignition sweep held until the work is done, critic 9/10,
nine of nine lines). The phone joins it: `apps/mobile/src/components/
Working.tsx` is the same instrument — the same 270° track from
`@tappet/core/cluster-geometry`, a 24° pip in the info blue hunting terminal
to terminal at ~1.3s a traverse, the terminal flashing the lit step on
touch, an empty centre where the numeral would be — at the web brief's three
sizes (128 full on a phone, 20 compact, 14 mark), with a ledger only where
a process emits real stages, and `Button`'s busy form for the control that
started the work (B7 of the instrument's brief). What it replaced, and what
each site became:

- The advisor's "Reading this car's history…" over three pulsing bars — a
  stage the client cannot see, over a wait dressed as content — is the
  compact face saying ANSWERING with the one sentence true for the whole
  call, and Ask takes the busy form with the bare mark (B9: two panels, two
  pips, one status). No upload stage: the phone's advisor attaches nothing.
- `Button`'s `ActivityIndicator` is the outlined form at the rest width,
  the 14pt mark and a mono status in `register.accentStrong` — the rest
  label held in flow at opacity 0 so nothing beside it shifts. Sixteen
  call sites gained a present-tense `busyLabel`; the two too narrow for a
  word (Ask, Undo, the wishlist row's Add) carry the bare mark.
- `Suggest`'s spinner beside "Looking these up…" is the compact face;
  `VehiclePlate`'s photo action carries the bare mark with the state as its
  accessible name; the paywall's text-only "Loading prices from the App
  Store…" is the compact face (B8: waits always carry the arc).
- The invoice scanner's three loose sentences are a `ScanPhase` and a
  ledger: opening the camera / your photos → reading the invoice, and a
  third row — filing it against this car — **only on the confirm path**,
  where the second send is a boundary the client started. `working-
  stages.ts` carries why the ordinary flow has two rows and not three.
- Ten page loads (Garage, Vehicle, Health, History, Due, Needs, the
  suggestions, What you told us, the recalls, Build) take the full face
  with `delay`: invisible for 350ms so a fetch that answers sooner never
  paints a dial. The embedded recalls section under Health takes the
  compact face, delayed, because it is a section of a page already up.
  `Skeleton.tsx` is deleted with its test rather than left dead. The app's
  root gate — waiting on the Keychain and the fonts — is the bare mark at
  the compact size, delayed, because it cannot set a line in the mono it is
  waiting for.
- Seven dead `ActivityIndicator` imports are gone, and
  `lib/__tests__/mobile-one-wait-instrument.test.ts` refuses the next
  spinner, skeleton, loop or clock outside an allow-list whose one entry is
  the instrument's own `Animated.loop`. `mobile-busy-controls-named` and
  `mobile-loading-shape` were re-pointed at the mark and the delayed
  instrument, neither relaxed, both keeping their anti-vacuous cases.

**The plate says it is drawing.** Both mobile routes carry `plate_status`
beside `photo_url` since c134bb6, and `PlateStatusLine` prints
`plateStatusLine` from `@tappet/core/plates` over the model name on the
empty plate — "Drawing this car's plate" with the bare mark on `pending` /
`generating`, "Plate not drawn yet" quietly and without an arc on `failed`,
nothing on `ready` or `null`. `fixtures.ts` reads the status from
`EXPO_PUBLIC_DESIGN_PLATE_STATUS` so the loop can shoot it, and
`EXPO_PUBLIC_DESIGN_HOLD` names paths whose requests never answer, so a wait
can be photographed without spending the call it waits on — the phone's
`/dev/working`.

**Health says what Vehicle says.** §6.13's spawned task: `HealthScreen`
printed the stored sentence raw where the vehicle screen ran it through
`healthVerdict`. Both read `screens/verdict-inputs.ts` now — the newest
filing date and the open-recall count, computed once — and Health prints
`verdict.text` with the provenance row, so on the fixture car both screens
say "taken before your 5 service records were filed".

**Round 29 — 7/10, five ✅ / four 🟡, `Continue: yes`.** One round by
instruction. Gap 1 (B3, Health's dial at 184 against the garage's 240) was
taken. Gap 2's file name in Inter was taken — `Working` has a `value` slot
in the mono beside the `detail` sentence, because the phone's B1 gives
every value to the mono where the web's instrument puts file names in its
one grey sentence. The rest of gap 2 is round 28's misread again ("WHAT IS
DRIVING IT" is `type.displayLabel`; §6.13) and §6.13's standing garage-row
item. Gap 3 is below.

**Recorded deviations, and two rulings Design owes:**

- **The full face is a band, not a panel.** The web brief's B3 draws the
  full face in its own graphite panel with the 45° cut; the phone's B5 is
  *"one graphite surface; cards become hairline-ruled bands; no nested
  cards"*. On the phone the full face is a hairline rule and the cluster on
  the page, stacked arc-over-text on one left edge — which is what the web
  brief already says the phone-width composition does. 24pt above and
  below (§14.3's phone padding).
- ⚠ **The ledger's active ink — the phone's B7 against the instrument's
  B4.** The critic's round-29 gap 3 asks for off-white ink on the active
  stage under the phone's B7 ("cyan only as focus, active rule and refresh
  ramp"). The instrument's own locked brief says the opposite — B4: *"active
  = cyan ring and cyan label"*; B9: *"cyan only on pip, terminal, active
  stage"* — and the web closed at 9/10 with that ink. The phone draws the
  web's ledger. Design should say which brief the ledger answers to; until
  then the two clients draw one ledger.
- **The compact face's dot is 3pt** (§14.2), and the mark draws no
  terminals — the web's measurements, kept.
- **No "quiet skeleton" on the phone.** The web rule keeps a still band for
  sub-second layout holds; the phone has no layout hold — every wait here is
  a fetch — so the pulse is retired with its last caller rather than left
  as a primitive nothing reads. The day a layout hold appears it is a still
  band on the cut, never a pulse; the scanner refuses the loop.
- **`register.accentStrong` (`#A5DCEC`) is new to the phone's theme** —
  web's `--info-strong`, read off `globals.css` for the terminal flash and
  the busy status. The phone had `--info` and not its lit step.
- **The plate line sits over the name, on the night.** The identity block's
  eyebrow, in `monoLabel` off-white with the mark in `register.accent` — on
  the garage it lands above the fade's start, as the name already does.
- **`MarkDoneSheet`'s "Saving…" text swap is the one wait left without the
  arc.** Its CTA is the retired cyan `brand.primary` fill on a sheet the
  port has not reached; making it a `Button` is that sheet's port, not this
  pass. Recorded so it is not mistaken for a decision.
- **The critic's Cut list** asks for the full face's rule and headline to
  go on the scanner. The rule is the band's edge (B5) and the headline is
  the instrument's status line (the web brief's B3); both stay.

### 6.15 The loop over the Service tab — rounds 30–33, 12 Sep

David, on his phone: *"i want design critic loop over service tab. i'm not
loving the ui, i don't think critic could possibly give that at least an
8."* Round 30 shot the tab in every state it has (`30-service/`: Due with a
schedule, History, collapsed, search, the scan's first frame, the pushed
Service, both empties) and graded it **6/10** — seven lines at partial. The
critic's sentence: *"History is committed … Due abandons that for sans-bold
prose rows with a grey slab button under each and a bordered card on top, so
the tab speaks two dialects and the weaker one is the landing segment. Scan,
the headline act, opens on a void."* Its three gaps were the Due list (B6,
B1, B4), the scan's first frame (B9) and the odometer card (B5, B4, B7); its
Cut list was the empty History's second scan button, the empty Due's
odometer card and schedule caption, and the pinned search field.

**Round 31 — 7/10, 6 ✅ / 3 🟡 / 0 ❌, `Continue: yes`.** Blind rank: phone
History, phone Due, web Service — *"an execution quality that betters the web
sibling's own Service page."* Taken, and what each became:

- **The Due segment is the spec table, and the whole schedule is on it**
  (`[B6][B1][B4]`). `ServiceMilestoneScreen` drew the next visit as a card of
  prose with a full-width "Add to wishlist" slab under every row, and nothing
  else — a car with a schedule and nothing within 5,000 miles read "Nothing
  due right now" over a blank while six services sat computed and unshown.
  It is the History row now (mono index, grotesk label, right-aligned mono
  *position* — "400 MI", "−3,000 MI", a dash where nothing can be counted
  from — hairline per row) and every evaluated service is on it under three
  condensed heads: the visit, named for its anchor and carrying
  `milestoneReason`'s own sentence (the notification body; the two must
  agree, so it is not re-voiced into caps); COMING UP; TIMED BY DATE, NOT
  MILEAGE. Web's Due lists every row in urgency order (`ServiceDueList.tsx`)
  and the phone joins that. ⚠ **Provenance is per row now, not per
  milestone.** `milestoneBasis` reported the weakest claim a visit could
  jointly support — honest, and it threw away a distinction the data holds;
  each row's meta line carries its own `SERVICE_BASIS_LABELS` entry beside
  the interval, which is what web does and what `service-provenance.ts`
  argues for. The row's action is the mono caps word the roots give their
  chrome (ADD, a `ghost` `Button`; ADDED once it is on Needs), in a column
  of its own so the numerals share an edge. ⚠ The model's per-service
  `description` is no longer printed on the row — B6's row has no slot for
  prose — and still travels to Needs with the item.
- **The odometer gate is a band with the `Field` primitive** (`[B5][B4][B7]`).
  It was a bordered, tinted card holding a square Inter input beside a
  second off-white primary. The question stays (R14: the gate is a banner,
  not a screen; the test still asserts it is asked before anything is
  asserted), the reading is the `Field` — mono, cut, ODOMETER in the label
  slot — and THAT IS RIGHT is the secondary hairline so SCAN INVOICE is the
  only off-white on the screen. After confirmation the reading is a row of
  the table (ODOMETER · 66,000 MI), not the sans "66,000 miles" line.
- ⚠ **Fields have a focus state, and the caret is not system blue** (`[B7]`).
  `Field` had no focus treatment at all; the one thing that changed on focus
  was the caret, which iOS draws in its own blue unless told otherwise — so
  the only focus signal on the phone was the hue B7 bans, and the critique
  saw it on the search field. The stroke steps to `brand.accent` while
  focused (a `problem` outranks it and keeps sodium), `selectionColor` and
  `cursorColor` are the accent, and the search field draws the same rule.
  `primitives.test.tsx` reads the rendered `RNSVGPath` stroke through the
  focus/blur cycle, so a regression to the default cannot pass silently.
- **The search field scrolls with the list** (`[B9]`, the Cut list). It was
  pinned under a note arguing the wishlist filter's case; by round 30 the
  rail, SCAN INVOICE and the field held ~220pt under the nav with five
  records scrolling beneath, and the critique named the pin in four rounds.
  The rail and the primary are the root's; the field is the list's, and it
  goes where a list's search goes on this platform — first in the list, gone
  once you are reading. The old note is kept in the screen with the
  supersession; `ServiceHistoryScreen.test.tsx` holds the field inside the
  scroller.
- **One scan control per screen.** The empty History offered SCAN AN INVOICE
  400px under the pinned SCAN INVOICE; the empty state now has words and no
  button. The empty Due lost the odometer card and the "Typical schedule …
  AI-generated" line — nothing to compute from, no schedule to cite — and
  says NO SCHEDULE YET, which is `nextService`'s own distinction: a car
  whose every service is unknown is not "nothing due".
- **The scan's first frame is top-aligned, in the brief's grammar** (`[B9]`,
  partial). R57's optical centre put two sans paragraphs and two equal
  buttons 40% down a black field; the critique called the remainder *"a
  placeholder layout"*. It is a mono caption, one body, one primary and the
  library as a `ghost` beneath, top-aligned in every state so the block does
  not jump into the wait. ⚠ **R57 is superseded on this screen** as it was
  on the roots (§6.9). What the frame still is not is B9's viewfinder —
  hairline corner brackets over a live feed — which is `expo-camera`, an EAS
  build (§6.9, §3.23); brackets drawn over graphite would be a picture of a
  viewfinder, which the critic would rightly call a placeholder. B9 stays 🟡
  on that build whatever this loop does, and round 31's gap 1 asks for the
  viewfinder again.

**The fixture grew, in shapes the suites already drive.** `fixtures.ts` now
carries a typical schedule for the M235i (`SCHEDULE`, `ScheduleEntry`'s
shape from `service-due.test.ts`), fed to both `knowledge.maintenance_
schedule` and `driversForVehicle` because the route feeds both; the sweep's
`next_service_label` / `next_service_at_miles` (the garage row's shape from
`GarageScreen.test.tsx`) so the garage and the hub stop saying "No schedule
yet" beside a Due segment listing eight services; and `EXPO_PUBLIC_DESIGN_
EMPTY=history,schedule`, which answers the two stores empty so the two empty
states can be shot without editing the file. ⚠ The frame's one warning rests
on a recollection on purpose: the drive-belt check counts from the owner's
"Timing belt" at 48,000 (one category in `categoryFor`, the product's own
rule) and is 3,000 miles past, and the row says "Based on what you told us
at sign-up" beside it — the claim the provenance line exists to qualify.

**Not taken in round 31, and why:** B2 🟡 is the masthead plate's cut, which
the critic itself marked *"do not act on this"* (§6.11: the cut is
bottom-right on a plate whose top edge is the screen's); the strip it
mentions is Garage's by the brief's own words.

**Round 32 — 7/10, 6 ✅ / 3 🟡, `Continue: yes`.** Taken from round 31's
gaps 2 and 3 and its Cut list: the History summary carries no total while a
search is active (its label said "1 OF 5 SHOWN" while its numeral summed all
five) and none while only one visit is priced (the head one band down
already says it — `ServiceHistoryScreen.test.tsx` holds both); the
provenance caption counts the invoice's lines rather than the matches ("a
1-line invoice" was the filter describing the query); the Due row's numeral
ends at the rule with ADD on the meta line beside it; the gate's body is
one sentence; the scan's two paragraphs are one. ⚠ **The row itself is not
the add affordance**, which the critic proposed in rounds 31, 32 and 33: a
tap that writes to Needs with no visible verb is a write on a mis-scroll
(`WishlistAddScreen`, R39, made the same call for its rows), and the History
row's tap *opens* something one segment away. The verb stays. **For David
to overrule.** B2 closed on a 4× crop of the masthead's corner, as round 27
closed the garage's. The two new 🟡s were the implementer's: B7 was the Expo
dev client's own "Refreshing…" banner across two frames shot seconds after a
reload (dev chrome, not the app — the app's refresh is the system control
in `text.muted`, and the brief's ramp is §6.13's unbuilt item), and B1 was
the condensed face at 15pt read as bold Inter caps — §6.13's misread, one
size up.

**Round 33 — 7/10, 8 ✅ / 1 🟡, `Continue: yes` — and the loop stops.**
Taken: the Due group heads and the History visit heads are
`type.displaySection` at its own 20pt rather than a 15pt override (the web
sets SPECIFICATION and PERFORMANCE at the token's size, as do the hub's
rows); `Button`'s `ghost` speaks in `text.secondary` — the roots' chrome ink
(ADD CAR, ACCOUNT) — because eight of them at full ink down the Due table's
edge outweighed the numerals, and it **presses to `surface.raised`**, which
`mobile-pressed-states.test.ts` had described since August while the `FILL`
map carried no `ghost` entry (a ghost gave no feedback at all; the guard's
sentence was the only place the rule lived); the air between SCAN INVOICE
and the first rule is 24pt, not 32; CHOOSE FROM LIBRARY sits on the page
margin; the empties were re-shot clean. B1, B2, B6 and B7 all ✅; the
score did not move, and the critic said why: *"the viewfinder is a full
point; everything else here is polish."* 6 → 7 → 7 → 7 is the loop's own
two-flat-rounds stop, and the point it is short by is `expo-camera` — an
EAS build (§6.9), not a design.

**Blind rank, all three rounds:** phone History, phone Due, web Service. The
critic on the sibling, unprompted: *"the web sibling still ships red
'Critical' fills and a pill segment; the phone is now ahead of it on B4 and
B7."* Web's Service page is the one that has drifted from its own system
(§6.15 opened with the same observation in round 30's parking lot).

**Recorded, not built — the next round's list, ungraded:**

- ~~*The odometer gate's field and verb*~~ (round 33, gap 2, `[B4]`) —
  **taken after the stop, ungraded** (`dfcbfa9`): the `Field` was 48pt and a
  small `Button` 44, bottoms aligned, tops 4pt apart — measured on the frame
  by the critic and confirmed in the source. `CONTROL_HEIGHT = 48` (the
  brief's figure for a button) now sits beside `TARGET_MIN` and `SPEC_ROW`;
  `Field` and `Button`'s `small` both read it, `large` keeps its recorded
  52, and the two strokes measure one edge at 3× (1052–1194px). The gate's
  question stepped from body to UI size in the same change.
- *One header treatment* (gap 3, `[B8]`): the collapsed root closes its mono
  title with a hairline; the pushed native header draws none.
- *The scan screen's tab bar* (Cut): a full-screen headline act would hide
  it — with the viewfinder, since the system camera already does.
- *The pinned rail + primary* (Cut, rounds 31–33): a quarter of the viewport
  once scrolled; the critic wants the primary to scroll with the list and
  only the mono title pinned. Round 30's B9 reading made the scan a
  first-class primary *in every state*; which of the two readings holds is
  David's.
- *"mark something done on Needs"* in the empty History: the critic read
  "Needs" as this tab's Due segment. Needs is the Plan tab's list; the
  sentence may want the tab's name.

**Parking lot — for David:**

- *SCAN INVOICE could open the camera directly.* The critic's B9 reading
  across three rounds: the primary should land in the camera, not on a page
  with a second primary. Without `expo-camera` the only camera is the
  system's (`expo-image-picker`), which could be opened on push — one tap
  fewer, and the library reachable after a cancel. That demotes the library
  the file's own note refuses to demote (*"Not a fallback"*), and it is a
  flow change, so it is here and not in the code.
- *A filtered visit's total* (round 33): the head totals the lines on
  screen ($678 of a $1,313 visit). The screen's docblock argues that is the
  honest figure; the critic reads it as the visit's cost. One of the two
  readings should be written down as the rule.
- *Whether a Due row's tap should add to Needs* — declined three times above,
  with the reason; the critic has not withdrawn it.
- *The odometer field's formatting* ("66000" under "66,000 miles?"), the
  search placeholder's size, and the empty Due naming how a schedule is
  obtained — the critic's parking lot, unchanged.

### 6.16 B9 is built — the viewfinder, rounds 34–36, 12 Sep

The line §6.9 and §6.10 called *"on a build"* was not on one. `expo-camera`
and `expo-haptics` landed on `main` in `0bdaf9f` that morning and both are
bundled in Expo Go, so the frame the critic asked for in four consecutive
rounds — *"hairline corner brackets, mono readout, CHOOSE FROM LIBRARY as
the hairline secondary at its foot"* — was a JS change. `components/
Viewfinder.tsx` is it, and `InvoiceScanScreen`'s idle frame is the
viewfinder (`f80e4ba`). **Round 34 graded B9 ✅.** Scores 7 → 8 → 7 across
rounds 34–36; the loop stopped on the critic's `Continue: no` — *"the
surface has reached the brief."* Eight of nine lines ✅ with B3 not on this
surface; the ninth (B6) is copy that lives in `packages/core`.

⚠ **Shot on the iPhone 16 Plus, not the 16 Pro.** The simulator input tool's
taps reached SpringBoard, Settings and system alerts on the Pro and never
Expo Go's project surface there, before and after a reboot; on the Plus
every tap landed. Same app, same fixtures, 1290×2796 instead of 1206×2622;
the blind set normalises width. The Expo dev-tools button was switched off
in Expo Go's dev menu before shooting (round 32's B7 🟡 was that chrome).

**What the viewfinder is, and the four things it was careful about:**

- The feed full-bleed under the header, four cyan hairline brackets (1pt,
  24pt legs, inset by the page gutter), a readout row in the spec row's
  grammar — PHOTOGRAPH THE INVOICE on the left, the camera's word on the
  right — a CAPTURE primary with CHOOSE FROM LIBRARY beside it at one
  height, and R49's caveat as one line at the foot. ⚠ The caveat stays
  *before* the photograph, for the reason §6.15 gave: there is no review
  step, lines file as they are read, and the critic's ask to move it to one
  (rounds 31, 32, 34, 36) describes a screen that does not exist. What the
  viewfinder took from the ask is the length — an explainer page became a
  line.
- **The brackets are cyan.** B7 gives cyan three jobs and a viewfinder's
  frame is the focus of a capture; the critic's own picture of the screen
  (`critique-32.md` §6) drew them cyan, and round 34 read them as *"focus"*
  under B7. An off-white hairline would vanish on the white paper it frames;
  `border.*` at 8–24% would vanish on everything. No text sits over the feed
  — a live image has no contrast anybody can promise — so the readout is a
  row on the graphite beneath, where `contrast.test.tsx` measures it.
- **The readout prints only what the camera has said**: ASKING, CAMERA OFF
  (sodium triangle, the Settings line, OPEN SETTINGS), STARTING, READY,
  CAPTURING, CAMERA FAILED — and NO CAMERA, the simulator's word. ⚠ That one
  is not read from the ready event: `CameraView.swift` dispatches
  `onCameraReady` unconditionally once the props settle, so READY alone
  would lie on the machine this is developed on. `getAvailableLensesAsync()`
  reads `AVCaptureDevice`'s discovery session — empty on a simulator, never
  on an iPhone — and is asked *inside* the ready handler, because the class
  method answers `[]` when its native ref is unset and an effect racing the
  mount could read that as "no camera" on a real phone. `Camera.
  isAvailableAsync()` is web-only in 57 and throws on iOS; it is not the
  check. With no lens the capture control stands down — `takePictureAsync`
  returns a generated grey square there, and filing one against a car would
  be a lie the upload cannot see — and the library is still on the frame.
- **One firm haptic, at the press** (`Heavy`, before `takePictureAsync`),
  counted by `InvoiceScanScreen.test.tsx`: the count fails on a second
  impact anywhere on the path. The capture is the picker's `InvoiceFile` at
  the picker's quality by construction — `INVOICE_QUALITY` moved out of
  `pick-image.ts` into `media/invoice-image.ts`, read by both, and the guard
  reads both call sites.

**LEG-02 is asked at the door.** The sheet used to open when TAKE A PHOTO
was pressed and hold the source so agreeing continued into the camera. The
screen opens *on* the camera now, so the question is asked as it opens: the
viewfinder is held (`live={false}` — nothing filmed, no permission alert
stacked under the sheet) until it is answered, and agreeing arms it. The
ordering the old comment argued for is kept exactly: consent before the
camera points at anything. Declining stands the controls down — the frame
stays, the note and "Change that" sit at its foot, no camera runs for
nobody. Every camera route on the screen ("Take a photo", "Try another
photo") lands on the viewfinder, never the system sheet; `pickImage`'s
source narrows to `'library'`.

⚠ **`Viewfinder.tsx` imports its two native modules directly**, and the
seam `InvoiceScanScreen` kept for the picker does not extend to it: the
seam existed because the dev client of 5 Aug predated the picker, and the
same is true here — `ExpoCamera.js` requires its native module at import,
so **the old CrewChief dev client cannot load a bundle containing this
file.** Expo Go carries both modules, David's phone runs Expo Go, and the
device build compiles them in. `jest.setup.js` stubs both the way it stubs
the picker; `mobile-native-build-inputs.test.ts` lists both, the camera
reusing the picker's `NSCameraUsageDescription` and the microphone
deliberately *not* listed — `CameraView` is mounted in picture mode and the
iOS module touches the audio device only when recording.

**Round 34 — 7/10, B9 ✅, and three lines round 33 had passed marked
partial** (B2 the unnamed root, B5 the pinned band's open edge, B6 the
wrapped captions — all visible in round 33's frames, none raised then; the
variance §6.10 recorded). Taken for round 35 (`292e03c`, `f10e5df`):

- **The pinned band closes with a rule.** A hairline 12pt under SCAN
  INVOICE, so the list passes under a rule the way it passes under the
  collapsed title's — *"the search field is sliced in half in 03b."* The
  rule that used to open each segment's first band (the odometer gate's,
  the confirmed reading's, both empties') went with it, because two
  hairlines with 20pt of nothing between them read as an empty band. ⚠ The
  critic's other option — let the primary scroll with the list — is the
  round-30 reading David has not ruled on (§6.15's list); the rule keeps
  the decision open.
- **The Service root names its car**, in the Advisor root's context line
  (R52) and voice — mono caps, muted, pinned above the rail. Optional
  because the route's `title` is; suppressed when pushed, where the back
  label "‹ BMW M235I" already says it and a second copy 24pt beneath is the
  two-names-on-one-screen `ScreenTitle` retired. ⚠ **The Plan root has the
  same gap** and was not on this loop's surface; the one-liner is the same.
- **The odometer field reads 66,000** and holds `66000`: `groupDigits` is
  display, the value is digits, and `confirm` sends what it always parsed.
- Cut: SCAN AN INVOICE → SCAN INVOICE on the nav title and the hub's row
  (one name for the act); "mark something done on Needs" → "on Plan" in the
  empty History (§6.15 had recorded it). Declined, with the reason: *"The
  list below is worked out from this reading"* is the §10 statement that
  the schedule is computed from an unconfirmed number, and its own test
  holds it — asked for again in rounds 35 and 36, declined the same way.

**Round 35 — 8/10, 8 ✅ / 1 🟡, `Continue: yes`** — *"one pass for the
three named fixes would take it to 9; land them and stop."* One of the three
was the implementer's and is landed (`0326396`): CHOOSE FROM LIBRARY takes
the `outline` secondary beside CAPTURE at one height — the brief's own pair,
the odometer gate's grammar. The other two are not the implementer's:

- ⚠ **The Due row's caption (B6, the one open line).** *"Every 15,000 mi ·
  Based on what you told us at sign-up"* orphans a word on every iPhone
  width; the critic wants a mono token — `· SIGN-UP`, `· RECORDS`,
  `· ESTIMATED`. The layout is already the caption's full width minus the
  ADD word; a one-line caption needs shorter copy, and `SERVICE_BASIS_
  LABELS` lives in `packages/core` precisely so both clients make one
  claim. **Proposal for David/core:** a `SERVICE_BASIS_SHORT` beside the
  sentences, same three meanings, for a row that has no room for a
  sentence — web's `ServiceDueList` could take it too. Not written from a
  worktree, which does not edit core.
- *The filtered visit's total* — the critic re-raised §6.15's parking-lot
  item under B6 (rounds 35 and 36): the head reads $678 of a $1,313
  invoice while a search is active. Round 36 offers the second way out,
  *"or drop the figure while a filter is active,"* which is the rule the
  summary one band up already follows (round 32). The screen's docblock and
  `ServiceHistoryScreen.test.tsx` hold the current reading; David's to
  overturn.

**Round 36 — 7/10, the same checklist, `Continue: no` — the loop stops.**
No regression named for the 8 → 7 step (the critic's variance again), and
its gap 2 reverses round 35's gap 2: the box it asked for beside CAPTURE is
now the row to break up, with the library back to a mono caption beneath —
the round-33 form. Neither is taken; the brief's own pair stands, and the
reversal is the plateau signal. Gap 1's second half is the row-as-affordance
declined three times in §6.15; its first half — ADD one step of ink quieter
than the numerals — was round 33's change (`ghost` to `text.secondary`),
graded ✅ then and 🟡 now. Recorded, not built. The sentence to carry: the
remaining gaps *"will not move the score by a full point, and the surface
has reached the brief."*

**Parking lot, rounds 34–36 — for David:**

- ~~*The scan screen's tab bar* (rounds 34, 36)~~ — **taken, 12 Sep 15:59
  (`dad16c1`).** `TabBar` draws nothing on `InvoiceScan`, read off the
  focused tab's nested route; the viewfinder's foot pays the bottom inset
  the bar used to. Seen on the simulator: the act takes the frame, back to
  Service brings the bar with it.
- *The pinned stack* (rounds 34–36): plate, model line, rail and primary
  hold ~26% of the screen once scrolled; the critic would collapse the model
  line and the primary with the title and return them on scroll-up. The
  same decision as §6.15's — which of round 30's two readings holds.
- *Due-empty's "one button"*: the brief's empty state ends in one, and
  NO SCHEDULE YET offers no way forward. What the button does is David's.
- *The group head's sentence* ("Drive belt and tensioner, inspect is 3,000
  miles overdue" over a row that says the same): the critic would drop it
  when a section has one overdue item; §6.15 kept it as the notification
  body the two must agree on. Unchanged, for the same reason.

**B6 closed after the stop — the token beside the sentence, 12 Sep 15:48.**
The one line the loop could not close from a worktree is closed from the
main tree (`317e4a4`): `SERVICE_BASIS_SHORT` sits beside
`SERVICE_BASIS_LABELS` in `packages/core/src/service-provenance.ts` —
`RECORDS`, `SIGN-UP`, `ESTIMATED`, the critic's own tokens — and the guard
holds each token to a word its sentence already says, so a token cannot
claim more than the sentence does. The phone's Due row prints the token in
the chrome's mono voice and speaks the sentence: it is the meta line's
accessibility label. Measured on the iPhone 16 Pro simulator at 402pt:
*"Every 15,000 mi · SIGN-UP"*, *"Every 5,000 mi or 12 months · RECORDS"*,
*"Every 7,500 mi · ESTIMATED"* — every meta line one line, no orphan. The
web's `ServiceDueList` keeps the sentence; it has room. Not re-judged: the
loop stopped on its own rule, and this is exactly the change the critic
prescribed. The frame is `~/Desktop/tappet-design-sync-2026-09-12/
screens-service/01-due.png`, with 01b, 03 and 05 re-shot beside it.

### 6.17 The row action, and the tab's add — rounds 37–41 over the catalogue and the Plan root, 13 Sep

David, from his phone, on WHAT THIS CAR NEEDS: *"I really don't like the
add and learn more CTA's. Are these in conformance with design system? If
yes, we need to improve design system, then improve here. They're simply
unclear, not obvious, not inviting."* And an hour later, on the Plan root
with one row on it: *"i'm not happy with Add CTA. it looks like a nav
element, like Account. But it's not, it's part of the core functionality
of Plan."* One question, on two screens: what does an action look like on
this phone when it is not the screen's single filled primary and is not
chrome. The loop ran five rounds (`37-catalogue/` … `41-catalogue/`,
`critique-37.md` … `critique-41.md`), on the iPhone 16 Pro (design sync)
simulator under Expo Go, with the Plan root — empty and with rows — in
every blind set beside the catalogue and the web's Plan page at 390px
(`web-reference/plan-web-mobile.png`, new). **6 → 6 → 7 → 7 → 7**, and the
loop stopped on its own two-flat-rounds rule. 2 ✅ / 7 🟡 became 5 ✅ with
B6 the one open line (B2, B3, B9 are not on this surface). Blind rank moved
from *phone empty root, catalogue, phone root with rows, web* to *phone
root with rows, catalogue, phone empty root, web* — the web's Plan page
last in every round: *"nested cards, tinted chips, pills."*

**⚠ The controls conformed, and the phone was not drawing them.** Before
round 37 could be shot, the first push of the catalogue after a launch
rendered every `CutSurface` on the screen — forty of them — and not one
received `onLayout`: forty renders, zero layout events, logged from the
component. No chip had its hairline and no ADD had its box until the screen
was left and opened again, or the rows remounted. `measure()` on the same
views answered with their true size on the push where the event was
silent, so the surface now asks once after mounting and takes whichever
answer comes first (`CutSurface`, `0cb5b27`; `cut-geometry.test.tsx` holds
the shape from a measurement alone and nothing when neither answers). Why
the event is dropped on that push and not the next is not established; the
fix is written against what was measured. It is very likely what David's
phone showed him: ADD as a bare word beside LEARN MORE, two ghosts — which
is exactly *"unclear, not obvious"*, and exactly the pair R39 had been
written to escape.

**The pattern — `RowActions`, the repeated row action.** The one-filled-
primary rule leaves one case open: a list of things each of which can be
taken. By 13 Sep the phone had answered it three ways on three screens (an
outline box beside a ghost word on the catalogue; a ghost word alone on the
Due table's meta line; a cyan-bordered box beside a sodium word on Needs),
and the web a fourth (a filled primary on every card,
`MaintenanceItemCard.tsx`). The spec, as landed and graded, for Design:

- **The act is the brief's secondary at the small size** — `Button`
  `outline` `small`: 48pt (`CONTROL_HEIGHT`, the field's height), mono caps
  at 12pt, off-white hairline (`text.primary`), one 45° cut bottom-right at
  `cut.control`, no fill. It sits at the **trailing edge of the row's last
  line**, so the row ends where its control does and the box's right edge is
  the rule the row's numeral ends on (B6).
- **One box per row.** A second verb is the `ghost` word before it — mono
  caps in `text.secondary`, the roots' chrome ink — so the box is where the
  eye lands and the word is the step beneath. Never two boxes; never a
  sodium box on every row (B7 gives sodium one job — the destructive
  treatment belongs to the confirm the word opens).
- **States.** Rest: the hairline. Pressed: a fill swap to `surface.raised`
  inside the hairline — `outline` had no pressed fill at all until this
  loop, as `ghost` had none until 12 Sep, and `primitives.test.tsx` now
  holds every variant's pressed fill (the source scan reads `*Pressed`
  style names and `Button`'s fills live in a map). Busy: the wait mark,
  bare, at the rest width. **Done: a word, not a disabled verb** — the box
  is replaced by a mono state word in `text.muted` (one step under the
  ghost verb, so a done row is not a row with two verbs), no glyph (the
  check-circle was *"an icon doing the job the system gives to a mono
  word"*), held to at least the box's width and flush right so the verb
  before it does not move when the state changes (measured in round 39:
  "On the list" pushed LEARN MORE 64pt left). The word is **ADDED**, the Due
  table's — one word for one state across the app; the sentence a reader
  hears is still "X is on the list".
- **The one-primary rule's carve-out: none.** The row action is the
  secondary, so a screen keeps one filled primary — the catalogue's free-
  text `ADD "…"` at its foot, the Plan root's ADD TO NEEDS.
- **Leading content shares the line**, centred on the control's height: the
  kind, as a bare mono word in `text.muted` (the Due row's basis token) — not
  a chip. Round 40 read three cut hairlines on one line as three controls;
  the row's one box is the act's.
- ⚠ **The row itself is not the affordance**, on either list (asked for in
  rounds 37, 39, 40 and 41). A tap that writes to Needs with no visible verb
  is a write on a mis-scroll; a tap that opens the advisor spends a model
  call (R39). The verb is visible, and it is a box because a bare word was
  what read as "not obvious" from a phone.

Where it landed: the catalogue (LEARN MORE / ADD → ADDED), the Needs list
(REMOVE / DONE), both as the spec table's row — mono index, `type.ui`
label, mono figure at the rule, the reason in the quiet sans beneath,
`RowActions` on the last line. ⚠ The Due table's ADD (§6.15) is the
pattern's *word* form and is not converted: its loop closed at 7 with the
word graded ✅, and its meta line has no room for a 48pt box without
growing every row past the 56pt rhythm. Whether the Due row should take the
box is the open half of this pattern — **for Design**: the box where a row
has a line of its own for its verbs, the word where the verb shares the
numeral's meta line, or one form everywhere at a cost to the ledger. The
Build ladder (`BuildScreen`, cards, a gauge with a needle) is pre-brief and
was not on this surface; it takes `RowActions` when it joins the system.

**The tab's add is its primary, not its chrome.** The Plan root's ADD was
the Garage's ADD CAR copied to the token — a mono caps word at the band's
trailing edge, and the same word in the native header when pushed. The
chrome voice is what makes ADD CAR read as navigation, and on the Garage
that is right: adding a car is occasional. On Plan the act is what the tab
is for, and the Service root already says what that looks like: SCAN
INVOICE, the full-width primary pinned under the rail on every state,
closing the band with a rule. ADD TO NEEDS is that control (`PlanScreen`,
`f46c8c6`) — on Needs only, since Mods carries its own ladder — and the
pushed instance needs nothing of its own any more, because `RootScreen`
renders the pinned block under a native header too; the `headerRight` copy
and the `onEmptyChange` prop went with the word. The empty Needs state kept
its caption and body and lost its second button (the redundancy the empty
History resolved the same way, §6.15). **For David:** the critic asked in
rounds 39, 40 and 41 for the populated state's add to stand down — a mono
ADD in the "2 ITEMS" band, or a hairline secondary as the table's last
row — on the brief's empty-state line (*"mono caption, sans body, one
button"*, which a primary pinned above the caption reorders) and on weight
(*"it outweighs the two items it serves"*). Declined, with the reason: a
control that moves between the band and the chrome by the list's length is
the "one control per state" rule that produced the word David rejected; a
verb at the foot of a twenty-row list is the 11 Sep "i'm missing options to
add" again; and the two roots now make one shape. It inherits §6.15's open
question — whether a root's primary pins or scrolls — and whatever David
rules there rules here.

**What else closed, and the numbers:**

- **`SearchField`** — the History list's search box as a primitive (the
  cut, the cyan focus stroke, the cyan caret, the 16px floor), and the
  catalogue takes it in place of a square `View` that had none of those.
  Round 38 found the three defects the History's box had been cured of one
  round at a time, again, on the second screen — the private-copy failure
  the primitive set exists to end.
- **One chip rule, then no chip.** The catalogue coloured a chip by the
  research's severity (a High issue, a Critical service — the spec's own
  rule); the Needs list coloured every issue; so the same item changed hue
  between screens and a routine oil change wore the warning hue under a
  head that already said DO FIRST. Neutral on both (round 39), then the
  kind as a bare word (round 41). Urgency is the section; the chip family
  keeps its rule elsewhere. ⚠ `wishlist-suggestions.ts` still says *"urgent
  is the only value that may colour it"* — true of the value, no longer of
  a chip; core's docblock to amend.
- **The figure is mono and at the rule**, read back out of core's sentence:
  `60,000–100,000 MI`, `5,000 MI / 12 MO`, `24 MO`, `EASY`; an issue's
  several windows spanned first-low to last-high (the coils' "30,000 -
  60,000 miles (plugs), 60,000 - 100,000 miles (coils)" is
  `30,000–100,000 MI` — less than the sentence, nothing it did not say);
  a numeric sentence never in the body; an empty slot rather than a dash
  where nothing is known (a column of dashes read as *"a stray glyph"*).
  **The figure travels with the item**: the catalogue writes core's note to
  `source_data` — a `jsonb` the route passes through, written by nothing and
  read by nothing (every live row `{}`, read 13 Sep) — and the Needs row
  reads it back through the same `suggestionValue`, so "5,000 MI / 12 MO"
  survives the trip. `wishlist-row.ts` holds the reading rules for both
  screens.
- **The heads take their face.** DO FIRST and EVERYTHING ELSE at
  `displaySection`'s 20pt, as the Due table's heads are — at the 12pt
  eyebrow the condensed face read as "tracked Inter caps" in three rounds,
  §6.13's misread again — and a search count ("5 MATCHING") in the mono the
  Needs summary speaks ("2 ITEMS", mono now; it was the sans eyebrow).
- **The reason ends on a word, then on a sentence.** `numberOfLines={2}`
  cut mid-word ("coolant loss, and p…" — *"an unedited default"*); the cut
  is made at the last space inside 96 characters, and after the stop, at
  the last full stop inside it where one lands (`clipWords`) — VANOS ends
  "…affecting variable valve timing." whole. The Needs row takes the same
  cut. ⚠ Declined: one sentence or none (round 41) — a High-severity
  issue's one sentence is three lines, and the reason is the product's
  argument, not decoration.
- Measured: the ADD box is 48×48 at the rule; the state word ends at the
  rule; every mono figure ends at the rule; LEARN MORE holds one x across
  rows before and after an add.

**Recorded deviations and open items — for Design:**

- *The ghost as a third rung.* The brief names three treatments (primary
  fill, secondary hairline, destructive hairline); the roots' chrome word
  and this pattern's second verb are a fourth — mono caps in
  `text.secondary`, no box, pressing to `surface.raised`. Round 39: *"the
  brief's button vocabulary has no bare-text tertiary; REMOVE and LEARN
  MORE add one — bless it or fold into secondary hairline."* It has carried
  ADD CAR and ACCOUNT since 11 Sep and the Due table's ADD since round 33;
  it needs a line in the system.
- *REMOVE is soft, and the destructive step is the confirm.* Decided once,
  as the critic asked: the word on the row is a ghost, never a sodium box
  on every row; sodium belongs to the alert it opens. The critic's
  alternative (round 41) — a native swipe with sodium on the revealed
  action, so each row carries one boxed DONE — is a flow change and is
  **David's**.
- *The state word cannot go smaller.* Round 41 asked for the kind label a
  size under the verbs; both are the 12pt mono label and 12 is `TYPE_MIN`,
  the floor the whole phone holds. Ink is the step the system has.
- *Chip and secondary share a silhouette* (round 39's parking lot) —
  hairline plus cut, told apart by ink weight. The catalogue's kind left the
  chip for that reason; the chip family elsewhere still shares the shape.
- *LEARN MORE stays* — rounds 37, 39, 40, 41 asked for it cut, the row as
  the disclosure. David's 23 Aug ask names both verbs; the row-as-affordance
  reason is above; and the loop's job was to make the pair read as a pair,
  which the blind rank says it now does. **For David**, with the critic's
  count.
- *Not built, ungraded:* sticky section heads on the scrolled catalogue;
  ADDED as a tap-to-undo; one name for the destination across ADD TO NEEDS,
  WHAT THIS CAR NEEDS and the empty copy; "Search" alone as the placeholder;
  whether Plan needs its plate at all (the brief gives the plate to Garage
  and Vehicle) — the critic's parking lot, unchanged.

**What `packages/core` should own** (not written from a worktree, which
does not edit core): a `value` on `WishlistSuggestion` built from the raw
fields — the window, the interval, the difficulty — so the web prints the
same figure the phone reads back out of `note` today
(`apps/mobile/src/screens/wishlist-row.ts` is the interim, pinned against
core's real templates); a `WishlistSourceData` beside `wishlist-source.ts`
naming `{ note }` as what an add writes to `source_data`, with the web's
dossier add writing the same key so an item added there carries its
figure to the phone; and the `urgent`-colours-the-chip sentence in
`wishlist-suggestions.ts` amended to "sorts and sections".

**The fixture, for the next loop:** `dev/fixtures.ts` carries the M235i's
own `known_issues` and `common_mods` as PostgREST returned them on 13 Sep
(the catalogue had drawn one of its three kinds), and keeps what ADD writes
for the session — the POST answered with the route's `{ wishlistItem }`
including `source_data`, the GET newest-first, `DELETE ?itemId=` — so the
Plan root can be shot with rows on it and the Needs row with its figure.

### 6.18 The car's hub is a binnacle — three concepts, the pick, rounds 42–46, 13 Sep

David, on the car's hub (`VehicleDetailScreen`, pushed from the Garage):
*"i feel surprised this page, with these cta's/nav elements, received an
acceptable score from the design critic."* He asked for three fearless
concepts, the critic to pick the best fit, and the existing loop on the
pick — *"when in doubt, trust design critic, don't need to ask me for
everything."* The loop ran on the iPhone 16 Pro (concepts) simulator under
Expo Go, fixtures Metro on 8094, with four states in every set — rest on
the plate, scrolled to the end, the owner's photograph added through the
app's own control, and the plate's wait state — and the web dossier at
phone width as the blind comparator. **42: 7 → 43: ungraded → 44: 7 →
45: 7 → 46: 8, `Continue: no`.** 5 ✅ / 4 🟡 in round 42 became 6 ✅ /
3 🟡 in round 46, the three left partial being B1 (a misread, below), B2
(taken after the stop) and B3 (the dial is the garage's by the brief's own
words). The blind rank put the phone at rest first in rounds 44 and 45 and
the web dossier first in 46 — *"full dial, spec tables, complete
instrument"* — which is the dial question in the parking lot, not a
regression.

**The three concepts** (`apps/mobile/src/screens/hub-concepts/` on
`1c93c72`, behind `EXPO_PUBLIC_DESIGN_VARIANT=a|b|c`; the frames, README
and pick in `design-loop/mobile-ios/concepts/hub/`), each keeping the film
and breaking the page — the row-list-of-links, the one-filled-primary at
the bottom, the chrome word as action, hero-then-ledger:

- **A · CLUSTER** — an instrument binnacle, not a list: the readings in one
  hairline-celled panel under the plate, every cell a reading and every
  reading the door to its own screen, the verdict the check-control message
  beneath, the two acts a pair of switches at the foot.
- **B · WORK ORDER** — a race engineer's sheet: the tools first as a rail
  under the plate, then the punch list of what the car needs as a numbered
  spec table, most urgent first, with History, Plan and the answers demoted
  to an index at the foot.
- **C · TICKET** — the reading and the next act as one object: a cut slab
  carrying the 88pt numeral, its verdict, the acts it leads to as rows, and
  its counterfoil, the one filled verb; the places an index beneath.

**The pick** (`concepts/hub/pick.md`, one blind invocation, the shipped page
as the fourth candidate): **CLUSTER first, WORK ORDER, TICKET, the shipped
page last.** *"It is the only candidate that treats the space under the
plate as the same instrument as the plate: mono-caps labels, big mono
values, hairline cells, the stat strip simply continuing downward … A and B
lead with a number their own copy calls stale; D leads with a data-entry
button; C leads with the readings."* Its one reservation was the 70
separated from the sentence that says it is stale — *"precisely the
unqualified precision this product says it will not show"* — and its three
notes on the pick (the verdict sentence with the 70; the job named in the
NEXT SERVICE cell; HOW YOU USE IT cut and PLAN's 0 in label grey) went into
round 42. The shipped page's own verdict: *"a tidy settings list with no
dominant reading; the overdue service is an unnamed value below the fold."*

**Round 42 — 7/10, 5 ✅ / 4 🟡.** CLUSTER made the real screen with the
three notes taken. Gaps: WHAT YOU TOLD US as a mono ghost word *"floating
over roughly 450pt of empty graphite"* (B1); SCAN INVOICE at equal weight
with the advisor when the phone's headline act should be the band's one
primary (B9); the count band's numerals on three baselines because FUEL
SYSTEM lifted the recall cell's (B6). **Round 43 is frames only**: the
fixes were built and shot, and the critic's call died on a rate limit
before it read an image. ⚠ **The worktree that held rounds 42 and 43 was
killed with that work uncommitted.** It was recovered here from the dead
agent's transcript — every `Write` and `Edit` payload and the scratchpad
scripts that survived, replayed with each replacement asserting one match
— then verified against tsc and the suites before anything else was
touched. Commit after every round is the rule this cost; `df29e94`
carries the recovery.

**What the hub is now** (`Binnacle.tsx`, `VehicleDetailScreen.tsx`):

- **The panel.** HEALTH (three parts wide) beside NEXT SERVICE (two): the
  reading at `numeralPlate`'s 44 with its band word, `healthVerdict`'s
  sentence and the provenance line inside the cell — the reading and its
  qualification never separated; the sweep's service by name in condensed
  caps over core's own timing, the sodium triangle beside the legend only
  when `describeNextService` says overdue or due now. Then RECALLS ·
  HISTORY · PLAN, one numeral each on one baseline. Every cell is
  pressable and says where it opens in its spoken name; the legend sits
  *under* the value with a hairline chevron after it, so a pressable cell
  and the plate's strip cell — eyebrow over value, not pressable — never
  read as one object. A count the screen could not read is nothing on the
  cell; a zero it did read is in the legend's ink (`VehicleDetailScreen.
  test.tsx` holds both, because a screen that printed 0 for both would pass
  either alone).
- **The switches.** SCAN INVOICE the one off-white primary and ASK THE
  ADVISOR the hairline secondary beside it, at the panel's foot under 24pt
  of air — the Service root's figure between its primary and the first
  rule. That number is not decoration: at 16 the panel's two rows ended 7pt
  short of the fold on the 16 Pro and a 7pt band of off-white showed over
  the tab bar at rest, which round 44 read as *"a stray band"*; measured at
  21px on the frame, 0 after. The critic's alternative — the switches above
  the count row — would have put the readings the pick led with under the
  fold and sliced the numerals instead.
- **WHAT YOU TOLD US** is a real section: `01 MILES A MONTH · 500`,
  `02 MODIFICATIONS · Keep it stock`, `03 OWNERSHIP · Keep forever`, each a
  `BandRow` opening the profile, with the spec table's index (B6) and the
  objective as a right-aligned mono value. MODIFICATIONS and OWNERSHIP are
  the web wizard's own heads for those answers, because the phone's profile
  asks "What do you want from it?" two blocks above a field labelled "What
  you want out of it" and side by side in a table those read as one
  question asked twice. ⚠ HOW YOU USE IT is not a row: USE is on the strip
  400pt above (the pick's note and round 45's cut — *"one goes"*), and every
  row here opens the one profile where it is changed. Round 43 had restored
  it on the argument that the section should not omit the answer it is
  best known for; superseded, and written down in the screen.
- **The sheet has a floor, and the title arrives early.** The binnacle is
  half a display tall and a sheet the height of its content stopped the
  scroll ~160pt in — past the hero name's fade (`HERO_TITLE_FADE_SPAN`
  210), short of the nav name's arrival (300) — so at the end of the scroll
  the car had no name. `sheetMinHeight` derives the floor from the motion
  constants, the scroll view's measured height (round 42 used the window
  and counted the tab bar's 83pt into the tail twice) and the nav's height;
  `navFadeStartFor` lets the mono title arrive as soon as the sheet has
  covered the identity block rather than at the constant. ⚠ **The tail is
  structural, and this is its arithmetic:** the end state is the sheet
  filling the viewport under the nav, so the tail is `(viewport − nav) −
  content` whatever the hero's height — 171pt with three answer rows on the
  16 Pro (513px, measured), 106 with four. Any content between "fits at
  rest" and "covers the name" ends the scroll with the name half under the
  sheet's edge, so the floor is not optional; only more content or a
  different end state removes the tail.
- **The plate's cut, where the plate meets the sheet.** The brief's cut is
  top-right; on this screen the plate runs under the status bar, so that
  corner is under the clock and every graded frame showed a plate with no
  cut while both buttons under it had one. Round 46 reversed the earlier
  acceptance (*"a cut nobody can see does not meet the line"*) and it was
  taken after the stop: the plate's one corner on the page is the sheet's
  leading edge, and that edge travels, so the cut is the sheet's —
  `cut.plate` of page colour laid over the plate's bottom-right corner
  above the edge, the masthead's and the garage plate's construction
  (`cornerCovers`, equal legs held), the hairline stopping where the bevel
  begins. Seen at 4× and at native scale; ungraded.
- **The car opens on its own plate.** Round 44's first gap — *"'drawn' is
  indistinguishable from 'drawing' … the top half of the car's own page
  holds no car"* — was the fixture, not the design: the M235i's generation
  plate has been `ready` in `vehicle_plates` since 12 Sep and the route
  serves a ready plate as `photo_url`, and the fixture answered `null` at
  rest, so every graded frame of the hub and the garage had stood the car
  on the house plate. `dev/fixtures.ts` carries the plate's public URL now
  (`platePublicUrl` on `app.json`'s `supabaseUrl` — a public object, not a
  credential), nulls the status under it as the route does, and keeps the
  house plate for `pending`/`generating`/`failed` with the line that
  explains it. ⚠ On the way: `apps/mobile/.env` carries
  `EXPO_PUBLIC_DESIGN_PHOTO_URL=` with an empty value, and `??` had taken
  `''` as a photograph — invisible while `''` and `null` drew the same
  plate, and in front of the plate the moment there was one. `||` now, and
  the fixtures suite holds the ready plate, the empty variable and the wait
  state as the anti-vacuous pair. The fixture also carries the M235i's other
  two answers as PostgREST returned them (`stock`, "Keep forever") — ⚠
  `stock` hides the Build ladder (`showsModifications`), so a loop shooting
  Mods from these fixtures sees the ladder's off state, which is the state
  this car is in.
- **`BandRow`** takes an optional `index` (the Due table's style — mono,
  muted, tabular, 22pt, hidden from the reader) and holds its value to one
  line and half the row, so a 280-character objective truncates before the
  label loses a letter — "HOW YOU USE THIS…" was this row's own history.
  `primitives.test.tsx` holds both, each proven against the wrong
  behaviour.
- ⚠ **A car never checked for recalls prints no count** (after the stop,
  found on the board rather than in a frame). The old page hid its recall
  row at 0, so "checked, clean" and "never checked" were the same silence
  — the roadmap carried that as David's call — and the concept's cell
  printed `open.length`, which is 0 for both: a `null` dressed as a
  reading. The cell now follows `load-vehicle`'s own rule — an absent
  `recalls` is "never checked" and prints nothing, with "not checked yet"
  in its spoken name; an empty array is "asked, none" and prints 0 in the
  legend's ink. Both halves held in the screen's test; the roadmap entry
  is closed in that direction.

**Not taken, with the reason:**

- *The four-line caveat* (round 42's cut, 44's cut, 45's gap 1, 46's cut —
  four rounds). It is `healthVerdict`'s sentence in `packages/core/
  health-claims.ts`, shared with the web, and the product's own words for a
  stale reading; re-voicing it on the phone is the two-clients-two-claims
  defect that module exists to prevent, and truncating it hides half of a
  claim about staleness (§10). Not editable from a worktree. **Proposal for
  David/core:** a `short` beside `text` on `HealthVerdict` — for `stale`,
  "Read before 5 records were filed"; `null` for `current` — the way
  `SERVICE_BASIS_SHORT` sits beside `SERVICE_BASIS_LABELS` (§6.16), so the
  cell prints one mono line and the sentence stays the reader's. It is
  also what frees the fold: with a one-line caveat the two rows end 60pt
  higher and the switches sit whole in the first view, which is the half of
  B9 the critic called *"worth a point"*.
- *The wait mark as a "spinner"* (rounds 42, 44, 45 — three asks for a
  cyan hairline ramp along a rule). It is `WorkingMark`, the house wait
  instrument's bare mark (§14, graded 9/10 on web), not the system spinner;
  B7's ramp is the *refresh* idiom and the plate line is a wait. Declined
  each time for that reason — and at 14pt on a scaled still the compact arc
  reads as a ring to this critic three rounds running, which is a fact for
  Design (below).
- *WHAT YOU TOLD US "in sans"* (the pick, round 45, round 46 — and §6.13
  before them). The caption is `type.displayLabel`, Archivo Narrow
  SemiBold; round 46 asked for it to be confirmed at native scale before
  being touched, and at 6× it is the row labels' own letterforms one size
  down. Not touched. §6.17 moved the Due table's *group heads* to
  `displaySection`'s 20pt for the same misread; the section eyebrow is the
  system's 12pt on every root and stays so here.
- *The switches above the count row* (round 44) and *the count row without
  its air* (round 45's cut) — both undo the fold: the readings the pick led
  with go under it, or the primary is sliced again at a 68pt cell. The 96pt
  cell is the concept's floor for a value, its legend and a thumb.
- *ASK THE ADVISOR "duplicates the ADVISOR tab"* (round 46's cut, with its
  own condition: *"unless it scopes the advisor to this car"*). It does —
  `openAdvisorTab` with the vehicle and its title; the tab bar opens the
  root as it last stood. Kept.

**Recorded deviations and open items — for Design:**

- *The binnacle is a pattern the system does not have.* A panel of readings
  where every cell is a door: value over legend (the strip's pair
  inverted, so the two objects never read as one), a hairline chevron after
  the legend, sodium only as the triangle beside a genuine warning, a 96pt
  cell floor, a fill swap on press, left rules on every cell after the first
  so a dropped cell leaves no rule hanging. The critic's one-line reading of
  it — *"the stat strip simply continuing downward"* — is the spec.
- *The acts at a hub's foot: one primary, one secondary, 24pt of air.* The
  same figure the Service root gives its primary. Where the fold lands is
  the device's; the rule is that what meets it is a rule or air, never a
  sliced control.
- *The 12pt condensed eyebrow reads as sans from a still* — four rounds,
  three surfaces. The options are Design's: wider tracking on
  `displayLabel`, or the 20pt step §6.17 took for group heads. The build
  keeps the token.
- *The wait instrument's bare mark reads as a ring at 14pt* — three rounds.
  The compact face with terminals is unmistakable; the bare mark is not.
  Whether the plate line takes the compact face (a second instrument on the
  bay, the reason `PlateStatusLine` gives for the mark) is Design's.
- *B2's cut on a plate that runs under the status bar* lives at the
  plate/sheet boundary, on the sheet's side, because that is the plate's
  only corner on the page and it travels. Round 46's parking lot asks
  whether the cut moves or the line is waived for this surface; it moved.
- *A ready plate arrives as `photo_url`, and the phone cannot tell.* Two
  consequences visible in the frames: `PhotoGrade` is laid over a plate
  that was graded at generation, and the control over it reads CHANGE
  PHOTO (with Remove in its sheet) on a car with no owner photograph. The
  payload should say what the image is — a `photo_kind: 'owner' | 'stock'
  | 'plate'` beside `photo_url` on both mobile routes (`app/api/v1/`, not
  core) — so the phone grades only what it should and names the control
  ADD PHOTO over a plate. A mobile build reading the field must wait for
  the promote (CLAUDE.md §8).

**Parking lot — for David:**

- *The dial on the hub* (rounds 42 and 46): the web dossier carries the
  arc on the car page; the brief moved it to Garage and Health, and the
  hub's 70 is bare. The critic ranked the web first in round 46 for it. A
  compact arc in the HEALTH cell is a brief question.
- *The count band as three spec rows* rather than three cells (round 42's
  parking lot).
- *The tail* — 171pt at three answer rows, by the arithmetic above. The
  ways out are more content under the switches (the four answers, or
  something new), or a different end state for the pullback; the floor is
  not the cause.
- *The owner-photo fixture is a film still* (round 45: *"reads as stock,
  and … the house grade cannot be seen doing any work"*). David's own
  daylight snap of a 2 Series exists (`design-loop/mobile-ios/
  owner-photo-daylight.jpg`, 12 Sep); putting it in the concepts
  simulator's library makes the next loop's 03 frame honest.
- *The strip is MILEAGE · TRIM · USE where the brief's studio version
  names MILEAGE · AVG · RELIABILITY* — pre-brief and unchanged by this
  loop; with USE now the only place the usage answer is printed, the strip
  is load-bearing.
- *A 16:9 plate* (round 44's parking lot) would clear the fold without
  reordering; the brief runs the plate under the status bar.
- *Hanging both cells of the first row from the top rule* (round 45's
  parking lot): NEXT SERVICE's content is bottom-aligned beside a full
  HEALTH cell.
- *`performance_mindedness: 'stock'` in the fixture* hides the Mods ladder
  under fixtures; a Build loop wants `moderate` for the session, or an
  `EXPO_PUBLIC_DESIGN_*` switch for it.

**What `packages/core` should own** (not written from a worktree): the
`short` form on `HealthVerdict` above, and nothing else — `platePublicUrl`
and `MINDEDNESS_LABELS` were already there to read.

**The numbers.** Mobile jest in band 39/39 suites, 748/748 tests, exit 0
after every round; root jest 214/214 suites, 3646 passed, 1 skipped; tsc
clean in both. Files: `components/Binnacle.tsx` and its test are new;
`screens/hub-concepts/` (six files) is gone with the switch; `BandRow`,
`hero-motion.ts`, `dev/fixtures.ts` and the hub changed. Frames and
critiques: `design-loop/mobile-ios/44-hub/` … `46-hub/`,
`critique-44.md` … `critique-46.md`; `43-hub/` stays frames only.

---

## 12. The identity, redrawn against a design critic — 7 Sep 2026

Raised by `design-loop/logo/` (gitignored). An independent critic wrote the brief
in BRIEF mode from screenshots of the **shipped** mark and graded three
iterations against it, never seeing code: 4/10 → 7 → 8, all nine brief lines met,
critic called it settled. Package in `docs/brand-package-v2/`, frozen brief in
its `BRIEF.md`.

✅ **Shipped 7 Sep on David's instruction.** This section was written as a
proposal — §11.3 of this register says the mark and its glow are Design's to own
— and David ruled to adopt it. It is recorded here in full because Design still
has to absorb it into the system: the entries below are what changed and why,
not a request.

Every icon slot on web and mobile now renders from `docs/brand-package-v2/`.
`packages/core/src/brand-geometry.ts` is **generated** by that package's
`build.py`; `brand.ts` carries the API and the reasoning; both `BrandLockup`
components kept their props, so no call site changed. 189 web suites and 27
mobile suites pass, both typechecks clean.

⚠ **§11.3 is superseded.** "The mark keeps its glow" was the right call against
the mark that had one. This mark has no glow to keep, and no hue at all — see
12.1.

### 12.1 ⚠ The mark becomes a stamped plate, not a backlit one ✅ shipped

A solid chamfered plate with the **W cut clean through it**, so the ground
behind shows in the letter (by fill rule rather than by a mask — see 12.6). The critic's reading of the current mark was
that serif small caps, four rivets and a cyan bloom make a heritage plaque, and
that the north star is an instrument photographed at night — the sheet's own
chrome was closer to the brief than the mark it presented.

What the mask buys, and the reason it is one rule rather than five:

- **Both polarities are one file** — off-white on graphite, graphite on ivory,
  nothing redrawn.
- **The reduction ladder disappears.** The shipped package needs four drawings
  (full / single-W / flat / inverted-29) and picks by size floor. This is one
  drawing from 1024 to 16. The `lockupFor` reduction rule in core has nothing
  left to choose between.
- **It survives a photograph** — the asphalt shows through the W.

### 12.2 The wordmark lands on the masthead width, and is not a new value ✅

`Newsreader` 500 small caps → **Archivo `wdth` 62 / `wght` 800**, caps, −1%
tracking. 62% is already the system's masthead stop (`app/globals.css`, the
`font-stretch: 62%` rule and its docblock) — this is the identity joining a token
that exists, not asking for one.

It also closes the defect `BrandLockup.tsx` documents at length: the lockup's
hand-spelled `var(--font-display), Newsreader, …` chain had been silently
rendering the brand mark in Archivo ever since brief B2 moved the display slot.
The mark was already in this face. It was just not supposed to be.

### 12.3 ⚠ Archivo's cap height is **0.686 em**, not 0.73 — a system-wide fact

Read from the font's own OS/2 `sCapHeight`. Any spec written in cap heights is
6% out if it assumes 0.73. It cost two rounds of this loop: a nav lockup was
being reported at a 20px cap while measuring **18.8px**, under the brief's floor,
green on paper. `CLAUDE.md` §5 is exactly this — the guard asserted a number it
had computed from the wrong constant.

Consequence carried into the package: correcting it left 25.6px for the mark and
the gap inside a 140px nav budget, so the mark is exactly one cap high and the
gap is one word space. The brief prose's "gap of half the mark's width" cannot
hold alongside the 140px budget at this wordmark width; the critic flagged the
sentence as David's to amend.

### 12.4 §6.1's `font-stretch` problem does not reach the lockup ✅ closed

§6.1 rules that the phone gets Archivo **Narrow** because React Native cannot
drive a `wdth` axis, and that its metrics are its own and will not match web.
That constraint does not apply here: **the package's type is outlined to paths**,
so the lockup is geometry rather than text and `react-native-svg` (15.15.4, already
a mobile dependency) renders the identical drawing on both platforms with no font
loaded at all. The mark and the wordmark stay glyph-for-glyph identical across
web and phone even while body and display type diverge.

Outlining is also the previous package's own unmet instruction — its README asks
for it at export time, and every SVG it shipped still declares
`font-family="Newsreader, Georgia, serif"`.

### 12.5 Two silent-failure fixes Design should carry into the system ✅

- **The mono favicon was invisible on light.** `favicon-mono.svg` draws the plate
  in `currentColor` and the W in a hardcoded `#16140F`; on a light ground both are
  dark and the tab shows a featureless blob. Reproduced in the loop's baseline
  capture. The new mark has no second colour to get wrong, and both PNG polarities
  ship because a raster favicon cannot follow `currentColor`.
- **An Android adaptive foreground cannot use the icon's 66% plate.** The outer
  third is maskable and the mask may be a circle, so a square plate must fit the
  inscribed square: 0.667 / √2 = **47%** of the canvas. At 66% the corners clip
  under a round launcher, silently. Verified against circular and squircle masks.

### 12.6 ⚠ The letter is cut by fill rule, not by a mask — and that is silent

`MARK_PATH` is the plate and the W in **one path**; `fill-rule="evenodd"` turns
the second contour into a hole. A `<mask>` was the obvious way to write it and
is the wrong one three times over: masks need document-global ids that collide
when two copies are inlined; Satori (which renders `app/opengraph-image.tsx`)
supports `<path>` and little else, and **fails by answering 200 with a zero-byte
body**; and one element means web and `react-native-svg` draw identical markup.

The trade is the reason this is in the drift register rather than only in a
docblock: **drop the fill rule and nothing breaks visibly.** The W fills in the
plate's own colour and the mark reads as a slightly heavier logo. `CLAUDE.md`
§6's defect class exactly, so `brand.test.ts` asserts it on all eight package
drawings and all three components.

### 12.7 What the redraw closed, and what it removed

Not deviations — drift being *closed*, listed so Design can see the whole pass:

- **`app/favicon.ico` and `app/apple-icon.png` were two logos out of date.**
  `app/layout.tsx` documented the gap: they were still the **Sweep dial**,
  because regenerating them needed a rasteriser with Newsreader loaded and
  nothing on this machine had one. Outlining removes the dependency rather than
  satisfying it — every size now rasterises from geometry.
- **The share card had lost its typeface.** `opengraph-image.tsx` set the name
  in Satori's default face, because loading a webfont means a network fetch
  inside `next build` and that build is the promote gate for the App Store's
  hostname. An outlined path is the one thing Satori does support, so the card
  now carries the real wordmark with no font and no fetch.
- **`Newsreader_500Medium` left the mobile bundle.** It was added 30 Aug for the
  engraved plate name and nothing else ever used it.
- **`BrandWordmark` stopped being a second assembly.** It existed because the
  old mark was a wide plate with the name inside it, which could not shrink into
  a bar. The lockup is a mark beside a free wordmark now, so the nav treatment
  *is* the short lockup.
- **`RIVETS`, `BRAND_TYPE` and the four-drawing reduction ladder are gone** from
  core, along with `PLATE.favicon` — the second plate path that existed because
  the icon's proportions closed up at 24px.

### 12.8 Recorded deviations from the critic's brief

- The brief names `#1A1A1A` and `#F2F1EC`, sampled off the north-star board. The
  package uses the shipped tokens `#1A1815` (`--surface-1`) and `#F5F3F0`
  (`--foreground`) — the same colours to within a rounding error, and
  `CLAUDE.md` says a rebrand moves no palette values.
- The critic's score fell 9 → 8 between the last two rounds while the checklist
  stayed nine-of-nine met and it stated plainly that nothing had regressed. Its
  own rule forbids that. Noted rather than smoothed over: the 9 was awarded on
  the wrong cap constant, so the 8 is the one measured against a lockup that
  actually meets B6.
- The brief prose says the lockup's gap is "half the mark's width". It is one
  word space, and it cannot be half the mark: the 140px nav budget and the 20px
  cap floor are both checklist lines and the gap is not, so the gap gave way.
  The critic flagged the sentence as **David's to amend** — the brief is locked
  and the implementer does not edit it. `docs/brand-package-v2/BRIEF.md` is the
  frozen copy.
- **`CLEAR_SPACE` changed meaning.** It was 48 grid units on a 280-unit lockup;
  it is now one mark height, stated against `LOCKUP.mark` so it survives a grid
  change instead of needing re-derivation.

---

## 13. The three signed-in pages join the system — 11 Sep 2026

Raised by `design-loop/signed-in/` (gitignored). `/garage`, `/settings` and
`/onboard` sit behind the middleware, so through two locked briefs and 27
graded rounds no critic ever saw them. On 11 Sep the pages were split into a
data wrapper and a view, `/dev/garage`, `/dev/settings` and `/dev/onboard`
render the views with no session (`dev-surfaces-render-the-real-views`
pins that they are the same components), and an independent critic wrote a
brief in BRIEF mode against the frozen north-star, the two reference pages
(`/` and `/check`) and the settled-system paragraph. Locked without review —
David delegated the pass. Baseline **4/10**, blind-ranked 4th, 5th and 6th of
six; closing **8/10**, nine of ten lines met, the garage blind-ranked **1st of
six** above both references and the north-star board. Four commits, each
carrying its critique score.

Everything here is drift being *closed* — three pages that had stayed on the
pre-4-Sep register while the components inside them moved. Three items are
new and Design should rule on them.

### 13.1 Two shared pieces the landing does not yet use ⚠ needs a ruling

`components/PageOpener.tsx` (mono eyebrow, condensed uppercase headline at
the 62% masthead width, one quiet line) and `components/FleetStrip.tsx` (the
IN THE GARAGE / AVERAGE HEALTH / OPEN RECALLS strip) are `app/page.tsx`'s
inline patterns extracted as components so the three signed-in pages cannot
drift from each other. **The landing still carries its inline copies** — it
is graded on its own loop and was outside this pass's lane — so the product
now has one pattern spelled twice. Adopting the components on the landing is
a mechanical change; the one behavioural difference is below.

### 13.2 The strip prints an em dash where the landing omits the cell ⚠ needs a ruling

The landing's strip *omits* AVERAGE HEALTH when nothing is scored and OPEN
RECALLS when the count is zero. The signed-in strip prints **—** in both
cases, with "not known" for a screen reader — the locked brief's words are
"em dash where the data cannot say", and the dash is doing §10's job: a
non-reading rendered as one. The refusal is identical (a zero recall count
may mean the lookup never ran, and the garage query does not select
`lookup_status`); only the typography differs. One of the two should win
when 13.1 is taken up.

### 13.3 `.field` has an `lg` step ✅ closed, with a note

`input.tsx` said "there is no `lg` — nothing in the app asked for one, and an
unused size is a decision nobody has made yet." The add-a-vehicle brief made
the VIN field the largest element on its page: 64px tall, 24px type, in
`.field-lg` beside the other two steps, with an override inside the
coarse-pointer block so the 16px anti-zoom rule cannot pull it back down.
Mono is not part of the step — the caller asks for it.

### 13.4 The card's hover is one chip, and it is not the chip the brief names ⚠ needs a ruling

Brief B10: *"Card hover: hairline brightens, one chip; no lift, no second
affordance."* `VehicleCard` — shared with the landing — lost its `card-lift`
transform and its two hover controls became one: a mono cut chip on the
plate's corner reading OPTIONS, which is the vehicle menu. The critic asked
three times for it to read ADD PHOTO and do only that, and it was declined
each time for the same reason: **`deleteVehicle` has exactly one call site,
this menu.** Naming a menu after one of its items would tell someone hovering
a photographed car that the chip adds a photo. If deleting a vehicle ever
moves to the dashboard, the chip can become the single verb the brief wants.

Two things found by measurement on the way, both real on the landing too:

- The old trigger was `MoveVertical as MoreVertical` — a ↕ arrow renamed to
  look like a ⋮ glyph, drawn in a circle with no label. The critic read it as
  a "reorder handle" because that is what it was drawn as.
- The first placement of the new chip, hidden with opacity in the header row,
  still occupied 92px of the row and pushed every dial to 52% of the card's
  width at rest. Moved onto the plate's corner, re-measured at 80%.

### 13.5 The VIN plate photograph is contained, and it is capped ✅ closed

`/onboard` carries a generated night plate of a VIN tag beside the form
(`public/design/onboard-vin-plate-{800,1400}.webp`, provenance and prompt in
`public/design/CREDITS.md`, US$0.40 of Gemini spend in `cost-log.jsonl`).
Contained, not a background — CC-142 §5 removed photographic page
*backgrounds* and this page still draws its room. `image-weight-budget`
caps the heaviest derivative at 96 KB, the same shape as `/check`'s
exemption. ⚠ Of the three candidates, one rendered a **legible VIN-like
string** on the tag and was rejected: a fake number beside the field that
asks for a real one is precision this product does not invent.

### 13.6 The room's seam is exposed on short pages — for Design

`.service-bay`'s wall/floor seam — one 1px line at 64% of the viewport,
kept deliberately as "geometry, not texture" when the panel joins were cut —
sits behind cards on the landing and behind nothing on `/settings` and
`/onboard`, where two critiques read it as a hard horizontal artefact. It is
the landing's plate exactly, which is what brief B1 asks for, so it was not
touched here. Whether the seam should feather, or the short pages should
cover it, is a system question.

### 13.7 Recorded deviations from the critic's brief

- The garage eyebrow reads SIGNED IN AS and the **profile's display name**,
  fetched through `getProfile` under `['profile', userId]` with a
  five-minute stale window and invalidated by a settings save. Round one said
  only SIGNED IN; round three tried the session email and the critic read a
  lowercase address inside a tracked uppercase line as the wrong register.
  This is the first place the display name is shown outside the field that
  sets it.
- The add-a-vehicle header omits "Add vehicle" — the page is the action. The
  critic graded B1 met "as a contextual omission" and parked whether David
  wants it literal.
- Not applied from the closing critique, and recorded because they reverse
  earlier grades on unchanged code: setting the DELETE ACCOUNT headline
  off-white (B3 passed it in sodium in round two), cutting "Up to 60
  characters." (endorsed as "the whole message" in round two), and an 11px
  three-across mobile strip (under `viewport-floors`' 12px floor).

### Not design-system changes, listed so Design can see the whole pass

The delete button, the settings shield, the `FormField` error line, the
onboarding alert and the garage's failed state were all `text-red-400` —
`#F87171`, the retired critical red, spelled as a utility class where
`retired-palette-literals` scans hex · the account chip, the Distance pills,
the photo pill, the options disc, the delete dialog's icon disc and the
settings panels were the last radii on the signed-in surface · the empty
garage no longer pitches the product to someone who has bought it · the
three settings sub-descriptions and the delete panel's restated one are gone,
as are both icon tiles and the duplicate "Go to Garage" link · Save is grey
until something is dirty · the delete dialog uses the primitive's destructive
variant instead of `bg-red-500 … disabled:opacity-40`.

## 14. The wait instrument — 11–12 Sep 2026

Raised by `design-loop/working/` (gitignored). David, walking the live demo on
11 Sep: *"i want more engaging loading states than just simple skeleton loader.
something engaging will buy patience from user."* The screenshot was the
Plan → Mods card — two pulsing skeleton bars under a mod nobody had asked
about, an absence drawn as a wait that never ends. The product boundary
(§10 of CLAUDE.md, `advice-range.ts`) rules out the usual answer: no
percentage, no bar that fills, no stage a timer advanced, no duration nobody
measured. So "engaging" became an instrument that is visibly alive and copy
that is true for the whole of the wait: `components/Working.tsx`, the health
dial's ignition sweep kept going — a 24° cyan pip hunting terminal to terminal
on a hairline arc with an empty centre where the numeral would be — at three
sizes (160/128 full, 20 compact, 14 mark), with a ledger only where a process
emits real stages, and `Button`'s `busy` form for the control that started
the work. Twenty-two `Loader2` spinners, four hand-rolled rings, five pulsing
skeletons, a framer glow and one stage list on a clock are gone, and
`one-wait-instrument.test.ts` refuses the next one.

An independent critic wrote the brief in BRIEF mode against the frozen
north-star and the settled-system paragraph; locked without review — David
delegated the pass. Trajectory **5 → 7 → 8 → 8 → 9** of ten; **0 → 6 → 8 → 8 →
9** of nine brief lines; closed at round 04 on three stop rules at once
(score ≥ 9, `Continue: no`, every line ✅). Two commits built it (`292b31d`,
`8a78ac4`), three carry their round's score (`ac84cbc`, `4f76d9c`, `b82cfb7`),
and `56cc61c` built round 04's terminal flash ungraded — the session ended
between the change and the shot; the 12 Sep pass shot and graded it.
Everything below is either a ruling Design owes, or a deviation recorded so
it is not mistaken for an accident.

### 14.1 B7 and B9 pull against each other on a card ⚠ needs a ruling

The brief's B7 puts a cyan mono status beside the mark on the originating
button; B9 says one moving instrument per panel and cyan only on pip,
terminal and active stage. The critic flagged the tension itself (critique
01, parking lot) and graded B7 as written. On the Plan → Mods card the two
collide: while a mod is analysed the card body draws the compact instrument
*and* Analyze Mod drops to its busy form, so one card carries two pips. The
critic never saw that state — it needs a model call, which the loop does not
spend — and passed B9 on the empty cards. The advisor (14.8) was built so the
two pips sit in two panels, thread and composer. Design should say whether a
card's button or its body carries the motion, not both.

### 14.2 The compact face's terminals are 3px, not 4 — for Design

The brief's composition names 4px terminal dots; that is the full face. At
20px the compact face draws 1px track, 2px pip, **3px** dots (measured in
the DOM at both viewports; the 14px mark draws no terminals at all). The
critic held its last point on "if the dots are still 4px at those sizes,
take them to 2px — measure first". They are 3px, so the condition did not
hold and nothing was changed; whether a 20px arc wants 3px or 2px dots is a
judgement for a capture at that scale.

### 14.3 The full panel's padding is 24px on a phone, 32 on desktop — recorded

`p-6 sm:p-8`. The brief says 32 without distinguishing viewports; the critic
read the phone capture as "nearer 16" and parked it. Measured 24.

### 14.4 The plate slot's frame is a solid hairline, and the critic read it as dashed — recorded

`VehicleIdentity`'s no-photo plate draws a hairline inset 12px inside the
4:3 box, and the specimen copies it exactly. Two critiques read the frame as
dashed at capture scale and parked "the system's container is a solid
hairline with the 45° cut". It is solid; the cut is the open question, and
it is `VehicleIdentity`'s, not this pass's.

### 14.5 The Stock gauge on Plan → Mods is a second arc idiom ⚠ needs a ruling

Every critique parked it: `ModificationsTab`'s build dial — thick stroke,
needle, sodium gradient tail, "Stock" caption — sits above cards whose wait
arc is a hairline with dot terminals, and it is an empty state that carries
an arc. Outside the brief and untouched. The loudest object on that page.

### 14.6 The onboarding VIN panel's border is the strongest edge on its screen — for Design

Critique 03: the panel wears a bright off-white border where the north-star's
panels use a hairline. Outside the brief; recorded.

### 14.7 A failure state would make sodium's absence on waits mean something — for Design

Critique 00's parking lot: a wait whose call fails could stop the pip and turn
the status sodium, which is the one hue the brief keeps off every wait. Not
built; every caller unmounts the instrument on failure and says what
happened in its own voice. Worth a decision rather than a drift.

### 14.8 The advisor adopts the instrument — 12 Sep ✅ closed, with one entry left

`ConsultantChat` was the scanner's largest exemption: three `Loader2`
spinners and a five-stage "thinking" list — "Reviewing vehicle profile…",
"Checking service history…" — advanced by a 1.8s `setInterval` with a
wrapping modulo. None of the five is a boundary the client can see;
`sendConsultantMessage` is one call, so the list claimed to have finished
checking the service history at 3.6 seconds and started over at nine: the
invoice scanner's UX-15 defect in a chat. It is `components/AdvisorWait.tsx`
now — the compact instrument in the thread, saying which of the **two** real
stages is running: the upload (one fetch per attached file, "File 2 of 3" a
real count, no byline because it is the composer's work) and the answer
(Jay's byline, ANSWERING, and the one sentence true for the whole call). On
the demo no model is called, so that sentence is not printed there. The send
control takes the primitive's busy form with an empty label — icon-only, so
the state is its accessible name — and the add-to-needs row carries the mark
and a mono ADDING. Two more findings on the way:

- **A conversation being fetched wore the greeting.** On every first load the
  thread showed "Hey, Jay here" and four prompts for as long as
  `getConsultantSession` took, over a thread about to fill with history — a
  wait dressed as the un-answered state, the mod card's defect in reverse.
  It is a delayed compact wait now; the empty thread keeps the greeting and
  no arc, which `advisor-wait.test.tsx` pins as the anti-vacuous half.
- **A first question with a file uploaded behind the greeting.** The wait was
  drawn in the thread branch, and the optimistic turn only lands after the
  upload, so the greeting — and four prompts inviting a second question —
  stayed up through the whole upload. The greeting now ends when a question
  is sent.

One allow-list entry remains, and it is honest: `app/consultant/[vehicleId]/page.tsx`
still draws two hand-rolled rings under "Loading consultant…". It was outside
this pass's lane; the replacement is one line, `<Working delay line="Opening
the advisor" />`, the shape `/plan` and `/vehicle-info` already use, and the
entry comes out with it.

### 14.9 Recorded deviations from the critic's brief

- The specimen's section heading reads "the un-analysed mod" in the repo's
  British prose voice while the state label beneath it reads NOT ANALYZED YET
  in the product's. The critic read the heading as the label in round 04 and
  held a point for it; the label matches the product, and dev-only prose
  keeps the prose voice.
- "Usually under a minute" on vehicle research is the one duration printed on
  any wait, and it stays: measured on 22 Aug (`VehicleResearchStatus`), which
  the brief records so it is not relitigated. Nothing else prints a number,
  because `ai_usage_events` carries no latency column.

### 14.10 The advisor's failure turn is the product speaking, not Jay — 17 Sep, for Design

Until 17 Sep every failed turn in the web thread rendered as an answer: Jay's
byline, the cyan rule, "Sorry, I encountered an error. Please try again.",
then the "Written by AI from this car's records" disclosure and a Copy button
under it. On the demo that was reachable one keystroke in — a typed question
off the fixed list — and the disclosure under an error was a false claim in
the direction that makes the true ones read as boilerplate.

The server now sends a `code` with every failure a retry cannot fix
(`packages/core/src/ai/advisor-failure.ts`) and the sentence beside it is
written to be shown. The thread renders that turn as a **failure turn**:

- **position** — the answer's slot, so the thread still reads as call and
  response;
- **no byline** — "Jay is unavailable right now" must not be said by Jay;
- **the rule goes neutral** — `border-white/20` for the cyan info rule, and
  the text steps back to `text-white/70`;
- **no disclosure, no Copy** — nothing here was written by AI, and there is
  nothing worth copying.

Unruled: whether the failure turn wants the sodium the brief keeps off every
wait (§14.7 is the same question from the instrument's side), and whether a
spent allowance and an unreachable model should look different from each
other. Both were left identical on purpose — one treatment for "the product
is speaking" until Design says otherwise. `components/ConsultantChat.tsx`
carries the flag (`isFailure`); the phone shows the same sentences under the
composer, where its refusals already live, and needed no new treatment.

---

## 15. The carrier, not the palette — 22 Sep 2026

David, on the phone: *"is it simply too much black and white with nothing
else? … I love what we've done with the introduction of the images on all
pages, that's a step in the right direction, but the concern still exists."*

He was right, and the first answer to reach for would have been wrong.

### 15.1 What the audit actually found

Every screen in `apps/mobile/src/screens` scanned for colour-token references
against surface and text ones, and every screen's imagery traced through real
component composition rather than through imports:

- **12%** of the app's colour references are chromatic. The rest is graphite
  and off-white ink.
- **14 screens** use no chromatic token at all.
- Imagery reached **6 screens**.

But the interface being flat is not the defect — it is the locked brief:
*"two hues only, used as light rather than as fill… the two hues are light,
and light belongs to the environment — the photograph."* `MastheadPlate` had
already written the consequence down on 11 Sep, in response to David saying
almost exactly this: *"a root with no imagery has nothing carrying it."*

So the diagnosis is **coverage**, not palette. Twenty-three screens were
running the flat half of the direction with nothing on top of it. And the
tell is that Service and Plan score **0% chroma in their own code** while
looking the best in the app — the plate is doing all of it.

⚠ **The fix must not be a third hue.** Between 3 and 5 Sep this codebase
removed a green, a red family and a duplicate amber, each with a contrast
defect behind it. Tinting a card to answer "it looks grey" walks all of that
back and breaks B5 besides.

### 15.2 A second finding, and it is the product one

Colour in this app is **bound to failure**. The health ramp came off green on
4 Sep, so `Good` bands to off-white — which is the right call, and
`health-band.ts` argues it well: a car with nothing wrong should read as
unremarkable rather than as a small celebration.

But *unremarkable* was implemented as *colourless*, and the consequence
follows to the user: **a well-maintained car renders a monochrome app.** The
better an owner does the job Tappet exists to help with, the greyer their
product becomes. David has been living in the success state, which is why he
is the one who noticed.

That finding is recorded rather than acted on directly. Its fix is 15.3 — the
success state gets the photograph, because the photograph is the only carrier
the brief licenses.

### 15.3 What shipped

- **`PlateBand`** — a 132pt frame at the head of a screen that is not a root,
  carrying no type at all (so nothing here can fail a contrast check) and one
  45° cut in the house geometry. A screen takes **its stack's** place: Account,
  Health, Recall detail and the vehicle profile open on the house plate; the
  invoice detail opens on the workshop apron. Account is the deviation — it is
  not a car screen and has no frame of its own; a bespoke one is an asset job.
- **The house plate takes the split tone.** `night-plate.jpg` is the most-shown
  image in the product and was its least chromatic: 0.268 mean saturation
  against 0.368–0.624 for the three mastheads, and flat in every 351-row band,
  so the tall crop is not the explanation. `PhotoGrade` gained a `plate`
  variant — the split tone alone, no lift, no vignette, no second grain. At
  0.40 on `soft-light` the plate measures **0.428**, inside the mastheads'
  band, with luminance moving 53 → 57.
- **Two guards.** `house-plate-chroma.test.ts` decodes the shipped frames and
  holds a saturation floor under each; `plate-coverage.test.ts` holds which
  screens open on a frame. Both carry an anti-vacuous case, and both caught a
  defect in their own first draft.

### 15.4 Two moves proposed and dropped, with the reasons

Recorded because both would otherwise be proposed again.

- **"Light the bay by the car's health"** — dropped. `BayLightPool` was removed
  from `GarageBay` on **11 Sep** and the comment explaining its removal is still
  there: under B7 cyan is *"focus, active rule and refresh ramp"* and nothing
  else, and on a graded frame the 14% pool *"read as air"* anyway. Reinstating
  it would have been §1's exact failure — rebuilding something that already
  carries a note explaining its own fix.
- **"The grade is damped on assets that do not need it"** — dropped, premise
  disproved by measurement. The three mastheads are the most saturated things
  in the product; they are not damped, and they are not graded at render
  because they are already the film.

⚠ Two docblocks cite scripts that do not exist in this repo:
`scripts/build-mastheads.mjs` (`MastheadPlate`) and
`scripts/render-night-plate.mjs` (`NightPlate`). Same shape as the
`cluster-geometry.test.ts` citation §1 collects. Not fixed here — flagged,
because the frames themselves are the thing that would need regenerating and
that is David's call.
