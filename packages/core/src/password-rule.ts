/**
 * The password floor, as the account system enforces it.
 *
 * Six: Supabase's project minimum, which the web's `/signup` and
 * `/reset-password` already refuse under (`password.length < 6`). The phone's
 * create form states it before the press (audit 360, UX-10) rather than
 * letting Supabase's sentence be the first an owner hears of it.
 *
 * `lib/__tests__/password-rule.test.ts` reads both web pages so the three
 * statements of the number cannot drift apart silently.
 */
export const PASSWORD_MIN_LENGTH = 6;
