'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Gauge, Plus, Search, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuildGauge } from '@/components/BuildGauge';
import { ClusterGauge } from '@/components/ClusterGauge';
import type { BuildPosition } from '@wellkept/core/build-progress';

/*
 * The design system on one page — tokens, then the controls built from them.
 *
 * ── Why this page exists ────────────────────────────────────────────────────
 *
 * `app/dev/brand` does this for the lockup and says why in its own header: a
 * mark fails by rendering wrong, not by throwing. The same is true of the
 * system underneath it, and more so, because the system has a second voice.
 *
 * ⚠ This page carried a DEFAULT/SPORT toggle and a REGISTER TOKENS section.
 * Both are gone, cut by successive critiques, and the reason is the same one
 * twice: the scope decision moved the cut and the milled radii into the
 * *default* register, so a page that documents the chamfer as an optional mode
 * is arguing against the system it is describing. A specimen page states the
 * voice; it does not offer to switch it.
 *
 * `[data-register='sport']` is still defined in `globals.css` and still set by
 * nothing in the app. It is a deeper cut and a harder light on top of this
 * geometry now, rather than the only place geometry exists — inspect it by
 * setting `data-register` on `<html>` in devtools. `register-tokens.test.ts`
 * is what keeps it honest in the meantime.
 *
 * ── The swatches read the DOM, they do not restate the file ─────────────────
 *
 * Every value below comes from `getComputedStyle`, not from a literal typed
 * here. A showcase that hardcodes `#100F0D` beside a chip painted with
 * `var(--background)` is two sources of truth, and the failure mode is a page
 * that keeps looking correct after the token moves — the exact defect
 * `CLAUDE.md` §5 is about, in the one artefact whose job is to show the truth.
 *
 * Reading the computed value also makes the register toggle honest: the same
 * swatch re-reads and re-renders, so what you see is what the cascade actually
 * resolved, including the aliases (`--surface-2` → `--card`) that a file read
 * would show as a `var()` reference rather than a colour.
 *
 * ⚠ Bare-triplet tokens are not colours. `--background` is `40 10% 6%`, which
 * is only a colour inside `hsl()`. `TRIPLET` marks them so the swatch wraps
 * them and the printed value says which kind it is; painting a triplet
 * directly produces no colour at all and no error.
 *
 * ⚠ Ink on this page comes from tokens, never from a bare white alpha. That is
 * not style preference — `text-contrast-floor.test.ts` scans `app/` for white
 * alphas below the floor and cannot classify one that sits in a class string
 * with no text-size beside it. The first draft of this page put a sub-floor
 * alpha on `.label-uppercase`, which already sets the floor value itself, and
 * turned the guard red for thirteen sites that were redundant rather than
 * wrong.
 *
 * ⚠ And do not spell those class names in a comment, even to explain them.
 * The same guard counts tokens before and after stripping comments and fails
 * if stripping ate more than five, which is how it proves it is reading
 * markup rather than prose. Six mentions in this header turned it red a
 * second time — the anti-vacuous case doing exactly its job.
 */

/** Tokens stored as bare `H S% L%` triplets, consumed via `hsl(var(--x))`. */
const TRIPLET = new Set([
  'background',
  'surface-nav',
  'surface-1',
  'surface-2',
  'surface-3',
  'card',
  'popover',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'border',
  'input',
  'ring',
  'foreground',
  'muted-foreground',
  'card-foreground',
  'primary-foreground',
  'accent-foreground',
  'destructive-foreground',
  'secondary-foreground',
]);

function paint(name: string) {
  return TRIPLET.has(name) ? `hsl(var(--${name}))` : `var(--${name})`;
}

/** One token, painted and printed. */
function Swatch({ name, note }: { name: string; note?: string }) {
  const [resolved, setResolved] = useState('');

  useEffect(() => {
    /*
     * Re-read on every register change. The observer watches <html>'s
     * attributes because that is where `data-register` lands; a `useEffect`
     * keyed on a React state would not see a change made by any other route.
     */
    const read = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(`--${name}`)
        .trim();
      setResolved(raw);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [name]);

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-11 w-11 shrink-0 rounded-lg border border-white/12"
        style={{ background: paint(name) }}
      />
      <div className="min-w-0">
        <p className="mono truncate text-[11px] text-[color:var(--text-primary)]">
          --{name}
        </p>
        <p className="mono truncate text-[11px] text-[color:var(--text-muted)]">
          {resolved || '—'}
          {TRIPLET.has(name) ? ' · triplet' : ''}
        </p>
        {note ? (
          <p className="truncate text-[11px] text-[color:var(--text-muted)]">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/*
 * The rail — brief B6.
 *
 * A 12-column grid whose first three columns are the section's name in mono
 * and nothing else. It is `sticky` rather than `fixed`: a fixed rail would
 * need the content column to carry a matching margin, which is two numbers
 * that have to agree, and they stop agreeing the first time somebody changes
 * one. Sticky keeps the label with its own section and needs no second number.
 *
 * ⚠ The rail collapses to a plain heading under `lg`. A three-column label
 * beside a nine-column body is a desktop rhythm; on a phone it is a 90px
 * column of orphaned words next to a squeezed one.
 */
function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-[color:var(--register-rule)] pt-12 lg:grid lg:grid-cols-12 lg:gap-8"
    >
      <div className="lg:col-span-3">
        <h2 className="mono sticky top-8 text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          {title}
        </h2>
      </div>
      <div className="mt-4 space-y-5 lg:col-span-9 lg:mt-0">
        {blurb ? (
          <p className="measure text-sm text-[color:var(--text-muted)]">
            {blurb}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-white/6 py-4">
      <p className="mono w-32 shrink-0 text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

/*
 * The button state row — brief B8.
 *
 * `force` drives `data-force`, which `hoverable:`/`focusable:` in
 * `tailwind.config.ts` compile into alongside the real pseudo-classes. So this
 * row renders the primitive's own hover and focus declarations rather than a
 * copy of them, and it survives a still screenshot, which `:hover` does not.
 *
 * ⚠ Disabled is a real `disabled` attribute, not a forced one. The disabled
 * styling hangs off `:disabled`, and faking it with an attribute would show a
 * button that looks unavailable and is not — the one state where pretending
 * has a behavioural consequence.
 */
const STATES: ReadonlyArray<{
  label: string;
  force?: string;
  disabled?: boolean;
  note: string;
}> = [
  { label: 'Default', note: 'off-white · 15.6:1' },
  { label: 'Hover', force: 'hover', note: 'sodium fill · 8.5:1' },
  { label: 'Focus', force: 'focus', note: 'cyan ring, inset' },
  { label: 'Disabled', disabled: true, note: 'stated fill and ink' },
];

const BUILD: BuildPosition = {
  points: 14,
  zone: 'heavily-modified',
  label: 'Heavily modified',
  needle: 62,
};

/*
 * The four values the plate above actually carries, sampled from it.
 *
 * These are not the tokens — they are the photograph, read at four points, and
 * they are printed beside the tokens so the claim "the palette comes from the
 * plate" can be checked rather than believed. The tokens are brighter by
 * design: #C27D54 is what sodium light does to wet asphalt, and it is 3.6:1 on
 * this ground, which is a colour you can photograph but not set text in.
 */
const SAMPLED = [
  { at: 'road pool', hex: '#C27D54', token: '--attention' },
  { at: 'flank', hex: '#004C56', token: '--info' },
  { at: 'lamp core', hex: '#FEECDC', token: '--foreground' },
  { at: 'shadow', hex: '#030D0F', token: '--background' },
];

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-background">
      {/*
        The masthead — brief B1.

        Full-bleed, and the headline sits in the left third because that is the
        third the plate was composed to leave empty. The scrim is a legibility
        device over a real photograph, not a gradient standing in for one: at
        the sample points behind the type the plate is #030D0F to #0C1B20, so
        the scrim is doing very little except holding the middle of the frame
        back off the descenders.

        `loading` is eager and there is no `fetchPriority`. React 18.2 — which
        is what Next 13.5.1 pins here — does not know the camelCase prop and
        warns `Invalid DOM property`, which `VehicleIdentity` already emits once
        per card on the landing page. One instance of a known warning is a bug
        to fix; two is a pattern somebody copies.
      */}
      <section className="relative isolate overflow-hidden">
        {/*
          A plain img, deliberately. The derivatives are built once by `sharp`
          and committed (see public/design/CREDITS.md), which is the same
          arrangement `public/vehicles/` already uses. Routing an
          already-optimised WebP through `next/image` would re-encode it at
          request time on the image CDN and bill for it, to produce the srcset
          that is written out by hand below.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/design/specimen-hero-1600.webp"
          srcSet="/design/specimen-hero-960.webp 960w, /design/specimen-hero-1600.webp 1600w, /design/specimen-hero-2400.webp 2400w"
          sizes="100vw"
          width={2752}
          height={1536}
          loading="eager"
          decoding="async"
          alt="A matte black BMW M3 parked on wet asphalt at night, lit by sodium streetlight from behind and a cold cyan reflection along its flank."
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent"
        />

        <div className="relative mx-auto flex min-h-[64vh] max-w-5xl flex-col justify-end px-6 pb-0 pt-24">
          <p className="mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--attention)]">
            Development only
          </p>
          <h1 className="display-instrument display-instrument-tight mt-3 text-[clamp(2.75rem,9vw,6.5rem)] uppercase leading-[0.92] text-[color:var(--text-primary)]">
            Well Kept
            <br />
            The System
          </h1>
          <p className="measure mt-5 text-sm text-[color:var(--text-muted)]">
            Every swatch below reads its value from the live cascade. Nothing on
            this page restates a number from <span className="mono">globals.css</span>.
          </p>

          {/* The palette, hard against the plate's bottom edge — B1. */}
          <div className="mt-10 grid grid-cols-2 border-t border-white/15 sm:grid-cols-4">
            {SAMPLED.map((s) => (
              <div
                key={s.at}
                className="flex items-center gap-3 border-b border-white/10 px-1 py-3 sm:border-b-0"
              >
                <span
                  className="h-8 w-8 shrink-0 border border-white/20"
                  style={{ background: s.hex }}
                />
                <span className="min-w-0">
                  <span className="mono block truncate text-[11px] text-[color:var(--text-primary)]">
                    {s.hex}
                  </span>
                  <span className="mono block truncate text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">
                    {s.at}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-24 px-6 py-16">
        <Section
          id="palette"
          title="Two hues, and what they mean"
          blurb="Sodium is the warning axis and nothing else. Cyan is information, focus, and the build ramp. Everything else is neutral. The tokens are brighter than the plate they came from because ink needs contrast that photographed light does not."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {SAMPLED.map((s) => (
              <div
                key={s.token}
                className="flex items-center gap-4 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-4"
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-md border border-white/15"
                  style={{ background: s.hex }}
                />
                <span className="mono text-[11px] text-[color:var(--text-muted)]">
                  plate {s.hex}
                </span>
                <span className="text-[color:var(--text-muted)]">→</span>
                <span
                  className="h-10 w-10 shrink-0 rounded-md border border-white/15"
                  style={{ background: paint(s.token.replace('--', '')) }}
                />
                <span className="mono truncate text-[11px] text-[color:var(--text-primary)]">
                  {s.token}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="surfaces"
          title="Surfaces — the elevation ladder"
          blurb="Warmed to graphite, not blue-black. surface-2 and surface-3 are aliases onto --card and --secondary, so the swatch prints what the alias resolved to."
        >
          <div className={GRID}>
            <Swatch name="background" note="surface-0, the page ground" />
            <Swatch name="surface-nav" note="top nav" />
            <Swatch name="surface-1" note="raised bars, tab strip" />
            <Swatch name="surface-2" note="alias → --card" />
            <Swatch name="surface-3" note="alias → --secondary, inset well" />
            <Swatch name="surface-disabled" note="pre-composited" />
          </div>
        </Section>

        <Section
          id="edges"
          title="Edges"
          blurb="Card borders take the warm neutral. Control borders are translucent white, because a fixed neutral sampled on one surface disappears on the others."
        >
          <div className={GRID}>
            <Swatch name="border" note="cards, panels" />
            <Swatch name="border-subtle" note="hairline inside a well" />
            <Swatch name="border-field" note="controls only" />
            <Swatch name="border-field-hover" />
            <Swatch name="focus-ring-soft" note="3px halo" />
            <Swatch name="ring" note="2px outline" />
          </div>
        </Section>

        <Section
          id="ink"
          title="Ink"
          blurb="Body, muted, and the disabled pair that exists to be measurable rather than compliant. Good news is carried here, not by a hue."
        >
          <div className={GRID}>
            <Swatch name="foreground" />
            <Swatch name="muted-foreground" />
            <Swatch name="text-muted-40" />
            <Swatch name="text-disabled" note="3.31:1 — exempt, not passing" />
          </div>
          <div className="space-y-2 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-5">
            <p className="text-base text-[color:var(--text-primary)]">
              Body copy at the default size, on surface-1.
            </p>
            <p className="text-sm text-[color:var(--text-muted)]">
              Muted, for anything secondary to the sentence beside it.
            </p>
            <p className="text-sm text-[color:var(--text-disabled)]">
              Disabled ink, which no live sentence should ever use.
            </p>
          </div>
        </Section>

        <Section
          id="action"
          title="Brand and action"
          blurb="The palette settled on white for actions, the ramps for state, sodium for alarm. The cyan below is the mark's colour and the information colour — never a call to action."
        >
          <div className={GRID}>
            <Swatch name="brand-accent" note="the mark" />
            <Swatch name="brand-accent-button" note="cyan-700, filled" />
            <Swatch name="brand-accent-ink" note="pairs with the fill" />
            <Swatch name="primary" />
            <Swatch name="info" note="links, headers — never a CTA" />
            <Swatch name="info-strong" />
          </div>
        </Section>

        <Section
          id="status"
          title="Semantic status"
          blurb="Attention and critical are the same hue now, so the treatment is what separates them: attention is ink on a wash, critical is a solid fill. That is the whole of B3 — severity as intensity and area, never as a second hue, and never as colour alone. Each chip still carries an icon and a word."
        >
          <div className={GRID}>
            <Swatch name="attention-amber" />
            <Swatch name="attention-amber-wash" />
            <Swatch name="critical-red" note="hot sodium, not salmon" />
            <Swatch name="critical-red-solid" note="the filled case" />
            <Swatch name="critical-red-wash" />
            <Swatch name="confirm-green" note="ink, holding no green" />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chamfer-sm inline-flex items-center gap-1.5 border border-[color:var(--attention-border)] bg-[color:var(--attention-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--attention)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Attention
            </span>
            <span className="chamfer-sm inline-flex items-center gap-1.5 bg-[color:var(--critical-solid)] px-3 py-1 text-xs font-semibold text-[color:var(--primary-foreground)]">
              <AlertTriangle className="h-3.5 w-3.5" /> 2 open recalls
            </span>
            <span className="chamfer-sm inline-flex items-center gap-1.5 border border-[color:var(--confirm-border)] bg-[color:var(--confirm-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--confirm)]">
              <Check className="h-3.5 w-3.5" /> Logged
            </span>
            <span className="chamfer-sm inline-flex items-center gap-1.5 border border-[color:var(--info-border)] bg-[color:var(--info-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--info-strong)]">
              From your invoice
            </span>
          </div>
        </Section>

        <Section
          id="ramps"
          title="The two ramps"
          blurb="Health grades a car and climbs into heat. Build describes one and climbs into cold — nothing on it is a failure state, so nothing on it is allowed to look like one."
        >
          <div className={GRID}>
            <Swatch name="ring-good" note="≥ 80 — unremarkable" />
            <Swatch name="ring-ok" />
            <Swatch name="ring-warn" />
            <Swatch name="ring-bad" />
          </div>
          <div className={GRID}>
            <Swatch name="build-stock" note="under 12" />
            <Swatch name="build-mild" note="12–39" />
            <Swatch name="build-warm" note="40–69" />
            <Swatch name="build-far" note="70+" />
            <Swatch name="build-redline" note="not part of the ramp" />
            <Swatch name="build-redline-track" />
          </div>
          <div className="flex flex-wrap items-end gap-8 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-6">
            <div className="space-y-2 text-center">
              <ClusterGauge score={82} variant="card" size={104} />
              <p className="mono text-[11px] text-[color:var(--text-muted)]">
                health 82
              </p>
            </div>
            <div className="space-y-2 text-center">
              <ClusterGauge score={61} variant="card" size={104} />
              <p className="mono text-[11px] text-[color:var(--text-muted)]">
                health 61
              </p>
            </div>
            <div className="space-y-2 text-center">
              <ClusterGauge score={null} variant="card" size={104} />
              <p className="mono text-[11px] text-[color:var(--text-muted)]">
                null — not zero
              </p>
            </div>
            <div className="space-y-2 text-center">
              <BuildGauge position={BUILD} size={104} />
              <p className="mono text-[11px] text-[color:var(--text-muted)]">
                build 14 pts
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="type"
          title="Type"
          blurb="Archivo is the instrument voice and holds the display slot; Newsreader stays the editorial voice on --font-editorial. JetBrains Mono carries every token name, value and state label, so the system is typeset the same on every machine."
        >
          <div className="space-y-5 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-6">
            <p className="display-instrument display-instrument-tight text-[4.5rem] uppercase leading-[0.9] text-[color:var(--text-primary)]">
              A Live Garage
            </p>
            <p className="display-instrument text-4xl text-[color:var(--text-primary)]">
              Display, 88% width
            </p>
            <h3 className="text-xl font-semibold text-[color:var(--text-primary)]">
              Section heading, Inter semibold
            </h3>
            <p className="measure text-base text-[color:var(--text-muted)]">
              Body copy sets at sixteen with a measure cap, because a line that
              runs the full width of a workbench layout is not readable at any
              size.
            </p>
            <p className="label-uppercase">Label, uppercase</p>
            <p className="mono text-3xl text-[color:var(--text-primary)]">
              67,400 mi · 82 · $1,240
            </p>
            <p className="mono text-xs text-[color:var(--text-muted)]">
              .mono — tabular, one face on every machine
            </p>
          </div>
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          blurb="One control, four states, in the order a reader meets them. Rest is off-white — a neutral, so it spends neither hue — and hover is the one place on a resting surface where a hue fills an area. Hover here is a real hover: the primitive's declaration is written once and compiled to both the pseudo-class and a forced attribute, so this cell cannot drift away from the button you actually touch."
        >
          <div className="border border-[color:var(--border)] bg-[hsl(var(--surface-1))] p-6">
            <div className="grid gap-6 sm:grid-cols-4">
              {STATES.map((state) => (
                <div key={state.label} className="space-y-3">
                  <p className="mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    {state.label}
                  </p>
                  <Button
                    data-force={state.force}
                    disabled={state.disabled}
                    className="w-full"
                  >
                    Add a car
                  </Button>
                  <p className="mono text-[10px] text-[color:var(--text-muted)]">
                    {state.note}
                  </p>
                </div>
              ))}
            </div>

            <Row label="variants">
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
              <Button variant="link">Link</Button>
            </Row>
            <Row label="sizes">
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Add">
                <Plus className="h-4 w-4" />
              </Button>
              <Button>
                <Wrench className="mr-2 h-4 w-4" /> Log service
              </Button>
              <Button variant="outline">
                <Search className="mr-2 h-4 w-4" /> Research
              </Button>
            </Row>
          </div>
        </Section>

        <Section
          id="fields"
          title="Fields"
          blurb="One field design, four states. Invalid is an attribute so a screen reader is told, never a conditional class."
        >
          <div className="grid gap-5 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-6 sm:grid-cols-2">
            <div className="field-group space-y-1.5">
              <label className="label-uppercase" htmlFor="f1">
                Mileage
              </label>
              <input id="f1" className="field mono" defaultValue="67,400" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase" htmlFor="f2">
                Placeholder
              </label>
              <input id="f2" className="field" placeholder="e.g. front brakes" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase" htmlFor="f3">
                Invalid
              </label>
              <input
                id="f3"
                className="field"
                aria-invalid="true"
                defaultValue="-12"
              />
              <p className="text-xs text-[color:var(--critical)]">
                Mileage cannot go backwards.
              </p>
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase" htmlFor="f4">
                Disabled
              </label>
              <input
                id="f4"
                className="field"
                disabled
                defaultValue="VIN locked"
              />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase" htmlFor="f5">
                Small
              </label>
              <input id="f5" className="field field-sm" defaultValue="Small" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase" htmlFor="f6">
                Textarea
              </label>
              <textarea
                id="f6"
                className="field field-textarea"
                rows={3}
                defaultValue="Rear control arms replaced, both sides."
              />
            </div>
          </div>
        </Section>

        <Section
          id="badges"
          title="Badges and chips"
          blurb="The primitive's four variants, then the provenance chips the product actually ships."
        >
          <div className="rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] px-6 py-2">
            <Row label="primitive">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </Row>
            <Row label="provenance">
              <Badge
                variant="outline"
                className="border-[color:var(--info-border)] text-[color:var(--info-strong)]"
              >
                From your invoice
              </Badge>
              <Badge
                variant="outline"
                className="border-white/12 text-[color:var(--text-muted)]"
              >
                Estimated range
              </Badge>
              <Badge
                variant="outline"
                className="border-white/12 text-[color:var(--text-muted)]"
              >
                Unknown
              </Badge>
            </Row>
          </div>
        </Section>

        <Section
          id="surfaces-built"
          title="Panels"
          blurb="The card, the glass panel, and the empty state that must never render a missing value as a reading."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card-lift rounded-xl border border-[color:var(--border)] bg-[hsl(var(--card))] p-6">
              <p className="label-uppercase">2019 BMW</p>
              <p className="display-instrument mt-1 text-2xl text-[color:var(--text-primary)]">
                M3
              </p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                Competition
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-[color:var(--text-primary)]">
                <Gauge className="h-4 w-4 text-[color:var(--text-muted)]" />
                <span className="mono">67,400</span>
                <span className="text-[color:var(--text-muted)]">mi</span>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-6">
              <p className="label-uppercase">glass-panel</p>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                Used where a panel sits over photography.
              </p>
            </div>

            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[hsl(var(--surface-1))] p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[hsl(var(--surface-3))]">
                <Gauge className="h-5 w-5 text-[color:var(--text-muted)]" />
              </div>
              <p className="mt-3 text-sm text-[color:var(--text-primary)]">
                No odometer yet
              </p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Not zero — we cannot say.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="skeleton"
          title="Loading"
          blurb="The shimmer, at the shapes it actually stands in for."
        >
          <div className="space-y-3 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-6">
            <div className="skeleton-shimmer h-6 w-1/3 rounded-md bg-white/6" />
            <div className="skeleton-shimmer h-4 w-2/3 rounded-md bg-white/6" />
            <div className="skeleton-shimmer h-4 w-1/2 rounded-md bg-white/6" />
          </div>
        </Section>

        <Section
          id="motion"
          title="Motion"
          blurb="Four durations and one easing curve. Everything below reads a token; nothing hardcodes a millisecond."
        >
          <div className={GRID}>
            <Swatch name="duration-fast" />
            <Swatch name="duration-scroll-reveal" />
            <Swatch name="duration-count-up" />
            <Swatch name="duration-shimmer" />
            <Swatch name="ease-standard" />
            <Swatch name="scroll-reveal-distance" />
          </div>
        </Section>
      </div>
    </main>
  );
}
