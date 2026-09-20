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
  /** Injected for tests; the wall clock otherwise. */
  now?: () => number;
}): ResearchRunner {
  const { vehicleId, observation, reload } = params;
  const now = params.now ?? Date.now;

  const [phase, setPhase] = useState<Phase>('idle');
  const [healthFailure, setHealthFailure] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const startedAt = useRef<number | null>(null);
  const healthAsked = useRef(false);
  const started = useRef(false);
  const inFlight = useRef(false);

  const status = observation?.knowledge?.research_status ?? null;

  const milestones = observation
    ? researchMilestones({ ...observation, healthFailure, stalled })
    : [];
  const settled = milestones.length > 0 && researchSettled(milestones);

  const start = useCallback(async () => {
    started.current = true;
    healthAsked.current = false;
    setHealthFailure(null);
    setStalled(false);
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
    }
  }, [now, observation, phase, start, status]);

  /* The score: asked once, after the dossier, when no reading exists. */
  useEffect(() => {
    if (phase !== 'running' || !observation || healthAsked.current) return;
    const dossierDone = status === 'completed' || status === 'unsupported';
    if (!dossierDone || hasScore(observation)) return;
    healthAsked.current = true;
    void (async () => {
      try {
        await apiRequest('/health', { method: 'POST', body: { vehicleId, refresh: true } });
        await reload();
      } catch (error) {
        setHealthFailure((error as ApiRequestError).message ?? 'Could not score this car.');
      }
    })();
  }, [observation, phase, reload, status, vehicleId]);

  /* Settle when every line has its answer. */
  useEffect(() => {
    if (phase === 'running' && settled) setPhase('settled');
  }, [phase, settled]);

  /* The poll: ask, never advance. */
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => {
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
    void start();
  }, [start]);

  return {
    visible: phase !== 'idle',
    milestones,
    line: milestones.length > 0 ? researchLine(milestones) : '',
    marginalia: observation ? researchMarginalia(observation) : null,
    settled: phase === 'settled',
    failed: researchHasFailure(milestones),
    retry,
  };
}
