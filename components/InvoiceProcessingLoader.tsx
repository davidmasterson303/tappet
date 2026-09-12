'use client';

import {
  hasScanDetailToNarrate,
  scanExtractedLine,
  scanFilePosition,
  scanStageLabel,
  type ScanProgress,
} from '@tappet/core/scan-progress';
import { Working } from '@/components/Working';
import { scanStages } from '@/lib/working';

/**
 * What the invoice scanner is doing, while it does it.
 *
 * ── ⚠ UX-15 · this component used to be a timer with a document on it ───────
 *
 * It took one boolean, `isProcessing`, and ran its own `setInterval` over four
 * hard-coded stages, advancing with `(prev + 1) % steps.length`. Nothing it
 * displayed was observed. Worse than that, the **modulo wrapped**: any upload
 * slower than 8.5 seconds ticked "Processing line items" complete with a green
 * check and then began "Uploading file" again, having already claimed the
 * entire sequence finished. A user watching a slow scan saw the work complete
 * two or three times.
 *
 * ── What it renders now, and where each figure comes from ───────────────────
 *
 * `CODE_HANDOFF_2026-08-24.md` §1.4 asks for the beat to survive and the
 * fiction to go: *"count up the records actually read, name the file being
 * parsed, show the fields extracted as they land."* Every value below is passed
 * in by `DocumentUploadDialog` from state it already held:
 *
 *   - the file name, which it deliberately keeps as the *original* rather than
 *     the reduced copy's — telling somebody their `invoice.jpg` failed as
 *     `invoice.webp` is a small lie in the message they read most closely;
 *   - the position in the queue, which is its loop index;
 *   - the line items, which arrive per file in `result.itemsExtracted` and are
 *     already summed for the completion toast.
 *
 * ⚠ **Two stages, because there are two awaits.** `prepareForUpload` and one
 * `fetch`. Everything the server does inside that request is a single opaque
 * wait from here, and splitting it invented a boundary the client cannot see.
 * `scan-progress.ts` carries the argument.
 *
 * ── The spinner is not a progress bar, and that is deliberate ───────────────
 *
 * There is no percentage here and there cannot honestly be one: the client
 * knows how many files are left but nothing at all about how far through a
 * given model call it is. An indeterminate spinner says "working, duration
 * unknown", which is exactly the state. A bar that fills on a timer says
 * "measured", which is what the old one said and could not support.
 */
export default function InvoiceProcessingLoader({
  isProcessing,
  progress,
}: {
  isProcessing: boolean;
  /**
   * Real state from the upload loop.
   *
   * ⚠ Required. The old signature took an optional `fileName` and invented
   * everything else, which is precisely how it came to display work nobody had
   * reported. A caller that cannot say what is happening should not render this.
   */
  progress: ScanProgress;
}) {
  if (!isProcessing) return null;

  const position = scanFilePosition(progress);
  const extracted = scanExtractedLine(progress);

  /*
    The wait instrument, with the scanner's two real stages beneath it — 11 Sep.

    Both marks come from `progress.stage`, the state the upload loop actually
    holds, so a stage is done when the loop moved past it and never because a
    timer ran out. The file name and the queue position are the facts the
    dialog was already keeping; the line-item count lands as files come back.
    `Working` carries `role="status"` and `aria-live` itself, on the container,
    so the stage and the count are read as one update rather than two — which
    is what this component's own `aria-live` note asked for.

    What went: the pulsing wash behind a document glyph and the spinning
    glyph beside the stage. Neither said anything the instrument does not.
  */
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 sm:px-6">
      <Working
        line={scanStageLabel(progress)}
        detail={
          progress.fileName
            ? position
              ? `${progress.fileName} · ${position}`
              : progress.fileName
            : position ?? undefined
        }
        stages={scanStages(progress)}
      >
        {/*
          ⚠ Rendered only when there is something true to put in it — handoff
          §1.4, "show nothing rather than a timer". A single file with nothing
          back yet has exactly one true thing to say, and the line above says
          it; this stays absent rather than holding open a slot for a count
          that does not exist yet. Once a file has come back, 0 is a result
          and is said. Off-white ink, not green: a fact, not a verdict.
        */}
        {hasScanDetailToNarrate(progress) && extracted && (
          <p className="mono text-xs uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
            {extracted}
          </p>
        )}

        {/*
          ⚠ No estimate. "A few seconds" was the closest this line ever came to
          a number, and nobody here has measured a scan; the honest shape of a
          wait whose length is unknown is to say what it is and ask for the tab.
          `/50` is the floor `text-contrast-floor.test.ts` holds, and this is
          the line somebody stares at while they wait.
        */}
        <p className="text-xs text-white/50 text-center">
          The model reads the whole document at once. Leave this open.
        </p>
      </Working>
    </div>
  );
}
