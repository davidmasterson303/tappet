import { apiRequest } from './client';
import { isContextKind, type ContextKind } from '@tappet/core/consultant-context-kinds';
import type { AdviceRange } from '@tappet/core/advice-range';
import type { ConsultantEstimate, EstimateLine } from '@tappet/core/consultant-estimate';

/**
 * The advisor — Phase 3.4, and the flow carrying the App Store 4.2 argument.
 *
 * ── One call, and no transcript upload ──────────────────────────────────────
 *
 * `POST /api/v1/consultant` takes a vehicle, a question, and optionally the
 * thread it belongs to. **It does not take the conversation.** The route reads
 * `message_history` out of `consultant_conversations` itself, so a phone
 * resuming a thread does not replay it and cannot rewrite what it was told
 * earlier. That is the route's design, not a convenience — its `resolveThread`
 * docblock is the authority.
 *
 * Omitting `sessionId` starts a thread and the response carries the new id, so
 * asking a first question is one round trip rather than two. **The caller must
 * keep that id** — the screen holds it for the life of the conversation, and
 * dropping it silently starts a second thread on the next message.
 *
 * ── What is deliberately not sent ───────────────────────────────────────────
 *
 * `messageHistory` and `attachedDocuments` are both accepted by the route and
 * neither is in `AskAdvisorParams`. History is server-side for the reason
 * above — the route ignores what a non-demo caller posts. Attachments belong to
 * 3.3, which needs a camera, which is a native module and therefore a second
 * EAS build; sending the field before that flow exists would be a parameter no
 * caller can populate.
 *
 * ── Why the response is narrowed by hand ────────────────────────────────────
 *
 * `apiRequest<T>` casts. What actually arrives is parsed JSON, so `T` is a
 * claim about the server rather than a check on it, and `contextKinds` in
 * particular is rendered as a **provenance row** — the one place in this app
 * where drawing something unverified means asserting something untrue. A kind
 * this build does not recognise is dropped rather than shown, which is what
 * `isContextKind` is for.
 */

export interface AskAdvisorParams {
  vehicleId: string;
  message: string;
  /** Omit on the first message of a thread; the response returns the new id. */
  sessionId?: string | null;
}

export interface AdvisorAnswer {
  /** Always present, and always the id to send with the next message. */
  sessionId: string;
  response: string;
  /**
   * True when the answer was written in advance rather than generated — the
   * demo's pre-written answers (`@tappet/core/demo-answers`). The screen must
   * say so at the point it is shown; a sample presented as a model's reading
   * of this car is the defect that file exists to prevent. Absent means a
   * model wrote it.
   */
  isSample?: true;
  /** What the server loaded and put in front of the model. Rendered "Based on". */
  contextKinds: ContextKind[];
  /**
   * The priced lines behind the estimate well, when the answer priced anything.
   *
   * ⚠ **Optional, and it is the field's most important property.** Most advisor
   * answers are not quotes. The server omits this rather than sending an empty
   * one for exactly that reason — see the route's own note — and the screen must
   * render nothing at all when it is absent. A well showing no lines, or a total
   * of $0, on ordinary advice would be the product asserting a price it never
   * inferred.
   */
  estimate?: ConsultantEstimate;
}

/**
 * Narrow an estimate off the wire, or drop it whole.
 *
 * The same argument as `isContextKind` one field along, and stronger here. This
 * is rendered as **prices, in the product's own voice, inside a styled well** —
 * the strongest claim of precision anything in this app makes. A partially
 * understood estimate is not a degraded estimate, it is a wrong one, so a
 * malformed line takes only itself and a payload with no usable lines returns
 * `undefined` rather than an empty shell.
 *
 * ⚠ It does **not** re-validate the numbers. `parseEstimate` on the server
 * already widened every range to an honest spread and dropped verdict labels;
 * repeating that here would put two copies of the same policy in two packages,
 * and the copy that drifts is always the second one.
 */
function narrowEstimate(raw: unknown): ConsultantEstimate | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;

  const source = raw as { lines?: unknown; likely?: unknown };
  if (!Array.isArray(source.lines)) return undefined;

  const lines = source.lines.filter(isEstimateLine);
  if (lines.length === 0) return undefined;

  const likely = isAdviceRange(source.likely) ? source.likely : undefined;

  return { lines, ...(likely ? { likely } : {}) };
}

function isAdviceRange(value: unknown): value is AdviceRange {
  if (typeof value !== 'object' || value === null) return false;
  const range = value as { low?: unknown; high?: unknown };
  return typeof range.low === 'number' && typeof range.high === 'number';
}

function isEstimateLine(value: unknown): value is EstimateLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as { label?: unknown; range?: unknown };
  return typeof line.label === 'string' && line.label !== '' && isAdviceRange(line.range);
}

/** Matches the route's own ceiling, so an over-long message fails before the flight. */
export const MAX_MESSAGE_LENGTH = 4000;

export async function askAdvisor({
  vehicleId,
  message,
  sessionId,
}: AskAdvisorParams): Promise<AdvisorAnswer> {
  const body = await apiRequest<{
    sessionId?: unknown;
    response?: unknown;
    contextKinds?: unknown;
    estimate?: unknown;
    isSample?: unknown;
  }>('/consultant', {
    method: 'POST',
    /*
      ── 23 Sep · sixty seconds, not the client's twenty ──────────────────────

      The advisor is a model call with the car's whole record in context and,
      on a thread with attachments, an image or two — the one request in the
      app whose honest duration is not a round trip. Under the default the
      phone abandoned the request at 20 s while the route went on to answer
      and *store* the turn; the screen then rolled the question back, said
      "did not answer within 20 seconds", and a "try again" appended a second
      identical turn to the thread the server already held. The invoice path
      took 90 s on 21 Sep for the same reason (`documents.ts`); this is the
      same argument at the advisor's scale.
    */
    timeoutMs: 60_000,
    body: {
      vehicleId,
      message,
      /*
        Omitted rather than sent as null. The route reads it with
        `typeof body.sessionId === 'string'`, so null and absent are already
        equivalent to it — but "absent" is what "start a new thread" means, and
        writing it that way keeps the request honest about the intent.
      */
      ...(sessionId ? { sessionId } : {}),
    },
  });

  const estimate = narrowEstimate(body.estimate);

  return {
    /*
      Falling back to the id we sent covers the impossible case without
      inventing one: a server that answered but returned no id has still
      answered *this* thread. An empty string would silently start a new
      conversation on the next message.
    */
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : (sessionId ?? ''),
    response: typeof body.response === 'string' ? body.response : '',
    contextKinds: Array.isArray(body.contextKinds)
      ? body.contextKinds.filter(isContextKind)
      : [],
    // Spread rather than assigned, so an answer with no estimate has no
    // `estimate` key at all. `undefined` and absent read the same in most code
    // and differently in an `'estimate' in answer` check, and this is a field
    // whose whole contract is that absent means absent.
    ...(estimate ? { estimate } : {}),
    ...(body.isSample === true ? { isSample: true as const } : {}),
  };
}

/**
 * ── 13 Sep · the advisor's threads — list one car's, reopen one ─────────────
 *
 * David: "i need some way to toggle between chat threads... or to view other
 * threads and select one to enter, or start new thread." The screen's own
 * docblock had recorded for a month that the routes existed — the phone just
 * never called them. `GET /consultant/conversations?vehicleId=` lists a car's
 * threads newest first; `GET /consultant/conversations/<id>` returns one with
 * its messages, which the screen draws as turns and continues by sending the
 * same id with the next question. Starting a new thread is what the screen
 * already does — omit the id.
 *
 * Titles come from the server (`consultant_conversations.title`), which may
 * be null on a thread it has not named; the screen falls back to the first
 * question so a row is never blank.
 */
export interface AdvisorThread {
  id: string;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StoredTurn {
  role: 'user' | 'assistant';
  content: string;
  estimate?: ConsultantEstimate;
}

export async function listAdvisorThreads(vehicleId: string): Promise<AdvisorThread[]> {
  const body = await apiRequest<{ conversations?: unknown }>(
    `/consultant/conversations?vehicleId=${encodeURIComponent(vehicleId)}`
  );
  if (!Array.isArray(body.conversations)) return [];
  return body.conversations
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .filter((row) => typeof row.id === 'string')
    .map((row) => ({
      id: row.id as string,
      title: typeof row.title === 'string' && row.title.trim() ? row.title : null,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    }));
}

export async function loadAdvisorThread(
  sessionId: string
): Promise<{ id: string; title: string | null; turns: StoredTurn[] }> {
  const body = await apiRequest<{ conversation?: { id?: unknown; title?: unknown; messages?: unknown } }>(
    `/consultant/conversations/${encodeURIComponent(sessionId)}`
  );
  const conversation = body.conversation ?? {};
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const turns: StoredTurn[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const estimate = narrowEstimate(m.estimate);
    turns.push({ role: m.role, content: m.content, ...(estimate ? { estimate } : {}) });
  }
  return {
    id: typeof conversation.id === 'string' ? conversation.id : sessionId,
    title: typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : null,
    turns,
  };
}

/**
 * The rows the empty thread's opening questions are drawn from — one
 * `load-vehicle` read, kept to the four fields `advisorStarters` reads.
 *
 * QE 2.1 (20 Sep): the questions used to be a static list under a heading
 * that claimed they were about this car. The screen derives them now; this
 * is the read. `nhtsa_data` arrives as an object or a one-element array
 * depending on the join, the same as everywhere else the phone reads it.
 */
export interface StarterSource {
  nextService: string | null;
  knownIssues: unknown;
  recalls: unknown;
  recallActions: Array<{ campaign_number?: string | null }>;
}

export async function loadStarterSource(vehicleId: string): Promise<StarterSource> {
  const body = await apiRequest<{
    vehicle?: {
      next_service_label?: unknown;
      nhtsa_data?: { recalls?: unknown } | { recalls?: unknown }[] | null;
      recall_actions?: unknown;
    };
    knowledge?: { known_issues?: unknown } | null;
  }>(`/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`);
  const vehicle = body.vehicle ?? {};
  const nhtsa = Array.isArray(vehicle.nhtsa_data) ? vehicle.nhtsa_data[0] : vehicle.nhtsa_data;
  return {
    nextService: typeof vehicle.next_service_label === 'string' ? vehicle.next_service_label : null,
    knownIssues: body.knowledge?.known_issues ?? null,
    recalls: nhtsa?.recalls ?? null,
    recallActions: Array.isArray(vehicle.recall_actions)
      ? (vehicle.recall_actions as Array<{ campaign_number?: string | null }>)
      : [],
  };
}
