import '@testing-library/jest-dom'

/*
  ── ⚠ Async finders wait five seconds, not one (11 Sep) ─────────────────────

  Testing Library's `findBy*` and `waitFor` default to a 1 s ceiling. Under a
  busy machine — three jest pools sharing it on 11 Sep — `vehicle-research-
  status.test.tsx` could not find a Retry button that renders in 60 ms alone,
  and the promote gate read that as a failing suite. A finder that never finds
  still fails, five times slower to say so; a finder that was merely starved
  no longer fails a gate. Pairs with `testTimeout` in jest.config.js.
*/
const { configure } = require('@testing-library/react');
configure({ asyncUtilTimeout: 5_000 });
