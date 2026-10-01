import { useCallback, useEffect, useRef, useState } from 'react';
import {
  researchHasFailure,
  researchLine,
  researchMarginalia,
  researchMilestones,
  researchSettled,
  type ResearchMilestone,
  type ResearchObservation,
} from '@tappet/core/research-milestones';
import { apiRequest, type ApiRequestError } from '../api/client';
import type { AiConsent } from '../onboarding/ai-consent';

/**
 * Drive a car's research from the phone, and narrate it.
 *
 * ── What this does, in order ────────────────────────────────────────────────
 *
 * 1. A car whose knowledge base is `pending` gets one `POST /api/v1/research`
 *    the first time its screen sees it — the trigger the phone never had
 *    (20 Sep; `lib/research-job.ts` carries the gap). The route is
 *    idempotent, so a remount does not spend twice.
 * 2. While a job runs, the screen's own loader is called quietly every
 *    `POLL_MS`, and the log is recomputed from whatever rows have landed —
 *    `researchMilestones` is the only thing that decides what a line says.
 * 3. When the dossier has landed and there is no score, one
 *    `POST /api/v1/health` with `refresh: true` — the free tier's one model
 *    call, exactly as the web's `VehicleInsights` forces it after research.
 *    ⚠ **Only on a granted AI consent** (audit 360, LEGAL-1, 1 Oct). This
 *    post sent the owner's mileage, service log and invoice lines to Google
 *    at add-a-car with no sheet in front of it — before the owner had been
 *    asked anything. Now the score step waits for the answer: `unknown`
 *    raises `consentNeeded` (the screen shows `HEALTH_AI_CONSENT`), `null`
 *    (still reading the Keychain) waits, and `declined` answers the line as
 *    not scored, with the retry asking again. A quiet re-score runs only on
 *    `granted` and otherwise does nothing.
 * 4. It stops when every line has its answer, or when `DEADLINE_MS` passes
 *    with something still running. The deadline is the client's to observe:
 *    the server cannot know a wait is being watched. Nothing here may spin
 *    forever; the stalled line says so and offers a retry.
 *
 * ── What this never does ────────────────────────────────────────────────────
 *
 * It never marks a step done because time passed. There is no timer that
 * advances a line — the interval only *asks*; the rows answer. That is the
 * product rule for a wait (`working-stages.ts`), and the reason the log can
 * be believed: a stalled pipeline is a stalled log, visibly.
 *
 * ── A failed car ────────────────────────────────────────────────────────────
 *
 * A row already `failed` when the screen opens shows the log settled on its
 * failure with the retry, and does not start anything on its own: the
 * refusal was a real outcome, and starting a Pro call on every open of a car
 * the model could not read would be a bill without a decision behind it.
 * The retry is the decision.
 */

export const POLL_MS = 2_500;
/** The dossier is 23–60 s, three attempts at most, NHTSA and the score beside it. */
export const DEADLINE_MS = 4 * 60_000;

export interface ResearchRunner {
  /** Whether the log belongs on screen this visit. */
  visible: boolean;
  milestones: ResearchMilestone[];
  line: string;
  marginalia: string | null;
  settled: boolean;
  failed: boolean;
  retry: () => void;
  /** The score is next and nobody has said yes to Google's AI — show the sheet. */
  consentNeeded: boolean;
  /** The sheet was answered no: stop showing it until the next retry. */
  consentDeclined: () => void;
  /**
   * A researched car with no score whose owner said no on an earlier visit
   * (audit 360, UX-15, 1 Oct). The automatic start leaves it idle — a decline
   * is the answer, and no log fails on every open — so without this the only
   * door to a score was the advisor's sheet, which nothing mentioned, while
   * HealthScreen and the sheet's own note sent the owner to this page. The
   * screen shows a "Score this car" control; `askScore` is it.
   */
  canAskScore: boolean;
  /** The owner asked: run the score step alone, and show the sheet again. */
  askScore: () => void;
  /**
   * The run settled and its one failed line is the owner's own *Not now*
   * (audit 360, UX-22, 1 Oct). Nothing went wrong and nothing needs
   * researching again, so the log's control is the score's door — the same
   * *Score this car* the page shows on a later open — not *Retry the
   * research*, a button named for finished work and the act just declined.
   */
  declinedOnly: boolean;
}

type Phase = 'idle' | 'running' | 'settled';

/** A reading, or the honest "could not say" row — either is a score that exists. */
function hasScore(observation: ResearchObservation): boolean {
  const health = observation.health;
  return Boolean(health && (typeof health.health_score === 'number' || health.last_generated));
}

export function useResearchRunner(params: {
  vehicleId: string;
  /** What the screen has, or `null` while it is still loading. */
  observation: ResearchObservation | null;
  /** The screen's own loader, quiet: no spinner, no pull-to-refresh state. */
  reload: () => Promise<void>;
  /**
   * The owner's AI answer — `readAiConsent`, or `null` while it is read.
   * Required, so no caller can reach the score without deciding (LEGAL-1).
   */
  consent: AiConsent | null;
  /** Injected for tests; the wall clock otherwise. */
  now?: () => number;
}): ResearchRunner {
  const { vehicleId, observation, reload, consent } = params;
  const now = params.now ?? Date.now;

  const [phase, setPhase] = useState<Phase>('idle');
  /*
    A stale-score refresh runs without the log (QE 1.5 / 2.15, 20 Sep): the
    cell already says "read before N records were filed", which is true
    while the Flash call runs, and the new reading seats in when it lands.
    Six rows of ledger for one four-second step would be noise on every open
    of a car that has just had a record filed.
  */
  const [quietRun, setQuietRun] = useState(false);
  const [healthFailure, setHealthFailure] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const startedAt = useRef<number | null>(null);
  const healthAsked = useRef(false);
  const started = useRef(false);
  const inFlight = useRef(false);
  /** A retry after a decline asks again; until then a decline is the answer. */
  const [reask, setReask] = useState(false);

  const status = observation?.knowledge?.research_status ?? null;
  const dossierDone = status === 'completed' || status === 'unsupported';
  const scoreOutstanding =
    !quietRun &&
    observation !== null &&
    dossierDone &&
    !(hasScore(observation) && !observation.scoreStale) &&
    !healthAsked.current;
  const consentNeeded =
    phase === 'running' && scoreOutstanding && (consent === 'unknown' || (consent === 'declined' && reask));
  // Not tied to `running`: the declined line is what settles the run, and it
  // has to stay answered once it has.
  const scoreDeclined = phase !== 'idle' && scoreOutstanding && consent === 'declined' && !reask;

  const milestones = observation
    ? researchMilestones({ ...observation, healthFailure, stalled, scoreDeclined })
    : [];
  const settled = milestones.length > 0 && researchSettled(milestones);

  const start = useCallback(async () => {
    started.current = true;
    healthAsked.current = false;
    setHealthFailure(null);
    setStalled(false);
    setQuietRun(false);
    startedAt.current = now();
    setPhase('running');
    try {
      const body = await apiRequest<{ state?: string }>('/research', { method: 'POST', body: { vehicleId } });
      if (body.state === 'completed' || body.state === 'unsupported') {
        await reload();
      }
    } catch (error) {
      // A refused trigger is a stated failure on the dossier's line, not a
      // spinner: the row stays as it was and the deadline names it.
      const apiError = error as ApiRequestError;
      if (apiError.status === 404) setPhase('settled');
    }
  }, [now, reload, vehicleId]);

  /*
    The one automatic start: a pending car, seen for the first time. A car
    already failed is shown settled with its retry (see the header).
  */
  useEffect(() => {
    if (!observation || started.current || phase !== 'idle') return;
    if (status === 'pending') {
      void start();
    } else if (status === 'failed') {
      started.current = true;
      setPhase('settled');
    } else if ((status === 'completed' || status === 'unsupported') && !hasScore(observation)) {
      /*
        LEGAL-1: an owner who said no is not shown a log that fails on every
        open of the car; the score line and its retry appear on a research
        run, and HealthScreen says why there is no score.
      */
      if (consent === null || consent === 'declined') return;
      /*
        Researched but never scored — a car the web or the sweep researched,
        or one researched before the phone could ask (the Accord, 20 Sep: a
        day after it was added, "No score yet" under copy saying its page
        shows the work running, and nothing ran). No trigger is posted; the
        dossier exists. The run is the score alone, and the log says so:
        five lines already answered, one running.
      */
      started.current = true;
      startedAt.current = now();
      setPhase('running');
    } else if ((status === 'completed' || status === 'unsupported') && observation.scoreStale && consent === 'granted') {
      /*
        Scored, and overtaken: a record was filed (an invoice, a job marked
        done) and the score was stamped stale — the web refreshes it on the
        next view, and until 20 Sep the phone never did. The same one-step
        run as above, without the log.
      */
      started.current = true;
      startedAt.current = now();
      setQuietRun(true);
      setPhase('running');
    }
  }, [consent, now, observation, phase, start, status]);

  /*
    The score: asked once, after the dossier, when no reading exists — and
    only once the owner has said yes to Google's AI (LEGAL-1, above).
  */
  useEffect(() => {
    if (phase !== 'running' || !observation || healthAsked.current) return;
    if (!dossierDone || (hasScore(observation) && !observation.scoreStale)) return;
    if (consent !== 'granted') return;
    healthAsked.current = true;
    void (async () => {
      try {
        await apiRequest('/health', { method: 'POST', body: { vehicleId, refresh: true } });
        await reload();
      } catch (error) {
        setHealthFailure((error as ApiRequestError).message ?? 'Could not score this car.');
      }
    })();
  }, [consent, dossierDone, observation, phase, reload, vehicleId]);

  const waitingOnOwner = useRef(false);
  waitingOnOwner.current = consentNeeded;

  /* Settle when every line has its answer. */
  useEffect(() => {
    if (phase === 'running' && settled) setPhase('settled');
  }, [phase, settled]);

  /* The poll: ask, never advance. */
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => {
      // Waiting on the owner's answer is not the pipeline stalling: the
      // deadline counts from when they answer.
      if (waitingOnOwner.current) {
        startedAt.current = now();
        return;
      }
      if (startedAt.current !== null && now() - startedAt.current > DEADLINE_MS) {
        setStalled(true);
        setPhase('settled');
        return;
      }
      if (inFlight.current) return;
      inFlight.current = true;
      void reload().finally(() => {
        inFlight.current = false;
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [now, phase, reload]);

  const retry = useCallback(() => {
    // A retry is the owner asking: after a decline, it shows the sheet again.
    setReask(true);
    void start();
  }, [start]);

  const consentDeclined = useCallback(() => setReask(false), []);

  const canAskScore =
    phase === 'idle' && observation !== null && dossierDone && !hasScore(observation) && consent === 'declined';

  /*
    The score-only run the automatic start makes for an unscored car, begun
    by the owner instead: no research trigger (the dossier exists and the
    route would be a second spend), `reask` so the sheet shows, and the
    deadline counting from their answer as it always does.
  */
  const askScore = useCallback(() => {
    setReask(true);
    started.current = true;
    healthAsked.current = false;
    setHealthFailure(null);
    setStalled(false);
    setQuietRun(false);
    startedAt.current = now();
    setPhase('running');
  }, [now]);

  return {
    visible: phase !== 'idle' && !quietRun,
    milestones,
    line: milestones.length > 0 ? researchLine(milestones) : '',
    marginalia: observation ? researchMarginalia(observation) : null,
    settled: phase === 'settled',
    failed: researchHasFailure(milestones),
    retry,
    consentNeeded,
    consentDeclined,
    canAskScore,
    askScore,
    declinedOnly:
      phase === 'settled' &&
      scoreDeclined &&
      milestones.filter((milestone) => milestone.state === 'failed').length === 1,
  };
}
