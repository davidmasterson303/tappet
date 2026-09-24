/*
  # A car's use is the owner's answer, or nothing

  ## What was wrong

  `vehicles.vehicle_status` was added on 14 Mar (`20260314163304`) with
  `DEFAULT 'daily_driver'`. Neither create path asks how the car is used —
  the web wizard asks for `usage_profile`, a different column, and the
  phone's ADD CAR asks nothing — so every car has carried "daily driver"
  from the moment its row existed, and two screens showed it as a fact the
  owner had stated: the phone's hero printed "USE · Daily Driver", and the
  profile screen pre-selected Daily Driver under a heading that says these
  are the answers you gave. Found 20 Sep on a 2003 Accord that had been on
  the account for a day and asked nothing (QE 2.2).

  That is a database default wearing an answer's clothes, which is the
  precision CLAUDE.md §10 forbids inventing. `null` is the honest value:
  "not said", which every reader of the column already renders as nothing
  — the phone's hero and profile screen omit it, the web's card draws no
  chip, the dashboard offers "Set Status".

  ## What this does

  Drops the default. Both inserts now name the column as `null` explicitly,
  which is right with or without this change — an explicit null overrides
  a default — so nothing waits on it; this stops the next insert that
  forgets from acquiring an answer.

  ## What it deliberately does not do

  It does not null the existing rows. The dashboard has a "Set Status"
  control that writes this column, and a row reading `daily_driver` today
  may be the default or the owner's choice: nothing in the row says which.
  Rewriting them would replace a possibly-wrong answer with a certainly-lost
  one. The one row known to be unasked (the Accord above, whose value was
  written back by the QE walk itself) was nulled by hand on 20 Sep.

  Applied state is a PostgREST check: an insert that omits the column
  answers with `vehicle_status: null` after, `'daily_driver'` before.
*/

ALTER TABLE vehicles ALTER COLUMN vehicle_status DROP DEFAULT;
