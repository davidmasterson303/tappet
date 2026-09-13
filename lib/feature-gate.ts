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
