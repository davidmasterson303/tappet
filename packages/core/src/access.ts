/**
 * What an account may do, by what it has paid for.
 *
 * ── The decision this encodes, David's, 17 Sep — and the one it replaces ────
 *
 * On 30 Aug this file was written to encode *"I don't want a free tier. I
 * think we should have a demo view/mode without real LLM calls so prospects
 * can explore the app without costing anything"* and *"A lapse drops to read
 * only."* — a tier system replaced by an access system, in which nobody unpaid
 * could write. **It was never built.** No write path ever consulted this
 * table; `permits()` had one consumer, the web's demo copy. An account that
 * never paid could add cars, log service and track mileage exactly like a
 * lapsed one, and the binary carried a free tier the docblock said did not
 * exist.
 *
 * On 17 Sep, with that put to him, David kept the free tier. The 30 Aug
 * decision was about cost, and its premise dissolved rather than being
 * overruled: once every model path is behind the feature gate, garage,
 * service log and mileage are database writes with no model call behind them,
 * and an unpaid account costs about nothing to serve — which is what "costs
 * exactly zero" was for. A lapse drops to the free tier, not to read-only:
 * no fourth kind of account, and kinder besides.
 *
 * `paid-features.ts` is the product decision (what Plus buys, what stays
 * free); `entitlement.ts` + `lib/feature-gate.ts` are the enforcement (which
 * account is on which tier, and the gate at every model path). This file is
 * the **copy and the capability table**, kept in step with both by
 * `access.test.ts`, and it exists because two clients explaining one refusal
 * differently are two clients telling somebody different things about their
 * money.
 *
 * ── Four states, and the last two are one tier with two sentences ───────────
 *
 *   demo          nobody is signed in. Sample data, sample answers, no writes.
 *   subscribed    a live entitlement. Everything.
 *   lapsed        paid once, the subscription ended. The free tier.
 *   unsubscribed  signed up, never subscribed. The free tier.
 *
 * `lapsed` and `unsubscribed` permit exactly the same things and are still two
 * states, because the **copy** differs and getting that wrong is cruel in one
 * direction and confusing in the other: "your subscription ended" shown to
 * somebody who never had one, or "subscribe to get started" shown to somebody
 * whose two years of service history is sitting behind it.
 *
 * ── What the free tier is, and is not ───────────────────────────────────────
 *
 * Reading, writing, exporting and deleting one's own records — the garage, the
 * service log, mileage. None of it calls a model, and `paid-features.ts`
 * argues the records are the owner's own whatever they pay. What it does not
 * include is anything that calls a model (the advisor and its health score,
 * invoice scanning, the dossier) and, by David's call, recall alerts — the
 * refresh and the notification; every recall already stored stays readable.
 * Apple's 5.1.1(v) requires the deletion path regardless of billing state.
 */

/** Who is asking. */
export type AccessState = 'demo' | 'subscribed' | 'lapsed' | 'unsubscribed';

/**
 * The things an account can want to do, at the coarsest grain that still makes
 * distinctions the product actually draws.
 */
export type Capability =
  /** See records this account owns. Costs nothing and is never withdrawn. */
  | 'read-own-records'
  /** Add or change them — a service record, a mileage reading, a wishlist item. */
  | 'write-own-records'
  /** Anything that calls a model: the advisor and its health score, invoice extraction, the dossier. */
  | 'generate'
  /** Take the data out, in a form the owner keeps. */
  | 'export'
  /** Close the account. Guideline 5.1.1(v) — never gated on anything. */
  | 'delete-account'
  /**
   * Fetch fresh NHTSA recall data for this account's vehicles, and notify.
   *
   * Separated from `read-own-records` deliberately: the recalls already
   * stored are the record and stay readable; the refresh and the notification
   * are the paid feature. `RECALL_ALERTS_AFTER_LAPSE` below is the decision.
   */
  | 'recall-alerts';

/**
 * **Decided: a lapsed account does not get recall alerts.** Recalls are paid
 * — David, 30 Aug, and confirmed 17 Sep when the free tier was kept — so the
 * refresh and the notification stop with the subscription. Every recall
 * already stored stays readable, like the rest of the record.
 *
 * The argument against is kept in `paid-features.ts` rather than deleted: a
 * federal defect notice an owner cannot see because their card expired, and a
 * lookup that costs nothing. It was considered and overruled, and the next
 * person to read this will have the same instinct.
 *
 * It is one boolean because it should be one decision, made once — not
 * something rediscovered at four call sites. Flipping it changes what
 * `permits('lapsed', 'recall-alerts')` answers and nothing else. ⚠ The sweep
 * does not read it yet: `paid-features.test.ts` lists that as the gate's
 * remaining E8 work, because enforcement is off until there is something to
 * buy.
 */
export const RECALL_ALERTS_AFTER_LAPSE = false;

/**
 * The free tier — `lapsed` and `unsubscribed` alike. Reading, writing,
 * exporting and deleting one's own records; nothing that calls a model.
 */
const FREE_TIER: readonly Capability[] = [
  'read-own-records',
  'write-own-records',
  'export',
  'delete-account',
];

const CAPABILITIES: Record<AccessState, ReadonlySet<Capability>> = {
  /*
    A demo visitor has no account, so `export` and `delete-account` are not
    withheld from them — there is nothing of theirs to take out or close. They
    are absent rather than refused, and the distinction matters for the copy: a
    demo that says "sign in to export your data" is offering something the
    person has not created yet.
  */
  demo: new Set<Capability>(['read-own-records']),

  subscribed: new Set<Capability>([...FREE_TIER, 'generate', 'recall-alerts']),

  lapsed: new Set<Capability>([
    ...FREE_TIER,
    ...(RECALL_ALERTS_AFTER_LAPSE ? (['recall-alerts'] as const) : []),
  ]),

  unsubscribed: new Set<Capability>(FREE_TIER),
};

/** Whether this state permits this capability. */
export function permits(state: AccessState, capability: Capability): boolean {
  return CAPABILITIES[state].has(capability);
}

/**
 * Whether this state may make a model call.
 *
 * ⚠ Named separately from `permits(state, 'generate')` because it is the one
 * with a bill attached, and a call site reading `canGenerate` is harder to
 * misread than one reading a string. It states the policy; the enforcement is
 * `checkFeatureAccess` at every model path, and `access.test.ts` holds the two
 * to the same answer.
 */
export function canGenerate(state: AccessState): boolean {
  return permits(state, 'generate');
}

/**
 * What to tell somebody who cannot do the thing they just tried.
 *
 * ⚠ Copy lives here, beside the rule, for the reason `advice-disclosure.ts`
 * gives about its own: two clients that explain the same refusal differently
 * are two clients telling somebody different things about their money.
 *
 * Every string says what happened, what it costs them, and what changes it —
 * a refusal that names none of those reads as a bug.
 */
export function refusalCopy(state: AccessState, capability: Capability): string | null {
  if (permits(state, capability)) return null;

  if (state === 'demo') {
    return capability === 'generate'
      ? 'This is a sample answer, written in advance. Subscribe to ask about your own car.'
      : 'This is a demo garage. Subscribe to add your own car and keep its record.';
  }

  /*
    The free tier refuses two things: generating, and recall alerts. Its
    records — reading, writing, exporting, deleting — are permitted above and
    never reach here. Both sentences say what stays: a lapsed owner deciding
    whether their two years of history is gone must not read a refusal that
    sounds as if it took it.
  */
  if (state === 'lapsed') {
    return capability === 'recall-alerts'
      ? 'Your subscription has ended, so new recall alerts are paused. The recalls already on your record are still here, and so is everything else.'
      : 'Your subscription has ended, so new answers are paused. Everything you have already recorded is still here, and you can keep adding to it.';
  }

  return capability === 'recall-alerts'
    ? 'Recall alerts are part of Tappet Plus. Your garage, service log and mileage stay free.'
    : 'Subscribe to ask about your car, see its health score, scan invoices and get its dossier.';
}
