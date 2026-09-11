# `public/design/` — provenance

Same convention as `public/vehicles/CREDITS.md`: every image here records where
it came from, so a derivative can be rebuilt without guessing at the original.

Unlike `public/vehicles/`, nothing here is a photograph of a real car anyone
owns. These are generated plates for the design system's own surfaces.

---

## `specimen-hero-{960,1600,2400}.webp`

⚠ **Replaced 5 Sep.** The first plate (`hero-night-street-1.png`, kept in
`design-loop/design-system/img/`) was graded sodium-only by two consecutive
critiques — the cold half of the north-star's duel never registered at
thumbnail size. The replacement below carries both sources in frame, and the
four sampled chips on the specimen were re-read from it: the road pool now
measures `#F28928` against `--attention`'s `#FB923C`.

Selection was by measurement. All three candidates were profiled over the
headline zone (left 38%, vertical 25–80%) and for the share of frame carrying
genuine cyan light:

| | headline worst-case | cyan-lit |
|---|---|---|
| 1 | 6.61:1 | 13.5% |
| 2 | 2.05:1 — **fails** | 19.0% |
| **3 — chosen** | **10.99:1** | 13.4% |

### The replacement prompt, verbatim

> Hero plate for a design-system specimen page. Role: full-bleed masthead
> photograph with a large display headline set over its LEFT THIRD.
>
> Subject: a matte black modern performance sedan, three-quarter rear,
> stationary on wet asphalt at night in an empty industrial street.
>
> ⚠ The defining requirement is TWO LIGHT TEMPERATURES IN OPEN CONFLICT, both
> clearly readable at thumbnail size. A previous attempt at this frame came out
> almost entirely sodium and the cold half never registered.
>
> - WARM: a sodium streetlamp high and behind the car, burning orange, throwing
>   a long orange reflection down the wet road on the right.
> - COLD: a strong cyan source at street level from camera right, raking across
>   the car's flank and pooling as a broad, bright cyan sheet on the wet tarmac
>   in the right half of the frame. This cyan must be genuinely luminous — a
>   real light with real brightness, not a dark teal colour cast.
>
> The two should meet and fight somewhere behind the car, orange above and cyan
> below.
>
> Composition: the car sits in the right two-thirds. The LEFT THIRD stays empty
> wet road falling to near-black — no light source there, nothing bright,
> because large type sits over it. Low horizon, camera at kerb height, strong
> negative space upper-left.
>
> Anamorphic, shallow depth of field, visible fine film grain, filmic
> teal-and-orange grade — saturated in the lights themselves, restrained
> everywhere else. No text, no logos, no people, no neon signage, no underglow,
> no light trails.

---

### The original plate, superseded

| | |
|---|---|
| **Role** | Masthead plate on `/dev/system`, the design-system specimen page. Brief line B1. |
| **Generated** | 4 Sep 2026, `~/Developer/design-loop/scripts/gen-image.mjs` |
| **Model** | `gemini-3-pro-image-preview`, `--n 3`, `--aspect 16:9` |
| **Styled to** | `design-loop/design-system/north-star.png` via `--ref` |
| **Source** | `design-loop/design-system/img/hero-night-street-1.png` — 2752×1536 |
| **Chosen** | 1 of 3. The other two are in `design-loop/design-system/rejects/`; both were better photographs and worse plates, because their left thirds carry fencing and buildings where this one carries flat black for the headline to sit in. |

Derivatives, run once rather than added to `scripts/build-image-derivatives.mjs`
— that script is scoped to `public/vehicles/` and re-encodes in place without
resizing, which is the opposite of what a responsive `srcset` needs:

```
node -e 'const sharp=require("sharp"); for (const w of [960,1600,2400])
  sharp("design-loop/design-system/img/hero-night-street-1.png")
    .resize({width:w}).webp({quality:72})
    .toFile(`public/design/specimen-hero-${w}.webp`)'
```

⚠ The intrinsic ratio is **1.7917**, not 1.7778. It is a 16:9 request that came
back 2752×1536. The `width`/`height` attributes at the call site state the real
numbers rather than the requested ones — a stated ratio that disagrees with the
file is a layout shift that only appears on a slow connection.

### The prompt, verbatim

> Hero plate for a design-system specimen page. Role: full-bleed masthead
> photograph, the only photograph on the page, with a display headline set over
> its left third.
>
> Subject: a matte black modern performance sedan, three-quarter rear view,
> stationary on wet asphalt at night in an empty industrial street.
>
> Composition: the car sits in the right two-thirds; the left third is empty wet
> road falling off into darkness, deliberately clear and uncluttered so large
> type can sit over it. Low horizon. Strong negative space upper-left. Camera at
> kerb height.
>
> Lighting: warm sodium streetlight raking from behind the car and throwing a
> long reflection down the wet asphalt; a cold cyan gel from camera left catching
> the flank and the standing water. Deep black shadows with no fill light. One
> soft flare from the sodium lamp only.
>
> Anamorphic, shallow depth of field, visible fine film grain, filmic
> teal-and-orange grade held restrained rather than saturated. No text, no logos,
> no people, no neon signage, no underglow, no light trails.

---

## `glass-plate-{480,960}.webp`

| | |
|---|---|
| **Role** | Background plate beneath the `.glass-panel` specimen on `/dev/system`. Brief line B9. |
| **Generated** | 5 Sep 2026, `~/Developer/design-loop/scripts/gen-image.mjs` |
| **Model** | `gemini-3-pro-image-preview`, `--n 3`, `--aspect 4:3` |
| **Styled to** | `design-loop/design-system/north-star.png` via `--ref` |
| **Source** | `design-loop/design-system/img/glass-plate-2.png` — 2400×1792 |
| **Chosen** | 2 of 3, for being the darkest of the three through the middle. That is the only criterion that mattered: off-white ink sits over this region, and the two brighter candidates put a sodium bloom directly behind it. |

The panel is inset rather than full-bleed over this image, deliberately — the
class being demonstrated is a 12px `backdrop-filter`, and what shows it is the
*difference* between the blurred region and the sharp image beside it. A
full-bleed backdrop hides exactly the thing the specimen exists to show.

### The prompt, verbatim

> Background plate for a translucent glass panel in a design-system specimen.
> Role: background plate — a card with blurred translucency sits directly on top
> of it, so this image exists to give that blur something to demonstrate.
>
> Subject: a tight, close crop of wet asphalt at night, filling the frame. No
> car, no horizon, no sky, no recognisable objects.
>
> Composition: one warm sodium streetlamp flare in the upper left third, thrown
> out of focus into a soft round bloom, and one cold cyan reflection stretching
> diagonally across the wet surface at lower right. Between and around them,
> deep unlit black asphalt with visible wet grain and scattered small specular
> pinpoints where water catches the light.
>
> Critical: the frame must stay DARK overall — the two highlights are small and
> contained, everything else falls to near-black, because off-white text will be
> set over the middle of this image and must remain readable. No large bright
> areas. No text, no logos, no people.
>
> Anamorphic, very shallow depth of field so the highlights are soft rounded
> bokeh, fine film grain, restrained teal-and-orange grade.

---

## `check-plate-{1200,1920}.webp`

| | |
|---|---|
| **Role** | Background plate on `/check`, replacing the drawn cyan room. |
| **Generated** | 5 Sep 2026, `gen-image.mjs`, `gemini-3-pro-image-preview`, `--n 3 --aspect 16:9` |
| **Styled to** | `design-loop/design-system/north-star.png` via `--ref` |
| **Source** | `design-loop/design-system/img/check-plate-2.png` — 2752×1536 |
| **Chosen** | 2 of 3, by measurement rather than by eye. The card sits centred, so all three were profiled over the region it covers: worst-case contrast for `--text-primary` was 3.08:1, **5.93:1** and 2.56:1. Only one of them could carry a card. |

⚠ `/check` is the one page in the product that photographs its room; every
other `.service-bay` surface draws it in CSS at zero bytes.
`image-weight-budget.test.ts` lists five pages that must ship no photograph and
`/check` is deliberately not among them — but that file now also caps this
plate at 70 KB, so the exemption is bounded rather than open. `app/page.tsx`
**is** on that list, which is why the landing keeps the drawn room.

### The prompt, verbatim

> Background plate for a web page's hero area. Role: background plate — a dark
> interface card sits centred on top of it, so this image is atmosphere and must
> never compete with the card.
>
> Subject: wet tarmac outside a service bay at night, thrown far out of focus. No
> car, no people, no signage, no readable objects — only light on a wet surface.
>
> Composition: light gathers toward the upper edge and the two lower corners, and
> the CENTRE OF THE FRAME FALLS TO NEAR-BLACK, because a card of text sits there.
> A warm sodium lamp bleeds in from the upper left; a cold cyan reflection pools
> along the lower right. Everything soft, nothing in focus.
>
> Critical: this must read as almost entirely dark. The highlights are small,
> contained and at the edges. No large bright areas anywhere, and nothing bright
> within the middle third in either direction.
>
> Anamorphic bokeh, heavy defocus, fine film grain, restrained teal-and-orange
> grade. No text, no logos.

---

## `onboard-vin-plate-{800,1400}.webp`

| | |
|---|---|
| **Role** | Product-in-context plate beside the VIN form on `/onboard` (`app/onboard/OnboardVinForm.tsx`). Signed-in brief line B9. Contained, not a page background — CC-142 §5 still holds on this route. |
| **Generated** | 11 Sep 2026, `~/Developer/design-loop/scripts/gen-image.mjs` |
| **Model** | `gemini-3-pro-image-preview`, `--n 3`, `--aspect 3:2` |
| **Styled to** | `design-loop/signed-in/north-star.png` via `--ref` |
| **Source** | `design-loop/signed-in/img/vin-plate-3.png` — 2528×1696 |
| **Chosen** | 3 of 3. Candidate 2 was **rejected for rendering a legible VIN-like string** on the tag — a fake number beside the field that asks for a real one is precision this product does not invent. Candidate 1 was almost entirely cyan; 3 carries both temperatures, sodium bokeh upper right and cyan on the wet road, and its stamped characters are texture rather than text at any size. The rejects are in `design-loop/signed-in/rejects/`. |
| **Weight** | 800px 29.8 KB, 1400px 63.6 KB. `image-weight-budget.test.ts` caps the heaviest at 96 KB. |

Derivatives, run once with the same recipe as the specimen hero:

```
node -e 'const sharp=require("sharp"); for (const w of [800,1400])
  sharp("design-loop/signed-in/img/vin-plate-3.png")
    .resize({width:w}).webp({quality:72})
    .toFile(`public/design/onboard-vin-plate-${w}.webp`)'
```

The intrinsic ratio is **1.4906**, a 3:2 request that came back 2528×1696; the
`width`/`height` attributes at the call site state those numbers.

### The prompt, verbatim

> Product-in-context photograph for the 'add a vehicle' page of a
> car-ownership app. Role: a contained plate beside a form, not a full-bleed
> background.
>
> Subject: a close, low-angle view of a car's VIN plate — the small stamped
> metal tag at the base of the windscreen on the driver's side, seen through
> the bottom corner of the glass — at night, on wet asphalt. Modern ordinary
> car, dark paint, no badges visible. The stamped characters catch the light as
> texture but are NOT legible: shallow focus and reflection make them
> unreadable, so the image carries no actual number.
>
> Composition: the plate and the windscreen edge fill the lower-left
> two-thirds; the upper right dissolves into dark bokeh of a wet street. Camera
> close, lens near the glass. Nothing bright in the upper right where the image
> meets a dark page.
>
> Lighting: one warm sodium streetlamp raking across the stamped metal from the
> left, throwing an orange highlight along the plate's edge and a soft
> reflection in the glass; cold cyan spill from the far right catching the wet
> bonnet and the standing water. Both temperatures clearly present. Deep
> warm-graphite shadows.
>
> Anamorphic, shallow depth of field, visible fine film grain, filmic
> teal-and-orange grade held restrained. No text, no logos, no people, no neon
> signage, no underglow, no light trails, no chrome.
