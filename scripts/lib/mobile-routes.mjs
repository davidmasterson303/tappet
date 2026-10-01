/**
 * ── Every `/api/v1` route the phone calls (audit 360, TL-11, 1 Oct) ─────────
 *
 * `verify-mobile-contract.mjs` exercised three routes — `load-vehicle`,
 * `vehicles` and `consultant` — and the failures that have cost the most
 * time were on the others: a mobile build calling a route the deployed API
 * did not have yet answers **404**, CLAUDE.md §8's "most confusing shape a
 * bug can take". This list is what the script now probes, anonymously and
 * read-only, for "the route exists here" (anything but a 404 or an HTML page).
 *
 * `lib/__tests__/mobile-routes.test.ts` derives the same set from the phone's
 * source and fails when the two differ, so a new call on the phone is a red
 * test until it is listed here.
 */
export const MOBILE_ROUTES = [
  'account',
  'client-errors',
  'consultant',
  'consultant/conversations',
  'delete-maintenance-item',
  'document-url',
  'health',
  'iap/verify',
  'invoice-pages',
  'load-maintenance-data',
  'load-vehicle',
  'push-token',
  'recalls',
  'research',
  'tires',
  'tires/rotations',
  'upload-document',
  'upload-photo',
  'vehicle-removal',
  'vehicles',
  'wishlist',
  'wishlist/complete',
];

/**
 * Whether an anonymous GET's answer shows the route is deployed. A 401, a
 * 400 or a 405 all do; a 404 is a deployment that has never heard of the
 * path, and HTML is a host serving something other than this app.
 */
export function routeIsDeployed(status, contentType) {
  if (status === 404) return false;
  if (typeof contentType === 'string' && contentType.includes('text/html')) return false;
  return true;
}
