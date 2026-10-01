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
 * longer exists with 403 `user_not_found` — it looks the user up before the
 * session, so a deleted account names itself. **That is the only answer that
 * means gone.** A network failure (no status) or a 5xx means we cannot tell,
 * which is not the same thing — it must never read as "deleted" (CLAUDE.md
 * §6: "we cannot say" is not a reading).
 *
 * ⚠ Audit 360, SEC-16 (round 3). This also read `session_not_found`,
 * `refresh_token_not_found` and any bare 401/403/404 as gone. Each of those
 * is an answer about the *session*, and a living account produces all of
 * them: "sign out everywhere", a revoked or rotated refresh token, a signing
 * key that no longer verifies. Production, 1 Oct, with the publishable key
 * and no account involved at all: `GET /auth/v1/user` with a malformed JWT
 * answers **403 `bad_jwt`**, and a refresh with a 12-character token nobody
 * issued answers **400 `refresh_token_not_found`**. The dialog then signed
 * the owner out and said every row and file was deleted while all of it was
 * still stored. Those are `unknown` now, with the "reload this page" sentence.
 */

export type AccountProbe = 'gone' | 'present' | 'unknown';

const GONE_CODES = new Set(['user_not_found']);

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
  // No error and no user is an answer nobody gave: not a reading of "gone".
  if (!error) return user ? 'present' : 'unknown';
  if (error.code && GONE_CODES.has(error.code)) return 'gone';
  // Everything else — a session-less client (`AuthSessionMissingError`), a
  // revoked session, a refresh token not found, a JWT that does not verify,
  // a 5xx — is about the session or the server, not the account.
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
