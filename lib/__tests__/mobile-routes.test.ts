/**
 * Audit 360, TL-11 (1 Oct) — the contract check probes every route the phone
 * calls, and the list cannot fall behind the phone.
 *
 * @jest-environment node
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { MOBILE_ROUTES, routeIsDeployed } from '../../scripts/lib/mobile-routes.mjs';

const ROOT = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Every quoted `/path` in the text that names an `app/api/v1` route. */
function routesNamedIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of Array.from(text.matchAll(/[`'"]\/([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)(?=[?`'"$])/g))) {
    if (existsSync(join(ROOT, 'app', 'api', 'v1', match[1], 'route.ts'))) found.add(match[1]);
  }
  return Array.from(found);
}

describe('MOBILE_ROUTES', () => {
  const files = sources(join(ROOT, 'apps', 'mobile', 'src'));
  const called = new Set(files.flatMap((file) => routesNamedIn(readFileSync(file, 'utf8'))));

  it('found the phone’s sources and its calls', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(called.size).toBeGreaterThan(10);
  });

  it('is exactly the set of v1 routes the phone names', () => {
    expect([...MOBILE_ROUTES].sort()).toEqual(Array.from(called).sort());
  });

  it('can still detect a call (anti-vacuous)', () => {
    expect(routesNamedIn("apiRequest('/upload-document', {")).toEqual(['upload-document']);
    expect(routesNamedIn('apiRequest(`/load-vehicle?vehicleId=${id}`)')).toEqual(['load-vehicle']);
    expect(routesNamedIn("apiRequest('/not-a-route')")).toEqual([]);
  });

  it('is probed by the contract script', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'verify-mobile-contract.mjs'), 'utf8');
    expect(script).toMatch(/for \(const route of MOBILE_ROUTES\)/);
    expect(script).toMatch(/^await checkEveryPhoneRouteIsDeployed\(\);$/m);
  });
});

describe('routeIsDeployed', () => {
  it('reads a refusal as deployed and a 404 or an HTML page as not', () => {
    expect(routeIsDeployed(401, 'application/json')).toBe(true);
    expect(routeIsDeployed(400, 'application/json')).toBe(true);
    expect(routeIsDeployed(405, null)).toBe(true);
    expect(routeIsDeployed(404, 'application/json')).toBe(false);
    expect(routeIsDeployed(200, 'text/html; charset=utf-8')).toBe(false);
  });
});
