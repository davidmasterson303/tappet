/**
 * The gate's retry tells starvation apart from failure, and never hides it.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * 11 Sep: the promote gate failed twice on "tests failed" while three other
 * jest runs shared the machine, and the suite passed alone every time.
 * `scripts/lib/run-suite.mjs` retries only the failed suites, once, and
 * reports that it did. The three outcomes are pinned here with an injected
 * runner so nothing spawns jest: a clean pass is not marked as retried; a
 * starved pass is marked; a second failure is a failure. The anti-vacuous
 * half is the last case — a helper that always returned ok could not pass it.
 */
import { retriedNote, runSuite } from '../../scripts/lib/run-suite.mjs';

describe('runSuite', () => {
  it('passes cleanly without a retry', () => {
    const exec = jest.fn();
    expect(runSuite({ exec })).toEqual({ ok: true, retried: false });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('npx jest --silent', undefined);
  });

  it('retries only the failed suites, once, and says it did', () => {
    const exec = jest.fn().mockImplementationOnce(() => { throw new Error('starved'); });
    expect(runSuite({ cwd: 'apps/mobile', exec })).toEqual({ ok: true, retried: true });
    expect(exec).toHaveBeenNthCalledWith(2, 'npx jest --silent --onlyFailures', 'apps/mobile');
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('a second failure is a failure — the retry never hides a defect', () => {
    const exec = jest.fn(() => { throw new Error('broken'); });
    expect(runSuite({ exec })).toEqual({ ok: false, retried: true });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('the note names the label and says the pass was second-try', () => {
    expect(retriedNote('tests')).toMatch(/^tests passed on a retry/);
    expect(retriedNote('tests')).toMatch(/machine was busy/);
  });
});
