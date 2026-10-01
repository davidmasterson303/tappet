/**
 * A deep link's query, with anything malformed or oversized left behind
 * before React Navigation parses it.
 *
 * ── Audit 360, SEC-9 (1 Oct) · a crafted link froze the app ─────────────────
 *
 * `getStateFromPath` parses a link's query with `query-string`, which decodes
 * through `decode-uri-component` ≤ 0.4.2 (GHSA-vcc3-ghjq-m6fr). Well-formed
 * input takes the native `decodeURIComponent` fast path; malformed
 * percent-encoding falls into a repair loop that is super-linear in the input
 * — measured on node 1 Oct: 1,320 characters of `%ff` took 2.6 s, and the
 * phone's JS thread is slower. A `tappet://…?x=%ff%ff…` link in a message or
 * a page would hang the app on open.
 *
 * The fix that belongs to the dependency is a bump of `@react-navigation/*`
 * (a lockfile change, held for David). This is the JS-only guard that needs
 * nothing installed: every query part must decode natively, and the whole
 * query must be short, or the part (or the query) is dropped. The path —
 * which screen, which car — is untouched, so a link still lands where it
 * points. The one query the app sends itself, `?ask=` on the advisor, is
 * produced by `encodeURIComponent` and always survives.
 */
export const MAX_LINK_QUERY_LENGTH = 2_048;

function decodes(part: string): boolean {
  try {
    decodeURIComponent(part.replace(/\+/g, ' '));
    return true;
  } catch {
    return false;
  }
}

export function safeLinkPath(path: string): string {
  const mark = path.indexOf('?');
  if (mark === -1) return path;

  const base = path.slice(0, mark);
  const query = path.slice(mark + 1);
  if (query.length > MAX_LINK_QUERY_LENGTH) return base;

  const kept = query.split('&').filter((part) => part.length > 0 && decodes(part));
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}
