/**
 * What a conversation may be called.
 *
 * One rule, read by both ends of a rename: `renameConsultantSession` refuses
 * with it, and the rail's inline field caps its input with the same number.
 * It lives here rather than beside the action because `app/actions.ts` is a
 * `'use server'` module, and Next permits such a file to export nothing but
 * async functions — so the constant *cannot* sit with the code that enforces
 * it, and two hand-copied 80s would be the arrangement this codebase keeps
 * paying for (see `lib/account-data.ts` on the storage prefixes).
 *
 * Pure and synchronous on purpose: it is validation, it costs nothing, and a
 * pure function is the one shape a unit test can pin without a Supabase stub.
 *
 * ── Why 80 ──────────────────────────────────────────────────────────────────
 *
 * The rail is 256px wide and shows a title at `text-xs` clamped to two lines,
 * which is roughly 76 characters before the clamp cuts it. A title the rail
 * cannot display is a title its owner cannot check, and the auto-generated
 * ones (`generateSessionTitle`) top out at 43. 80 is the two-line rail with
 * a little slack, not a database limit — the column is unbounded `text`.
 *
 * ── Whitespace is collapsed, not merely trimmed ─────────────────────────────
 *
 * A pasted title can carry a newline or a run of spaces; an `<input>` cannot
 * show either, so the row would render something other than what the field
 * held. Collapsing every run to one space makes the stored title the visible
 * one. Nothing else is touched — punctuation, case and emoji are the owner's.
 */

/** Longest title a conversation may carry, after normalisation. */
export const CONSULTANT_TITLE_MAX = 80;

export type TitleCheck =
  | { ok: true; title: string }
  | { ok: false; error: string };

/**
 * Normalise a proposed title and say whether it is usable.
 *
 * The two refusals name what to do, not just what went wrong — a refusal that
 * names none of that reads as a bug (`refusalCopy`'s own rule).
 */
export function normalizeConsultantTitle(raw: unknown): TitleCheck {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Give this conversation a name.' };
  }

  const title = raw.replace(/\s+/g, ' ').trim();

  if (title.length === 0) {
    return { ok: false, error: 'Give this conversation a name.' };
  }

  if (title.length > CONSULTANT_TITLE_MAX) {
    return {
      ok: false,
      error: `Keep the name to ${CONSULTANT_TITLE_MAX} characters — this one is ${title.length}.`,
    };
  }

  return { ok: true, title };
}
