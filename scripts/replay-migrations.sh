#!/usr/bin/env bash
#
# Replay every file in supabase/migrations/, in order, against a throwaway
# Postgres — so a migration that cannot run fails when it is COMMITTED, not
# when David pastes it into the Supabase SQL editor.
#
#   scripts/replay-migrations.sh                 # self-test, then full replay
#   scripts/replay-migrations.sh --recent-days 14   # idempotency window (default 30)
#
# Connection is plain libpq: PGHOST / PGPORT / PGUSER / PGPASSWORD. The role
# must be able to CREATE DATABASE and CREATE ROLE. Every run makes its own
# databases and drops them afterwards; nothing else in the cluster is touched.
#
# ── ⚠ Why this exists ───────────────────────────────────────────────────────
#
# `20260824110000_a_rate_limiter_that_two_requests_cannot_switch_off.sql` was
# committed 24 Aug and failed on its FIRST execution on 24 Sep:
#
#     42883: function min(uuid) does not exist
#
# A month in the folder, reviewed, "done" on the board. Nothing in the repo
# ever parsed the SQL: `scripts/check-migrations.mjs` probes the live database
# for the SHAPE a migration creates, which tells you whether it was applied —
# never whether it can be.
#
# ── How it runs each file ───────────────────────────────────────────────────
#
# `psql -1 -v ON_ERROR_STOP=1`: one transaction per file, stop at the first
# error — the way the SQL editor runs it, so a file that half-applies there
# fails here. The first failure stops the replay: every later file was written
# against a database in which that one had run, so their errors would be noise.
#
# Before the first file it loads `scripts/replay/supabase-shim.sql` (the parts
# of Supabase the folder touches). Before specific files it loads
# `scripts/replay/drift-before/<that file's name>` — objects that exist in
# production but that no migration creates. That list is the drift, written
# down; read its README before adding to it.
#
# ── The three checks that keep this honest (CLAUDE.md §5) ────────────────────
#
#   1. SELF-TEST. `scripts/replay/fixtures/broken/` holds a file that must fail
#      (`SELECT min(gen_random_uuid())`, the original defect). The runner replays
#      it first and exits non-zero if that is reported green. A runner that
#      cannot see the bug it was built for checks nothing.
#   2. NON-EMPTY. It asserts it found >0 migrations AND ran every one it found.
#      A glob that silently matches nothing would otherwise report a clean
#      folder forever.
#   3. NO DEAD DRIFT. A drift file whose name matches no migration fails the
#      run, so renaming a migration cannot leave its drift quietly unused.
#
# ── Idempotency (the second pass) ───────────────────────────────────────────
#
# After the full replay, every migration dated within the last --recent-days is
# run a SECOND time against the finished database. Files in this folder are
# pasted by hand, and a paste that half-worked gets pasted again — so a recent
# migration should converge, not fail with 42710 "already exists". It is
# windowed rather than folder-wide because the early files were written before
# that convention (bare CREATE POLICY), are applied, and will never be re-run.
# On 24 Sep everything from the last 45 days converged; 60 found two that do not.
#
# Exit codes: 0 all good · 1 a migration failed · 2 a recent migration is not
# idempotent · 3 the runner itself is not trustworthy (self-test, empty
# folder, dead drift file, cannot connect).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT/supabase/migrations}"
REPLAY_DIR="$ROOT/scripts/replay"
SHIM="$REPLAY_DIR/supabase-shim.sql"
DRIFT_DIR="$REPLAY_DIR/drift-before"
BROKEN_DIR="$REPLAY_DIR/fixtures/broken"
RECENT_DAYS=30

while [ $# -gt 0 ]; do
  case "$1" in
    --recent-days) RECENT_DAYS="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 3 ;;
  esac
done

# GitHub renders these as annotations; elsewhere they are just readable lines.
error() { echo "::error::$*"; }

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
# NOTICEs ("… does not exist, skipping") are noise here; errors still surface.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
CREATED_DBS=()

cleanup() {
  for db in "${CREATED_DBS[@]:-}"; do
    [ -n "$db" ] && "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1
  done
}
trap cleanup EXIT

fresh_db() {
  local db="$1"
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null || return 1
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$db\"" >/dev/null || return 1
  CREATED_DBS+=("$db")
  # The shim is cluster-wide for roles and per-database for everything else.
  "${PSQL[@]}" -1 -d "$db" -f "$SHIM" >/dev/null || return 1
}

# run_file DB FILE -> 0/1, output of a failure left in $LAST_OUTPUT
run_file() {
  LAST_OUTPUT="$("${PSQL[@]}" -1 -d "$1" -f "$2" 2>&1 >/dev/null)"
  local rc=$?
  # psql -1 still exits 0 on some errors if ON_ERROR_STOP is lost; belt and braces.
  if [ $rc -ne 0 ] || grep -q '^psql:.*ERROR:' <<<"$LAST_OUTPUT"; then
    return 1
  fi
  return 0
}

# replay DB DIR -> sets RAN / FAILED_FILE; applies drift files where named
replay() {
  local db="$1" dir="$2" f name
  RAN=0
  FAILED_FILE=""
  for f in "$dir"/*.sql; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    if [ "$dir" = "$MIGRATIONS_DIR" ] && [ -f "$DRIFT_DIR/$name" ]; then
      if ! run_file "$db" "$DRIFT_DIR/$name"; then
        FAILED_FILE="drift-before/$name"
        return 1
      fi
      echo "  ~ drift supplied before $name"
    fi
    if ! run_file "$db" "$f"; then
      FAILED_FILE="$name"
      return 1
    fi
    RAN=$((RAN + 1))
  done
  return 0
}

if ! "${PSQL[@]}" -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
  error "cannot connect to Postgres (PGHOST=${PGHOST:-} PGPORT=${PGPORT:-}); the replay did not run"
  exit 3
fi
echo "Postgres: $("${PSQL[@]}" -Atd postgres -c 'SHOW server_version')"

SUFFIX="$$"

# ── 1. Self-test: the runner must see the bug it was built for ──────────────
echo
echo "Self-test: replaying fixtures/broken/, which must FAIL"
broken_count=$(find "$BROKEN_DIR" -maxdepth 1 -name '*.sql' | wc -l)
if [ "$broken_count" -eq 0 ]; then
  error "self-test has no fixture in $BROKEN_DIR — the runner cannot prove it detects anything"
  exit 3
fi
fresh_db "replay_selftest_$SUFFIX" || { error "could not create the self-test database"; exit 3; }
if replay "replay_selftest_$SUFFIX" "$BROKEN_DIR"; then
  error "self-test: the broken fixture replayed GREEN. The runner is not detecting failures; nothing it reports can be trusted."
  exit 3
fi
if ! grep -q '42883\|does not exist' <<<"$LAST_OUTPUT"; then
  error "self-test: the fixture failed, but not with the expected error — got: $LAST_OUTPUT"
  exit 3
fi
echo "  ok — $FAILED_FILE reported failing: $(grep -m1 'ERROR' <<<"$LAST_OUTPUT")"

# ── 2. Something to replay, and every drift file names a real migration ─────
total=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l)
if [ "$total" -eq 0 ]; then
  error "found no migrations in $MIGRATIONS_DIR — a replay of nothing is not a pass"
  exit 3
fi
dead=0
for d in "$DRIFT_DIR"/*.sql; do
  [ -e "$d" ] || continue
  if [ ! -f "$MIGRATIONS_DIR/$(basename "$d")" ]; then
    error "drift file $(basename "$d") names no migration in supabase/migrations/ — it would silently never run"
    dead=1
  fi
done
[ $dead -eq 0 ] || exit 3

# ── 3. The replay ────────────────────────────────────────────────────────────
echo
echo "Replaying $total migrations from supabase/migrations/"

DB="replay_$SUFFIX"
fresh_db "$DB" || { error "could not create the replay database"; exit 3; }
if ! replay "$DB" "$MIGRATIONS_DIR"; then
  echo
  error "migration $FAILED_FILE cannot run (after $RAN of $total applied cleanly)"
  echo "$LAST_OUTPUT"
  echo
  echo "Every later migration was skipped: each was written against a database where this one had run."
  exit 1
fi
if [ "$RAN" -ne "$total" ]; then
  error "ran $RAN migrations but found $total — the replay skipped files"
  exit 3
fi
echo "  ok — all $RAN migrations applied in order, one transaction each"

# ── 4. Idempotency: recent migrations must survive a second paste ────────────
cutoff="$(date -u -d "-$RECENT_DAYS days" +%Y%m%d%H%M%S)"
echo
echo "Idempotency: re-running migrations dated after ${cutoff:0:8} (last $RECENT_DAYS days) a second time"
recent=0
not_idempotent=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$f")"
  stamp="${name%%_*}"
  [[ "$stamp" =~ ^[0-9]{14}$ ]] || continue
  [ "$stamp" \> "$cutoff" ] || continue
  recent=$((recent + 1))
  if run_file "$DB" "$f"; then
    echo "  ok   $name"
  else
    error "$name is not idempotent — a second run fails: $(grep -m1 'ERROR' <<<"$LAST_OUTPUT")"
    not_idempotent=$((not_idempotent + 1))
  fi
done
[ $recent -gt 0 ] || echo "  (none in the window)"
if [ $not_idempotent -gt 0 ]; then
  echo
  echo "$not_idempotent recent migration(s) fail when run twice. Guard them (IF NOT EXISTS, DROP … IF EXISTS, CREATE OR REPLACE) so a re-paste converges."
  exit 2
fi

echo
echo "Migration replay passed."
