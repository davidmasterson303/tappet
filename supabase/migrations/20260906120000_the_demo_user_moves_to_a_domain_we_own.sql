-- The seeded demo user stops carrying an address on a domain nobody owns.
--
-- ── ⚠ Why a new migration and not an edit ───────────────────────────────────
--
-- `20260314234029_enforce_vehicle_ownership_and_rls.sql` creates the synthetic
-- demo user `00000000-0000-0000-0000-000000000001` with the address
-- `demo@crewchief.app`, and it has already run. Editing that file changes
-- nothing about a database where it has been applied — its INSERT ends in
-- `ON CONFLICT (id) DO NOTHING`, so a re-run is a no-op and the row keeps the
-- address it was created with. CLAUDE.md §2: only an UPDATE moves the artefact.
--
-- ── Why the address has to move ─────────────────────────────────────────────
--
-- `crewchief.app` is not a domain anyone here controls. It was never
-- registered, so the address has never been able to receive anything — which is
-- harmless for a synthetic account that never signs in, and not harmless as a
-- string sitting in `auth.users` on the assumption that it is ours. Anyone who
-- registers the domain owns an address this database treats as a user's.
--
-- `southmoordigital.com` is David's, and is already where the product's
-- contact address moved on 30 Aug (`lib/legal.ts`).
--
-- ── ⚠ It reports what it did, because the silent outcome is the likely one ──
--
-- Checked against the live project on 6 Sep 2026 before this was written: the
-- GoTrue admin API answers **"User not found"** for this id, while all three
-- demo vehicles still carry it in `vehicles.user_id`. Those two facts cannot
-- both be simple. Either the row exists and the admin API does not list it, or
-- the row is gone and the foreign key named in the 14 Mar migration is not
-- being enforced. Settling it needs the SQL editor, which is David's.
--
-- So this migration must not be written as if the row is definitely there. A
-- bare UPDATE matching zero rows exits 0 and reads exactly like success —
-- CLAUDE.md §6, the defects that matter here are silent. The block below says
-- which of the three cases it landed in, and warns on the one that means the
-- seed user is missing rather than merely already renamed.
--
-- ── ✅ Applied 7 Sep, and the admin API was the thing that was wrong ─────────
--
-- It hit the first case. Before, `auth.users` id …0001 held `demo@crewchief.app`;
-- after, it holds `demo@southmoordigital.com`, with zero rows left on the old
-- address, three demo vehicles still owned, and the foreign key on
-- `vehicles.user_id` present. Established by SELECT either side, because the
-- Supabase SQL editor swallows `NOTICE`.
--
-- ⚠ **So the GoTrue admin API's "User not found" above was simply wrong.** The
-- row existed the whole time. The paragraph is kept rather than deleted because
-- the reasoning it produced was right for the wrong reason: writing this to
-- report which case it hit is what made the outcome knowable at all, and it
-- would have been the correct shape even if the row really had been missing.
--
-- Recorded as the third negative on this project from an instrument whose
-- coverage nobody had confirmed — after a stale Colorado dataset and a scanner
-- with two blind spots. The rule that keeps being relearned: a negative from an
-- unverified instrument is UNKNOWN, not VERIFIED.

DO $$
DECLARE
  moved     integer;
  already   integer;
BEGIN
  UPDATE auth.users
     SET email      = 'demo@southmoordigital.com',
         updated_at = now()
   WHERE id    = '00000000-0000-0000-0000-000000000001'
     AND email = 'demo@crewchief.app';

  GET DIAGNOSTICS moved = ROW_COUNT;

  SELECT count(*) INTO already
    FROM auth.users
   WHERE id    = '00000000-0000-0000-0000-000000000001'
     AND email = 'demo@southmoordigital.com';

  IF moved = 1 THEN
    RAISE NOTICE 'demo user moved to demo@southmoordigital.com';
  ELSIF already = 1 THEN
    RAISE NOTICE 'demo user already on demo@southmoordigital.com — nothing to do';
  ELSE
    RAISE WARNING
      'demo user 00000000-0000-0000-0000-000000000001 not found in auth.users; '
      'the three demo vehicles reference it as their owner. Check whether the '
      'foreign key from vehicles.user_id is present.';
  END IF;
END $$;
