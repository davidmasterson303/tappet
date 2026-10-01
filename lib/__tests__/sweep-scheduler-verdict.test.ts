/**
 * Audit 360, TL-24 (1 Oct) — the scheduler's log does not call a sweep failed
 * when the gateway merely stopped waiting for it.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { schedulerVerdict } from '@/lib/sweep-scheduler-verdict';

const SCHEDULER = join(__dirname, '..', '..', 'netlify', 'functions', 'notify-sweep.mts');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe('schedulerVerdict', () => {
  it.each([502, 504])('reads a %s as no answer in time, and points at sweep_runs', (status) => {
    const verdict = schedulerVerdict(status);
    expect(verdict.level).toBe('warn');
    expect(verdict.line).not.toMatch(/failed/i);
    expect(verdict.line).toMatch(/sweep_runs/);
  });

  it.each([500, 401, 503])('can still call a %s from the route a failure', (status) => {
    // Anti-vacuous: the route's own refusals and errors are still "failed".
    expect(schedulerVerdict(status)).toEqual({ level: 'error', line: expect.stringMatching(/Sweep failed/) });
  });

  it('logs a success as before', () => {
    expect(schedulerVerdict(200).level).toBe('log');
  });
});

describe('the scheduler', () => {
  const scheduler = code(readFileSync(SCHEDULER, 'utf8'));

  it('chooses its non-2xx line through the verdict, by relative import', () => {
    expect(scheduler.length).toBeGreaterThan(200);
    expect(scheduler).toMatch(/from '\.\.\/\.\.\/lib\/sweep-scheduler-verdict'/);
    expect(scheduler).toMatch(/schedulerVerdict\(response\.status\)/);
  });

  it('no longer prints "Sweep failed" for every non-2xx itself', () => {
    expect(scheduler).not.toMatch(/console\.error\('\[CRON:SWEEP\] Sweep failed/);
    // Anti-vacuous: the shape that shipped is caught by the same pattern.
    const shipped = "if (!response.ok) { console.error('[CRON:SWEEP] Sweep failed: %s %s', response.status, body); }";
    expect(shipped).toMatch(/console\.error\('\[CRON:SWEEP\] Sweep failed/);
  });
});
