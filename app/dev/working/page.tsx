'use client';

import { Working, WorkingMark } from '@/components/Working';
import { Button } from '@/components/ui/button';
import { scanStages } from '@/lib/working';

/*
 * Every state of the wait instrument, live and frozen. Development only.
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
 * ── Live, then frozen ───────────────────────────────────────────────────────
 *
 * A screenshot catches an infinite animation on whatever frame it happens to
 * be on. Each live instrument is followed by the same state held on the pip's
 * twelve-o'clock frame — which is also the base position, which is also what
 * a reduced-motion visitor sees — so a capture of this page and a capture
 * under `prefers-reduced-motion` show the same instrument.
 *
 * ⚠ One column, not two. The first draft set live and frozen side by side,
 * which halved the width the full face had to sit in and put its one-line
 * sentence on three lines. The instrument is a left-anchored panel on the
 * page grid (brief B3), and the specimen shows it on the grid it is built for.
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
      'A page-level wait on a single model call. The line says what is happening; the sentence ' +
      'says what the caller was handed. No stages, because there is nothing to be part-way ' +
      'through. The one duration is the one this product has measured.',
    render: (frozen) => (
      <Working
        frozen={frozen}
        line="Researching this car"
        detail="Issues, intervals and recalls for a 2018 Honda Accord — usually under a minute."
      />
    ),
  },
  {
    title: 'Full — real stages, first of two',
    note:
      'The invoice scanner has two stages because the client awaits two things. The first is ' +
      'local and active; the second has not started. Every mark comes from the scanner’s own ' +
      'state, never from a timer.',
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
    title: 'Full — real stages, second of two, with a count',
    note:
      'The long stage. The first is done — a fact, not a timer expiry — and the count in the ' +
      'ledger footer is real: one file has come back with seven line items. “File 2 of 3” is a ' +
      'queue the user actually has.',
    render: (frozen) => (
      <Working
        frozen={frozen}
        line="Reading the invoice"
        detail="oil-change-march.pdf · File 2 of 3"
        stages={SCAN_STAGES_READING}
      >
        7 line items so far
      </Working>
    ),
  },
  {
    title: 'Full — page load, delayed entry',
    note:
      'The page-level variant with `delay`: it holds invisible for 350ms and fades in, so a ' +
      'hold that resolves from cache never paints a dial. Live, it arrives late on purpose.',
    render: (frozen) => <Working frozen={frozen} delay line="Opening the plan" />,
  },
  {
    title: 'Compact — a card',
    note:
      'The dial at 20px beside the line, no panel of its own, for a row or a card body. This is ' +
      'the Plan → Mods card while an analysis runs; the mod and the car are facts the card holds.',
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
        <div className="absolute inset-0 flex items-center justify-start px-7">
          <Working variant="compact" frozen={frozen} line="Drawing this car’s plate" />
        </div>
      </div>
    ),
  },
  {
    title: 'Mark — the button that started the work',
    note:
      'A busy button drops to its outlined form at its rest width and says what it is doing in ' +
      'the state voice: the 14px mark and a cyan mono status. The rest label is held invisibly ' +
      'in the same cell, so nothing beside it shifts. Each pair below is the same control at ' +
      'rest and busy.',
    render: (frozen) => (
      <div className="space-y-4">
        {/*
          The VIN form's Continue, full width as it ships: the one busy label
          longer than its rest label, and the width cannot move because the
          width is the form's. ⚠ Measured: a busy label wider than a
          non-full-width rest label grows the button to fit it — the cell
          holds the wider of the two, never the narrower — so busy labels on
          fitted buttons stay to one word.
        */}
        <div className="grid max-w-sm gap-3">
          <Button className="w-full font-semibold">Continue</Button>
          <Button className="w-full font-semibold" busy busyLabel="Decoding the VIN">
            Continue
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Analyze Mod</Button>
          <Button size="sm" busy busyLabel="Analyzing">
            Analyze Mod
          </Button>
          <Button size="sm" variant="outline">
            Save changes
          </Button>
          <Button size="sm" variant="outline" busy busyLabel="Saving">
            Save changes
          </Button>
          {/* The bare mark, for an icon-only control: the aria-label carries the state. */}
          <span className="inline-flex items-center gap-2 mono text-xs uppercase tracking-[0.08em] text-white/55">
            <WorkingMark className="h-3.5 w-3.5" frozen={frozen} />
            bare mark
          </span>
        </div>
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
          <p className="mono mt-1.5 text-xs uppercase tracking-[0.08em] text-white/55">
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
      <div className="mx-auto max-w-5xl space-y-14">
        <header className="space-y-2">
          <p className="mono text-xs uppercase tracking-[0.2em] text-white/55">Development only</p>
          <h1 className="display-instrument display-instrument-narrow uppercase text-3xl leading-none text-[color:var(--text-primary)]">
            The wait instrument
          </h1>
          <p className="max-w-2xl text-sm text-white/60 leading-relaxed">
            Every state below is what the component renders from its props. There is no timer
            inside it, no percentage, and no stage that a real event did not report. Each live
            instrument is followed by the same state held on the pip’s twelve-o’clock frame — the
            frame a reduced-motion visitor sees.
          </p>
        </header>

        {states.map((state) => (
          <section key={state.title} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">{state.title}</h2>
              <p className="max-w-2xl text-sm text-white/60 leading-relaxed">{state.note}</p>
            </div>
            <div className="space-y-4">
              <div data-frame="live">
                <p className="mono mb-2 text-xs uppercase tracking-[0.2em] text-white/50">Live</p>
                {state.render(false)}
              </div>
              <div data-frame="frozen">
                <p className="mono mb-2 text-xs uppercase tracking-[0.2em] text-white/50">Frozen</p>
                {state.render(true)}
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
