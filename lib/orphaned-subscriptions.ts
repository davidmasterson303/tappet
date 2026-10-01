import { getServiceRoleClient } from '@/lib/supabase';
import { logger } from '@tappet/core/logger';

/**
 * The two reads `orphaned_apple_subscriptions` was created for (audit 360,
 * TL-29, 1 Oct).
 *
 * `deleteAccount` writes a row before the cascade (IAP-05) and, until this,
 * nothing read it: `reclaimed_at` was never set, and a renewal for a deleted
 * subscriber was logged exactly like a notification for somebody who never
 * existed. Neither changes what anybody is entitled to — a re-signup with the
 * same Apple Account reattaches through the ordinary verify path (no owner →
 * a plain write), and the notification route acknowledges an unowned
 * transaction either way. Both are bookkeeping for the support conversation
 * the migration describes ("Apple is still charging me"), so both are
 * best-effort: a failure here is logged and never fails the request.
 *
 * The table carries no `user_id`, deliberately (migration 20260824120000);
 * nothing here adds one.
 */

const TABLE = 'orphaned_apple_subscriptions';

/** Whether this transaction belongs to a deleted account and is unclaimed. */
export async function isOrphanedSubscription(originalTransactionId: string): Promise<boolean> {
  try {
    const { data, error } = await getServiceRoleClient()
      .from(TABLE)
      .select('original_transaction_id')
      .eq('original_transaction_id', originalTransactionId)
      .is('reclaimed_at', null)
      .maybeSingle();
    if (error) {
      logger.warn('IAP:ORPHAN_READ', 'Could not read the orphaned-subscription record', { message: error.message });
      return false;
    }
    return data != null;
  } catch (error) {
    logger.warn('IAP:ORPHAN_READ', 'Could not read the orphaned-subscription record', {
      message: (error as Error)?.message,
    });
    return false;
  }
}

/**
 * Mark an orphaned subscription reclaimed — a new account has just bound it.
 * Only an unclaimed row is touched, so the first reclaim's time stands.
 */
export async function markSubscriptionReclaimed(originalTransactionId: string): Promise<void> {
  try {
    const { error } = await getServiceRoleClient()
      .from(TABLE)
      .update({ reclaimed_at: new Date().toISOString() })
      .eq('original_transaction_id', originalTransactionId)
      .is('reclaimed_at', null);
    if (error) {
      logger.warn('IAP:ORPHAN_RECLAIM', 'Could not mark the subscription reclaimed', { message: error.message });
    }
  } catch (error) {
    logger.warn('IAP:ORPHAN_RECLAIM', 'Could not mark the subscription reclaimed', {
      message: (error as Error)?.message,
    });
  }
}
