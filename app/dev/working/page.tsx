'use client';

import { Working, WorkingMark, type WorkingStage } from '@/components/Working';
import { Button } from '@/components/ui/button';
import { scanStages } from '@/lib/working';

/*
 * Every state of the wait instrument, frozen and live. Development only.
 *
 * ── Why this page exists ────────────────────────────────────────────────────
 *
 * The same reason `scan-progress` and `quote-progress` do: the only other way
 * to see a wait is to spend the call it is waiting on and watch. Nobody
 * watches a loader, so the invoice scanner's modulo bug and the quote panel's
 * fake percentage both shipped and stayed shipped. Here every state is one
 * screenful, and the design loop can shoot it without a session, a Gemini
 * call or a database.
 *
 * ── Frozen, then live ───────────────────────────────────────────────────────
 *
 * A screenshot catches an infinite animation on whatever frame it happens to
 * be on. The frozen column holds the sweep on its centre frame — which is also
 * the base position, which is also what a reduced-motion visitor sees — so a
 * capture of this page and a capture under `prefers-reduced-motion` show the
 * same instrument. The live column is the thing itself.
 *
 * ⚠ Nothing on this page claims a duration, and no state here is fed by a
 * timer. The stage lists are the real ones the scanner emits; the copy is the
 * copy the call sites use.
 */

const SCAN_STAGES_PREPARING = scanStages({
  stage: 'preparing',
  fileName: 'service-invoice.jpg',
  fileIndex: 1,
  fileCount: 1,
  itemsExtracted: 0,
});

const SCAN_STAGES_READING = scanStages({
  stage: 'reading',
  fileName: 'oil-change-march.pdf',
  fileIndex: 2,
  fileCount: 3,
  itemsExtracted: 7,
});

const states: Array<{
  title: string;
  note: string;
  render: (frozen: boolean) => React.ReactNode;
}> = [
  {
    title: 'Full — one opaque call',
    note:
      'A page-level wait on a single model call. The line says what is happening; the detail says ' +
      'what the caller was handed and what comes back. No stages, because there is nothing to be ' +
      'part-way through, and no number, because nobody measured one.',
    render: (frozen) => (
      <Working
        frozen={frozen}
        line="Researching this car"
        detail="Common issues, maintenance intervals and recalls for a 2018 Honda Accord. Usually under a minute — the rest of the page works now."
      />
    ),
  },
  {
    title: 'Full — real stages, first of two',
    note:
      'The invoice scanner has two stages because the client awaits two things. The first is ' +
      'local and active; the second has not started. Every mark here comes from the scanner’s ' +
      'own state, never from a timer.',
    render: (frozen) => (
      <Working
        frozen={frozen}
        line="Preparing the file"
        detail="service-invoice.jpg"
        stages={SCAN_STAGES_PREPARING}
      />
    ),
  },
  {
    title: 'Full — real stages, second of two, with a fact',
    note:
      'The long stage. The first is done — a fact, not a timer expiry — and the running count ' +
      'is real: one file has come back with seven line items. “File 2 of 3” is a queue the user ' +
      'actually has.',
    render: (frozen) => (
      <Working
        frozen={frozen}
        line="Reading the invoice"
        detail="oil-change-march.pdf · File 2 of 3"
        stages={SCAN_STAGES_READING}
      >
        <p className="mono text-xs uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
          7 line items so far
        </p>
      </Working>
    ),
  },
  {
    title: 'Full — page load, delayed entry',
    note:
      'The page-level variant with `delay`: it holds invisible for 350ms and fades in, so a ' +
      'hold that resolves from cache never paints a dial. Frozen here to show the settled frame; ' +
      'live, it arrives late on purpose.',
    render: (frozen) => <Working frozen={frozen} delay line="Opening the plan" />,
  },
  {
    title: 'Compact — a card',
    note:
      'The dial at 28px beside the line, for a row or a card body. This is the Plan → Mods card ' +
      'while an analysis runs; the mod and the car are facts the card was handed.',
    render: (frozen) => (
      <Working
        variant="compact"
        frozen={frozen}
        line="Analyzing this mod"
        detail="Cat-back exhaust on a 2018 Honda Accord. Performance, reliability, cost and fitment come back together."
      />
    ),
  },
  {
    title: 'Compact — the plate',
    note:
      'A car’s generation plate is drawn in the background after VIN decode, and the empty plate ' +
      'says so. `pending` and `generating` both read like this; `ready` swaps the photograph in ' +
      'and `failed` drops back to a plain line.',
    render: (frozen) => (
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: '4 / 3',
          maxWidth: 320,
          background: 'linear-gradient(160deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.01))',
          border: '1px solid rgb(255 255 255 / 0.08)',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute pointer-events-none chamfer-sm border border-white/8"
          style={{ inset: 12 }}
        />
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <Working variant="compact" frozen={frozen} line="Drawing this car’s plate" />
        </div>
      </div>
    ),
  },
  {
    title: 'Mark — inside a control',
    note:
      'The sweep at button scale in the button’s own ink. The label carries the state; the mark ' +
      'is hidden from assistive tech. One-for-one replacement for the old spinning glyph.',
    render: (frozen) => (
      <div className="flex flex-wrap gap-3">
        <Button disabled className="font-semibold">
          <WorkingMark className="mr-2 h-4 w-4" frozen={frozen} />
          Decoding the VIN
        </Button>
        <Button size="sm" variant="outline" disabled>
          <WorkingMark className="mr-1 h-3 w-3" frozen={frozen} />
          Analyzing
        </Button>
        <Button size="sm" variant="ghost" disabled className="text-white/60">
          <WorkingMark className="mr-1.5 h-3.5 w-3.5" frozen={frozen} />
          Saving
        </Button>
      </div>
    ),
  },
];

/*
  An empty state is not a wait, and the two must not share clothes. This is
  the un-analysed mod card as it now reads: the system's empty treatment —
  mono line, hairline — with the action beside it. No bars, no sweep.
*/
function EmptyMod() {
  return (
    <div className="cut-panel border border-white/8 bg-[hsl(var(--card))]/95 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white">Cat-back Exhaust System</h4>
          <p className="mono mt-1.5 text-xs uppercase tracking-[0.14em] text-white/55">
            Not analyzed yet
          </p>
        </div>
        <Button size="sm" className="whitespace-nowrap">
          Analyze Mod
        </Button>
      </div>
    </div>
  );
}

export default function WorkingStatesPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-12">
        <header className="space-y-2">
          <p className="mono text-xs uppercase tracking-[0.2em] text-white/55">Development only</p>
          <h1 className="display-instrument display-instrument-narrow uppercase text-3xl leading-none text-[color:var(--text-primary)]">
            The wait instrument
          </h1>
          <p className="max-w-2xl text-sm text-white/60 leading-relaxed">
            Every state below is what the component renders from its props. There is no timer
            inside it, no percentage, and no stage that a real event did not report. The left
            column is held on the sweep’s centre frame — the same frame a reduced-motion visitor
            sees; the right column is live.
          </p>
        </header>

        <div className="mono grid grid-cols-2 gap-6 text-xs uppercase tracking-[0.2em] text-white/55">
          <span>Frozen</span>
          <span>Live</span>
        </div>

        {states.map((state) => (
          <section key={state.title} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">{state.title}</h2>
              <p className="max-w-2xl text-sm text-white/60 leading-relaxed">{state.note}</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div
                className="cut-panel border border-white/8 bg-[hsl(var(--card))]/95 p-6"
                data-frame="frozen"
              >
                {state.render(true)}
              </div>
              <div
                className="cut-panel border border-white/8 bg-[hsl(var(--card))]/95 p-6"
                data-frame="live"
              >
                {state.render(false)}
              </div>
            </div>
          </section>
        ))}

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white">Not a wait — the un-analysed mod</h2>
            <p className="max-w-2xl text-sm text-white/60 leading-relaxed">
              What David screenshotted: two skeleton bars and “No analysis yet” under a button, an
              absence drawn as a wait that never ends. An empty state takes the system’s empty
              treatment — one mono line, the action beside it — and borrows nothing from loading.
            </p>
          </div>
          <div className="max-w-xl">
            <EmptyMod />
          </div>
        </section>
      </div>
    </main>
  );
}
