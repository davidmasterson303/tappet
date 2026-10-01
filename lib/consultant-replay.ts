/**
 * ── A question asked again after a lost answer gets the stored answer ───────
 *
 * Audit 360, TL-6 (1 Oct). The phone waits 60 s for the advisor
 * (`apps/mobile/src/api/consultant.ts`), and a slow answer — three
 * attachments on a slow link — outlives that: the phone rolls the turn back
 * and keeps the text, while the route goes on to answer and *store* it. The
 * owner sends again, and the thread holds the question twice and two
 * answers, the second one a second model fee.
 *
 * ── ⚠ TL-12 (1 Oct, round 2) · text is not identity ─────────────────────────
 *
 * The first version replayed whenever the thread's last question had the same
 * text as this one, within ten minutes. So an owner who answered the
 * advisor's "want me to add that?" with **yes**, and its next question with
 * **yes**, was handed the first answer again — no model call, nothing stored,
 * a conversation that visibly repeated itself. One-word replies are the
 * designed shape of this chat, not an edge.
 *
 * What only a resend has, in two strengths:
 *
 *  1. **A turn id the phone sends** (`clientTurnId`, build 3). The screen
 *     keeps the id with the rolled-back question and sends it again only for
 *     that same question; a new question, including the same word typed
 *     afresh after an answer arrived, gets a new id. Replay iff the stored
 *     turn carries this id. Decisive both ways.
 *
 *  2. **Without one** (build 2, which cannot be changed): the answer must
 *     have taken long enough that the phone had *already given up* on it.
 *     The stored user turn records when the question was taken up
 *     (`askedAt`) beside when it was answered (`timestamp`). An answer
 *     produced inside the phone's wait was delivered, so a repeat of its
 *     question is a new message and is asked afresh. Only an answer slower
 *     than `PHONE_GAVE_UP_MS` — which the phone cannot have shown — is
 *     replayed, and only to a resend that arrives within
 *     `UNNAMED_RESEND_WINDOW_MS` of it. Turns stored before `askedAt`
 *     existed are never replayed: the safe direction is a second answer,
 *     not a stale one.
 *
 * `PHONE_GAVE_UP_MS` sits below the phone's 60 s on purpose: the phone's
 * clock starts before the request reaches this function (a cold start, TLS,
 * auth and the thread read all happen first), so a lost answer can measure
 * well under 60 s here. The cost of the margin is an answer that took 45–60 s
 * *and arrived*, followed by the identical reply within five minutes — and
 * the ordinary answer takes seconds.
 *
 * ⚠ What it does not cover: a resend that arrives while the first call is
 * still running finds nothing stored yet; and on build 2, an answer lost to
 * a dropped connection inside the wait (the phone's `offline`) is asked
 * again. Build 3's turn id covers the second.
 */

/** With a turn id, how long a resend may be answered from the thread. */
export const REPLAY_WINDOW_MS = 10 * 60 * 1000;

/** The phone's own wait for the advisor (`apps/mobile/src/api/consultant.ts`). */
export const PHONE_WAIT_MS = 60_000;

/** Without a turn id, an answer at least this slow is one the phone gave up on. */
export const PHONE_GAVE_UP_MS = 45_000;

/** Without a turn id, how soon after that slow answer a resend may come. */
export const UNNAMED_RESEND_WINDOW_MS = 5 * 60 * 1000;

/** A client turn id the route will store: short, and nothing a log or a prompt minds. */
export function parseClientTurnId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

type Turn = {
  role?: unknown;
  content?: unknown;
  timestamp?: unknown;
  askedAt?: unknown;
  clientTurnId?: unknown;
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

function instant(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

/** The stored answer to this question, if this message is a resend of the thread's last. */
export function replayedAnswer(
  history: unknown[],
  message: string,
  attachedDocuments: unknown,
  clientTurnId: string | null = null,
  now: number = Date.now()
): ReplayedAnswer | null {
  if (history.length < 2) return null;
  const asked = history[history.length - 2] as Turn | null;
  const answered = history[history.length - 1] as Turn | null;
  if (!asked || !answered || asked.role !== 'user' || answered.role !== 'assistant') return null;
  if (typeof asked.content !== 'string' || asked.content.trim() !== message.trim()) return null;
  if (typeof answered.content !== 'string' || answered.content.length === 0) return null;

  const before = documentUrls(asked.documents);
  const again = documentUrls(attachedDocuments);
  if (before.length !== again.length || before.some((url, i) => url !== again[i])) return null;

  const answeredAt = instant(answered.timestamp);
  if (!Number.isFinite(answeredAt) || now < answeredAt) return null;

  if (clientTurnId) {
    // A named resend: the id decides, both ways.
    if (asked.clientTurnId !== clientTurnId) return null;
    if (now - answeredAt > REPLAY_WINDOW_MS) return null;
  } else {
    // An unnamed one (build 2): only an answer the phone had already given up on.
    if (typeof asked.clientTurnId === 'string') return null;
    const askedAt = instant(asked.askedAt);
    if (!Number.isFinite(askedAt)) return null;
    if (answeredAt - askedAt < PHONE_GAVE_UP_MS) return null;
    if (now - answeredAt > UNNAMED_RESEND_WINDOW_MS) return null;
  }

  return {
    response: answered.content,
    wishlistActions: Array.isArray(answered.wishlistActions) ? answered.wishlistActions : [],
    ...(answered.estimate ? { estimate: answered.estimate } : {}),
  };
}

/**
 * ── ⚠ TL-16 (round 3) · a thread's first question has no thread to name ────
 *
 * Everything above reads the thread the request names. A thread's *first*
 * question names none: the phone learns the `sessionId` from the answer, and
 * the answer is what was lost. So the resend arrived with no `sessionId`, the
 * route made a second thread, called the model again, and the owner's first
 * impression of the advisor was a chat that forked — two threads with one
 * title, two fees. Every advisor open and every `?ask=` link begins there.
 *
 * So, before a new thread is made, the newest threads on this car made
 * inside `REPLAY_WINDOW_MS` are asked the same question `replayedAnswer`
 * asks of a named one — the same rule, both strengths, no third. A thread
 * qualifies only while it holds exactly that one exchange: the phone never
 * learned its id, so nothing can have been added to it, and a thread someone
 * is using is never taken over by a stranger's first line.
 *
 * The legitimate repeat — a new thread opened with the same words as the
 * last one — is asked afresh on both builds: build 3 sends a new turn id,
 * and build 2's answer arrived inside the phone's wait, which is what
 * `PHONE_GAVE_UP_MS` already decides.
 */

/** How many of the car's newest threads a first question is checked against. */
export const FIRST_QUESTION_CANDIDATES = 5;

/**
 * Of the car's threads made inside `REPLAY_WINDOW_MS` (newest first, as the
 * route reads them), the one this first question is a resend into — or null.
 * Pure, so this module stays portable; the route does the read.
 */
export function resentFirstQuestion(
  threads: unknown[],
  {
    message,
    attachedDocuments,
    clientTurnId,
    now = Date.now(),
  }: {
    message: string;
    attachedDocuments: unknown;
    clientTurnId: string | null;
    now?: number;
  }
): { sessionId: string; messageHistory: unknown[] } | null {
  for (const row of threads as Array<{ id?: unknown; message_history?: unknown } | null>) {
    const history = row?.message_history;
    if (!row || typeof row.id !== 'string' || !Array.isArray(history) || history.length !== 2) continue;
    if (replayedAnswer(history, message, attachedDocuments, clientTurnId, now)) {
      return { sessionId: row.id, messageHistory: history };
    }
  }
  return null;
}
