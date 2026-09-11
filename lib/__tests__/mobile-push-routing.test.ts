/**
 * A notification can open a screen. It must not open the internet.
 *
 * @jest-environment node
 *
 * Phase 5 routes a tapped push through the navigator's existing `linking`
 * config by reading `data.url` off the payload. That field is the one input in
 * the mobile client that **arrives over the network and is then acted on**, so
 * it is the one place an open redirect could exist: an `https://` value there
 * would send someone to an arbitrary website from a notification that looks
 * like it came from their own garage.
 *
 * `notificationUrl` is therefore an allowlist of one scheme, and this is what
 * holds it there.
 *
 * The cold-start reader is covered too, because it is the journey that gets
 * missed. An app opened *by* a notification tap has no `Linking` url — it was
 * not opened by a link — so a client that only listens for taps at runtime
 * routes perfectly while backgrounded and does nothing at all from cold.
 */

/* Module, not a global script — see the note in `mobile-session.test.ts`. */
export {};

const getLastNotificationResponseAsync = jest.fn();
const addNotificationResponseReceivedListener = jest.fn();

jest.mock(
  'expo-notifications',
  () => ({
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getLastNotificationResponseAsync: () => getLastNotificationResponseAsync(),
    addNotificationResponseReceivedListener: (handler: unknown) =>
      addNotificationResponseReceivedListener(handler),
  }),
  { virtual: true }
);

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  notificationUrl,
  initialNotificationUrl,
  subscribeToNotificationTaps,
} = require('../../apps/mobile/src/notifications/push');

/* MOB-07's source scan reads the navigator off disk — see the last describe. */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
/* eslint-enable @typescript-eslint/no-var-requires */

/** A notification carrying `data.url`, shaped as expo-notifications delivers it. */
function notification(data: unknown) {
  return { request: { content: { data } } };
}

beforeEach(() => jest.clearAllMocks());

describe('notificationUrl', () => {
  it('accepts an in-app link', () => {
    expect(notificationUrl(notification({ url: 'tappet://vehicle/abc/advisor' }))).toBe(
      'tappet://vehicle/abc/advisor'
    );
  });

  it.each([
    ['https://evil.example/phish', 'a website'],
    ['http://evil.example', 'an insecure website'],
    ['javascript:alert(1)', 'a script url'],
    ['file:///etc/passwd', 'a local file'],
    ['TAPPET://vehicle/abc', 'a case-shifted scheme'],
    [' tappet://vehicle/abc', 'a leading space that hides the scheme'],
    ['//tappet://vehicle/abc', 'a protocol-relative prefix'],
  ])('refuses %s (%s)', (url) => {
    /*
      Each of these would otherwise be handed to the navigator's linking
      handler. The case-shifted and space-prefixed ones matter most: they are
      what a filter written with `includes('tappet://')` would let through,
      and `startsWith` on the raw string is what makes them fail.
    */
    expect(notificationUrl(notification({ url }))).toBeNull();
  });

  /*
    Typed as `unknown[][]` rather than left to inference. `it.each` widens a
    heterogeneous table into a union of tuples, and a callback taking fewer
    parameters than the widest row fails `tsc --noEmit` while passing under
    Jest's transform — the same green-here-red-there shape this project keeps
    hitting.
  */
  const malformed: unknown[][] = [
    [undefined, 'no data at all'],
    [{}, 'data without a url'],
    [{ url: 42 }, 'a non-string url'],
    [{ url: null }, 'a null url'],
  ];

  it.each(malformed)('returns null for %s (%s)', (data) => {
    expect(notificationUrl(notification(data))).toBeNull();
  });

  it('survives a malformed notification rather than throwing', () => {
    // These arrive from the OS, not from us. A throw here happens inside a
    // navigation listener where nothing is going to catch it.
    expect(notificationUrl(null)).toBeNull();
    expect(notificationUrl(undefined)).toBeNull();
    expect(notificationUrl({} as never)).toBeNull();
  });
});

describe('initialNotificationUrl — the cold start', () => {
  it('reads the notification the app was opened by', async () => {
    getLastNotificationResponseAsync.mockResolvedValue({
      notification: notification({ url: 'tappet://vehicle/xyz' }),
    });

    await expect(initialNotificationUrl()).resolves.toBe('tappet://vehicle/xyz');
  });

  it('returns null when the app was opened normally', async () => {
    getLastNotificationResponseAsync.mockResolvedValue(null);
    await expect(initialNotificationUrl()).resolves.toBeNull();
  });

  it('applies the same scheme rule as a live tap', async () => {
    // The cold path is a second entry point for the same untrusted field, and
    // is exactly where a duplicated check would drift.
    getLastNotificationResponseAsync.mockResolvedValue({
      notification: notification({ url: 'https://evil.example' }),
    });

    await expect(initialNotificationUrl()).resolves.toBeNull();
  });

  it('does not take the app down if the OS call fails', async () => {
    getLastNotificationResponseAsync.mockRejectedValue(new Error('no notification centre'));
    await expect(initialNotificationUrl()).resolves.toBeNull();
  });
});

describe('subscribeToNotificationTaps', () => {
  it('forwards a valid url and unsubscribes cleanly', () => {
    const remove = jest.fn();
    let captured: ((response: unknown) => void) | undefined;
    addNotificationResponseReceivedListener.mockImplementation((handler: (r: unknown) => void) => {
      captured = handler;
      return { remove };
    });

    const handler = jest.fn();
    const unsubscribe = subscribeToNotificationTaps(handler);

    captured?.({ notification: notification({ url: 'tappet://garage' }) });
    expect(handler).toHaveBeenCalledWith('tappet://garage');

    // A url that fails the scheme rule must not reach the navigator at all.
    handler.mockClear();
    captured?.({ notification: notification({ url: 'https://evil.example' }) });
    expect(handler).not.toHaveBeenCalled();

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });
});

/**
 * ── MOB-07: a cold-start tap must not be a dead end ─────────────────────────
 *
 * @jest-environment node
 *
 * Without an `initialRouteName`, a link opened from a **cold start** produces a
 * stack with exactly one route: no back button, the edge-swipe gesture does
 * nothing, `goBack()` is a no-op. The only exit is force-quitting.
 *
 * That is the flagship path. A recall notification says *"Tap to see what it
 * means"*, and this product delivered its first real ones on 16 Aug — so the
 * journey most likely to be somebody's first was the one with no way out.
 *
 * ── ⚠ 11 Sep · two levels, and the seed has to be at the right one ──────────
 *
 * The navigator is a tree now — a root stack over four tabs, each with a
 * stack — and the linking config mirrors it. So there are two seeds and each
 * does one job: `initialRouteName: 'Tabs'` on the root config, so `account`
 * opens over the tabs; and `initialRouteName: 'Garage'` on the **garage tab's**
 * config, so a link to a car or its recalls has the garage beneath it.
 *
 * ⚠ The second is the one that can be got wrong silently. Moved up to the root
 * config it names a route the root stack does not have, type-checks anyway,
 * and seeds nothing — and the first version of this guard, which asked only
 * that the string appear before `screens: {`, would have kept passing. It is
 * pinned instead to the object that registers `vehicle/:vehicleId`.
 *
 * A source scan because there is no React Native runtime on this side of the
 * workspace, and because what regressed is one declarative line in a config
 * object rather than anything a render would reach.
 */

/**
 * The object literal `levels` braces out from `at` — `1` is the object the
 * position sits in, `2` its parent, and so on. Text from its `{` to its
 * matching `}`.
 *
 * A path lives inside a `screens: { … }` map, so the config object that owns
 * that map is two levels out.
 */
function enclosingObject(source: string, at: number, levels: number): string {
  let open = at;

  for (let level = 0; level < levels; level += 1) {
    let depth = 0;
    let found = -1;

    for (let i = open - 1; i >= 0; i -= 1) {
      const character = source[i];
      if (character === '}') depth += 1;
      else if (character === '{') {
        if (depth === 0) {
          found = i;
          break;
        }
        depth -= 1;
      }
    }

    if (found === -1) return '';
    open = found;
  }

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const character = source[i];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }

  return '';
}

/** The config object that registers `path`, or `''` when nothing does. */
function configRegistering(source: string, path: string): string {
  const at = source.indexOf(`'${path}'`);
  return at === -1 ? '' : enclosingObject(source, at, 2);
}

/** The whole linking declaration, from the first per-tab config to `subscribe`. */
function linkingRegion(source: string): string {
  const start = source.indexOf('const garageLinks');
  const end = source.indexOf('subscribe(listener)', start);
  return start === -1 || end === -1 ? '' : source.slice(start, end);
}

describe('the linking config seeds a stack', () => {
  const navigator = readFileSync(
    join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'navigation', 'RootNavigator.tsx'),
    'utf8'
  );
  const region = linkingRegion(navigator);

  it('finds the linking declaration at all', () => {
    // The anti-vacuous half for the cases below: an empty region satisfies
    // nothing, but it also proves nothing.
    expect(region.length).toBeGreaterThan(0);
    expect(region).toContain("prefixes: ['tappet://']");
  });

  it('seeds the tabs under a cold-started account link', () => {
    const config = region.slice(region.indexOf('config: {'));

    expect(config).toMatch(/initialRouteName: 'Tabs'/);
    // On the root config itself — before its screens map, not inside a tab's.
    expect(config.indexOf("initialRouteName: 'Tabs'")).toBeLessThan(config.indexOf('screens: {'));
  });

  it('seeds the garage under a cold-started car or recall link', () => {
    /*
      ⚠ Pinned to the object that owns the path, not to a position in the file.
      Both notification paths — the car and its recalls — live in the garage
      tab's config, and that config is the one that must name the garage.
    */
    const garage = configRegistering(region, 'vehicle/:vehicleId');
    const recalls = configRegistering(region, 'vehicle/:vehicleId/recalls');

    expect(garage.length).toBeGreaterThan(0);
    expect(garage).toMatch(/initialRouteName: 'Garage'/);
    expect(recalls).toBe(garage);
  });

  it('can still detect the seed at the wrong level', () => {
    /*
      A config shaped like the real one with the garage's seed hoisted to the
      root — which is what the old position-based check could not see.
    */
    const hoisted = `
      const linking = {
        config: {
          initialRouteName: 'Garage',
          screens: {
            Tabs: {
              screens: {
                GarageTab: {
                  screens: {
                    Garage: 'garage',
                    VehicleDetail: 'vehicle/:vehicleId',
                  },
                },
              },
            },
          },
        },
      };
    `;

    const garage = configRegistering(hoisted, 'vehicle/:vehicleId');
    expect(garage.length).toBeGreaterThan(0);
    expect(garage).not.toMatch(/initialRouteName/);
  });
});
