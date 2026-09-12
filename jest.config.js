const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  /*
    ── ⚠ The timeout is for correctness, not speed (11 Sep) ──────────────────

    Jest's default is 5 s per test. On 11 Sep the promote gate failed twice
    on "tests failed" while three other jest runs shared the machine, and the
    same suite passed every time it ran alone. Reproduced deliberately: three
    concurrent `npx jest` processes — each with its own full worker pool —
    took `consultant-rail-rename-delete.test.tsx` from 2.9 s to 64–71 s and
    tripped the 5 s wall on tests that take 100 ms unloaded. The mobile suite
    has the same shape (`AddVehicleScreen.test.tsx`, recorded the same day).

    A test that hangs still fails — three times slower to say so. A gate that
    fails on a busy machine reports success as "tests failed", and CLAUDE.md
    §5 says what happens to a guard that cries wolf: it gets made to pass.
  */
  testTimeout: 15_000,
  moduleNameMapper: {
    // Order matters: the scoped alias must be tried before the '@/' catch-all.
    '^@tappet/core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  /*
    Agent worktrees under .claude/worktrees are full checkouts, so every suite
    was being discovered twice — 24 suites and 338 tests against a real 12 and
    169. Harmless while the copies agree, actively misleading once they do not:
    a worktree pinned to an older commit reports its stale expectations as
    passes, and a green run stops meaning the working tree is green.
  */
  /*
    `apps/` is ignored because this config is the *web* app's — jsdom
    environment, next/jest transform, React 18 types. The Expo client runs
    React 19 under jest-expo and needs its own runner; discovering that as a
    wall of transform errors in this suite would teach nobody anything.
  */
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.claude/worktrees/',
    '<rootDir>/apps/',
  ],
  /*
    `testPathIgnorePatterns` stops the worktrees being *run*. It does not stop
    `jest-haste-map` crawling them, and the crawler reads every package.json it
    finds — so each run printed:

      Haste module naming collision: tappet
        * <rootDir>/package.json
        * <rootDir>/.claude/worktrees/…/package.json

    (it read `crewchief`, then `tappet`, before the 30 Aug and 7 Sep renames,
    and the worktrees still hold checkouts from before both — so the names
    collide differently now, and the reason to ignore the path has not changed.)

    once for the root package and once for @tappet/core. Noise rather than a
    failure, which is the problem: a real warning appearing above 50 passing
    suites is invisible next to two that always fire. Every verification today
    started by reading past them.

    This ignores the paths at the module-resolution layer, which is the one the
    crawler consults.
  */
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'app/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}

module.exports = createJestConfig(customJestConfig)
