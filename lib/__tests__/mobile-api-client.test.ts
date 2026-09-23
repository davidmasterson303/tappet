/**
 * The only way the phone talks to Tappet.
 *
 * @jest-environment node
 *
 * `apps/mobile/src/api/client.ts` is the single chokepoint for every mobile
 * request — `mobile-api-only.test.ts` exists to keep it that way, statically.
 * This tests what it actually does.
 *
 * Same placement argument as `mobile-secure-storage.test.ts`: no React and no
 * React Native reach this file once `../auth/session` is mocked, so it runs in
 * the web suite rather than waiting on jest-expo. `../config` is mocked too, so
 * URL assertions do not depend on which deployment the app happens to point at.
 */

/* Module, not a global script — see the note in `mobile-session.test.ts`. */
export {};

jest.mock(
  '../../apps/mobile/src/config',
  () => ({ API_BASE_URL: 'https://example.test', API_PREFIX: '/api/v1' }),
  { virtual: true }
);

const getAccessToken = jest.fn<Promise<string | null>, []>();
jest.mock(
  '../../apps/mobile/src/auth/session',
  () => ({ getAccessToken: () => getAccessToken() }),
  { virtual: true }
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiRequest, ApiRequestError } = require('../../apps/mobile/src/api/client');

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

/** A `Response`-alike with only the members the client touches. */
function reply(
  status: number,
  body: unknown,
  { unparseable = false }: { unparseable?: boolean } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (unparseable) throw new SyntaxError('Unexpected token < in JSON');
      return body;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getAccessToken.mockResolvedValue('tok-123');
  fetchMock.mockResolvedValue(reply(200, { ok: true }));
});

describe('the signed-out short circuit', () => {
  it('throws 401 without sending a request', async () => {
    /*
      The behaviour the comment argues for: failing locally rather than
      round-tripping to read back a 401 we already know is coming. Asserting
      `fetch` was not called is the whole point — the thrown error alone would
      pass either way.
    */
    getAccessToken.mockResolvedValue(null);

    await expect(apiRequest('/vehicles')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does send the request when the endpoint allows anonymous callers', async () => {
    getAccessToken.mockResolvedValue(null);

    await apiRequest('/load-vehicle', { allowAnonymous: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    // No token, so no Authorization header at all — not an empty bearer.
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('reports 401 as unauthorized so callers can route to sign-in', async () => {
    getAccessToken.mockResolvedValue(null);

    await expect(apiRequest('/vehicles')).rejects.toMatchObject({ isUnauthorized: true });
  });
});

describe('the request it builds', () => {
  it('joins base, prefix and path', async () => {
    await apiRequest('/vehicles');
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/api/v1/vehicles');
  });

  it('sends the bearer token', async () => {
    await apiRequest('/vehicles');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123');
  });

  it('fetches the token per request rather than once', async () => {
    /*
      Load-bearing: `getAccessToken` returns the live session and refreshes an
      expired one, so a screen left open overnight must not reuse the token it
      mounted with. If this were hoisted to module scope the second call would
      carry a stale token and 401 — the exact symptom the session module's
      AppState refresher exists to prevent.
    */
    getAccessToken.mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await apiRequest('/vehicles');
    await apiRequest('/vehicles');

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer first');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer second');
  });

  it('defaults to GET with no body and no Content-Type', async () => {
    await apiRequest('/vehicles');
    const [, init] = fetchMock.mock.calls[0];

    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('serialises a body and declares its type', async () => {
    await apiRequest('/consultant', { method: 'POST', body: { vehicleId: 'v1' } });
    const [, init] = fetchMock.mock.calls[0];

    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"vehicleId":"v1"}');
  });

  it('treats an explicit null body as a body', async () => {
    // `body === undefined` is the test in the source, so `null` serialises.
    // Pinned because loosening it to `!body` would silently drop `0`, `''`
    // and `false` payloads too.
    await apiRequest('/thing', { method: 'POST', body: null });
    expect(fetchMock.mock.calls[0][1].body).toBe('null');
  });
});

describe('failures a phone actually hits', () => {
  it('separates an unreachable network from an HTTP error', async () => {
    /*
      Status 0 and a "check your connection" message. A phone loses
      connectivity constantly, and that instruction is actionable where
      "something went wrong" is not.
    */
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiRequest('/vehicles')).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach Tappet. Check your connection.',
    });
  });

  it('surfaces the server’s own message on an HTTP error', async () => {
    // Those messages are written to be shown, and are careful not to leak
    // whether a resource exists.
    fetchMock.mockResolvedValue(reply(404, { error: 'Vehicle not found' }));

    await expect(apiRequest('/load-vehicle')).rejects.toMatchObject({
      status: 404,
      message: 'Vehicle not found',
    });
  });

  it('falls back to the status when the error body is not a string', async () => {
    fetchMock.mockResolvedValue(reply(500, { error: { nested: true } }));

    await expect(apiRequest('/vehicles')).rejects.toMatchObject({
      status: 500,
      message: 'Tappet could not complete that. Try again in a moment.',
    });
  });

  it('carries the server’s code beside its message — E6’s wire', async () => {
    /*
      `lib/feature-gate.ts` returns `code: 'needs-subscription'` beside the
      refusal sentence and the routes forward it as 402. The screen keys on
      the code, not the number, so it has to survive the trip.
    */
    fetchMock.mockResolvedValue(
      reply(402, { error: 'The advisor is part of Tappet Plus.', code: 'needs-subscription', feature: 'advisor' })
    );

    await expect(apiRequest('/consultant', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 402,
      message: 'The advisor is part of Tappet Plus.',
      code: 'needs-subscription',
      needsSubscription: true,
    });
  });

  it('carries no code when the server sent none', async () => {
    // Anti-vacuous for the case above, and the ordinary shape of every error.
    fetchMock.mockResolvedValue(reply(404, { error: 'Vehicle not found' }));

    await expect(apiRequest('/load-vehicle')).rejects.toMatchObject({
      code: null,
      needsSubscription: false,
    });
  });

  it('reports the status, not a parse error, when a proxy returns HTML', async () => {
    /*
      The cold-start symptom recorded against /api/version: a 502 from an edge
      proxy arrives as HTML, and `response.json()` throwing on it would surface
      "Unexpected token <" instead of the 502 that actually matters.
    */
    fetchMock.mockResolvedValue(reply(502, null, { unparseable: true }));

    await expect(apiRequest('/vehicles')).rejects.toMatchObject({
      status: 502,
      message: 'Tappet could not complete that. Try again in a moment.',
    });
  });

  it('does not throw when a successful response has no JSON body', async () => {
    // A 204, or a 200 with an empty body. `readJson` returns null and the
    // caller gets null rather than an exception from the parser.
    fetchMock.mockResolvedValue(reply(200, null, { unparseable: true }));

    await expect(apiRequest('/thing')).resolves.toBeNull();
  });

  it('is an ApiRequestError, named, in every failure path', async () => {
    // Callers branch on `instanceof` and on `.name`; SignedInScreen reads
    // `.status` off it directly.
    fetchMock.mockRejectedValue(new TypeError('down'));

    const error = await apiRequest('/vehicles').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as Error).name).toBe('ApiRequestError');
  });

  it('marks only 401 as unauthorized', async () => {
    for (const [status, expected] of [[401, true], [403, false], [500, false]] as const) {
      fetchMock.mockResolvedValue(reply(status, { error: 'no' }));
      await expect(apiRequest('/vehicles')).rejects.toMatchObject({
        isUnauthorized: expected,
      });
    }
  });
});

/**
 * ── The two habits — QE §3, 20 Sep ──────────────────────────────────────────
 *
 * Every screen re-reads on focus and the runner polls, so the same GET is
 * routinely asked for twice within a few hundred milliseconds; and a phone
 * drops a request for no reason often enough that the first failure is
 * usually not the answer. Reads join an in-flight twin and retry once on
 * transport; writes do neither, because a write whose answer was lost may
 * have been applied.
 */
describe('one GET in flight per path', () => {
  /** A fetch that answers when told to, so two requests can overlap. */
  function deferred() {
    let release: (value: unknown) => void = () => {};
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }

  it('joins a second request for a path that is already being fetched', async () => {
    const first = deferred();
    fetchMock.mockReturnValueOnce(first.promise);

    const a = apiRequest('/load-vehicle?vehicleId=v1');
    const b = apiRequest('/load-vehicle?vehicleId=v1');
    first.release(reply(200, { vehicle: { id: 'v1' } }));

    expect(await a).toEqual({ vehicle: { id: 'v1' } });
    expect(await b).toEqual({ vehicle: { id: 'v1' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not join a request for a different path, or one that has finished', async () => {
    await apiRequest('/vehicles');
    await apiRequest('/vehicles');
    await apiRequest('/wishlist?vehicleId=v1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never joins a write to a write', async () => {
    const first = deferred();
    fetchMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply(200, { second: true }));

    const a = apiRequest('/wishlist', { method: 'POST', body: { item: 1 } });
    const b = apiRequest('/wishlist', { method: 'POST', body: { item: 1 } });
    first.release(reply(200, { first: true }));

    expect(await a).toEqual({ first: true });
    expect(await b).toEqual({ second: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a GET asked after a write does not join one that started before it', async () => {
    /*
      The post-write reload must read the row as it is now. A join here
      would hand it the response to a request sent before the write — the
      stale ADDED state QE 1.2 was about, re-created inside the client.
    */
    const stale = deferred();
    fetchMock
      .mockReturnValueOnce(stale.promise) // the GET in flight
      .mockResolvedValueOnce(reply(200, { written: true })) // the write
      .mockResolvedValueOnce(reply(200, { fresh: true })); // the reload

    const before = apiRequest('/wishlist?vehicleId=v1');
    await new Promise((resolve) => setTimeout(resolve, 2)); // the clock must move past the GET's start
    await apiRequest('/wishlist', { method: 'POST', body: { item: 1 } });
    const after = apiRequest('/wishlist?vehicleId=v1');
    stale.release(reply(200, { stale: true }));

    expect(await before).toEqual({ stale: true });
    expect(await after).toEqual({ fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('one retry, for a read that failed in transport', () => {
  it('retries a GET once when the network dropped it, and returns the second answer', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(reply(200, { vehicles: [] }));

    expect(await apiRequest('/vehicles')).toEqual({ vehicles: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a GET once on a gateway status, and surfaces the second failure', async () => {
    fetchMock.mockResolvedValue(reply(503, { error: 'Function cold' }));

    await expect(apiRequest('/vehicles')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a write — it may already have been applied', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(apiRequest('/wishlist', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'offline' });
    await expect(apiRequest('/vehicles', { method: 'PATCH', body: {} })).rejects.toMatchObject({ kind: 'offline' });
    await expect(apiRequest('/account', { method: 'DELETE' })).rejects.toMatchObject({ kind: 'offline' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a status the server decided, or a signed-out short circuit', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: 'No such car' }));
    await expect(apiRequest('/vehicles')).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(reply(500, { error: 'Ours' }));
    await expect(apiRequest('/vehicles')).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    getAccessToken.mockResolvedValue(null);
    await expect(apiRequest('/vehicles')).rejects.toMatchObject({ isLocallySignedOut: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry a timeout — twenty seconds are already spent', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      })
    );

    await expect(apiRequest('/vehicles', { timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
