'use client';

import { Working } from '@/components/Working';

/**
 * What is actually happening while a quote is generated, and nothing else.
 *
 * ── The third fake indicator, and the last one ──────────────────────────────
 *
 * This panel ran two `setInterval`s. One advanced a percentage 2 points every
 * 150ms to a hard 100; the other ticked four hard-coded stages every 2.5s and
 * drew green checks behind them. Neither was connected to anything. The client
 * awaits exactly one call — `generateQuoteRequestV2` — so there were no stages
 * to be on, no percentage to be at, and the bar reached 100% at 7.5 seconds
 * whether the answer had arrived or not.
 *
 * Two of the stages were worse than decorative. *"Checking regional labor
 * rates"* describes a lookup this product does not perform: the ZIP is typed by
 * the owner and pasted into a prompt, and the model is asked to allow for local
 * rates. *"Using AI to analyze market rates and regional pricing data"* named a
 * data source that does not exist. A progress step is a claim about work, and
 * these claimed work nobody does.
 *
 * ── Why a beat at all ──────────────────────────────────────────────────────
 *
 * David's call on the same defect in the hero and the invoice scanner:
 * *"not to remove the beat but to make it narrate something real… Same
 * reassurance, no fiction."* So the panel stays and the subject changes. What
 * this component can honestly say is what it was handed — the items being
 * priced, by name, and the ZIP going with them.
 *
 * **No percentage.** The wait is one model call, and a client cannot measure a
 * model call's progress. An indeterminate bar says "working" without claiming
 * to know how much is left; a number says something false to two significant
 * figures.
 *
 * **No per-item ticks.** The items are a list of what was sent, not a queue
 * being worked through — one request prices all of them at once, so marking
 * them off individually would invent an order that does not exist. Same
 * reasoning as the invoice scanner's two stages rather than four: the client
 * awaits one thing, and everything inside it is one opaque wait.
 *
 * ⚠ The old panel announced nothing to a screen reader — the stages were divs
 * that changed colour. It was, for a blind user, purely decorative *and*
 * purely fictional. `role="status"` now, with the sentence a screen reader
 * needs rather than the layout a sighted reader gets.
 */

interface ServiceItem {
  id: string;
  description: string;
  category: string;
}

interface QuoteGenerationProgressProps {
  items: ServiceItem[];
  zipCode: string;
}

export function QuoteGenerationProgress({ items, zipCode }: QuoteGenerationProgressProps) {
  const count = items.length;

  /*
    ── The instrument, and what stayed — 11 Sep ────────────────────────────────

    The beat is now the wait instrument shared with every other wait in the
    product: the dial's ignition sweep, held. What it replaced here was a
    framer-motion glow pulsing behind a lightning glyph and an indeterminate
    bar — three separate ways of saying "working", none of them the way the
    rest of the app says it.

    Everything the panel could honestly say before, it still says, in the same
    words: the count, the ZIP as something sent, the items by name, and what
    the answer will contain. No percentage — a client cannot measure a model
    call — and no per-item ticks, because one request prices all of them at
    once and marking them off would invent an order that does not exist.

    `Working` is the `role="status"` region, and the item list sits inside it
    so a screen reader hears the count, the ZIP and the items as one account.
  */
  return (
    <Working
      line={count === 1 ? 'Pricing your service item' : `Pricing ${count} service items`}
      detail={`Pricing ${count} service ${count === 1 ? 'item' : 'items'}. Your ZIP code ${zipCode} goes with the request so the ranges can allow for local labour rates.`}
    >
      {count > 0 && (
        <div className="w-full max-w-md text-left">
          <p className="mono text-xs uppercase tracking-[0.14em] text-white/55 mb-1">
            {count === 1 ? 'The item' : 'The items'} being priced
          </p>
          {/*
            Hairline-ruled rows, not bordered tiles — the dossier's band
            grammar. The category is mono because it is a label; the
            description is the owner's own words and wraps rather than
            truncating, because a clipped line item is the one you cannot
            check.
          */}
          <ul className="divide-y divide-white/8 border-y border-white/8">
            {items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <p className="text-sm text-foreground leading-snug">{item.description}</p>
                {item.category && (
                  <p className="mono text-xs uppercase tracking-[0.14em] text-white/50 flex-shrink-0">
                    {item.category}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        What the answer will contain, which is knowable — the action returns a
        cost breakdown and an email draft, always both. Naming the output is not
        the same as claiming to be part-way through producing it.
      */}
      <p className="text-xs text-white/50 leading-relaxed max-w-md">
        You will get parts and labour ranges for each item, and an email draft you can send to a
        shop.
      </p>
    </Working>
  );
}
