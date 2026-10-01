import { useCallback, useEffect, useState } from 'react';
import { readAiConsent, type AiConsent } from './ai-consent';

/**
 * The owner's one AI answer, as a screen that outlives a visit should hold it.
 *
 * ── Audit 360, UX-23 (1 Oct) · read once, acted on later ───────────────────
 *
 * The car's page and the advisor are tab roots: they mount once and stay
 * mounted while the owner is elsewhere. Each read the answer at mount and
 * kept it — so a yes given on the advisor while the car's page waited (its
 * asks wait for the owner's return since UX-20) was asked for again on
 * return, and a *Not now* to that second sheet wrote `declined` over the
 * yes. CLAUDE.md §6: a component mounted for the screen's lifetime derives
 * its state once.
 *
 * Now the answer is read at mount and again every time the screen regains
 * focus, and `fresh` says whether the copy was read since the screen last
 * came into view. **An ask acts only on a fresh answer**: between the focus
 * and the read landing, `fresh` is false and nothing presents. `answer` keeps
 * the last value meanwhile, so nothing on screen blinks while it is re-read.
 *
 * `set` records what this screen's own sheet was told, for this visit; the
 * store is written by the caller (`recordAiConsent` / `declineAiConsent`).
 * `null` is "not read yet", as before.
 */
export function useAiConsent(focused: boolean): {
  answer: AiConsent | null;
  fresh: boolean;
  set: (answer: AiConsent) => void;
} {
  const [answer, setAnswer] = useState<AiConsent | null>(null);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!focused) setFresh(false);
    let live = true;
    void readAiConsent().then((stored) => {
      if (!live) return;
      setAnswer(stored);
      if (focused) setFresh(true);
    });
    return () => {
      live = false;
    };
  }, [focused]);

  const set = useCallback((next: AiConsent) => setAnswer(next), []);

  return { answer, fresh, set };
}
