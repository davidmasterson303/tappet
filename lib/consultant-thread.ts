import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ── A stored thread is appended to, never rewritten from a caller's copy ────
 *
 * Audit 360, TL-18 (1 Oct, round 3). `sendConsultantMessage` stored
 * `[...messageHistory, question, answer]` — and on the web, `messageHistory`
 * is the browser's copy of the thread, loaded once when the thread was
 * opened. An owner who continued the same thread from the phone (it is in
 * the phone's threads sheet) and then typed one more line at the laptop had
 * the phone's exchanges overwritten: the row became the browser's stale copy
 * plus that one pair. The phone's route already read the row ("the history
 * comes from the database, not the request"); the action did not, so the web
 * did not.
 *
 * So both ends read the row: the prompt's history is the stored thread, and
 * the write appends to the thread as it stands *at the write*, re-read after
 * the model answered, so a turn that landed meanwhile is kept.
 *
 * Both reads and the write are scoped to the vehicle the caller was
 * authorized for, as well as the id — the update used to be `eq('id',
 * sessionId)` alone on the service-role client, so a caller-supplied id of a
 * thread under another car would have been overwritten. A thread that is not
 * this car's is `null`: the action refuses before any model call.
 *
 * ⚠ The demo is the exception, as everywhere: nothing is stored for a demo
 * car, so the caller's copy is all there is.
 */

type Client = Pick<SupabaseClient, 'from'>;

/**
 * A read of the thread that failed — not a thread that is gone.
 *
 * Audit 360, TL-22. Both used to be `null`, and the action answered a dropped
 * connection with "That conversation is no longer here. Start a new one." —
 * so the owner forked a thread that a retry would have reached. A failed read
 * throws this; only a row that is genuinely absent is `null`.
 */
export class ThreadReadError extends Error {
  constructor(readonly code: string | null, message: string) {
    super(`consultant thread read failed: ${message}`);
    this.name = 'ThreadReadError';
  }
}

/**
 * The thread's stored turns, or `null` when the id is not a thread of this car.
 * Throws `ThreadReadError` when the read itself failed.
 */
export async function storedThreadHistory(
  client: Client,
  sessionId: string,
  vehicleId: string
): Promise<unknown[] | null> {
  const { data, error } = await client
    .from('consultant_conversations')
    .select('message_history')
    .eq('id', sessionId)
    .eq('vehicle_id', vehicleId)
    .maybeSingle();
  if (error) throw new ThreadReadError(error.code ?? null, error.message);
  if (!data) return null;
  const history = (data as { message_history?: unknown }).message_history;
  return Array.isArray(history) ? history : [];
}

/**
 * Append `turns` to the thread as it is stored now. False when the thread is
 * not this car's (or the read failed) — nothing is written then.
 */
export async function appendToStoredThread(
  client: Client,
  { sessionId, vehicleId, turns }: { sessionId: string; vehicleId: string; turns: unknown[] }
): Promise<boolean> {
  let stored: unknown[] | null;
  try {
    stored = await storedThreadHistory(client, sessionId, vehicleId);
  } catch {
    return false;
  }
  if (!stored) return false;

  const { error } = await client
    .from('consultant_conversations')
    .update({ message_history: [...stored, ...turns], updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('vehicle_id', vehicleId);
  return !error;
}
