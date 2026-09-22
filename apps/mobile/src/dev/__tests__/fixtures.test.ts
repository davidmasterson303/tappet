/**
 * The fixture car takes a photograph through the control and keeps it for
 * the session.
 *
 * `dev/fixtures.ts` answers `POST /upload-photo` with the picked file's own
 * `uri` and serves it back as the car's `photo_url`, so the vehicle detail
 * can be photographed with a real owner photograph under the house grade —
 * through ADD PHOTO, the picker and the reload, exactly as the product runs
 * them — with no session and no server. This pins the three halves: the
 * upload is answered from the `FormData` shape `api/photos.ts` sends, both
 * vehicle routes answer with the photograph from then on (and say the plate
 * is not showing), and `DELETE` takes it away. A body that is not that shape
 * falls through to the network, the way every unmapped path here does.
 *
 * ── 13 Sep · the car stands on its plate, not on nothing ───────────────────
 *
 * "Starts without one" used to mean `photo_url: null` — the house plate.
 * The M235i's generation plate is ready in the library, and the route
 * serves a ready plate *as* `photo_url` (`lib/vehicle-photo.ts`), so the
 * fixture does too: the car starts on its plate, the owner's photograph
 * outranks it, and `DELETE` returns to the plate — "the car will stand on
 * its plate", the confirm's own words — never to nothing. The house plate
 * is what a car stands on while the plate is drawing, which is the
 * environment's to ask for, and the pair below holds both halves.
 */
import { designPhotoUrl, fixtureFor, fixtureHolds } from '../fixtures';

/** The public object every route would resolve the M235i's ready plate to. */
const READY_PLATE = 'https://example.supabase.test/storage/v1/object/public/garage-images/plates/bmw/2-series/f22/hero-3x2.jpg';

/** React Native's `FormData`, as far as the fixture reads it. */
function rnForm(parts: Array<{ fieldName: string; uri?: string; string?: string }>) {
  return { getParts: () => parts };
}

const vehicleOf = (answer: unknown) => (answer as { vehicle: { photo_url: string | null; plate_status: unknown } }).vehicle;
const garageOf = (answer: unknown) => (answer as { vehicles: Array<{ photo_url: string | null }> }).vehicles[0];

describe('the fixture car and its photograph', () => {
  afterEach(() => {
    fixtureFor('/upload-photo', { method: 'DELETE', body: { vehicleId: 'x' } });
  });

  it('names what the image is, as the route does (21 Sep)', () => {
    const kindOf = (answer: unknown) => (answer as { vehicle: { photo_kind: unknown } }).vehicle.photo_kind;
    // On its plate: a plate, so the control reads ADD PHOTO and no grade is laid over it.
    expect(kindOf(fixtureFor('/load-vehicle?vehicleId=v'))).toBe('plate');
    // With the owner's photograph added through the control: the owner's.
    fixtureFor('/upload-photo', { method: 'POST', body: rnForm([{ fieldName: 'file', uri: 'file:///tmp/owner.jpg' }]) });
    expect(kindOf(fixtureFor('/load-vehicle?vehicleId=v'))).toBe('owner');
  });

  it('starts on its ready plate, with nothing to say about it', () => {
    // No photograph has been added — and the car is not empty for it.
    expect(designPhotoUrl()).toBe(process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ?? null);
    const before = vehicleOf(fixtureFor('/load-vehicle?vehicleId=v'));
    expect(before.photo_url).toBe(READY_PLATE);
    // The plate is showing, so the status is nulled under it, as the route nulls it.
    expect(before.plate_status).toBeNull();
    expect(garageOf(fixtureFor('/vehicles')).photo_url).toBe(READY_PLATE);
  });

  it('reads an empty EXPO_PUBLIC_DESIGN_PHOTO_URL as no photograph, not as one', () => {
    /*
      `apps/mobile/.env` carries the key with nothing after the `=`. An empty
      string stood in front of the plate for a day without anyone seeing it,
      because `''` and `null` drew the same house plate until there was a
      plate to fall back to.
    */
    const held = process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL;
    process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL = '';
    try {
      jest.isolateModules(() => {
        const empty = require('../fixtures') as typeof import('../fixtures');
        expect(empty.designPhotoUrl()).toBeNull();
        expect(vehicleOf(empty.fixtureFor('/load-vehicle?vehicleId=v')).photo_url).toBe(READY_PLATE);
      });
    } finally {
      if (held === undefined) delete process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL;
      else process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL = held;
    }
  });

  it('stands on the house plate while the plate is drawing, and says so', () => {
    /*
      The anti-vacuous half: the environment names a plate still drawing,
      and the car has no image and the status the line is printed from. The
      variable is read once at import, so the module is loaded again under
      it rather than the value being flipped underneath a loaded one.
    */
    const held = process.env.EXPO_PUBLIC_DESIGN_PLATE_STATUS;
    process.env.EXPO_PUBLIC_DESIGN_PLATE_STATUS = 'generating';
    try {
      jest.isolateModules(() => {
        const drawing = require('../fixtures') as typeof import('../fixtures');
        const car = vehicleOf(drawing.fixtureFor('/load-vehicle?vehicleId=v'));
        expect(car.photo_url).toBeNull();
        expect(car.plate_status).toBe('generating');
      });
    } finally {
      if (held === undefined) delete process.env.EXPO_PUBLIC_DESIGN_PLATE_STATUS;
      else process.env.EXPO_PUBLIC_DESIGN_PLATE_STATUS = held;
    }
  });

  it('reads stale unless the environment asks for a current reading (21 Sep)', () => {
    /*
      The loop graded five rounds of a stale reading and never saw a current
      one — the state that put six lines in the HEALTH cell. Both halves:
      unset is the stale pair, and `current` postdates every filed record.
    */
    const summaryOf = (answer: unknown) =>
      (answer as { vehicle: { vehicle_health_summary: { summary: string; last_generated: string } } }).vehicle
        .vehicle_health_summary;
    const stale = summaryOf(fixtureFor('/load-vehicle?vehicleId=v'));
    expect(stale.last_generated).toBe('2026-07-30T01:05:47.583+00:00');
    expect(stale.summary).toMatch(/^With no service records/);

    const held = process.env.EXPO_PUBLIC_DESIGN_VERDICT;
    process.env.EXPO_PUBLIC_DESIGN_VERDICT = 'current';
    try {
      jest.isolateModules(() => {
        const current = require('../fixtures') as typeof import('../fixtures');
        const reading = summaryOf(current.fixtureFor('/load-vehicle?vehicleId=v'));
        expect(Date.parse(reading.last_generated)).toBeGreaterThan(Date.parse('2026-08-06T02:43:11.903661+00:00'));
        expect(reading.summary).toMatch(/^The oil, brakes and coolant are inside their intervals/);
        // No preamble on either sentence.
        expect(reading.summary).not.toMatch(/Based on your provided/);
      });
    } finally {
      if (held === undefined) delete process.env.EXPO_PUBLIC_DESIGN_VERDICT;
      else process.env.EXPO_PUBLIC_DESIGN_VERDICT = held;
    }
  });

  it('answers the upload with the picked file, then serves it from both routes', () => {
    const uri = 'file:///var/mobile/Containers/Data/Application/x/ImagePicker/owner.jpg';
    const answer = fixtureFor('/upload-photo', {
      method: 'POST',
      body: rnForm([
        { fieldName: 'file', uri },
        { fieldName: 'vehicleId', string: 'db143cdc' },
      ]),
    });
    expect(answer).toEqual({ success: true, photoUrl: uri });

    const vehicle = vehicleOf(fixtureFor('/load-vehicle?vehicleId=v'));
    expect(vehicle.photo_url).toBe(uri);
    // Under a photograph the plate is not showing, so it has no status to report.
    expect(vehicle.plate_status).toBeNull();
    expect(garageOf(fixtureFor('/vehicles')).photo_url).toBe(uri);
  });

  it('takes it away on DELETE', () => {
    const uri = 'file:///tmp/owner.jpg';
    fixtureFor('/upload-photo', { method: 'POST', body: rnForm([{ fieldName: 'file', uri }]) });
    expect(vehicleOf(fixtureFor('/load-vehicle?vehicleId=v')).photo_url).toBe(uri);

    expect(fixtureFor('/upload-photo', { method: 'DELETE', body: { vehicleId: 'v' } })).toEqual({ success: true });
    // Back to the plate — the confirm promised the car would stand on it.
    expect(vehicleOf(fixtureFor('/load-vehicle?vehicleId=v')).photo_url).toBe(READY_PLATE);
  });

  it('does not answer an upload it cannot read — that request reaches the network', () => {
    expect(fixtureFor('/upload-photo', { method: 'POST', body: { not: 'a form' } })).toBeUndefined();
    expect(fixtureFor('/upload-photo', { method: 'POST', body: rnForm([{ fieldName: 'vehicleId', string: 'v' }]) })).toBeUndefined();
    expect(designPhotoUrl()).toBe(process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ?? null);
  });
});

describe('a held path', () => {
  const env = process.env.EXPO_PUBLIC_DESIGN_HOLD;
  afterEach(() => {
    if (env === undefined) delete process.env.EXPO_PUBLIC_DESIGN_HOLD;
    else process.env.EXPO_PUBLIC_DESIGN_HOLD = env;
  });

  it('holds its own route and its query string, not the routes beneath it', () => {
    process.env.EXPO_PUBLIC_DESIGN_HOLD = '/consultant, /vehicles';
    expect(fixtureHolds('/consultant')).toBe(true);
    expect(fixtureHolds('/vehicles?x=1')).toBe(true);
    // The thread list under the advisor still opens while the ask is held.
    expect(fixtureHolds('/consultant/conversations?vehicleId=v')).toBe(false);
    expect(fixtureHolds('/consultant/conversations/t1')).toBe(false);
  });

  it('holds a subtree when named with a trailing slash, and nothing when unset', () => {
    process.env.EXPO_PUBLIC_DESIGN_HOLD = '/consultant/';
    expect(fixtureHolds('/consultant/conversations')).toBe(true);
    delete process.env.EXPO_PUBLIC_DESIGN_HOLD;
    expect(fixtureHolds('/consultant')).toBe(false);
  });
});

/**
 * The fixture car takes something onto Needs through the control and keeps
 * it for the session — 13 Sep, for the loop over the catalogue.
 *
 * `POST /wishlist` used to be answered with the GET's `{ wishlistItems: [] }`,
 * so ADD "succeeded" into nothing: the catalogue row flipped on its own local
 * state and the Plan root behind it still counted 0. The store below answers
 * the POST with the route's own `{ wishlistItem }`, the GET with the rows
 * added so far (newest first, as the route orders them), and `DELETE
 * ?itemId=` takes one away — so a frame of the added state is the frame the
 * product would draw, and the list behind it agrees.
 */
describe('the fixture car and its needs', () => {
  const vehicleId = 'db143cdc-e68c-46f0-849e-69f7a1873f58';
  const itemsOf = (answer: unknown) =>
    (answer as { wishlistItems: Array<{ id: string; item_identifier: string; item_name: string }> })
      .wishlistItems;

  afterEach(() => {
    for (const item of itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`))) {
      fixtureFor(`/wishlist?itemId=${item.id}`, { method: 'DELETE' });
    }
  });

  it('starts with nothing on the list', () => {
    expect(itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`))).toEqual([]);
  });

  it('answers an add with the row, and the list with it from then on', () => {
    const body = {
      vehicleId,
      itemType: 'issue',
      itemName: 'Charge Pipe',
      itemIdentifier: 'issue:charge-pipe',
      description: 'Cracks under boost.',
      source: 'dossier',
    };
    const answer = fixtureFor('/wishlist', { method: 'POST', body }) as {
      wishlistItem: { id: string; item_identifier: string; item_name: string; item_type: string; description: string };
    };
    expect(answer.wishlistItem).toMatchObject({
      item_identifier: 'issue:charge-pipe',
      item_name: 'Charge Pipe',
      item_type: 'issue',
      description: 'Cracks under boost.',
    });

    const list = itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`));
    expect(list).toHaveLength(1);
    expect(list[0].item_identifier).toBe('issue:charge-pipe');
  });

  it('keeps what the add sent beside the item, as the route does', () => {
    // `sourceData` → `source_data`, so a frame of Needs shows the figure the catalogue sent.
    const answer = fixtureFor('/wishlist', {
      method: 'POST',
      body: {
        vehicleId,
        itemType: 'maintenance',
        itemName: 'Oil',
        itemIdentifier: 'maintenance:oil',
        sourceData: { note: 'Every 5,000 mi' },
      },
    }) as { wishlistItem: { source_data: unknown } };
    expect(answer.wishlistItem.source_data).toEqual({ note: 'Every 5,000 mi' });
    const [listed] = itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`)) as unknown as Array<{ source_data: unknown }>;
    expect(listed.source_data).toEqual({ note: 'Every 5,000 mi' });
  });

  it('lists newest first, as the route orders them', () => {
    const add = (name: string) =>
      fixtureFor('/wishlist', {
        method: 'POST',
        body: { vehicleId, itemType: 'maintenance', itemName: name, itemIdentifier: `maintenance:${name}` },
      });
    add('First');
    add('Second');
    expect(itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`)).map((item) => item.item_name)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('adds one row for one identifier, however many times it is sent', () => {
    // The table dedupes on the identifier; a fixture that grew a duplicate
    // would draw a Needs list the product cannot have.
    const body = { vehicleId, itemType: 'modification', itemName: 'Intake', itemIdentifier: 'modification:intake' };
    fixtureFor('/wishlist', { method: 'POST', body });
    fixtureFor('/wishlist', { method: 'POST', body });
    expect(itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`))).toHaveLength(1);
  });

  it('takes a row away on DELETE', () => {
    const answer = fixtureFor('/wishlist', {
      method: 'POST',
      body: { vehicleId, itemType: 'issue', itemName: 'X', itemIdentifier: 'issue:x' },
    }) as { wishlistItem: { id: string } };
    expect(fixtureFor(`/wishlist?itemId=${answer.wishlistItem.id}`, { method: 'DELETE' })).toEqual({
      success: true,
    });
    expect(itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`))).toEqual([]);
  });

  it('does not answer an add it cannot read — that request reaches the network', () => {
    expect(fixtureFor('/wishlist', { method: 'POST', body: { not: 'an item' } })).toBeUndefined();
    expect(itemsOf(fixtureFor(`/wishlist?vehicleId=${vehicleId}`))).toEqual([]);
  });
});

/**
 * The catalogue has all three of its sources to draw from.
 *
 * `suggestionsFor` reads `known_issues`, `maintenance_schedule` and
 * `common_mods`; the fixture carried only the schedule, so WHAT THIS CAR
 * NEEDS listed eight services and no issue or modification — a catalogue
 * with one of its three kinds, and the Build ladder with nothing on it.
 */
describe('the fixture car and what is known about it', () => {
  const knowledgeOf = (answer: unknown) =>
    (
      answer as {
        knowledge: { known_issues?: unknown[]; maintenance_schedule?: unknown[]; common_mods?: unknown[] };
      }
    ).knowledge;

  it('answers with issues and mods beside the schedule', () => {
    const knowledge = knowledgeOf(fixtureFor('/load-vehicle?vehicleId=v'));
    expect(knowledge.known_issues?.length).toBeGreaterThan(0);
    expect(knowledge.common_mods?.length).toBeGreaterThan(0);
    expect(knowledge.maintenance_schedule?.length).toBeGreaterThan(0);
  });

  it('holds them in the shapes the catalogue reads', () => {
    const knowledge = knowledgeOf(fixtureFor('/load-vehicle?vehicleId=v'));
    for (const issue of knowledge.known_issues as Array<Record<string, unknown>>) {
      expect(typeof issue.part).toBe('string');
      expect(typeof issue.severity).toBe('string');
      expect(typeof issue.description).toBe('string');
    }
    for (const mod of knowledge.common_mods as Array<Record<string, unknown>>) {
      expect(typeof mod.name).toBe('string');
      expect(typeof mod.purpose).toBe('string');
      expect(typeof mod.difficulty).toBe('string');
    }
  });
});
