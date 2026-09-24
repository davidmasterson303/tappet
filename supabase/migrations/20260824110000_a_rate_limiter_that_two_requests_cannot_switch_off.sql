/*
  Two concurrent requests could switch the rate limiter off for a whole window.

  ── ⚠ The defect, from the 24 Aug QA audit (SEC-05) ────────────────────────

  `lib/rate-limit.ts` was read-then-insert with no atomicity, and this table has
  **no unique constraint** — only a non-unique index. So:

    1. Two requests arrive in the same window. Both `SELECT` and both see
       nothing. Both `INSERT`.
    2. Every subsequent request in that window calls `.maybeSingle()` against a
       **two-row** result, which PostgREST answers `PGRST116`.
    3. That lands in the `fetchError` branch, which logs and
       **`return { allowed: true, remaining: config.maxRequests }`**.

  The limiter is off for that identifier for the rest of the window, and an
  attacker triggers it deliberately by firing two parallel requests at each
  boundary. It defeats the `ai` (10/min) and `upload` (5/min) tiers — the two
  standing in front of Gemini spend.

  Failing open on a fetch error is the right instinct for a limiter (a database
  hiccup must not take the product down) and it is what makes this exploitable.
  The fix is to make the ambiguous state unreachable rather than to change what
  happens when it is reached.

  ── Two parts, and the second needs the first ──────────────────────────────

  The unique constraint makes a duplicate window impossible. The function makes
  the increment a single statement, so there is no window between reading a
  count and writing it back.
*/

/*
  ⚠ Duplicates must go before the constraint can be added, and they are summed
  rather than dropped: each row represents requests that genuinely happened, and
  discarding one would hand back the allowance it recorded. Rows in expired
  windows are deleted outright — `cleanupExpiredWindows` would have taken them
  anyway.

  ⚠ **`id` is a `uuid`, and Postgres has no `min(uuid)`.** This file shipped
  with `MIN(id)` at both sites below and died on `42883` the first time anyone
  ran it (24 Sep, SQL editor) — a month after it was committed, because no one
  had. `(array_agg(id ORDER BY id))[1]` is the uuid-safe spelling of the same
  thing.
  `scripts/replay-migrations.sh` now replays the folder in CI, and would have
  failed this file the day it was committed.

  ⚠ **The two `keep_id` expressions must pick the same row.** The `UPDATE`
  writes the summed count into one row and the `DELETE` keeps one row; if they
  disagree, the sum is written into a row that is then deleted and the merged
  count is silently lost. `ORDER BY id` makes both deterministic, so they agree
  — change one and you must change the other.
*/
DELETE FROM api_rate_limits
WHERE window_start < NOW() - INTERVAL '1 day';

WITH merged AS (
  SELECT
    identifier,
    endpoint,
    window_start,
    SUM(request_count) AS total,
    -- Must match the keep_id in the DELETE below (see above).
    (array_agg(id ORDER BY id))[1] AS keep_id
  FROM api_rate_limits
  GROUP BY identifier, endpoint, window_start
  HAVING COUNT(*) > 1
)
UPDATE api_rate_limits AS a
SET request_count = merged.total
FROM merged
WHERE a.id = merged.keep_id;

DELETE FROM api_rate_limits AS a
USING (
  -- Must match the keep_id in the UPDATE above (see above).
  SELECT identifier, endpoint, window_start, (array_agg(id ORDER BY id))[1] AS keep_id
  FROM api_rate_limits
  GROUP BY identifier, endpoint, window_start
) AS keep
WHERE a.identifier = keep.identifier
  AND a.endpoint = keep.endpoint
  AND a.window_start = keep.window_start
  AND a.id <> keep.keep_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_rate_limits_window_key'
  ) THEN
    ALTER TABLE api_rate_limits
      ADD CONSTRAINT api_rate_limits_window_key
      UNIQUE (identifier, endpoint, window_start);
  END IF;
END $$;

/*
  ── The increment, as one statement ────────────────────────────────────────

  `INSERT … ON CONFLICT … DO UPDATE SET request_count = request_count + 1
  RETURNING` is the whole point: the read and the write are the same statement,
  so there is no interval in which two callers can both believe they are first.

  ⚠ **`SECURITY INVOKER`, deliberately.** This runs under the service role,
  which already bypasses RLS, so `SECURITY DEFINER` would buy nothing and would
  make the function a privilege boundary somebody has to reason about. The
  `search_path` is pinned regardless — an unpinned one on a function reachable
  by any role is the trap `20260727150000` records as outstanding for
  `user_owns_vehicle()`.

  It returns the count **after** incrementing, so the caller compares against
  its own tier ceiling. The ceiling stays in TypeScript on purpose: it is
  product configuration, it changes more often than schema does, and duplicating
  it here would create two places for `ai` to mean 10.
*/
CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_window_start timestamptz
)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  INSERT INTO api_rate_limits (identifier, endpoint, window_start, request_count)
  VALUES (p_identifier, p_endpoint, p_window_start, 1)
  ON CONFLICT (identifier, endpoint, window_start)
  DO UPDATE SET
    request_count = api_rate_limits.request_count + 1,
    updated_at = NOW()
  RETURNING request_count;
$$;

/*
  ⚠ Not granted to `anon` or `authenticated`. The limiter is called from the
  server with the service role, and a function that increments a counter is a
  function anybody holding it can use to exhaust somebody else's allowance.

  ⚠ **`service_role` is granted explicitly.** Revoking from `PUBLIC` removes the
  default everybody-may-execute, so the only thing that left the server able to
  call this was Supabase's `ALTER DEFAULT PRIVILEGES` granting new functions to
  its roles. Run against a Postgres without that default (24 Sep, local), the
  service role got `permission denied` — and `lib/rate-limit.ts` answers any
  RPC error by falling back to the racy read-then-insert path this file exists
  to retire, logging `RATE_LIMIT:RPC_MISSING` as if the migration had never
  run. The grant costs nothing where the default holds and is the only thing
  that works where it does not.
*/
REVOKE ALL ON FUNCTION consume_rate_limit(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_rate_limit(text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION consume_rate_limit(text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION consume_rate_limit(text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION consume_rate_limit(text, text, timestamptz) IS
  'Atomic rate-limit increment. Returns the count after this request. See lib/rate-limit.ts and SEC-05.';
