import { largestRecallSystem } from './research-milestones';

/**
 * The questions the advisor offers before anyone has asked one — drawn
 * from the car's rows, so that they are about this car.
 *
 * ── The finding (QE 2.1, 20 Sep) ─────────────────────────────────────────────
 *
 * Under a heading reading "Ask about this car", the empty thread offered the
 * same three questions to every car: a timing chain, "the next service", and
 * "$1,400 for front control arms". The Accord's own schedule lists a timing
 * *belt*; the price was an M235i number. It is the fun-facts problem in
 * another form — text that reads as tailored and is not (CLAUDE.md §10).
 *
 * So the three are derived, in this order, from what is on file:
 *
 *   1. the service that is due next   (`vehicles.next_service_label`)
 *   2. the worst known issue           (`vehicle_knowledge_base.known_issues`)
 *   3. the largest open recall system  (the campaigns not marked repaired)
 *
 * and a slot that no row can fill takes that slot's generic question, which
 * claims nothing about the car. A car with nothing on file gets three of
 * those, which is honest: the advisor still answers them from what it can
 * find. Slot-wise rather than a pool, because the M235i — a next service, a
 * known issue, no open recalls — otherwise read "What does the oil change
 * that is due next involve?" over "What should I do at the next service?",
 * the same question twice (seen live, 20 Sep).
 *
 * ⚠ The recall line names the *open* campaigns, which the caller decides —
 * the phone's `openRecalls` drops the ones marked repaired. Counting a
 * campaign the owner has already had fixed would be the thing this exists
 * to stop.
 */

export interface StarterRows {
  /** `vehicles.next_service_label`; null or blank when nothing is projected. */
  nextService?: string | null;
  /** `vehicle_knowledge_base.known_issues`, as stored. Any shape is tolerated. */
  knownIssues?: unknown;
  /** The campaigns still open, in any of the shapes `normaliseRecalls` reads. */
  openRecalls?: unknown;
}

/** Questions that assume nothing about the car, one per slot, for the rows that cannot fill it. */
export const GENERIC_STARTERS: readonly string[] = [
  'What should I do at the next service?',
  'What are the most common problems with this car?',
  'Are there any recalls I should know about?',
];

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Three questions, the derived ones first, then the generic line of each
 * slot the rows could not fill.
 */
export function advisorStarters(rows: StarterRows): string[] {
  const slots = [nextServiceQuestion(rows.nextService), knownIssueQuestion(rows.knownIssues), recallQuestion(rows.openRecalls)];
  const derived = slots.filter((q): q is string => q !== null);
  const generic = slots.flatMap((q, i) => (q === null ? [GENERIC_STARTERS[i]] : []));
  return [...derived, ...generic];
}

function nextServiceQuestion(label: string | null | undefined): string | null {
  const service = inSentence(label);
  if (!service) return null;
  return `What does the ${service} that is due next involve?`;
}

/**
 * The worst issue on file, by the severity the research wrote (`High` before
 * `Medium` before `Low`; ties keep the model's order, which lists the
 * important ones first).
 */
function knownIssueQuestion(issues: unknown): string | null {
  if (!Array.isArray(issues)) return null;
  let best: { part: string; rank: number; index: number } | null = null;
  issues.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const part = inSentence(typeof record.part === 'string' ? record.part : null);
    if (!part) return;
    const severity = typeof record.severity === 'string' ? record.severity.toLowerCase() : '';
    const rank = SEVERITY_RANK[severity] ?? 4;
    if (!best || rank < best.rank) best = { part, rank, index };
  });
  if (!best) return null;
  return `Is the ${(best as { part: string }).part} something I should worry about?`;
}

function recallQuestion(openRecalls: unknown): string | null {
  const largest = largestRecallSystem(openRecalls);
  if (!largest) return null;
  if (largest.count === 1) return `What does the open recall involving ${largest.system} mean for this car?`;
  return `What do the ${largest.count} open recalls involving ${largest.system} mean for this car?`;
}

/**
 * A stored label, lowered to sit inside a sentence. Title Case words lose
 * their capital ("Engine Oil and Filter Change" → "engine oil and filter
 * change"); a word that is not simply capitalised is left alone, because
 * "VANOS", "PCV" and "N55" are names, not casing.
 */
export function inSentence(label: string | null | undefined): string | null {
  const trimmed = (label ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  // Punctuation around a word is not part of it: "(V6 Models)" is "(V6 models)".
  return trimmed
    .split(' ')
    .map((word) => {
      const parts = /^([^A-Za-z0-9]*)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/.exec(word);
      if (!parts) return word;
      const [, lead, core, trail] = parts;
      return lead + (/^[A-Z][a-z]+$/.test(core) ? core.toLowerCase() : core) + trail;
    })
    .join(' ');
}
