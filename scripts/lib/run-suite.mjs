/**
 * Run a jest suite for a gate, and tell load apart from failure.
 *
 * ── ⚠ Why a retry, and why only of what failed (11 Sep) ─────────────────────
 *
 * The promote gate failed twice on "tests failed" while three other jest runs
 * shared the machine, and the suite passed every time it ran alone.
 * Reproduced on purpose: three concurrent `npx jest` processes, each with its
 * own full worker pool, took a 2.9 s suite to 64–81 s and tripped per-test
 * timeouts on tests that take 100 ms unloaded. That is starvation, not a
 * defect, and a gate that reports it as "tests failed" is a guard crying
 * wolf — which CLAUDE.md §5 says gets made to pass, quietly, by hand.
 *
 * So: on failure, the suites that failed are run again, once, with
 * `--onlyFailures`. A deterministic failure fails twice and the gate still
 * refuses. A starved run passes on the retry — and the gate *says so*, so a
 * suite that only ever passes on the second try is visible rather than
 * absorbed. Never more than one retry: the second failure is the answer.
 *
 * `exec` is injected so `run-suite.test.ts` can pin the three outcomes
 * without spawning jest.
 */
import { execSync } from 'node:child_process';

const defaultExec = (cmd, cwd) => execSync(cmd, { stdio: 'pipe', cwd });

/**
 * @param {{ cwd?: string, exec?: (cmd: string, cwd?: string) => unknown }} options
 * @returns {{ ok: boolean, retried: boolean }}
 */
export function runSuite({ cwd, exec = defaultExec } = {}) {
  try {
    exec('npx jest --silent', cwd);
    return { ok: true, retried: false };
  } catch {
    // fall through to the single retry
  }
  try {
    exec('npx jest --silent --onlyFailures', cwd);
    return { ok: true, retried: true };
  } catch {
    return { ok: false, retried: true };
  }
}

/** The line a gate prints for a suite that needed the retry. */
export function retriedNote(label) {
  return `${label} passed on a retry of the failed suites — the machine was busy; a suite that only ever passes second time is worth a look`;
}
