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
 * `[data-register='sport']` is defined in `globals.css` and **set by nothing in
 * the app** — `grep data-register` returns the stylesheet, this file and
 * `register-tokens.test.ts`. So the register's whole perceptual claim (milled
 * radii, chamfered panels, hotter bay, a sans display face) has never been
 * looked at side by side with the voice it is supposed to contrast with. The
 * toggle at the top of this page is the first place it can be.
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
        <p className="truncate font-mono text-[11px] text-white/85">--{name}</p>
        <p className="truncate font-mono text-[11px] text-white/40">
          {resolved || '—'}
          {TRIPLET.has(name) ? ' · triplet' : ''}
        </p>
        {note ? (
          <p className="truncate text-[11px] text-white/35">{note}</p>
        ) : null}
      </div>
    </div>
  );
}

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
    <section id={id} className="space-y-5 scroll-mt-24">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {blurb ? (
          <p className="max-w-2xl text-sm text-white/50">{blurb}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-white/6 py-4">
      <p className="w-32 shrink-0 font-mono text-[11px] uppercase tracking-widest text-white/40">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

const BUILD: BuildPosition = {
  points: 14,
  zone: 'heavily-modified',
  label: 'Heavily modified',
  needle: 62,
};

export default function DesignSystemPage() {
  const [sport, setSport] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (sport) root.setAttribute('data-register', 'sport');
    else root.removeAttribute('data-register');
    return () => root.removeAttribute('data-register');
  }, [sport]);

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-14">
        <header className="space-y-4">
          <p className="label-uppercase text-white/45">Development only</p>
          <h1 className="display-serif text-4xl text-white">
            Well Kept — the system
          </h1>
          <p className="measure text-sm text-white/55">
            Every swatch reads its value from the live cascade. Nothing on this
            page restates a number from <code>globals.css</code>.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="inline-flex rounded-xl border border-[color:var(--border-field)] p-1">
              <button
                type="button"
                onClick={() => setSport(false)}
                aria-pressed={!sport}
                className={`min-h-[44px] rounded-lg px-4 text-sm transition-colors ${
                  sport
                    ? 'text-white/55 hover:text-white'
                    : 'bg-white/10 text-white'
                }`}
              >
                Default register
              </button>
              <button
                type="button"
                onClick={() => setSport(true)}
                aria-pressed={sport}
                className={`min-h-[44px] rounded-lg px-4 text-sm transition-colors ${
                  sport
                    ? 'bg-white/10 text-white'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                Sport register
              </button>
            </div>
            <p className="text-xs text-white/40">
              Sets <code>data-register</code> on <code>&lt;html&gt;</code>.
            </p>
          </div>
        </header>

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
          blurb="Body, muted, and the disabled pair that exists to be measurable rather than compliant."
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
          blurb="The palette settled on white for actions, the health ramp for state, red for alarm. The cyan below is the mark's colour, not a call to action."
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
          blurb="Attention is orange-400. The health ramp's warn is a different amber and deliberately so — the collision was in the word, not the hex."
        >
          <div className={GRID}>
            <Swatch name="attention-amber" />
            <Swatch name="attention-amber-wash" />
            <Swatch name="critical-red" />
            <Swatch name="critical-red-solid" />
            <Swatch name="critical-red-wash" />
            <Swatch name="confirm-green" />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--attention-amber-border)] bg-[color:var(--attention-amber-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--attention-amber)]">
              <AlertTriangle className="h-3.5 w-3.5" /> Attention
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--critical-red-border)] bg-[color:var(--critical-red-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--critical-red)]">
              <AlertTriangle className="h-3.5 w-3.5" /> 2 open recalls
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--confirm-green-border)] bg-[color:var(--confirm-green-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--confirm-green)]">
              <Check className="h-3.5 w-3.5" /> Logged
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--info-border)] bg-[color:var(--info-wash)] px-3 py-1 text-xs font-semibold text-[color:var(--info-strong)]">
              From your invoice
            </span>
          </div>
        </Section>

        <Section
          id="ramps"
          title="The two ramps"
          blurb="Health grades a car. Build describes one. They must never be read as the same axis, which is why nothing on the build ramp is red and the redline is a separate token."
        >
          <div className={GRID}>
            <Swatch name="ring-good" note="health ≥ 80" />
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
              <p className="font-mono text-[11px] text-white/40">health 82</p>
            </div>
            <div className="space-y-2 text-center">
              <ClusterGauge score={61} variant="card" size={104} />
              <p className="font-mono text-[11px] text-white/40">health 61</p>
            </div>
            <div className="space-y-2 text-center">
              <ClusterGauge score={null} variant="card" size={104} />
              <p className="font-mono text-[11px] text-white/40">
                null — not zero
              </p>
            </div>
            <div className="space-y-2 text-center">
              <BuildGauge position={BUILD} size={104} />
              <p className="font-mono text-[11px] text-white/40">build 14 pts</p>
            </div>
          </div>
        </Section>

        <Section
          id="register"
          title="Register tokens"
          blurb="The four values the sport register moves, plus the bay knobs it re-tunes. Toggle the switch at the top and watch these change."
        >
          <div className={GRID}>
            <Swatch name="register-accent" />
            <Swatch name="register-rule" />
            <Swatch name="register-chamfer" />
            <Swatch name="register-grain" />
            <Swatch name="register-tracking" />
            <Swatch name="radius" note="the one that moves the product" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel-cut border border-[color:var(--border)] bg-[hsl(var(--card))] p-6">
              <p className="label-uppercase text-white/45">panel-cut</p>
              <p className="mt-2 text-sm text-white/70">
                Square in the default register, chamfered in sport.
              </p>
            </div>
            <div className="machined rounded-xl border border-[color:var(--border)] bg-[hsl(var(--card))] p-6">
              <p className="label-uppercase text-white/45">machined</p>
              <p className="mt-2 text-sm text-white/70">
                The milled edge treatment.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="type"
          title="Type"
          blurb="Newsreader for the display line, Inter for everything else. The sport register swaps the display face to the sans stack — the register changes instrument, it does not merely tighten."
        >
          <div className="space-y-4 rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] p-6">
            <p className="display-serif text-[4.5rem] leading-none tracking-tighter text-white">
              A Live Garage
            </p>
            <p className="display-serif text-5xl text-white">Display large</p>
            <p className="display-serif text-3xl text-white">Display medium</p>
            <h3 className="text-xl font-semibold text-white">
              Section heading, Inter semibold
            </h3>
            <p className="measure text-base text-white/70">
              Body copy sets at sixteen with a measure cap, because a line that
              runs the full width of a workbench layout is not readable at any
              size.
            </p>
            <p className="label-uppercase text-white/45">Label, uppercase</p>
            <p className="num text-3xl text-white">67,400 mi · 82 · $1,240</p>
            <p className="font-mono text-xs text-white/40">
              .num — tabular, register-tracked
            </p>
          </div>
        </Section>

        <Section
          id="buttons"
          title="Buttons"
          blurb="44px floor everywhere, no ring offset, an explicit disabled fill rather than a group alpha."
        >
          <div className="rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] px-6 py-2">
            <Row label="variants">
              <Button>Add a car</Button>
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
            </Row>
            <Row label="with icon">
              <Button>
                <Wrench className="mr-2 h-4 w-4" /> Log service
              </Button>
              <Button variant="outline">
                <Search className="mr-2 h-4 w-4" /> Research
              </Button>
            </Row>
            <Row label="disabled">
              <Button disabled>Add a car</Button>
              <Button variant="outline" disabled>
                Outline
              </Button>
              <Button variant="destructive" disabled>
                Delete
              </Button>
            </Row>
            <Row label="focus">
              <Button className="focus-visible:ring-2 focus-visible:ring-ring" autoFocus>
                Focused
              </Button>
              <p className="text-xs text-white/40">
                Shot with --focus; the halo sits on the border, not off it.
              </p>
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
              <label className="label-uppercase text-white/45" htmlFor="f1">
                Mileage
              </label>
              <input id="f1" className="field num" defaultValue="67,400" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase text-white/45" htmlFor="f2">
                Placeholder
              </label>
              <input id="f2" className="field" placeholder="e.g. front brakes" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase text-white/45" htmlFor="f3">
                Invalid
              </label>
              <input
                id="f3"
                className="field"
                aria-invalid="true"
                defaultValue="-12"
              />
              <p className="text-xs text-[color:var(--critical-red)]">
                Mileage cannot go backwards.
              </p>
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase text-white/45" htmlFor="f4">
                Disabled
              </label>
              <input id="f4" className="field" disabled defaultValue="VIN locked" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase text-white/45" htmlFor="f5">
                Small
              </label>
              <input id="f5" className="field field-sm" defaultValue="Small" />
            </div>
            <div className="field-group space-y-1.5">
              <label className="label-uppercase text-white/45" htmlFor="f6">
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
          blurb="The primitive's four variants, then the semantic chips the product actually ships."
        >
          <div className="rounded-xl border border-white/8 bg-[hsl(var(--surface-1))] px-6 py-2">
            <Row label="primitive">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </Row>
            <Row label="provenance">
              <Badge variant="outline" className="border-[color:var(--info-border)] text-[color:var(--info-strong)]">
                From your invoice
              </Badge>
              <Badge variant="outline" className="border-white/12 text-white/55">
                Estimated range
              </Badge>
              <Badge variant="outline" className="border-white/12 text-white/55">
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
              <p className="label-uppercase text-white/45">2019 BMW</p>
              <p className="display-serif mt-1 text-2xl text-white">M3</p>
              <p className="mt-1 text-sm text-white/50">Competition</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-white/70">
                <Gauge className="h-4 w-4 text-white/40" />
                <span className="num">67,400</span>
                <span className="text-white/40">mi</span>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-6">
              <p className="label-uppercase text-white/45">glass-panel</p>
              <p className="mt-2 text-sm text-white/70">
                Used where a panel sits over photography.
              </p>
            </div>

            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[hsl(var(--surface-1))] p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[hsl(var(--surface-3))]">
                <Gauge className="h-5 w-5 text-white/35" />
              </div>
              <p className="mt-3 text-sm text-white/70">No odometer yet</p>
              <p className="mt-1 text-xs text-white/40">
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
