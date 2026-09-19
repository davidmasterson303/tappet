/**
 * Reading a Gemini response's usage metadata, and deciding whether it is worth
 * recording. No database, no SDK.
 *
 * The write itself needs a service-role client (see `lib/ai-usage.ts`), but the
 * decisions — which fields to read, what a missing field means, whether a row
 * of zeroes is a free call or a broken response — are pure, and they are the
 * part that fails quietly. A meter that records zeroes looks exactly like a
 * meter that is working, right up until the price is set off its averages.
 */

/**
 * The purposes a Gemini call can be recorded under.
 *
 * One per call site as of 2 Aug 2026. Mirrors the CHECK constraint first
 * written in `20260802150000_meter_ai_usage_per_account.sql` — and last
 * redefined by whichever migration in the corpus did so most recently, which
 * is what `ai-usage.test.ts` reads to hold the two in step. A purpose the
 * application knows and the database refuses is a write that fails at
 * runtime, on the one path that is not allowed to disturb a request: the row
 * is dropped with an `AI_USAGE:WRITE_FAILED` warn and the request proceeds,
 * so the only symptom is a cost report quietly missing one feature.
 *
 * Adding one means a migration. That is the correct amount of friction for a
 * vocabulary the cost reports are grouped by; the alternative is 'consultant',
 * 'Consultant' and 'chat' all being different features by the time anyone looks.
 */
export const AI_USAGE_PURPOSES = [
  'consultant',
  'invoice_extraction',
  'vehicle_dossier',
  'vehicle_health_summary',
  'powertrain_options',
  'modification_details',
  'modification_backfill',
  'performance_stats',
  'health_check',
  /*
    Phase 2.97b, the anonymous front door. Its own purpose rather than reusing
    `invoice_extraction`, because it is a different feature: a different prompt,
    a range instead of line items, and — unlike invoice extraction, which is
    deliberately the one 3.x site left at the default — a set thinking level,
    since an anonymous endpoint at default thinking is the money faucet 2.95a
    exists to close.

    `surface` would already separate the traffic, but it answers "whose", not
    "which feature". Both questions get asked of this table.

    Added by `20260803210000_the_front_door_spends_on_its_own_line.sql`.
  */
  'quote_check',
  /*
    17 Sep. The demo quote's two calls (`estimateCosts`, `generateEmailDraft`
    in `generateQuoteRequestV2`) had never been metered — `checkDemoBudget`
    was reading a gauge nothing on that path wrote, and the only purposes
    ever recorded in `ai_usage_events` were the nine above plus the front
    door. Two purposes rather than one `quote`, for the reason the canary
    taught (`AI_USAGE_SURFACES` below): the estimate is a structured JSON
    call and the email is prose, they cost differently — measured 17 Sep at
    ~1,300 and ~900 output-equivalent tokens at LOW — and a blended average
    across two populations describes neither.

    `document_validation` is the consultant's upload check
    (`validateConsultantDocument`): a vision call that the same audit found
    with neither meter nor ceiling. It rides in the same migration because
    the CHECK constraint is one SQL-editor trip, and a second trip for one
    value is the friction this vocabulary is supposed to have, not more.

    Added by `20260917120000_the_demo_quote_writes_the_meter_it_is_read_against.sql`.
  */
  'quote_estimate',
  'quote_email',
  'document_validation',
] as const;

export type AiUsagePurpose = (typeof AI_USAGE_PURPOSES)[number];

/**
 * Whose traffic a call was, which is orthogonal to what it was *for*.
 *
 * `purpose` says which feature spent the money. This says whether the money was
 * spent on someone who might one day pay. A consultant call can be any of these
 * and they cost the same to serve while meaning entirely different things to a
 * price decision.
 *
 * **Only `account` belongs in the D2 dataset.**
 *
 *   account    a signed-in user — the only traffic a subscription price can be
 *              derived from
 *   demo       the seeded public demo garage. Wanted traffic, but nobody will
 *              ever pay for it
 *   anonymous  the Phase 2.97 front door, when it exists. Its own budget line
 *   canary     `/api/health/consultant`. Synthetic, and it distorts badly — it
 *              asks a fixed question for a ~40-token answer while thinking is
 *              roughly fixed per call, so it ran at 7.34x thinking-to-visible
 *              against real consultant traffic's 1.39x. Blending the two
 *              produced 3.45x, a figure describing neither
 *
 * Adding a value is a migration, same as `purpose`, and for the same reason.
 */
export const AI_USAGE_SURFACES = ['account', 'demo', 'anonymous', 'canary'] as const;

export type AiUsageSurface = (typeof AI_USAGE_SURFACES)[number];

export interface AiUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

/** A non-negative integer, or 0 for anything that is not one. */
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

/**
 * Narrow the SDK's `usageMetadata` into the five numbers this application bills
 * against.
 *
 * Takes `unknown` on purpose. The shape belongs to `@google/genai` and has
 * already changed once in this project's lifetime; doing the narrowing here
 * means a field disappearing produces a zero in one place rather than a
 * `TypeError` at nine call sites, on paths that must not throw.
 *
 * **`totalTokens` is recomputed rather than trusted when it disagrees.** The
 * API's own total has been observed to exclude thinking tokens on some
 * responses, and a total that omits the most expensive component is worse than
 * no total — every cost figure derived from it would be low, consistently, and
 * plausibly.
 */
export function readUsageMetadata(metadata: unknown): AiUsage {
  const m = (metadata ?? {}) as Record<string, unknown>;

  const promptTokens = count(m.promptTokenCount);
  const outputTokens = count(m.candidatesTokenCount);
  const thoughtsTokens = count(m.thoughtsTokenCount);
  const cachedTokens = count(m.cachedContentTokenCount);

  const reported = count(m.totalTokenCount);
  const summed = promptTokens + outputTokens + thoughtsTokens;

  return {
    promptTokens,
    outputTokens,
    thoughtsTokens,
    cachedTokens,
    totalTokens: Math.max(reported, summed),
  };
}

/**
 * Whether this usage represents a call that actually happened.
 *
 * A response with every counter at zero is not a free call — Gemini does not
 * serve those. It is metadata that was missing, malformed, or from an error
 * path. Writing it would put a row of zeroes in the table, and a row of zeroes
 * is invisible in exactly the statistic it corrupts: it drags every per-call
 * average down without appearing anywhere as a fault.
 *
 * A gap can be noticed. A zero cannot.
 */
export function isWorthRecording(usage: AiUsage): boolean {
  return usage.promptTokens > 0 || usage.outputTokens > 0 || usage.thoughtsTokens > 0;
}

/**
 * What a call cost, in the only unit that is comparable across models:
 * billable tokens, with thinking counted at output rate.
 *
 * Not a currency figure. Prices belong with the model tiers and change without
 * the schema changing; this is the quantity those prices multiply.
 */
export function billableTokens(usage: AiUsage): { input: number; output: number } {
  return {
    // Cached input bills at a discount, so it is reported separately rather
    // than folded in. Subtracting it here would understate the full-rate input.
    input: usage.promptTokens,
    // Thinking bills at the output rate. This is the sum that made 2.95a the
    // largest single cost lever in the application.
    output: usage.outputTokens + usage.thoughtsTokens,
  };
}
