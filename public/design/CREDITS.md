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
