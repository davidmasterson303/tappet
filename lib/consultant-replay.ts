/**
 * ── A question asked again after a lost answer gets the stored answer ───────
 *
 * Audit 360, TL-6 (1 Oct). The phone waits 60 s for the advisor
 * (`apps/mobile/src/api/consultant.ts`), and a slow answer — three
 * attachments on a slow link — outlives that: the phone rolls the turn back
 * and keeps the text, while the route goes on to answer and *store* it. The
 * owner sends again, and the thread holds the question twice and two
 * answers, the second one a second model fee. The 23 Sep note records the
 * same thing at the old 20 s bound.
 *
 * The thread already knows the answer. When its last two turns are this
 * exact question (same text, same attachments) and its answer, asked within
 * `REPLAY_WINDOW_MS`, the route returns that answer instead of asking the
 * model again and appends nothing. Phones already running build 2 get this
 * on their resend with no change on the phone.
 *
 * ⚠ What it does not cover: a resend that arrives while the first call is
 * still running finds nothing stored yet. That needs an in-flight marker the
 * thread does not have.
 */

export const REPLAY_WINDOW_MS = 10 * 60 * 1000;

type Turn = {
  role?: unknown;
  content?: unknown;
  timestamp?: unknown;
  documents?: unknown;
  wishlistActions?: unknown;
  estimate?: unknown;
};

export type ReplayedAnswer = {
  response: string;
  wishlistActions: unknown[];
  estimate?: unknown;
};

function documentUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((doc) => (doc && typeof doc === 'object' ? (doc as { file_url?: unknown }).file_url : undefined))
    .filter((url): url is string => typeof url === 'string')
    .sort();
}

/** The stored answer to this exact question, if it was the thread's last. */
export function replayedAnswer(
  history: unknown[],
  message: string,
  attachedDocuments: unknown,
  now: number = Date.now()
): ReplayedAnswer | null {
  if (history.length < 2) return null;
  const asked = history[history.length - 2] as Turn | null;
  const answered = history[history.length - 1] as Turn | null;
  if (!asked || !answered || asked.role !== 'user' || answered.role !== 'assistant') return null;
  if (typeof asked.content !== 'string' || asked.content.trim() !== message.trim()) return null;
  if (typeof answered.content !== 'string' || answered.content.length === 0) return null;

  const at = typeof asked.timestamp === 'string' ? Date.parse(asked.timestamp) : NaN;
  if (!Number.isFinite(at) || now - at > REPLAY_WINDOW_MS || now < at) return null;

  const before = documentUrls(asked.documents);
  const again = documentUrls(attachedDocuments);
  if (before.length !== again.length || before.some((url, i) => url !== again[i])) return null;

  return {
    response: answered.content,
    wishlistActions: Array.isArray(answered.wishlistActions) ? answered.wishlistActions : [],
    ...(answered.estimate ? { estimate: answered.estimate } : {}),
  };
}
