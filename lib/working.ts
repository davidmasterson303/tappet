import type { ScanProgress } from '@tappet/core/scan-progress';

/**
 * The wait instrument's stage model, and the one mapping into it.
 *
 * ── Stages are facts, never a schedule ──────────────────────────────────────
 *
 * `components/Working.tsx` draws a stage list when it is handed one. This is
 * the only place one is assembled, and the rule for adding another is the
 * rule `scan-progress.ts` settled for the invoice scanner: a stage may exist
 * only where the client can *observe* the boundary. A stage that a timer
 * marks done is the UX-15 modulo bug in a new drawing, and `b1e2baa` removed
 * the last one of those on 30 Aug.
 *
 * Kept apart from the component so a test can exercise the mapping without
 * rendering, and so the model of a stage has no React in it.
 */

export type WorkingStageState = 'done' | 'active' | 'pending';

export interface WorkingStage {
  label: string;
  /**
   * ⚠ From a real event, never a timer. A stage marked done because 2.5s
   * passed is the invoice scanner's UX-15 defect again.
   */
  state: WorkingStageState;
}

/**
 * The invoice scanner's two real stages, as the wait instrument's stage list.
 *
 * `scan-progress.ts` settles why there are two and not four: the client
 * awaits `prepareForUpload` and then one `fetch`, and everything the server
 * does inside that request is one opaque wait. These are the two boundaries
 * the client can actually see, so they are the only two it may draw.
 *
 * `done` never reaches the instrument — the dialog unmounts the loader when
 * every file has been answered for — but the mapping is total so a caller
 * that does render it gets two done marks rather than a throw.
 */
export function scanStages(progress: ScanProgress): WorkingStage[] {
  const stage = progress.stage;
  return [
    {
      label: 'Preparing the file',
      state: stage === 'preparing' ? 'active' : 'done',
    },
    {
      label: 'Reading the invoice',
      state: stage === 'preparing' ? 'pending' : stage === 'reading' ? 'active' : 'done',
    },
  ];
}
