/**
 * What the scheduler's log line may say about a sweep, from the status alone.
 *
 * Audit 360, TL-24 (1 Oct). `netlify/functions/notify-sweep.mts` logged
 * "Sweep failed" for every non-2xx, but a 502/504 there is the gateway giving
 * up on the response, not the route failing: the research path was measured
 * running on and writing for 30 s after the gateway stopped waiting
 * (`docs/roadmap.md`, "the gateway gave up on the response while the function
 * ran on"), and production sweeps finish 35–50 s after the hour
 * (`sweep_runs.finished_at`, 7–30 Sep). The route writes its own heartbeat row,
 * so on those statuses the row is the verdict and the log says so.
 *
 * Relative-imported by the scheduler, so no imports here — the function
 * bundle must not depend on the app's path aliases.
 */

/** Statuses a gateway answers when it stopped waiting, not when the route failed. */
const GATEWAY_GAVE_UP = new Set([502, 504]);

export type SchedulerVerdict =
  | { level: 'log'; line: string }
  | { level: 'warn'; line: string }
  | { level: 'error'; line: string };

export function schedulerVerdict(status: number): SchedulerVerdict {
  if (status >= 200 && status < 300) return { level: 'log', line: '[CRON:SWEEP] %s' };
  if (GATEWAY_GAVE_UP.has(status)) {
    return {
      level: 'warn',
      line:
        '[CRON:SWEEP] No answer in time (%s %s) — the sweep may still be running. ' +
        'Today’s sweep_runs row is the verdict: a row with ok=true means it ran.',
    };
  }
  return { level: 'error', line: '[CRON:SWEEP] Sweep failed: %s %s' };
}
