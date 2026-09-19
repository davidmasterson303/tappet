/*
  # A car added from the phone may have no VIN

  ## What was wrong

  `vehicles.vin` has been `text UNIQUE NOT NULL` since the first schema
  (`20260101215332`), which was written when the only way into the product
  was the web wizard, and the wizard opens with a VIN decode. The phone's
  ADD CAR form (8 Aug, `093ce23`) was built on the opposite argument — *"a
  first-run flow that demands a VIN before showing anything is a first-run
  flow people abandon"* — and `POST /api/v1/vehicles` inserts year, make,
  model, trim and mileage with no `vin` at all.

  So the phone could not save a car. Every submit since 8 Aug has answered
  500 "Could not save the vehicle", with `null value in column "vin"
  violates not-null constraint` in a function log nobody read. Found 19 Sep
  adding a 2003 Accord for an App Store frame: the route's test is a source
  scan, the table held five rows and every one of them came from the wizard
  or the demo seed, and two docblocks (`AddVehicleScreen.tsx`, `api/vpic.ts`)
  said in so many words that a car added this way "carries no VIN in the
  database" — a claim about the schema made from a file read, which CLAUDE.md
  §2 exists to forbid. It carried no row.

  ## What this does

  One statement. `UNIQUE` stays: Postgres treats NULLs as distinct under a
  unique constraint, so every real VIN is still one car and any number of
  cars may have none. The route now carries the VIN the phone decoded when
  the owner typed one, and `null` — never `''`, which UNIQUE would allow
  exactly once in the whole product — when they did not. `null` is the
  honest value here (CLAUDE.md §10): a VIN the owner never gave is "we
  cannot say", not a placeholder that would read as a number on the vehicle
  page and be sent to vPIC.

  ## Until this is applied

  No car saves from the phone. The route's insert names the column now, so a
  500 with `"vin"` in the log after this date means the migration has not
  been run, not that the route regressed. `create-vehicle-route.test.ts`
  pins this file and the insert together; the applied state is a PostgREST
  probe (23502 before, 23503 on the FK after), which is the only check that
  counts.
*/

ALTER TABLE vehicles ALTER COLUMN vin DROP NOT NULL;
