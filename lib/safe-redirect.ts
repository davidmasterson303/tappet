/**
 * Where a sign-in is allowed to send somebody afterwards: a path on this
 * site, or the garage.
 *
 * ── Two callers, one rule ───────────────────────────────────────────────────
 *
 * `/auth/callback` (the emailed link) and `/login` (the password form) both
 * read `?redirect=` and both act on it the moment a session exists. SEC-04
 * (24 Aug) closed the callback and kept its guard private to the route, so
 * the login form went on doing `router.push(searchParams.get('redirect'))`
 * — and Next's app router hands an absolute URL to `location.href`. A link
 * to `tappet.southmoordigital.com/login?redirect=https://evil.example`
 * showed the genuine address bar, took a real sign-in, and delivered the
 * owner to whatever page asked them to "confirm their password" (audit 360,
 * SEC-4, 1 Oct). One module now, so the second caller cannot drift from the
 * first.
 *
 * ── What is refused ─────────────────────────────────────────────────────────
 *
 * Anything that is not a single leading slash followed by a path:
 *
 *   - absolute URLs and schemes (`https:`, `javascript:`, `data:`) — they do
 *     not start with `/`;
 *   - `//evil.example` — protocol-relative, starts with a slash and is not a
 *     path;
 *   - `/\evil.example` — browsers normalise the backslash to a slash;
 *   - any control character — the URL parser strips tab, CR and LF before it
 *     reads, so `/\t/evil.example` arrives as `//evil.example`.
 */
export const DEFAULT_AFTER_SIGN_IN = '/garage';

export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_SIGN_IN;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_AFTER_SIGN_IN;
  if (!raw.startsWith('/')) return DEFAULT_AFTER_SIGN_IN;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN;
  return raw;
}
