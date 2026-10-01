import { getStateFromPath } from '@react-navigation/native';

import { linking } from '../RootNavigator';
import { MAX_LINK_QUERY_LENGTH, safeLinkPath } from '../safe-link-path';

/**
 * Audit 360, SEC-9 (1 Oct) — a crafted deep link cannot reach the
 * library's slow decoder.
 *
 * `query-string` → `decode-uri-component` ≤ 0.4.2 is super-linear on
 * malformed percent-encoding (GHSA-vcc3-ghjq-m6fr; 1,320 chars of `%ff`
 * measured 2.6 s on node). No timing here — a timing test flakes under load
 * — so the tests prove the malformed query never reaches the parser, and
 * that the unguarded parser would have taken it.
 */

const MALFORMED = '%ff'.repeat(400);

/** Every param on every route in a parsed state, flattened. */
function params(state: unknown): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  const walk = (node: { routes?: Array<{ params?: Record<string, unknown>; state?: unknown }> } | undefined) => {
    for (const route of node?.routes ?? []) {
      Object.assign(found, route.params ?? {});
      walk(route.state as never);
    }
  };
  walk(state as never);
  return found;
}

describe('safeLinkPath', () => {
  it('leaves a link the app sends untouched', () => {
    const ask = `vehicle/abc/advisor?ask=${encodeURIComponent('What does P0420 mean?')}`;
    expect(safeLinkPath(ask)).toBe(ask);
    expect(safeLinkPath('vehicle/abc/recalls')).toBe('vehicle/abc/recalls');
  });

  it('drops a part that does not decode, and keeps the rest', () => {
    expect(safeLinkPath(`vehicle/abc/advisor?x=${MALFORMED}&ask=hi`)).toBe('vehicle/abc/advisor?ask=hi');
    expect(safeLinkPath('vehicle/abc/advisor?x=%E0%A4')).toBe('vehicle/abc/advisor');
  });

  it('drops an oversized query whole, keeping the path', () => {
    const long = `vehicle/abc/advisor?ask=${'a'.repeat(MAX_LINK_QUERY_LENGTH + 1)}`;
    expect(safeLinkPath(long)).toBe('vehicle/abc/advisor');
  });
});

describe('the linking config uses it', () => {
  it('a malformed query is gone before the library parses it — the finding', () => {
    const path = `vehicle/abc/advisor?x=${MALFORMED.slice(0, 30)}`;

    // Anti-vacuous: unguarded, the library hands the malformed value to its decoder.
    expect(params(getStateFromPath(path, linking.config as never))).toHaveProperty('x');

    expect(linking.getStateFromPath).toBeDefined();
    const guarded = params(linking.getStateFromPath!(path, linking.config as never));
    expect(guarded).not.toHaveProperty('x');
    expect(guarded).toMatchObject({ vehicleId: 'abc' });
  });

  it('a well-formed ask still arrives', () => {
    const state = linking.getStateFromPath!(
      `vehicle/abc/advisor?ask=${encodeURIComponent('Is this recall mine?')}`,
      linking.config as never
    );
    expect(params(state)).toMatchObject({ vehicleId: 'abc', ask: 'Is this recall mine?' });
  });
});
