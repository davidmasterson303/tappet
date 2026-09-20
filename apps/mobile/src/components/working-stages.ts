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

export type WorkingStageState = 'done' | 'active' | 'pending' | 'failed';

export interface WorkingStage {
  label: string;
  /**
   * ⚠ From a real event, never a timer. A stage marked done because 2.5s
   * passed is the invoice scanner's UX-15 defect again.
   */
  state: WorkingStageState;
  /**
   * The answer the step came back with — "24 on file." — rendered under the
   * label once it exists (20 Sep, the research log). A stage with an answer
   * is `done` or `failed`; a running one has none. The coupling is enforced
   * where the stages are assembled (`@tappet/core/research-milestones`), and
   * this component only draws what it is handed.
   */
  answer?: string;
  /**
   * The answer is a value rather than a sentence — a VIN read off a sticker —
   * and takes the mono, as every value does on this platform (brief B1).
   * Default off: most answers are sentences about the car.
   */
  mono?: boolean;
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

/**
 * The research log's rows — `@tappet/core/research-milestones` is the whole
 * argument and the whole rule: every answer quotes a row the API handed the
 * client, so this cannot depict work that has not happened. The mapping here
 * is one to one; it exists so the screen imports a stage list and not a
 * milestone list, like every other wait on the phone.
 */
export function researchStages(
  milestones: ReadonlyArray<{ label: string; answer?: string; state: WorkingStageState }>
): WorkingStage[] {
  return milestones.map(({ label, answer, state }) => ({ label, answer, state }));
}

/**
 * ── The decode: the wait between "which car" and "what only the owner knows" ─
 *
 * The rebuilt first run (20 Sep) narrates the VIN decode on the wait
 * instrument rather than behind a busy button, and the rule above is the
 * whole design: two rows, each a boundary this screen observes.
 *
 *   01  Reading the sticker      → 1HGCM82633A004352
 *   02  Asking NHTSA what that is → 2003 Honda Accord EX-V6, 3.0L V6.
 *
 * The first row is the door's own act. Off the sticker it is the barcode
 * read, whose answer is the number; off the keyboard it is the check-digit
 * arithmetic, whose answer is whether position 9 agrees — real, instant,
 * and the one thing worth saying about a typed number before NHTSA is asked.
 * The second is the one network call, and its answer is the car or the
 * stated reason there is none.
 *
 * ⚠ A check-digit mismatch is an *answer*, not a failure. Position 9 is
 * only mandatory for North American builds, so an import fails it with a
 * genuine number and NHTSA decodes the car anyway (`vinProblem` carries the
 * argument). The row says so and the decode proceeds; it is `failed` only
 * when the number cannot be sent at all.
 */
export type DecodeSource = 'sticker' | 'typed' | 'document';

export type DecodeObservation = {
  source: DecodeSource;
  /** The seventeen characters, once read. `null` while the door has not produced them. */
  vin: string | null;
  /** Whether position 9 agrees — known the moment the number is. */
  checkDigit: boolean | null;
  /** NHTSA's answer, as the client has seen it. */
  outcome:
    | { status: 'asking' }
    /** The car, as one sentence — `describeDecodedVin`. */
    | { status: 'named'; sentence: string }
    | { status: 'failed'; reason: string };
};

const DECODE_ACT: Record<DecodeSource, string> = {
  sticker: 'Reading the sticker',
  typed: 'Checking the number',
  document: 'Reading the document',
};

/** The check-digit verdict, as the typed door's first answer. */
export function checkDigitAnswer(agrees: boolean): string {
  return agrees
    ? 'Check digit agrees.'
    : 'Check digit does not agree — read it over. Asking NHTSA anyway.';
}

export function decodeStages(observation: DecodeObservation): WorkingStage[] {
  const { source, vin, checkDigit, outcome } = observation;

  const read: WorkingStage =
    vin === null
      ? { label: DECODE_ACT[source], state: 'active' }
      : source === 'typed'
        ? { label: DECODE_ACT[source], state: 'done', answer: checkDigitAnswer(checkDigit === true) }
        : { label: DECODE_ACT[source], state: 'done', answer: vin, mono: true };

  const ask: WorkingStage =
    vin === null
      ? { label: 'Asking NHTSA what that is', state: 'pending' }
      : outcome.status === 'asking'
        ? { label: 'Asking NHTSA what that is', state: 'active' }
        : outcome.status === 'named'
          ? {
              label: 'Asking NHTSA what that is',
              state: 'done',
              /*
                Off the sticker or a document the mismatch has not been said
                yet, so it rides the answer: the car is named and the number
                is flagged in one breath, as the old form's note did.
              */
              answer:
                checkDigit === false && source !== 'typed'
                  ? `${outcome.sentence} Its check digit does not agree — read the number over.`
                  : outcome.sentence,
            }
          : { label: 'Asking NHTSA what that is', state: 'failed', answer: outcome.reason };

  return [read, ask];
}

/**
 * The instrument's line for a decode — the active stage's own label while
 * one runs, and the outcome's word once it is over, so the status and the
 * ledger never disagree.
 */
export function decodeLine(observation: DecodeObservation): string {
  const active = decodeStages(observation).find((stage) => stage.state === 'active');
  if (active) return active.label;
  return observation.outcome.status === 'failed' ? 'Not identified' : 'Identified';
}
