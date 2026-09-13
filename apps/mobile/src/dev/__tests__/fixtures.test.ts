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
import { designPhotoUrl, fixtureFor, fixtureHolds } from '../fixtures';

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
