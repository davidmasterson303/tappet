import { logger } from '@tappet/core/logger';
import { type NextRequest } from 'next/server';
import type { ApiResponse } from '@tappet/core/types';
import { aiCallerKey, checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { isDemoVehicleId } from '@tappet/core/demo';
import { retryCannotHelp, type AdvisorFailureCode } from '@tappet/core/ai/advisor-failure';
import {
  sendConsultantMessage,
  createConsultantSession,
  getConsultantSession,
  generateSessionTitle,
} from '@/app/actions';
import {
  FIRST_QUESTION_CANDIDATES,
  REPLAY_WINDOW_MS,
  parseClientTurnId,
  replayedAnswer,
  resentFirstQuestion,
} from '@/lib/consultant-replay';
import { getServiceRoleClient } from '@/lib/supabase';
import { UNREADABLE_REQUEST } from '@/lib/api-error-copy';

export const dynamic = 'force-dynamic';

/**
 * Ask the advisor — the flow carrying the 4.2 Minimum Functionality argument.
 *
 * ── Why this route can be thin ──────────────────────────────────────────────
 *
 * Because `sendConsultantMessage` stopped taking the vehicle's entire history
 * as parameters. Until `a0e9894` it did, which made it unusable as a public
 * API twice over: a phone cannot upload a car's whole record on every message,
 * and the prompt was assembled from whatever the caller posted. The context is
 * now derived from `vehicleId` server-side, so what is left for a caller to
 * supply is a vehicle, a thread, and a question.
 *
 * This route therefore **delegates rather than reimplementing**. Prompt
 * assembly, wishlist command parsing, performance updates and persistence all
 * live in the action and stay there. A second copy of any of that would be the
 * bug this codebase keeps finding — two implementations of one rule, drifting.
 *
 * ── Why authorization happens here as well as in the action ─────────────────
 *
 * Not redundancy. The action authorizes because it is independently reachable:
 * Next.js compiles server actions into public POST endpoints, so it must
 * defend itself and always must. This route authorizes because it needs the
 * *status code* — a denial has to come back as 401 or 404, and the action
 * returns `{ success: false, error }` with no status, as it should. Deriving
 * HTTP semantics by matching on error strings would be the fragile version of
 * this.
 *
 * One extra ownership query on a request that is about to spend one to three
 * seconds in Gemini. It is not the cost worth optimising.
 */

interface ConsultantRequestBody {
  vehicleId?: unknown;
  message?: unknown;
  sessionId?: unknown;
  messageHistory?: unknown;
  attachedDocuments?: unknown;
  /** The phone's id for this question (build 3) — `lib/consultant-replay.ts`. */
  clientTurnId?: unknown;
}

/** Keeps a single message from becoming an unbounded prompt. */
const MAX_MESSAGE_LENGTH = 4000;
/** Attachments per turn — each is an image in the prompt (23 Sep). */
const MAX_ATTACHMENTS = 3;
/** Turns of caller-supplied history the demo path will replay (23 Sep). */
const MAX_DEMO_HISTORY = 20;

/**
 * The status each coded failure goes out with. 502 is deliberately absent.
 *
 * ── Three meanings had one status — 17 Sep ──────────────────────────────────
 *
 * Everything the action would not do left here as 502, and the phone renders
 * 502 as "could not answer that one — try again". `ai/advisor-failure.ts`
 * carries the argument for why that is wrong advice for each of these; this
 * table is where the argument meets HTTP.
 *
 * The clients branch on the code, never on the number, so the numbers are
 * chosen for the reader of a log or a status dashboard rather than for the
 * app:
 *
 *   402   a purchase is the answer (E6's wire, unchanged)
 *   429   the account's allowance is spent for the month. The same status
 *         as our per-minute limiter, on purpose: both are quotas on a clock,
 *         and RFC 6585 is what a 429 means. The code says which clock.
 *         Not a 5xx — a customer over their allowance is not us failing,
 *         and a 5xx here would put every heavy user into an error rate.
 *   503   the model cannot be reached for a reason that is ours: Google's
 *         quota or the prepay balance, or a rejected key. We *are*
 *         unavailable, and 503 is the honest number for a monitor to see.
 *   422   the demo holds a fixed set of answers and this question was not
 *         one. Well-formed, understood, cannot be processed.
 *   502   stays what it was: a failure to answer that a retry might fix.
 *         It is the only exit without a code, and that absence is the
 *         contract the clients read.
 *
 * `Record<AdvisorFailureCode, number>`: a code added to the registry without
 * a status here does not compile, and `advisor-failure-states.test.ts` fails
 * if any of these is ever 502.
 */
const FAILURE_STATUS: Record<AdvisorFailureCode, number> = {
  'needs-subscription': 402,
  'budget-exhausted': 429,
  'advisor-unavailable': 503,
  'demo-unanswered': 422,
};

export async function POST(request: NextRequest): Promise<Response> {
  logger.info('API:CONSULTANT', 'Consultant message received');

  /*
    The address limiter every route has, ahead of authentication — the
    model's own 'ai' bucket waits until the caller is known (SEC-6, below),
    so this is what bounds unauthenticated traffic.
  */
  const addressLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!addressLimit.allowed) return rateLimitResponse(addressLimit);

  let body: ConsultantRequestBody;
  try {
    body = (await request.json()) as ConsultantRequestBody;
  } catch {
    return Response.json(
      { success: false, error: UNREADABLE_REQUEST } as ApiResponse,
      { status: 400 }
    );
  }

  const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!vehicleId) {
    return Response.json(
      { success: false, error: UNREADABLE_REQUEST } as ApiResponse,
      { status: 400 }
    );
  }

  if (!message) {
    return Response.json(
      { success: false, error: UNREADABLE_REQUEST } as ApiResponse,
      { status: 400 }
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { success: false, error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` } as ApiResponse,
      { status: 400 }
    );
  }

  try {
    /*
      Conditional intent, and it must stay that way. `authorizeVehicleAccess`
      denies demo vehicles any write, so an unconditional 'write' here would
      return 403 for every consultant message on the public demo — the exact
      regression that killed the demo's headline feature once already.
      `auth-posture.test.ts` guards the action against it; this is a second
      place that needs the same care, and it has its own assertion.
    */
    const isDemoVehicle = isDemoVehicleId(vehicleId);

    const access = await authorizeVehicleAccess(vehicleId, {
      intent: isDemoVehicle ? 'read' : 'write',
    });
    if (!access.ok) {
      return access.response;
    }

    /*
      ⚠ Audit 360, SEC-6 (1 Oct) · after authorization, keyed on the caller.
      This was `consultant:${vehicleId}` and ran first, so ten unauthenticated
      POSTs a minute with anybody's vehicle id locked that owner's advisor.
      The action uses the same key, so alternating between the two still
      cannot double an allowance. 'ai' tier: this call spends Gemini tokens.

      ⚠ TL-19 (round 3) · its own key, not the action's. With one key both
      calls spent the same bucket, so every message cost two of the ten and
      the real allowance was five a minute. Now the route's bucket counts
      requests (replays and thread starts included) and the action's counts
      model calls: ten messages a minute each way, and the route — which
      counts at least as many — is the one that answers the phone's 429.
      Alternating with the action still cannot double the model's
      allowance: every model call is counted in the action's bucket.
    */
    const rateLimit = await checkRateLimit(
      aiCallerKey('consultant-route', {
        userId: access.userId,
        visitor: access.userId ? null : getClientIdentifier(request, 'ai'),
        vehicleId,
      }),
      'ai'
    );
    if (!rateLimit.allowed) {
      logger.warn('API:CONSULTANT', 'Rate limit exceeded', { vehicleId });
      return rateLimitResponse(rateLimit);
    }

    const clientTurnId = parseClientTurnId(body.clientTurnId);
    const thread = await resolveThread({
      vehicleId,
      isDemoVehicle,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      message,
      attachedDocuments: body.attachedDocuments,
      clientTurnId,
      // Bounded: the demo's history is the caller's, and the prompt is paid for.
      clientHistory: Array.isArray(body.messageHistory) ? body.messageHistory.slice(-MAX_DEMO_HISTORY) : [],
    });

    if (!thread.ok) {
      return Response.json(
        { success: false, error: thread.error } as ApiResponse,
        { status: thread.status }
      );
    }

    /*
      ⚠ 1 Oct · audit 360, TL-6 · the same question, sent again because the
      phone stopped waiting for an answer this thread already stored. Answered
      from the thread: no second model call, no second pair of turns.
      ⚠ TL-12: the same *words* are not the same question — "yes" twice is
      two answers. A resend is named by the phone's turn id (build 3) or, for
      build 2, by an answer slower than the phone waits.
      `lib/consultant-replay.ts`.
    */
    const replay = isDemoVehicle
      ? null
      : replayedAnswer(thread.messageHistory, message, body.attachedDocuments, clientTurnId);
    if (replay) {
      logger.info('API:CONSULTANT', 'Answered a repeated question from the thread', { vehicleId });
      return Response.json({
        success: true,
        sessionId: thread.sessionId,
        response: replay.response,
        contextKinds: [],
        wishlistActions: replay.wishlistActions,
        ...(replay.estimate ? { estimate: replay.estimate } : {}),
      } as ApiResponse);
    }

    const result = await sendConsultantMessage({
      vehicleId,
      sessionId: thread.sessionId,
      message,
      messageHistory: thread.messageHistory,
      clientTurnId,
      // Each attachment is an inline image part in the prompt; the count is ours to cap, not the caller's.
      attachedDocuments: Array.isArray(body.attachedDocuments) ? body.attachedDocuments.slice(0, MAX_ATTACHMENTS) : undefined,
    });

    if (!result.success) {
      /*
        ── E6's wire · a gate refusal is not a failed answer ─────────────────

        The action returns `{ success: false, error }` for everything it will
        not do, and this route answered all of it with 502 — which the advisor
        screen renders as "could not answer that one, try again". For the
        feature gate that advice is wrong twice: nothing failed, and trying
        again cannot help, because the answer is a subscription.

        So a refusal carrying `code: 'needs-subscription'` goes out as **402**
        with `code` and `feature` beside the sentence, and the phone opens the
        paywall on the code rather than on the status. `feature-gate.ts`
        carries the shape; `PAID_FEATURES_ENFORCED` decides whether it is ever
        returned, and it is off.

        ⚠ 17 Sep: the same argument applied to three more exits the 502 was
        flattening — `FAILURE_STATUS` above names them. The gate is not
        touched by that; it stays off.
      */
      if (result.code === 'needs-subscription') {
        logger.info('API:CONSULTANT', 'Consultant refused: needs subscription', { vehicleId });
        return Response.json(
          { success: false, error: result.error, code: result.code, feature: result.feature },
          { status: 402 }
        );
      }

      /*
        ── The other three — a spent allowance, an unreachable model, the
        demo's fixed list — leave with their code and their sentence, and a
        status from the table above. The phone shows the sentence rather than
        its retry copy; the web shows it rather than its fallback. Only a
        failure with **no** code reaches the 502 below, because only that
        one is worth a retry.
      */
      if (retryCannotHelp(result.code)) {
        logger.warn('API:CONSULTANT', 'Consultant could not answer, and a retry would not help', {
          vehicleId,
          code: result.code,
        });
        return Response.json(
          { success: false, error: result.error, code: result.code },
          { status: FAILURE_STATUS[result.code] }
        );
      }

      logger.warn('API:CONSULTANT', 'Consultant declined to answer', {
        vehicleId,
        error: result.error,
      });
      return Response.json(
        { success: false, error: result.error } as ApiResponse,
        { status: 502 }
      );
    }

    logger.info('API:CONSULTANT', 'Consultant answered', { vehicleId });

    return Response.json({
      success: true,
      sessionId: thread.sessionId,
      response: result.response,
      /*
        What the answer was grounded in, computed server-side from the context
        actually loaded. The web client renders these as "Based on" chips; the
        mobile client will want the same, and neither can derive them itself
        now that the context never leaves the server.
      */
      contextKinds: result.contextKinds ?? [],
      wishlistActions: result.wishlistActions ?? [],
      /*
        The priced lines behind the estimate well, and **omitted rather than
        emptied** when the answer did not price anything.

        Not `?? []` like the two above, and the difference is the whole design.
        Those are lists that are legitimately empty — no chips, no suggestions.
        An estimate is a claim about what a job costs, and there is no such
        thing as an empty one: a well rendering no lines, or a total of $0, on
        the ordinary advice turn would be the product asserting a price it
        never inferred. Absent has to arrive as absent.
      */
      ...(result.estimate ? { estimate: result.estimate } : {}),
      /*
        ⚠ Whether this answer was written in advance rather than generated —
        the demo, which makes no model call (`demo-answers.ts`). Dropped here
        until 17 Sep, so through this route a sample arrived indistinguishable
        from a model answer while the web, which calls the action directly,
        labelled it. `demo-answers.ts` puts an unlabelled sample beside the
        scan sweep that depicted an examination nobody ran, and it is right:
        the label is the honesty of the whole demo, and the route is the only
        surface a phone can reach it through. Present only when true, like
        `estimate`, so absent means "a model wrote this" and never "unknown".
      */
      ...(result.isSample ? { isSample: true } : {}),
    } as ApiResponse);
  } catch (error) {
    logger.error('API:CONSULTANT', error as Error);
    return Response.json(
      { success: false, error: 'The advisor could not answer that one. Your question is still here — try again.' } as ApiResponse,
      { status: 500 }
    );
  }
}

type ThreadResult =
  | { ok: true; sessionId: string; messageHistory: unknown[] }
  | { ok: false; error: string; status: number };

/**
 * Work out which thread this message belongs to, and what was said in it.
 *
 * **The history comes from the database, not the request.** A phone resuming a
 * conversation should not have to replay it, and a caller should not be able
 * to rewrite what it was told earlier — the same argument that moved the
 * vehicle context server-side. `consultant_conversations.message_history`
 * already holds it.
 *
 * Demo vehicles are the deliberate exception. Nothing is persisted for them —
 * every write in `sendConsultantMessage` is inside `if (!isDemoVehicle)` — so
 * there is no thread to read and the caller's own history is all there is. It
 * is their own conversation with a read-only car; the worst a caller can do by
 * editing it is mislead their own advisor.
 *
 * Omitting `sessionId` starts a thread. A phone should not need two round
 * trips to ask its first question.
 */
async function resolveThread({
  vehicleId,
  isDemoVehicle,
  sessionId,
  message,
  attachedDocuments,
  clientTurnId,
  clientHistory,
}: {
  vehicleId: string;
  isDemoVehicle: boolean;
  sessionId: string | null;
  message: string;
  attachedDocuments: unknown;
  clientTurnId: string | null;
  clientHistory: unknown[];
}): Promise<ThreadResult> {
  if (isDemoVehicle) {
    return { ok: true, sessionId: sessionId || 'demo-session', messageHistory: clientHistory };
  }

  if (sessionId) {
    // Authorizes the session against its own parent vehicle, so a valid id
    // belonging to another car is refused rather than resumed.
    const existing = await getConsultantSession(sessionId);

    if (!existing.success || !existing.data) {
      return { ok: false, error: 'Conversation not found', status: 404 };
    }

    if (existing.data.vehicle_id !== vehicleId) {
      // Same status as "not found": which conversations exist under which
      // vehicle is not something to confirm.
      return { ok: false, error: 'Conversation not found', status: 404 };
    }

    return {
      ok: true,
      sessionId,
      messageHistory: Array.isArray(existing.data.message_history)
        ? existing.data.message_history
        : [],
    };
  }

  /*
    ⚠ Audit 360, TL-16 (round 3) · the first question, sent again. Its answer
    carried the thread's id, so a lost answer leaves the phone nothing to
    name — and this made a second thread. A thread on this car holding only
    this question, answered in a way the replay rule says was lost, is the
    one. Asked before a thread is made; a failed read makes one, as before.
    `lib/consultant-replay.ts`.
  */
  try {
    const { data: recent, error } = await getServiceRoleClient()
      .from('consultant_conversations')
      .select('id, message_history, created_at')
      .eq('vehicle_id', vehicleId)
      .gte('created_at', new Date(Date.now() - REPLAY_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(FIRST_QUESTION_CANDIDATES);
    if (error) throw new Error(error.message);
    const resent = resentFirstQuestion(recent ?? [], { message, attachedDocuments, clientTurnId });
    if (resent) return { ok: true, ...resent };
  } catch (error) {
    logger.warn('API:CONSULTANT', 'Could not look for a resent first question', {
      vehicleId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const created = await createConsultantSession(vehicleId, await generateSessionTitle(message));

  if (!created.success || !created.sessionId) {
    return { ok: false, error: 'The advisor could not start that conversation. Your question is still here — try again.', status: 500 };
  }

  return { ok: true, sessionId: created.sessionId, messageHistory: [] };
}
