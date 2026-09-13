/**
 * The wait instrument's stage model, and the one mapping into it.
 *
 * ── Stages are facts, never a schedule ──────────────────────────────────────
 *
 * `Working.tsx` draws a ledger when it is handed one. This is the only place a
 * ledger is assembled, and the rule for adding another is the one web's
 * `lib/working.ts` settled for the invoice scanner: a stage may exist only
 * where the client can *observe* the boundary. A stage that a timer marks
 * done is the invoice scanner's UX-15 modulo bug in a new drawing, and web
 * removed the last one of those on 30 Aug.
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
 * Where the phone's invoice scan is, as the client can see it.
 *
 * ── Three boundaries, and why the third is only sometimes drawn ─────────────
 *
 * `InvoiceScanScreen` awaits two things in the ordinary flow: the picker
 * (`pickImage`, a native sheet the app sits behind until a file comes back or
 * the person dismisses it) and then one `fetch` — `uploadInvoice`, inside
 * which the server reads the document *and* files its lines. The client
 * cannot see the seam between reading and filing on that request, so the
 * ordinary wait has two stages and no third: drawing "Filing it" as pending
 * while the server may already be doing it would be a stage the process did
 * not emit.
 *
 * The third boundary is real only on the mismatch path. When the server
 * answers "this looks like a different car" and the owner confirms, the
 * screen sends the same file again with the check overridden — a second
 * request the client started, after a question it asked. On that wait the
 * first two stages are done as a matter of record (the file was chosen; the
 * invoice was read — that is how the mismatch was found) and the filing is
 * what runs. So the ledger has three rows there, and two everywhere else,
 * and every mark is a thing that happened.
 *
 * `source` names the first stage honestly: the library is a sheet the app
 * sits behind, and the camera — since 12 Sep — is the viewfinder's own
 * shutter (`Viewfinder.tsx`), so its row says what happened there. "Opening
 * the camera" over a photograph already taken, or over a library picker, is
 * a lie in the state voice.
 */
export type ScanPhase = 'picking' | 'reading' | 'filing';

export function scanStages(phase: ScanPhase, source: 'camera' | 'library'): WorkingStage[] {
  const picking = source === 'camera' ? 'Photographing the invoice' : 'Opening your photos';

  if (phase === 'filing') {
    return [
      { label: picking, state: 'done' },
      { label: 'Reading the invoice', state: 'done' },
      { label: 'Filing it against this car', state: 'active' },
    ];
  }

  return [
    { label: picking, state: phase === 'picking' ? 'active' : 'done' },
    { label: 'Reading the invoice', state: phase === 'picking' ? 'pending' : 'active' },
  ];
}

/**
 * The line the instrument prints for a phase — the active stage's own label,
 * so the status and the ledger never disagree about what is running.
 */
export function scanLine(phase: ScanPhase, source: 'camera' | 'library'): string {
  const active = scanStages(phase, source).find((stage) => stage.state === 'active');
  return active?.label ?? 'Reading the invoice';
}
