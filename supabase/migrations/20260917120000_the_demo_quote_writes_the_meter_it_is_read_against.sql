/*
  # The demo quote writes the meter it is read against

  ## What was wrong

  `generateQuoteRequestV2` is two model calls — `estimateCosts` and
  `generateEmailDraft` — and it is the only thing the public demo spends on
  since the demo advisor moved to pre-written answers on 30 Aug. Its ceiling,
  `checkDemoBudget`, sums `ai_usage_events` rows with `surface = 'demo'`.
  **Neither call ever wrote one.** Checked 17 Sep: 490 rows in the table, and
  the only purposes among them are the nine from 2 Aug plus `quote_check`. The
  ceiling was a real constant on an empty gauge, and could not trip.

  The same audit found `validateConsultantDocument` — the vision call that
  checks an upload is automotive before the consultant is shown it — with no
  meter and no ceiling in its caller either.

  ## Three purposes, not one

  `quote_estimate` and `quote_email` are separate because they are different
  shapes of call that cost differently: measured 17 Sep on a three-item quote
  at LOW thinking, ~1,300 and ~900 output-equivalent tokens. One `quote` value
  would blend a structured JSON call with a prose one, and the surface column
  exists because a blended average across two populations measured neither
  (`20260802200000`). `document_validation` is its own feature and its own
  prompt.

  All three ride in one migration because this constraint is one SQL-editor
  trip, and the vocabulary's friction is meant to be "a migration", not "a
  migration each".

  ## This has to land before the rows appear — and the code is already live

  `recordAiUsage` is fire-and-forget: a rejected INSERT is an
  `AI_USAGE:WRITE_FAILED` warn and a missing row, and the request is
  unaffected. So until this is applied, every demo quote and every upload
  check runs exactly as before and writes nothing — the ceiling stays on its
  empty gauge. The day this is applied, the rows start and the ceiling means
  something. `ai-usage.test.ts` holds `AI_USAGE_PURPOSES` and this constraint
  in step at build time, which is the only signal there is.

  ## Pure addition

  One CHECK swapped for a superset of itself, inside a transaction so there is
  no instant with no purpose constraint at all. No DROP TABLE, no TRUNCATE, no
  data touched — the drop is of the *constraint*, immediately replaced. Same
  shape as `20260803210000`, which applied cleanly on 3 Aug.
*/

-- ─── The vocabulary, extended ─────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_purpose_check;

ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_purpose_check CHECK (purpose IN (
    'consultant',
    'invoice_extraction',
    'vehicle_dossier',
    'vehicle_health_summary',
    'powertrain_options',
    'modification_details',
    'modification_backfill',
    'performance_stats',
    'health_check',
    -- Phase 2.97b. The only purpose that can arrive with surface = 'anonymous'
    -- by design; everything else reaching that surface would be a bug.
    'quote_check',
    -- 17 Sep. The quote's two calls: surface = 'demo' for the seeded cars,
    -- 'account' for an owner. The only purposes that spend the demo pool.
    'quote_estimate',
    'quote_email',
    -- 17 Sep. The consultant's upload check. Always 'account': the upload
    -- authorizes for write, which a demo vehicle never passes.
    'document_validation'
  ));

COMMIT;

COMMENT ON CONSTRAINT ai_usage_events_purpose_check ON public.ai_usage_events IS
  'Which feature spent the money. Orthogonal to surface, which says whose traffic it was. Kept in step with AI_USAGE_PURPOSES by ai-usage.test.ts — adding a value here without adding it there, or the reverse, fails the build.';
