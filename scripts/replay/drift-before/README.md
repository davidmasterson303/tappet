# Drift: things production has that no migration creates

Each file here is named after the migration it must run **immediately before**,
and `scripts/replay-migrations.sh` applies it there. Every one of them is an
object someone made by hand in the Supabase dashboard; the migrations folder
then started depending on it without ever creating it (CLAUDE.md §2 — the
database and the folder disagree, both ways).

| Runs before | Supplies | First needed because |
|---|---|---|
| `20260314142241_seed_demo_vehicles.sql` | `consultant_conversations.message_count` | the seed inserts it; no migration adds it |
| `20260314234029_enforce_vehicle_ownership_and_rls.sql` | `public.user_owns_vehicle(uuid)` | its policies call it; `20260629202102` is the first file to even name its signature |
| `20260801160000_rename_policies_that_undersell_their_scope.sql` | policies "Users can view nhtsa data" / "Users can view vehicle knowledge" | the rename raises, deliberately, when neither old nor new name exists |

⚠ **Do not "fix" this by editing an old migration.** Those files are what was
run against production; rewriting them makes the folder describe a history that
never happened. The honest fix is a *new* migration that creates the object
idempotently (`IF NOT EXISTS`, `CREATE OR REPLACE`) — and once one exists the
replay will tell you, because the drift file will then collide with it or
become redundant; delete the drift file in the same commit.

The runner refuses a drift file whose name matches no migration, so a renamed
migration cannot leave one here silently doing nothing.
