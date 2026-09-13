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
 */
import { designPhotoUrl, fixtureFor } from '../fixtures';

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

  it('starts without one, and says the plate is what is showing', () => {
    expect(designPhotoUrl()).toBe(process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ?? null);
    const before = vehicleOf(fixtureFor('/load-vehicle?vehicleId=v'));
    expect(before.photo_url).toBe(designPhotoUrl());
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
    expect(vehicleOf(fixtureFor('/load-vehicle?vehicleId=v')).photo_url).toBe(
      process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ?? null
    );
  });

  it('does not answer an upload it cannot read — that request reaches the network', () => {
    expect(fixtureFor('/upload-photo', { method: 'POST', body: { not: 'a form' } })).toBeUndefined();
    expect(fixtureFor('/upload-photo', { method: 'POST', body: rnForm([{ fieldName: 'vehicleId', string: 'v' }]) })).toBeUndefined();
    expect(designPhotoUrl()).toBe(process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ?? null);
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
