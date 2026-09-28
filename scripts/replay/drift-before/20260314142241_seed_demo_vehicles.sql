/*
  DRIFT — `consultant_conversations.message_count` exists in production and no
  migration adds it. `20260314142241_seed_demo_vehicles.sql` inserts into it,
  so a clean replay stops there with 42703 without this.

  Type is the live one (`integer`); nothing in the folder says otherwise.
*/
ALTER TABLE public.consultant_conversations
  ADD COLUMN IF NOT EXISTS message_count integer;
