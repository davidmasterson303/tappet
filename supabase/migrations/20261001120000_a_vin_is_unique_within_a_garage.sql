/*
  # A VIN is unique within a garage, not across every garage

  ## What was wrong (audit 360, SEC-1, 1 Oct)

  `vehicles.vin` has been `text UNIQUE` since the first schema
  (`20260101215332`); `20260919160000` dropped `NOT NULL` and deliberately
  kept `UNIQUE`. On production the constraint is `vehicles_vin_key`
  (confirmed 1 Oct: a dry insert of a demo VIN answered `23505 duplicate key
  value violates unique constraint "vehicles_vin_key"`).

  A VIN is printed on the windscreen and in every listing, so a key across
  all accounts is a resource one account can use against another:

    - an oracle: "is this car in Tappet?" answered by the save's 409 vs 201,
      and by the web's VIN step before anything was saved;
    - a squat: the first account to save a VIN owns it, and the car's real
      owner can never add it;
    - with no attacker: a used car's previous owner still has it in their
      garage, so its buyer is refused.

  ## What this does

  Drops the table-wide key and makes the VIN unique per owner. One owner
  still cannot hold the same car twice; two owners may each hold it. NULLs
  stay distinct, so any number of cars may have no VIN. The non-unique
  `idx_vehicles_vin` lookup index from the first schema is untouched.

  Nothing in production can violate the new key: on 1 Oct the table held 7
  non-null VINs with no duplicates at all.

  Idempotent (`IF EXISTS` / `IF NOT EXISTS`): a paste that half-worked can
  be pasted again.

  ## The code on either side of it

  `lib/vin-conflict.ts` answers a `23505` on either side: after this, it can
  only be the caller's own car ("already in your garage"); before, it may be
  a stranger's, and the log says `VIN:GLOBAL_KEY_STILL_APPLIED`.

  ## Verify after applying (PostgREST, SUPABASE_SECRET_KEY, no write)

  Insert a demo VIN under an impossible owner. Before: `23505` naming
  `vehicles_vin_key`. After: `23503` on the user_id foreign key — the VIN is
  no longer a key across owners, and the row is refused for its owner.

    curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/vehicles" \
      -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
      -H "Content-Type: application/json" -H "Prefer: return=minimal" \
      -d '{"vin":"DEMO1HGCV1F30JA000001","year":2018,"make":"Probe","model":"Probe","user_id":"00000000-0000-0000-0000-00000000dead"}'
*/

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_key;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_user_id_vin_key ON vehicles (user_id, vin);
