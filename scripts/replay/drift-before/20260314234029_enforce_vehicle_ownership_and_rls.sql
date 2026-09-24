/*
  DRIFT — `public.user_owns_vehicle(vid uuid) returns boolean` exists in
  production and no migration creates it. `20260314234029` writes policies that
  call it (42883 without it); `20260629202102` is the first file to name its
  signature, and only to ALTER it.

  ⚠ The body below is a stand-in with the right SIGNATURE, which is all the
  replay can check. The live body has never been read into this repo —
  `scripts/sql/reconcile-rls-2026-08-24.sql` §2 is the query that reads it, and
  says so. Do not treat this file as a description of what production does.
*/
CREATE OR REPLACE FUNCTION public.user_owns_vehicle(vid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vid AND v.user_id = auth.uid()
  )
$$;
