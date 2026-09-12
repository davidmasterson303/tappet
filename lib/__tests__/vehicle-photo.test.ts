/**
 * The mobile contract's photo guarantee.
 *
 * @jest-environment node
 *
 * `/api/v1/load-vehicle` used to `select('*')`, which handed a caller the raw
 * `custom_image_url` column — a `placeholder://` storage path that no client
 * outside this repo can resolve. Phase 2.9 item 4.
 *
 * The guarantee is narrow and worth stating exactly: whatever happens, the
 * resolved value is a URL something can render, or null. Never the stored
 * scheme. These tests exist because that is a promise to a client that does
 * not exist yet and therefore cannot complain.
 */

import { clearVehiclePhoto, platePresence, resolveVehiclePhoto, resolveVehiclePhotos } from '../vehicle-photo';
import { STORED_URL_SCHEME, storedUrl } from '@tappet/core/storage-paths';
import { DEMO_UNPHOTOGRAPHED_VEHICLE_IDS } from '@tappet/core/demo';

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_VEHICLE_ID = '22222222-2222-4222-8222-222222222222';

/** A Supabase stand-in whose signing outcome each test chooses. */
function clientThatSigns(outcome: { url?: string; error?: unknown; throws?: boolean }) {
  return {
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          if (outcome.throws) throw new Error('network');
          if (outcome.error) return { data: null, error: outcome.error };
          return { data: { signedUrl: outcome.url }, error: null };
        },
      }),
    },
  } as never;
}

describe('resolveVehiclePhoto', () => {
  it('signs an owner photo stored as a path', async () => {
    const result = await resolveVehiclePhoto(
      VEHICLE_ID,
      { custom_image_url: storedUrl(`${VEHICLE_ID}/photos/car.jpg`), image_url: '/vehicles/stock.jpg' },
      clientThatSigns({ url: 'https://signed.example/car.jpg?token=abc' })
    );

    expect(result).toBe('https://signed.example/car.jpg?token=abc');
  });

  it('prefers the owner photo over the stock image, matching useVehicleImage', async () => {
    const result = await resolveVehiclePhoto(
      VEHICLE_ID,
      { custom_image_url: storedUrl(`${VEHICLE_ID}/photos/mine.jpg`), image_url: '/vehicles/stock.jpg' },
      clientThatSigns({ url: 'https://signed.example/mine.jpg' })
    );

    expect(result).not.toBe('/vehicles/stock.jpg');
  });

  it('passes through a value that is already renderable', async () => {
    const result = await resolveVehiclePhoto(
      VEHICLE_ID,
      { custom_image_url: null, image_url: '/vehicles/accord.jpg' },
      clientThatSigns({ url: 'unused' })
    );

    expect(result).toBe('/vehicles/accord.jpg');
  });

  it('returns null when there is no photo at all', async () => {
    const result = await resolveVehiclePhoto(
      VEHICLE_ID,
      { custom_image_url: null, image_url: null },
      clientThatSigns({ url: 'unused' })
    );

    expect(result).toBeNull();
  });

  it('no demo car is carved out any more — the M3 resolves to its own plate (12 Sep)', async () => {
    /*
      The M3 stood bare so the demo showed the empty state. Now every car
      without a photograph gets a generated plate, so the bare bay is a wait,
      not a home — the list is empty and the carve-out resolves nothing. The
      mechanism stays: the day an id goes back into the list, this is the case
      that changes.
    */
    expect(DEMO_UNPHOTOGRAPHED_VEHICLE_IDS).toHaveLength(0);
    const result = await resolveVehiclePhoto(
      'a3000000-0000-0000-0000-000000000003',
      { custom_image_url: null, image_url: '/vehicles/m3/hero-3x2.jpg' },
      clientThatSigns({ url: 'unused' })
    );
    expect(result).toBe('/vehicles/m3/hero-3x2.jpg');
  });

  /*
    The security half. A signed URL bypasses RLS for its lifetime, so a row
    whose custom_image_url points at another vehicle's object must not get that
    object signed under this vehicle's proven ownership.
  */
  it('refuses to sign a path scoped to a different vehicle', async () => {
    const result = await resolveVehiclePhoto(
      VEHICLE_ID,
      {
        custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/not-mine.jpg`),
        image_url: '/vehicles/stock.jpg',
      },
      clientThatSigns({ url: 'https://signed.example/LEAKED.jpg' })
    );

    expect(result).toBe('/vehicles/stock.jpg');
    expect(result).not.toContain('LEAKED');
  });

  describe('never emits the stored scheme', () => {
    const cases: Array<[string, Parameters<typeof resolveVehiclePhoto>[1], ReturnType<typeof clientThatSigns>]> = [
      [
        'when signing fails',
        { custom_image_url: storedUrl(`${VEHICLE_ID}/photos/a.jpg`), image_url: null },
        clientThatSigns({ error: { message: 'nope' } }),
      ],
      [
        'when signing throws',
        { custom_image_url: storedUrl(`${VEHICLE_ID}/photos/a.jpg`), image_url: null },
        clientThatSigns({ throws: true }),
      ],
      [
        'when the path is scoped to another vehicle',
        { custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/a.jpg`), image_url: null },
        clientThatSigns({ url: 'https://signed.example/x.jpg' }),
      ],
      [
        'when the stored value is a bare scheme with no path',
        { custom_image_url: STORED_URL_SCHEME, image_url: null },
        clientThatSigns({ url: 'https://signed.example/x.jpg' }),
      ],
    ];

    it.each(cases)('%s', async (_label, columns, client) => {
      const result = await resolveVehiclePhoto(VEHICLE_ID, columns, client);

      expect(result ?? '').not.toContain(STORED_URL_SCHEME);
    });
  });
});

/**
 * The batch resolver, for `/api/v1/vehicles`.
 *
 * A garage is many vehicles, and signing one photo per round trip is the N+1
 * that makes a phone's garage screen feel broken. The interesting property is
 * not that it is faster — it is that it must reach *the same verdict* as the
 * single resolver on every input, since the two now serve the same screen on
 * two clients.
 */
describe('resolveVehiclePhotos', () => {
  /** Records what it was asked to sign, so the N+1 claim is testable. */
  function batchClient(outcome: {
    urls?: (string | null)[];
    error?: unknown;
    throws?: boolean;
    calls?: { paths: string[][] };
  }) {
    return {
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            outcome.calls?.paths.push(paths);
            if (outcome.throws) throw new Error('network');
            if (outcome.error) return { data: null, error: outcome.error };
            return {
              data: paths.map((path, i) => ({
                path,
                signedUrl: outcome.urls?.[i] ?? `https://signed.example/${path}`,
                error: null,
              })),
              error: null,
            };
          },
        }),
      },
    } as never;
  }

  it('signs every stored photo in one round trip', async () => {
    const calls = { paths: [] as string[][] };
    const result = await resolveVehiclePhotos(
      [
        { id: VEHICLE_ID, custom_image_url: storedUrl(`${VEHICLE_ID}/photos/a.jpg`), image_url: null },
        {
          id: OTHER_VEHICLE_ID,
          custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/b.jpg`),
          image_url: null,
        },
      ],
      batchClient({ calls })
    );

    expect(calls.paths).toHaveLength(1);
    expect(calls.paths[0]).toEqual([
      `${VEHICLE_ID}/photos/a.jpg`,
      `${OTHER_VEHICLE_ID}/photos/b.jpg`,
    ]);
    expect(result.get(VEHICLE_ID)).toContain('signed.example');
    expect(result.get(OTHER_VEHICLE_ID)).toContain('signed.example');
  });

  it('makes no storage call when nothing needs signing', async () => {
    const calls = { paths: [] as string[][] };
    const result = await resolveVehiclePhotos(
      [{ id: VEHICLE_ID, custom_image_url: null, image_url: '/vehicles/stock.jpg' }],
      batchClient({ calls })
    );

    expect(calls.paths).toHaveLength(0);
    expect(result.get(VEHICLE_ID)).toBe('/vehicles/stock.jpg');
  });

  it('keeps results with their own vehicle when only some need signing', async () => {
    // The ordering bug this shape exists to catch: unsigned entries are not in
    // the request array, so a naive index-into-the-input mapping shifts every
    // signed URL onto the wrong car.
    const third = '33333333-3333-4333-8333-333333333333';
    const result = await resolveVehiclePhotos(
      [
        { id: VEHICLE_ID, custom_image_url: null, image_url: '/vehicles/stock.jpg' },
        {
          id: OTHER_VEHICLE_ID,
          custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/b.jpg`),
          image_url: null,
        },
        { id: third, custom_image_url: storedUrl(`${third}/photos/c.jpg`), image_url: null },
      ],
      batchClient({})
    );

    expect(result.get(VEHICLE_ID)).toBe('/vehicles/stock.jpg');
    expect(result.get(OTHER_VEHICLE_ID)).toContain(`${OTHER_VEHICLE_ID}/photos/b.jpg`);
    expect(result.get(third)).toContain(`${third}/photos/c.jpg`);
  });

  it('refuses to sign a path scoped to a different vehicle', async () => {
    const result = await resolveVehiclePhotos(
      [
        {
          id: VEHICLE_ID,
          custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/not-mine.jpg`),
          image_url: '/vehicles/stock.jpg',
        },
      ],
      batchClient({ urls: ['https://signed.example/LEAKED.jpg'] })
    );

    expect(result.get(VEHICLE_ID)).toBe('/vehicles/stock.jpg');
  });

  describe('never emits the stored scheme', () => {
    const stored = { id: VEHICLE_ID, custom_image_url: storedUrl(`${VEHICLE_ID}/photos/a.jpg`), image_url: null };

    it('when the batch call fails', async () => {
      const result = await resolveVehiclePhotos([stored], batchClient({ error: { message: 'nope' } }));

      expect(result.get(VEHICLE_ID) ?? '').not.toContain(STORED_URL_SCHEME);
      expect(result.has(VEHICLE_ID)).toBe(true);
    });

    it('when the batch call throws', async () => {
      const result = await resolveVehiclePhotos([stored], batchClient({ throws: true }));

      expect(result.get(VEHICLE_ID) ?? '').not.toContain(STORED_URL_SCHEME);
    });

    it('when one entry in the batch fails while others succeed', async () => {
      const failing = {
        storage: {
          from: () => ({
            createSignedUrls: async (paths: string[]) => ({
              data: paths.map((path, i) =>
                i === 0
                  ? { path, signedUrl: null, error: 'not found' }
                  : { path, signedUrl: `https://signed.example/${path}`, error: null }
              ),
              error: null,
            }),
          }),
        },
      } as never;

      const result = await resolveVehiclePhotos(
        [
          stored,
          {
            id: OTHER_VEHICLE_ID,
            custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/b.jpg`),
            image_url: '/vehicles/stock.jpg',
          },
        ],
        failing
      );

      expect(result.get(VEHICLE_ID)).toBeNull();
      expect(result.get(OTHER_VEHICLE_ID)).toContain('signed.example');
    });
  });

  it('agrees with the single resolver on the same input', async () => {
    /*
      The property that matters. Two functions deciding which photo a car has
      is the recurring bug in this codebase; they share `planVehiclePhoto`
      precisely so they cannot diverge, and this asserts that rather than
      trusting it.
    */
    const inputs = [
      { custom_image_url: null, image_url: '/vehicles/stock.jpg' },
      { custom_image_url: null, image_url: null },
      { custom_image_url: STORED_URL_SCHEME, image_url: '/vehicles/stock.jpg' },
      { custom_image_url: storedUrl(`${OTHER_VEHICLE_ID}/photos/x.jpg`), image_url: '/vehicles/stock.jpg' },
      { custom_image_url: 'https://external.example/car.jpg', image_url: null },
    ];

    for (const columns of inputs) {
      const single = await resolveVehiclePhoto(VEHICLE_ID, columns, clientThatSigns({ url: 'https://signed.example/s.jpg' }));
      const batch = await resolveVehiclePhotos([{ id: VEHICLE_ID, ...columns }], batchClient({}));

      expect(batch.get(VEHICLE_ID)).toBe(single);
    }
  });
});

/*
  ── The generation plate, and taking a photograph back off a car (11 Sep) ───

  The plate ranks last, after the owner's photograph and the stock image —
  the same precedence `useVehicleImage` keeps on the web — and only a `ready`
  row resolves; a drawing or failed one leaves the car on its fallback. Two
  cars on one key cost one query. `clearVehiclePhoto` is the body the web
  action and the phone's DELETE share: object first, then the three columns.
*/
const PLATE_KEY = 'bmw/2-series/f22';
const PLATE_URL = 'https://x.supabase.co/storage/v1/object/public/garage-images/plates/bmw/2-series/f22/hero-3x2.jpg';

function clientWithPlates(rows: Array<{ key: string; status: string; hero_path: string | null }>) {
  const calls: string[] = [];
  const client = {
    calls,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'signed' }, error: null }), createSignedUrls: async () => ({ data: [], error: null }) }) },
    from: (table: string) => {
      calls.push(table);
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        in: (col: string, vals: string[]) => { filters.push([col, vals]); return builder; },
        eq: (col: string, val: unknown) => { filters.push([col, val]); return builder; },
        then: (resolve: (v: unknown) => unknown) => {
          const keys = (filters.find(([c]) => c === 'key')?.[1] as string[]) ?? [];
          const status = filters.find(([c]) => c === 'status')?.[1];
          const data = rows.filter((r) => keys.includes(r.key) && (!status || r.status === status));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return client as unknown as import('@supabase/supabase-js').SupabaseClient & { calls: string[] };
}

describe('the generation plate', () => {
  const env = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'; });
  afterAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = env; });

  it('resolves a ready plate to its public hero for a car with no photograph', async () => {
    const client = clientWithPlates([{ key: PLATE_KEY, status: 'ready', hero_path: 'plates/bmw/2-series/f22/hero-3x2.jpg' }]);
    await expect(resolveVehiclePhoto(VEHICLE_ID, { plate_key: PLATE_KEY }, client)).resolves.toBe(PLATE_URL);
  });

  it('leaves the car on nothing while the plate draws or after it failed', async () => {
    const drawing = clientWithPlates([{ key: PLATE_KEY, status: 'generating', hero_path: null }]);
    await expect(resolveVehiclePhoto(VEHICLE_ID, { plate_key: PLATE_KEY }, drawing)).resolves.toBeNull();
    const failed = clientWithPlates([{ key: PLATE_KEY, status: 'failed', hero_path: null }]);
    await expect(resolveVehiclePhoto(VEHICLE_ID, { plate_key: PLATE_KEY }, failed)).resolves.toBeNull();
  });

  it('ranks last: an owner photo or a stock image wins, and the plate is never asked for', async () => {
    const client = clientWithPlates([{ key: PLATE_KEY, status: 'ready', hero_path: 'plates/bmw/2-series/f22/hero-3x2.jpg' }]);
    await expect(resolveVehiclePhoto(VEHICLE_ID, { image_url: '/vehicles/m3/hero-3x2.jpg', plate_key: PLATE_KEY }, client)).resolves.toBe('/vehicles/m3/hero-3x2.jpg');
    await expect(resolveVehiclePhoto(VEHICLE_ID, { custom_image_url: storedUrl(`${VEHICLE_ID}/photos/a.webp`), plate_key: PLATE_KEY }, client)).resolves.toBe('signed');
    expect(client.calls.filter((t) => t === 'vehicle_plates')).toHaveLength(0);
  });

  it('asks once for a garage of cars on the same plate', async () => {
    const client = clientWithPlates([{ key: PLATE_KEY, status: 'ready', hero_path: 'plates/bmw/2-series/f22/hero-3x2.jpg' }]);
    const resolved = await resolveVehiclePhotos(
      [
        { id: 'a', plate_key: PLATE_KEY },
        { id: 'b', plate_key: PLATE_KEY },
        { id: 'c', image_url: '/vehicles/m3/hero-3x2.jpg' },
      ],
      client,
    );
    expect(resolved.get('a')).toBe(PLATE_URL);
    expect(resolved.get('b')).toBe(PLATE_URL);
    expect(resolved.get('c')).toBe('/vehicles/m3/hero-3x2.jpg');
    expect(client.calls.filter((t) => t === 'vehicle_plates')).toHaveLength(1);
  });
});

describe('clearVehiclePhoto', () => {
  function clientForRemoval(opts: { path: string | null; removeError?: string; updateError?: string }) {
    const log: string[] = [];
    const client = {
      log,
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            log.push(`remove:${paths.join(',')}`);
            return { error: opts.removeError ? { message: opts.removeError } : null };
          },
        }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { custom_image_storage_path: opts.path }, error: null }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            log.push(`update:${Object.keys(patch).sort().join(',')}`);
            return { error: opts.updateError ? { message: opts.updateError } : null };
          },
        }),
      }),
    };
    return client as unknown as import('@supabase/supabase-js').SupabaseClient & { log: string[] };
  }

  it('deletes the object first, then nulls the three columns', async () => {
    const client = clientForRemoval({ path: `${VEHICLE_ID}/photos/a.webp` });
    await expect(clearVehiclePhoto(client, VEHICLE_ID)).resolves.toEqual({ success: true });
    expect(client.log).toEqual([
      `remove:${VEHICLE_ID}/photos/a.webp`,
      'update:custom_image_storage_path,custom_image_uploaded_at,custom_image_url',
    ]);
  });

  it('skips the object when there is none, and still clears the columns', async () => {
    const client = clientForRemoval({ path: null });
    await expect(clearVehiclePhoto(client, VEHICLE_ID)).resolves.toEqual({ success: true });
    expect(client.log).toEqual(['update:custom_image_storage_path,custom_image_uploaded_at,custom_image_url']);
  });

  it('a failed object delete is not fatal; a failed row update is', async () => {
    const tolerated = clientForRemoval({ path: 'p', removeError: 'gone already' });
    await expect(clearVehiclePhoto(tolerated, VEHICLE_ID)).resolves.toEqual({ success: true });
    const fatal = clientForRemoval({ path: 'p', updateError: 'rls' });
    await expect(clearVehiclePhoto(fatal, VEHICLE_ID)).resolves.toEqual({ success: false, error: 'Failed to remove photo' });
  });
});

describe('platePresence — what the phone may say about a plate', () => {
  it('reports the library status only for cars with no photograph and a key, in one query', async () => {
    const client = clientWithPlates([
      { key: PLATE_KEY, status: 'generating', hero_path: null },
      { key: 'honda/accord/10th', status: 'failed', hero_path: null },
    ]);
    const presence = await platePresence(
      [
        { id: 'drawing', photo_url: null, plate_key: PLATE_KEY },
        { id: 'failed', photo_url: null, plate_key: 'honda/accord/10th' },
        { id: 'photographed', photo_url: 'https://x/signed', plate_key: PLATE_KEY },
        { id: 'no-plate', photo_url: null, plate_key: null },
        { id: 'unknown-key', photo_url: null, plate_key: 'ford/f-150/13th' },
      ],
      client,
    );
    expect(presence.get('drawing')).toBe('generating');
    expect(presence.get('failed')).toBe('failed');
    // A photograph on screen leaves nothing to say, whatever the plate is doing.
    expect(presence.get('photographed')).toBeNull();
    expect(presence.get('no-plate')).toBeNull();
    expect(presence.get('unknown-key')).toBeNull();
    expect(client.calls.filter((t) => t === 'vehicle_plates')).toHaveLength(1);
  });

  it('asks nothing when no car needs an answer', async () => {
    const client = clientWithPlates([]);
    const presence = await platePresence([{ id: 'p', photo_url: 'https://x/signed', plate_key: PLATE_KEY }], client);
    expect(presence.get('p')).toBeNull();
    expect(client.calls).toHaveLength(0);
  });
});
