import { getServiceRoleClient } from './supabase';
import { logger } from '@tappet/core/logger';
import { entitlesFeature } from '@tappet/core/entitlement';
import { type FeatureDecision, type PaidFeature } from '@tappet/core/paid-features';

/**
 * The server-side half of the feature gate — the pricing decision of 24 Aug.
 *
 * ── Why this is a sibling of `ai-budget.ts` and not part of it ──────────────
 *
 * They answer different questions and fail in **opposite directions**, which is
 * exactly the pairing `entitlement.ts` already documents:
 *
 *   - `checkMonthlyBudget` protects **a bill**. An unreadable usage row lets the
 *     call through, because taking every AI feature offline over a database
 *     hiccup costs more than the tokens would.
 *   - this protects **revenue**. An unreadable entitlement resolves to `free`,
 *     because reading a broken row as paid gives the product away to precisely
 *     the case somebody would try to manufacture.
 *
 * Folding them into one function would force one failure direction on both, and
 * whichever was chosen would be wrong for the other half.
 *
 * Both still run. The gate decides *whether* a feature may be used at all; the
 * budget decides whether this particular call is affordable. A subscriber past
 * the fuse is still refused, and that is deliberate — `paid-features.ts` calls
 * the ceiling abuse protection behind the gate rather than a thing being sold.
 */

/**
 * ── ⚠ Off until there is something to buy ───────────────────────────────────
 *
 * `PAID_FEATURES_ENFORCED` is not a rollout flag and must not become one. It
 * encodes one rule, stated at length in `paid-features.ts`: **a feature may
 * only be gated behind a purchase the app can actually make.**
 *
 * As of writing, E8 is unfinished — `PaywallScreen` is mounted by no navigator
 * and no StoreKit library is installed. Enforcing now would take the advisor,
 * invoice scanning and the dossier from every existing account and offer them
 * no way back.
 *
 * ⚠ Anything other than the exact string `'true'` is off, including `'1'`,
 * `'yes'` and `'TRUE'`. A gate that switches on for a typo is a gate that
 * switches on by accident, and the accident here is a support inbox.
 *
 * ⚠ It is read per call rather than captured at module load. A captured value
 * bakes the environment into the bundle and makes the switch a redeploy of the
 * whole app rather than a config change plus a restart.
 */
function enforced(): boolean {
  return process.env.PAID_FEATURES_ENFORCED === 'true';
}

/**
 * Whether this account may use a paid feature.
 *
 * ⚠ An anonymous caller is `null` and resolves to `free`. The demo reaches the
 * consultant through its own budget path and must keep doing so — it is a
 * portfolio piece with its own ceiling, not an account, and gating it would put
 * a paywall on the page recruiters are sent to.
 */
export async function checkFeatureAccess(
  userId: string | null,
  feature: PaidFeature
): Promise<FeatureDecision> {
  if (!enforced()) return { state: 'not-enforced' };
  if (!userId) return entitlesFeature(null, feature, { enforced: true });

  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from('account_entitlements')
      .select('tier, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      /*
        ⚠ Fails **closed**, unlike every other read in `ai-budget.ts`. Logged at
        warn so a paying customer's complaint has something to match, which is
        the same bargain `readTier` makes in the other direction.
      */
      logger.warn(
        'FEATURE_GATE:ENTITLEMENT_READ_FAILED',
        'Could not read entitlement; treating as free',
        { userId, feature, message: error.message }
      );
      return entitlesFeature(null, feature, { enforced: true });
    }

    /*
      A missing row is the ordinary case rather than an error: an account only
      gets one when it buys something.
    */
    return entitlesFeature(
      data
        ? { tier: data.tier as string | null, expiresAt: data.expires_at as string | null }
        : null,
      feature,
      { enforced: true }
    );
  } catch (err) {
    logger.warn('FEATURE_GATE:THREW', 'Feature gate threw; treating as free', {
      userId,
      feature,
      message: err instanceof Error ? err.message : String(err),
    });
    return entitlesFeature(null, feature, { enforced: true });
  }
}

/**
 * Which of these accounts may use a paid feature — the batch form of
 * `checkFeatureAccess`, for the nightly sweep.
 *
 * ── Why a batch, and why it lives here ──────────────────────────────────────
 *
 * The sweep walks every vehicle in the product in pages of 200 and, since
 * 17 Sep, recall alerts are paid — the refresh and the notification stop with
 * the subscription, by David's call (`access.ts`, `RECALL_ALERTS_AFTER_LAPSE`).
 * Asking `checkFeatureAccess` once per vehicle would be a query per car every
 * night; this is one query per page. The verdict per account is the same
 * `entitlesFeature` the single check uses, so the two cannot disagree.
 *
 * **Not enforced → every id**, which is tonight's behaviour and stays it until
 * `PAID_FEATURES_ENFORCED` flips. Enforced and the table cannot be read →
 * **nobody**, the direction the single check fails in and for the same reason
 * — with one honest difference named here: what a closed failure withholds
 * from a subscriber that night is a safety notice, not a feature. It is logged
 * at warn with the count, and the next night's sweep tries again; a notice
 * delayed a day is recoverable, a paid feature given away is not.
 */
export async function usersEntitledTo(
  userIds: readonly string[],
  feature: PaidFeature
): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (!enforced()) return new Set(ids);
  if (ids.length === 0) return new Set();

  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from('account_entitlements')
      .select('user_id, tier, expires_at')
      .in('user_id', ids);

    if (error) {
      logger.warn('FEATURE_GATE:ENTITLEMENT_BATCH_READ_FAILED', 'Could not read entitlements; treating every account as free', {
        feature,
        accounts: ids.length,
        message: error.message,
      });
      return new Set();
    }

    const byUser = new Map<string, { tier: string | null; expiresAt: string | null }>();
    for (const row of data ?? []) {
      byUser.set(row.user_id as string, { tier: row.tier as string | null, expiresAt: row.expires_at as string | null });
    }

    // A missing row is the ordinary case — an account only gets one when it
    // buys something — and `entitlesFeature(null, …)` reads it as free.
    return new Set(ids.filter((id) => entitlesFeature(byUser.get(id) ?? null, feature, { enforced: true }).state === 'allowed'));
  } catch (err) {
    logger.warn('FEATURE_GATE:BATCH_THREW', 'Feature gate threw; treating every account as free', {
      feature,
      accounts: ids.length,
      message: err instanceof Error ? err.message : String(err),
    });
    return new Set();
  }
}

/**
 * What a refused call returns, beside `success: false`.
 *
 * ── E6's wire — the machine-readable half of a refusal ──────────────────────
 *
 * Until 12 Sep this was a sentence. A sentence is right for a person and
 * useless to a client: the phone read "The advisor is part of Tappet Plus" as
 * one more failed request, and the consultant route answered it with a 502
 * that the advisor screen renders as "try again" — advice that cannot help,
 * because the answer is a purchase, not a retry.
 *
 * So the refusal carries `code` beside `error`. It is the literal already in
 * `FeatureDecision['state']` rather than a second string, so the gate and the
 * wire cannot name the same state two ways; and `feature`, so the paywall can
 * say what was reached for. The `/api/v1/*` routes forward both, the mobile
 * client's `ApiRequestError` carries `code`, and `requestUpgrade(feature)` is
 * what a screen calls on it.
 *
 * ⚠ **Wired, and off.** `PAID_FEATURES_ENFORCED` decides whether this is ever
 * returned, and it stays off until a sandbox purchase has been through Restore
 * — `paid-features.ts` carries the rule. Nothing about this shape changes
 * what a call is allowed to do.
 */
export interface FeatureRefusal {
  /** The sentence, written to be shown. */
  error: string;
  /** The literal a client keys on to open the paywall. */
  code: Extract<FeatureDecision, { state: 'needs-subscription' }>['state'];
  /** What was reached for, so the paywall can name it. */
  feature: PaidFeature;
}

/**
 * The refusal, or `null` when the call may proceed.
 *
 * A convenience for the call sites, which all have the same shape as the budget
 * checks above them: one guard, one early return carrying the three fields.
 *
 * ⚠ Written out at the call sites rather than spread — `{ success: false,
 * error: gate.error, code: gate.code, feature: gate.feature }`. The routes
 * read `result.code` off the action's *inferred* return type, and TypeScript
 * only adds a member's missing properties to the other members of that union
 * (as `code?: undefined`) for plain object literals; a spread is left out, and
 * `result.code` then does not typecheck anywhere.
 */
export function featureRefusal(decision: FeatureDecision): FeatureRefusal | null {
  return decision.state === 'needs-subscription'
    ? { error: decision.message, code: decision.state, feature: decision.feature }
    : null;
}
