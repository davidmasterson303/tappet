/**
 * What the subscription buys — three features, not a bigger number.
 *
 * ── ⚠ The pricing decision of 24 Aug, and what it replaces ──────────────────
 *
 * The paid tier used to be **a larger token allowance**: 400,000
 * output-equivalent tokens a month became 1,000,000, and `PaywallScreen` sold
 * that difference in as many words. The boundary moves from *how much you have
 * used* to *which features you have*.
 *
 * Three things go wrong with selling an allowance, and they compound:
 *
 *   1. **Nobody can tell what they are buying.** "A monthly allowance for
 *      Tappet's AI features" is a unit the customer has never seen, cannot
 *      observe while using the app, and has no way to relate to their own use.
 *   2. **The number invites a claim, and the claim was wrong.** The screen said
 *      the paid tier *"raises that allowance five times over"*; 400k → 1M is
 *      **2.5×**. IAP-06. Deriving the figure from `TIERS` fixed the arithmetic
 *      and left the unit unintelligible.
 *   3. **It prices the wrong thing.** Both tiers could reach every feature, so
 *      the expensive paths — the advisor, invoice vision, dossier research —
 *      were open to free accounts and bounded only by a fuse. Cost and revenue
 *      were not connected to each other at any point.
 *
 * A feature gate answers all three. It is nameable on a paywall, it is
 * observable in the product, and the three paid features are exactly the three
 * that call a model — so price now tracks cost by construction rather than by
 * a ceiling somebody tunes.
 *
 * ── ⚠ IAP-06 is killed rather than corrected ────────────────────────────────
 *
 * `entitlementMultiple()` in `ai/budget.ts` exists solely to keep that "five
 * times" copy honest. With the allowance out of the sales pitch there is **no
 * multiple to state**, so the sentence is deleted rather than fixed. A derived
 * figure that nothing renders is a smaller version of the same problem.
 *
 * ── The ceiling survives, as a fuse and not as a pitch ──────────────────────
 *
 * `TIERS` and `decideBudget` are unchanged and still enforced. What changes is
 * that the ceiling is **abuse protection behind the gate**, never customer-
 * facing copy: it exists so one runaway account cannot cost more than every
 * subscription it sits beside, and an ordinary month does not approach it.
 * `ai/budget.ts` already calls it "a fuse, not a meter" — this is that sentence
 * taken seriously in the product as well as the code.
 */

/**
 * The features a subscription unlocks.
 *
 * ⚠ Every model call in the tree is sold under one of these. That is not a
 * coincidence to be maintained by hand — it is the reason the gate is drawn
 * here, and a paid feature that costs nothing to run would be a price rise
 * wearing a feature's clothes. (`recalls` is the deliberate exception, David's
 * call — see `FREE_FEATURE_COPY` below.)
 *
 * ── 17 Sep · the four paths that were outside, and where they went ──────────
 *
 * "Exactly the three that call a model" was written on 24 Aug and was not true
 * of the tree: four model paths sat outside `checkFeatureAccess`, and with the
 * switch flipped an unpaid account would still have spent on all of them.
 * David's decision of 17 Sep — keep the free tier, gate the model paths —
 * put three under the feature each belongs to and kept one free on purpose:
 *
 *   `fetchPowertrainOptions`         → dossier    research about the model,
 *                                                 fired beside the dossier's own
 *   `recomputePerformanceStats`      → dossier    stock and modified figures —
 *                                                 research about the car
 *   `generateQuoteRequestV2`'s two   → advisor    "a second opinion on a quote"
 *                                                 is the advisor's job
 *   `generateVehicleHealthSummary`   → **free**   see `FREE_FEATURES`
 *
 * The health score was gated for about two hours that afternoon, under the
 * advisor, because the instruction read "gate the four" and it was one of
 * them. It fought the product: the score on the garage card is the free
 * tier's whole face, and without it the free tier is a spreadsheet with a car
 * photo. David reversed it the same day with the cost in front of him — a
 * summary is 274–789 output-equivalent tokens, half a cent, at most once a
 * car a day, and `FREE_MONTHLY_COST_USD` had been sized for exactly this. So
 * it is the free tier's one model call, bounded by the free ceiling rather
 * than the gate, and it is in `FREE_FEATURES` so every sentence that lists
 * what is free carries it — `model-paths-behind-the-gate.test.ts` fails if
 * a gate ever appears in it, and if a paid blurb ever names it.
 */
export type PaidFeature = 'advisor' | 'invoice-scanning' | 'dossier' | 'recalls';

/**
 * What stays free, named so the paywall can say it without inventing a list.
 *
 * The free tier, since 17 Sep by decision rather than by accident — see
 * `FREE_FEATURE_COPY` for the day it was "no free tier" and why that reversed.
 * `health-score` is the one entry that calls a model; `PaidFeature` says why
 * it is here and not there.
 */
export type FreeFeature = 'garage' | 'service-log' | 'mileage' | 'health-score';

export interface FeatureCopy {
  /** The name on the paywall. Title case, no trailing punctuation. */
  label: string;
  /** One line saying what it does, in the owner's terms rather than ours. */
  blurb: string;
}

export const PAID_FEATURE_COPY: Record<PaidFeature, FeatureCopy> = {
  advisor: {
    label: 'The advisor',
    /*
      ⚠ For two hours on 17 Sep this named the health score, while the score
      was gated under the advisor. It is free again and this must not say
      otherwise — and rather than trust the edit, `paid-features.test.ts`
      holds every paid blurb against `FREE_FEATURE_COPY`: a paid feature's
      sentence may not name a free feature's label. The recall refusal drifted
      for eighteen days on a sentence nobody re-checked; this one is checked
      on every run.
    */
    blurb: 'Ask about a noise, a quote or a job, with your car’s history in front of it.',
  },
  'invoice-scanning': {
    label: 'Invoice scanning',
    blurb: 'Photograph a receipt and have the work read off it into your service log.',
  },
  recalls: {
    label: 'Recall alerts',
    blurb: 'Open safety recalls from NHTSA, with a notification when a new one lands.',
  },
  dossier: {
    label: 'The vehicle dossier',
    blurb: 'Known issues, a typical service schedule and modification guidance for your car.',
  },
};

/**
 * What an account has without paying, and it is deliberately a real product.
 *
 * ── The free tier — decided 17 Sep, and it reverses 30 Aug ──────────────────
 *
 * On 30 Aug David said *"I don't want a free tier"*, and this docblock read
 * "there is no free tier; this list is what a **lapsed** account keeps". That
 * decision was driven by cost — a prospect who has not paid should cost
 * exactly zero — and the tree never implemented it: no write path ever
 * consulted entitlement, so an account that never paid could add cars, log
 * service and track mileage exactly like one that had lapsed. The binary
 * had a free tier of garage, service log and mileage all along.
 *
 * On 17 Sep David chose to keep it, and the reasoning is that the premise
 * dissolved rather than being overruled: once the model paths are behind
 * `checkFeatureAccess` (the four that were not, listed at `PaidFeature`),
 * garage, service log and mileage are database writes with no model call
 * behind them, and an unpaid account costs about nothing to serve — which is
 * what the 30 Aug decision was for. A lapse drops to this tier, not to
 * read-only, which needs no fourth state and is kinder besides: a garage that
 * stops working when a subscription ends is a hostage, and the records in it
 * are the owner's own. `access.ts` carries the states and their copy.
 *
 * ── The health score is free, and it is the one line here that spends ──────
 *
 * Everything else in this list is stored, not generated. The health score is
 * generated — `generateVehicleHealthSummary` asks the model for it — and it
 * is free by David's decision of 17 Sep, with the cost in front of him: half
 * a cent a summary, at most once a car a day, bounded by
 * `FREE_MONTHLY_COST_USD` in `ai/pricing.ts`, which was sized for exactly
 * this. "The health dial is the free product's whole face" was a product
 * judgement, and a free tier without it is a spreadsheet with a car photo —
 * nothing in it suggests the app knows anything about the car, which is the
 * feeling that sells the advisor. Three lines to reverse if it ever costs
 * real money, at which point there is revenue to argue against.
 *
 * ── ⚠ Recalls moved to paid on 30 Aug, and the argument against is kept ─────
 *
 * This list held `recalls` and this docblock argued hard that it must: they are
 * safety notices from a federal database, and a defect notice an owner cannot
 * see because their card expired is not a version of this product that should
 * exist. Design's rebrand package first gated them, then reversed and endorsed
 * that argument.
 *
 * **David overruled both.** It is his call and it is made; the argument is kept
 * here rather than deleted because the next person to read this file will have
 * the same instinct, and they should be able to see it was considered rather
 * than missed.
 *
 * ⚠ What it costs, stated plainly so nobody has to rediscover it: an owner
 * whose subscription has ended stops receiving new recall notifications for a
 * car they still own. `RECALL_ALERTS_AFTER_LAPSE` in `access.ts` is the switch,
 * and it is `false` for the same reason — David, 30 Aug: no features that incur
 * costs for a lapsed account. What a lapsed owner keeps is every recall already
 * stored against their vehicles, which stays readable like the rest of the
 * record.
 */
export const FREE_FEATURE_COPY: Record<FreeFeature, FeatureCopy> = {
  garage: { label: 'Your garage', blurb: 'Every vehicle you own, with photos and details.' },
  'service-log': {
    label: 'Service log',
    blurb: 'Everything that has been done, entered by hand or scanned in while you had Plus.',
  },
  mileage: { label: 'Mileage tracking', blurb: 'Odometer readings and what is due by distance.' },
  'health-score': {
    label: 'Health score',
    blurb: 'A read on each car from its own records, refreshed as you add to them.',
  },
};

const PAID: ReadonlySet<string> = new Set(Object.keys(PAID_FEATURE_COPY));

/** Whether a feature sits behind the subscription. */
export function isPaidFeature(feature: string): feature is PaidFeature {
  return PAID.has(feature);
}

/** The paid features in the order a paywall should list them. */
export const PAID_FEATURES: readonly PaidFeature[] = [
  'advisor',
  'invoice-scanning',
  'dossier',
  'recalls',
] as const;

/** What an account has without paying, in the order a paywall should list them. */
export const FREE_FEATURES: readonly FreeFeature[] = [
  'garage',
  'service-log',
  'mileage',
  'health-score',
] as const;

/**
 * Why a feature was refused, so a caller can say something useful.
 *
 * ⚠ `'not-enforced'` is a distinct answer from `'allowed'` even though both let
 * the call through. A caller that logs them the same way cannot tell "this
 * account is entitled" from "the gate is not switched on yet", and that is
 * exactly the fact somebody will need on the day the switch flips.
 */
export type FeatureDecision =
  | { state: 'allowed' }
  | { state: 'not-enforced' }
  | { state: 'needs-subscription'; feature: PaidFeature; message: string };

/**
 * Whether this account may use a paid feature.
 *
 * ── ⚠ `enforced` exists because you cannot gate what nobody can buy ─────────
 *
 * It is not a feature flag in the usual sense — a knob for rolling something
 * out gradually — and it must not become one. It encodes a single rule:
 *
 *   **A feature may only be gated behind a purchase the app can actually make.**
 *
 * At the time this was written, `PaywallScreen` is mounted by no navigator and
 * no StoreKit library is installed: E8 is unfinished, and there is literally
 * nothing to buy. Shipping an enforcing gate in that state would take the
 * advisor, invoice scanning and the dossier away from every existing account
 * and offer them no way back — a worse product for everybody, and on the
 * surface App Review opens.
 *
 * So the decision is implemented in full and enforcement is off until the thing
 * it points at exists. This is the same shape as
 * `readFailureMeansNoSubscription`'s deploy-ordering rule: a sequencing hazard
 * expressed as a rule in the code rather than as a step in a runbook, because a
 * runbook step is only as good as the person reading it at the moment they push.
 *
 * ⚠ Turning it on is a **product launch**, not a config change. Its
 * preconditions are E8 complete: a purchasable product in App Store Connect, the
 * paywall reachable, and a tested Restore. `paid-features.test.ts` asserts the
 * default is off precisely so nobody flips it by accident and discovers the
 * order was wrong from a support email.
 */
export function decideFeatureAccess(params: {
  feature: PaidFeature;
  /** The tier resolved from the stored entitlement — see `entitlement.ts`. */
  tier: 'free' | 'paid';
  /** Whether there is something to buy. See the docblock; defaults to off. */
  enforced?: boolean;
}): FeatureDecision {
  if (params.enforced !== true) return { state: 'not-enforced' };
  if (params.tier === 'paid') return { state: 'allowed' };

  return {
    state: 'needs-subscription',
    feature: params.feature,
    message: featureUpsellMessage(params.feature),
  };
}

/**
 * What to tell somebody who has hit the gate.
 *
 * ⚠ Names the feature and does not mention allowances, tokens or limits. The
 * whole point of the pricing change is that a customer can tell what they are
 * buying; a refusal that says "you have reached your monthly allowance" would
 * put the old model back in the one place the customer actually reads.
 *
 * ⚠ The list of what is kept is **derived from `FREE_FEATURES`**, since 17 Sep.
 * It was typed out — "your garage, service log, mileage and recall alerts stay
 * free" — and kept promising recall alerts for eighteen days after this file
 * moved them to paid. A refusal that names a paid feature as free is the one
 * sentence a customer reads on the day they decide, and it was wrong. The
 * list above is the list; this sentence reads it.
 */
export function featureUpsellMessage(feature: PaidFeature): string {
  const kept = FREE_FEATURES.map((f) => FREE_FEATURE_COPY[f].label.replace(/^Your /, '').toLowerCase());
  const list = kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}` : kept[0];
  return `${PAID_FEATURE_COPY[feature].label} is part of Tappet Plus. Your ${list} stay free.`;
}
