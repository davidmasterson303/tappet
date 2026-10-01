import { useCallback, useEffect, useState } from 'react';

/**
 * One full-screen ask on a page at a time, each after the last has left.
 *
 * ── Audit 360, UX-19 / UX-20 (1 Oct) ───────────────────────────────────────
 *
 * The car's page owns two asks — the push primer and the health score's AI
 * sheet — and each `visible` was a separate expression of separate state.
 * UX-16 made them take turns, but a turn ended the moment an answer was
 * recorded: a *Not now* on the score's sheet settled the run, the primer's
 * hold lifted, and the primer was `visible` in the very next render, sliding
 * up while the sheet was still sliding down. iOS will not present a view
 * controller while another is dismissing, and RN's modal host does not
 * queue — so the second ask can fail to appear at all while its state says
 * it is up. And neither ask knew whether the owner was still on the page
 * (UX-20): both could rise over the advisor or the Service tab.
 *
 * So the page names what each ask *wants*, in priority order, and this
 * decides which one *presents*:
 *
 * - **Only while the page is focused.** An ask wanted elsewhere waits,
 *   unanswered, until the owner comes back.
 * - **One at a time, and sticky.** The ask on screen stays until it is no
 *   longer wanted (or the page loses focus); a higher-priority ask arriving
 *   meanwhile waits rather than swapping in the same render.
 * - **Never in the render that took another down.** When the presenting ask
 *   goes, nothing presents until its `Modal` reports `onDismiss` — the
 *   honest signal on iOS that the slide-down has finished — or, where that
 *   never comes (Android, or a sheet iOS declined to present),
 *   `ASK_SETTLE_MS` after. The timer only bounds a wait for a signal; it
 *   never stands in for an answer.
 */
export const ASK_SETTLE_MS = 700;

export function useAskTurns<K extends string>(params: {
  focused: boolean;
  /** Every ask the page owns, highest priority first, with whether it is wanted now. */
  wanted: ReadonlyArray<readonly [K, boolean]>;
}): {
  /** The one ask to draw `visible`, or `null`. */
  presenting: K | null;
  /** Hand to every ask's `Modal` as `onDismiss`. */
  dismissed: () => void;
} {
  const { focused, wanted } = params;
  const [shown, setShown] = useState<K | null>(null);
  const [leaving, setLeaving] = useState(false);

  const isWanted = (key: K) => wanted.some(([k, w]) => k === key && w);
  const firstWanted = wanted.find(([, w]) => w)?.[0] ?? null;

  let presenting: K | null;
  if (shown !== null) {
    presenting = focused && isWanted(shown) ? shown : null;
  } else {
    presenting = focused && !leaving ? firstWanted : null;
  }

  useEffect(() => {
    if (shown === null && presenting !== null) {
      setShown(presenting);
    } else if (shown !== null && presenting === null) {
      setShown(null);
      setLeaving(true);
    }
  }, [presenting, shown]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), ASK_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const dismissed = useCallback(() => setLeaving(false), []);

  return { presenting, dismissed };
}
