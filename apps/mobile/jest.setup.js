/**
 * What every mobile screen test needs before it can mount anything.
 *
 * Kept deliberately small. A setup file that stubs half the app produces tests
 * that pass against the stubs — which is the failure `tests-test-real-code.test.ts`
 * exists to prevent in the web suite, and it would be easier to commit here
 * because React Native genuinely does need some mocking.
 *
 * The rule: mock what the **host platform** provides and Node does not. Never
 * mock Tappet's own modules here — a test that needs `apiRequest` stubbed
 * should say so itself, where the reader can see it.
 */

/* eslint-env jest */

/**
 * ── An un-awaited RNTL call fails the test that made it ─────────────────────
 *
 * **RNTL 14's `render`, `fireEvent` and `userEvent` are all async.** Drop an
 * `await` and the damage is silent, permanent and lands somewhere else:
 *
 * Each of them wraps its work in `React.act`. `act` increments a module-scoped
 * `actScopeDepth`, parks the work on `ReactSharedInternals.actQueue`, and only
 * unwinds both when the thenable it returns is awaited. Two un-awaited calls
 * in the same tick overlap, and the pops then arrive out of order — the last
 * one restores the depth to a *non-zero* value. From that point on every
 * `act()` in the file captures `prevActScopeDepth !== 0`, takes the branch that
 * skips `flushActQueue`, and leaves its render work on a queue nobody drains.
 * `render()` returns a root that never committed and `toJSON()` is `null`.
 *
 * Nothing throws. `contrast.test.tsx` ran blind below one such call from 8 to
 * 15 August 2026, and because its assertions all read
 * `expect(belowFloor(...)).toEqual([])`, every test added there passed on an
 * empty audit. `await act(async () => {})` does not repair it — that call sees
 * the same non-zero depth. Only a fresh module registry clears it, which is
 * why moving a test to another file "fixed" it.
 *
 * So the leak is turned into a failure attributed to the test that caused it.
 * Two signals, because neither alone is complete: React's own warning names the
 * mistake, and the leaked queue catches a corruption React did not warn about
 * (`didWarnNoAwaitAct` is one-shot per registry).
 */
const ACT_LEAK = /overlapping act\(\) calls|without await|call was not awaited/;
const reactInternals =
  require('react').__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

let actWarnings = [];
const passThroughConsoleError = console.error;

console.error = (...args) => {
  if (typeof args[0] === 'string' && ACT_LEAK.test(args[0])) {
    actWarnings.push(args[0].trim());
  }
  passThroughConsoleError(...args);
};

beforeEach(() => {
  actWarnings = [];
});

afterEach(() => {
  const warnings = actWarnings;
  actWarnings = [];

  // Read before asserting: a throw here would leave it set for the next test,
  // which would then fail for a leak it did not cause.
  const leakedQueue = reactInternals?.actQueue ?? null;
  if (reactInternals) reactInternals.actQueue = null;

  if (warnings.length === 0 && leakedQueue === null) return;

  throw new Error(
    "React's act scope was left open by this test, which stops every later " +
      '`render` in this file from committing — they return a tree whose ' +
      '`toJSON()` is null, and an assertion on nothing passes.\n\n' +
      'Await every `render`, `fireEvent.*` and `userEvent.*` call. All three ' +
      'are async in RNTL 14.\n\n' +
      (warnings.length > 0
        ? `React reported:\n  ${warnings.join('\n  ')}`
        : 'React left work queued on `actQueue` without reporting it.')
  );
});

/*
  Native modules with no JS implementation off-device. Each one is required by
  a screen's import graph rather than by the test, so an unmocked one fails at
  collection with an error about the native side being missing — which reads
  as a broken test rather than a missing stub.
*/
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: {
    Automatic: 'automatic',
    Compatible: 'compatible',
    Current: 'current',
  },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

/*
  ── `expo-camera`, as the viewfinder sees it ────────────────────────────────

  `Viewfinder.tsx` imports the module directly (its docblock says why the
  `pickImage` seam does not extend to it), so every screen test that mounts
  the scan mounts a camera. The stub answers the way a phone with a camera and
  a granted permission does: the permission hook says granted, the view
  reports ready on mount, the lens query finds the wide lens, and a capture
  resolves a JPEG. `InvoiceScanScreen.test.tsx` turns each of those the other
  way through `__camera` — a denied permission, no lens, a rejected capture —
  which is what makes the readout's words testable without a device.

  `CameraView` is a class in the real module and the viewfinder calls methods
  on its ref, so the stub is a `forwardRef` exposing the same two methods; the
  stub's `onCameraReady` fires from an effect so the "ready" path runs in the
  same order it does natively (mount, then the event).
*/
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const __camera = {
    permission: { status: 'granted', granted: true, canAskAgain: true, expires: 'never' },
    requestPermission: jest.fn(async () => __camera.permission),
    getAvailableLensesAsync: jest.fn(async () => ['Back Camera']),
    takePictureAsync: jest.fn(async () => ({
      uri: 'file:///tmp/capture.jpg',
      width: 3024,
      height: 4032,
      format: 'jpg',
    })),
    /** Whether the stub view reports ready on mount. */
    ready: true,
    reset() {
      __camera.permission = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
      __camera.ready = true;
      __camera.requestPermission.mockReset().mockImplementation(async () => __camera.permission);
      __camera.getAvailableLensesAsync.mockReset().mockResolvedValue(['Back Camera']);
      __camera.takePictureAsync.mockReset().mockResolvedValue({
        uri: 'file:///tmp/capture.jpg',
        width: 3024,
        height: 4032,
        format: 'jpg',
      });
    },
  };

  const CameraView = React.forwardRef(function CameraView(props, ref) {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: (...args) => __camera.takePictureAsync(...args),
      getAvailableLensesAsync: () => __camera.getAvailableLensesAsync(),
    }));
    const { onCameraReady } = props;
    React.useEffect(() => {
      if (__camera.ready) onCameraReady?.();
    }, [onCameraReady]);
    return React.createElement(View, { testID: 'camera-view', style: props.style });
  });

  return {
    CameraView,
    /*
      The hook's tuple: the current answer (`null` for the first frame, as the
      real hook), a request that resolves the stub's answer, and a get.
    */
    useCameraPermissions: jest.fn(() => {
      const [answer, setAnswer] = React.useState(null);
      React.useEffect(() => {
        setAnswer(__camera.permission);
      }, []);
      const request = React.useCallback(async () => {
        const next = await __camera.requestPermission();
        setAnswer(next);
        return next;
      }, []);
      const get = React.useCallback(async () => __camera.permission, []);
      return [answer, request, get];
    }),
    __camera,
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

/*
  `expo-constants` carries the app.json `extra` block, which `auth/supabase.ts`
  reads at import and throws without. The values are the public ones already in
  app.json — they identify the project and grant nothing on their own — but
  they are written here rather than imported so a test never depends on which
  deployment the checked-in config happens to point at.
*/
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        apiBaseUrl: 'https://example.test',
        supabaseUrl: 'https://example.supabase.test',
        supabasePublishableKey: 'test-publishable-key',
      },
    },
  },
}));

/*
  The Supabase client opens timers and a websocket at import. Screens reach it
  only through `auth/session`, and none of them should be talking to it
  directly — `mobile-api-only.test.ts` enforces exactly that — so a stub here
  keeps a mounted screen from holding the event loop open after a test ends.
*/
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
  }),
}));

/*
  ── `expo-iap` — the App Store, off-device ───────────────────────────────────

  A native module with no JS fallback: its `import` is harmless (the module is
  resolved lazily through a Proxy) but the first real call throws `Cannot find
  native module 'ExpoIap'` — reproduced under this runner on 12 Sep, which is
  the same absence Expo Go has. `src/api/store.ts` is the only importer.

  Two things beyond the image-picker pattern above, both because the package
  is **event-driven**: a purchase is delivered on `purchaseUpdatedListener` and
  a failure on `purchaseErrorListener`, never as a return value. So the mock
  keeps a listener set per event, and exposes `__emit(event, payload)` so a
  test can deliver one the way the native side would — and `__listenerCount`
  so it can prove the adapter unsubscribed afterwards. Both are test-only and
  prefixed to say so; nothing in `src/` may reach for them.

  Availability is not mocked here. The adapter asks
  `requireOptionalNativeModule('ExpoIap')` from `expo`, which under this
  runner answers `null` — "this build cannot buy" — exactly as Expo Go does.
  A test that needs a store present mocks `expo` itself and says so.
*/
jest.mock('expo-iap', () => {
  const listeners = {
    'purchase-updated': new Set(),
    'purchase-error': new Set(),
  };
  const subscribe = (event) => (listener) => {
    listeners[event].add(listener);
    return { remove: () => listeners[event].delete(listener) };
  };

  return {
    __esModule: true,
    ErrorCode: {
      AlreadyOwned: 'already-owned',
      DeferredPayment: 'deferred-payment',
      NetworkError: 'network-error',
      Pending: 'pending',
      PurchaseError: 'purchase-error',
      UserCancelled: 'user-cancelled',
    },
    initConnection: jest.fn(async () => true),
    endConnection: jest.fn(async () => true),
    fetchProducts: jest.fn(async () => []),
    requestPurchase: jest.fn(async () => []),
    finishTransaction: jest.fn(async () => undefined),
    restorePurchases: jest.fn(async () => undefined),
    getAvailablePurchases: jest.fn(async () => []),
    purchaseUpdatedListener: jest.fn(subscribe('purchase-updated')),
    purchaseErrorListener: jest.fn(subscribe('purchase-error')),
    __emit: (event, payload) => {
      for (const listener of [...listeners[event]]) listener(payload);
    },
    __listenerCount: (event) => listeners[event].size,
  };
});
