/*
  ANTI-VACUOUS FIXTURE — this file must FAIL.

  `scripts/replay-migrations.sh` replays it first, and requires the runner
  to report it as failing. If the runner ever reports this green, the runner is
  not checking anything (CLAUDE.md §5), and CI fails for that reason alone.

  It is the exact defect that motivated the replay: `min()` has no uuid
  overload, so `20260824110000` failed 42883 on first execution, a month after
  it was committed.
*/
SELECT min(gen_random_uuid());
