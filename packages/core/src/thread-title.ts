/**
 * A thread's title, from its first question.
 *
 * ── Whole words, or the whole question (QE 2.13, 20 Sep) ────────────────────
 *
 * The first version took six words and then cut at forty characters, so
 * "What should I do at the next service?" became "What should I do at the"
 * — a title cut mid-thought, in the threads sheet, beside the car's name.
 * A question that fits is the title; a longer one is cut at the last word
 * boundary inside the limit, with an ellipsis that says so. Never inside a
 * word.
 */
export const THREAD_TITLE_MAX = 48;

export function threadTitle(message: string, max = THREAD_TITLE_MAX): string {
  const clean = message.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return 'New Chat';
  if (clean.length <= max) return clean;
  const room = clean.slice(0, max - 1);
  const cut = room.lastIndexOf(' ');
  const head = cut > max / 2 ? room.slice(0, cut) : room;
  return `${head.replace(/[\s,;:—-]+$/, '')}…`;
}
