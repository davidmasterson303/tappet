/*
  # A count nobody computes is dropped

  ## What was wrong

  `consultant_conversations.message_count` was written by exactly one thing
  in this repository — the 14 Mar demo seed — and read by nothing. Every
  conversation the app has created since carries `message_count = 0` beside
  a `message_history` that holds its messages: the App Review account's
  thread reads 0 against 2 (Cowork, 21 Sep). Nothing renders it today, and
  that is the only reason it has not been wrong on a screen. A stored
  number that does not match the thing it counts is the signature defect
  this codebase is written against (FN-01, the 70 that was a constant), one
  `SELECT` from a reading.

  ## What this does

  Drops the column. Computing it on write was the other honest answer;
  with no reader, a column is the wrong place for a number that
  `message_history.length` already is.

  ## Applied state

  `GET /rest/v1/consultant_conversations?select=message_count` answers
  `42703` after, a row before.
*/

ALTER TABLE consultant_conversations DROP COLUMN IF EXISTS message_count;
