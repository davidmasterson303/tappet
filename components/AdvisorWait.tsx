'use client';

import { Working } from '@/components/Working';
import { ADVISOR_NAME } from '@tappet/core/prompts';

/**
 * The advisor's turn while it is still being written: the wait instrument in
 * the thread, saying the one thing the composer can actually observe.
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 *
 * `ConsultantChat` drew a `Loader2` spinner beside a list of five stages —
 * "Reviewing vehicle profile…", "Checking service history…", "Analyzing
 * maintenance records…", "Consulting knowledge base…", "Preparing response…"
 * — advanced by a 1.8s `setInterval` with a wrapping modulo. None of the five
 * is a boundary the client can see: `sendConsultantMessage` is one call with
 * one outcome, and everything the list described happens inside it. So the
 * thread claimed to have finished "Checking service history" at 3.6 seconds,
 * and after nine seconds started again from the top — the invoice scanner's
 * UX-15 defect in a chat. `8a78ac4` removed the same shape from /check on
 * 11 Sep; this was the one file it could not reach that day.
 *
 * ── The two stages that are real ────────────────────────────────────────────
 *
 * The composer awaits two things in order, and a person can be told which
 * only at the boundary between them:
 *
 *   1. the upload — one `fetch` per attached file, in order. The file's name
 *      and its place in the queue are facts the composer holds, so "File 2 of
 *      3" is a real count.
 *   2. the answer — one call. The server loads the car's records and asks the
 *      model once; nothing inside that is observable from here.
 *
 * Which of the two is running is the whole of what this component knows, and
 * the line says exactly that: no third stage, no timer, no duration (none has
 * been measured — `ai_usage_events` carries no latency column).
 *
 * ⚠ On the demo no model is called at all: the answer is pre-written
 * (`app/actions.ts`, 30 Aug) and arrives labelled as a sample. So the
 * sentence about the model is not printed there — the line alone is true on
 * both — and the demo never uploads, so its turn has no first stage.
 *
 * The byline is Jay's only while Jay is answering. The upload is the
 * composer's own work, so that stage carries no byline: the thread does not
 * say the advisor is doing something it is not.
 *
 * Its own file so `/dev/working` can render this turn without a session, a
 * question or a model call — the reason the specimen exists.
 */

/** The file the composer is uploading right now, and its place in the queue. */
export interface AdvisorUpload {
  fileName: string;
  fileIndex: number;
  fileCount: number;
}

interface AdvisorWaitProps {
  vehicle: { year?: number | string | null; make?: string | null; model?: string | null };
  /** The demo answers from a pre-written set and calls no model. */
  demo: boolean;
  /** Set while the composer is on stage one; null once the question is with the model. */
  uploading?: AdvisorUpload | null;
  /** Hold the sweep still — the specimen and its screenshots only. */
  frozen?: boolean;
}

export function AdvisorWait({ vehicle, demo, uploading = null, frozen = false }: AdvisorWaitProps) {
  if (uploading) {
    const { fileName, fileIndex, fileCount } = uploading;
    return (
      <Working
        variant="compact"
        frozen={frozen}
        line={fileCount > 1 ? 'Uploading the files' : 'Uploading the file'}
        detail={fileCount > 1 ? `${fileName} · File ${fileIndex} of ${fileCount}` : fileName}
      />
    );
  }

  const car = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col items-start">
      {/* The same label row as a finished turn, so the wait sits where the answer will. */}
      <div className="mono mb-1.5 flex items-center gap-2 text-xs uppercase tracking-widest text-white/50">
        <span>{ADVISOR_NAME}</span>
      </div>
      <Working
        variant="compact"
        frozen={frozen}
        line="Answering"
        detail={demo ? undefined : `${car ? `Your ${car}’s` : 'The car’s'} records go to the model with the question.`}
      />
    </div>
  );
}
