/**
 * Whether a deletion whose answer was lost actually happened — the web's half
 * of TL-7 (audit 360, TL-25, 1 Oct).
 *
 * `deleteAccount()` (the server action) catches its own failures and returns
 * `{ success: false }`, so the only way it *throws* is transport: the action's
 * fetch failing, or the platform answering a 5xx after its function ceiling.
 * The purge is inline — every object under every car, then the auth user —
 * so a long deletion can outlive the request and still finish. Without this,
 * the dialog sat on "Deleting" with Cancel disabled while the account was
 * already gone, and the next page answered 401 for a cookie naming nobody.
 *
 * The question goes to Supabase's auth server from the browser, not through
 * our own function: it is the authority on whether the user exists, and it is
 * not behind the ceiling that just failed. GoTrue answers a JWT whose user no
 * longer exists with 403 `user_not_found` (or `session_not_found` — the
 * deletion cascades the sessions), and a refresh for one with 400
 * `refresh_token_not_found`. Those mean gone. A network failure (no status)
 * or a 5xx means we cannot tell, which is not the same thing — it must never
 * read as "deleted" (CLAUDE.md §6: "we cannot say" is not a reading).
 */

export type AccountProbe = 'gone' | 'present' | 'unknown';

const GONE_CODES = new Set(['user_not_found', 'session_not_found', 'refresh_token_not_found']);

interface AuthLikeError {
  status?: number;
  code?: string;
  name?: string;
}

/** Classify the answer of `auth.getUser()` after a lost deletion. */
export function classifyAccountProbe(
  user: unknown,
  error: AuthLikeError | null | undefined
): AccountProbe {
  if (!error) return user ? 'present' : 'gone';
  if (error.code && GONE_CODES.has(error.code)) return 'gone';
  // A session-less client (`AuthSessionMissingError`, status 400) asked
  // nobody, so it proves nothing about the account: falls through to unknown.
  if (error.status === 401 || error.status === 403 || error.status === 404) return 'gone';
  return 'unknown';
}

/** Ask the auth server; any throw is `unknown`, never `gone`. */
export async function probeAccount(client: {
  auth: { getUser: () => Promise<{ data: { user: unknown }; error: AuthLikeError | null }> };
}): Promise<AccountProbe> {
  try {
    const { data, error } = await client.auth.getUser();
    return classifyAccountProbe(data?.user ?? null, error);
  } catch {
    return 'unknown';
  }
}

/** Shown when the deletion's answer was lost and the account is still there. */
export const DELETION_NOT_FINISHED =
  'Tappet could not finish deleting your account. It is still here — try again in a moment.';

/** Shown when neither the deletion nor the check answered. */
export const DELETION_OUTCOME_UNKNOWN =
  'Tappet did not answer, so it cannot tell yet whether your account was deleted. Reload this page: if you are signed out, it was.';
