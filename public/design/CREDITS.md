# `public/design/` — provenance

Same convention as `public/vehicles/CREDITS.md`: every image here records where
it came from, so a derivative can be rebuilt without guessing at the original.

Unlike `public/vehicles/`, nothing here is a photograph of a real car anyone
owns. These are generated plates for the design system's own surfaces.

---

## `specimen-hero-{960,1600,2400}.webp`

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
