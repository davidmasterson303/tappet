import { act, render, userEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { ScanVinScreen, VIN_BARCODE_TYPES } from '../ScanVinScreen';
import { decodeVin } from '../../api/vpic';

/**
 * The sticker door — the viewfinder reading the door-jamb barcode.
 *
 * The camera is `jest.setup.js`'s stub: granted, ready on mount, a lens
 * found. A read is delivered the way the module delivers one — by calling
 * the `onBarcodeScanned` the screen handed the view — so what is asserted is
 * what the screen does with a read: which ones it accepts, that it pauses
 * delivery after one, that the haptic fires once, and that the log tells the
 * decode with the number as its first answer.
 */

jest.mock('../../api/vpic', () => ({
  decodeVin: jest.fn(),
  fetchModels: jest.fn().mockResolvedValue([]),
}));

const mockDecode = decodeVin as jest.MockedFunction<typeof decodeVin>;
const { __camera } = jest.requireMock('expo-camera') as {
  __camera: { getAvailableLensesAsync: jest.Mock; scanFromURLAsync: jest.Mock; takePictureAsync: jest.Mock; reset: () => void };
};

const ACCORD = '1HGCM82633A004352';
const ACCORD_DECODE = {
  status: 'decoded' as const,
  car: { year: 2003, make: 'Honda', model: 'Accord', trim: 'EX-V6', confidence: 'clean' as const, engine: '3.0L V6' },
};

function mount(overrides: Partial<Parameters<typeof ScanVinScreen>[0]> = {}) {
  const props = { onIdentified: jest.fn(), onType: jest.fn(), onDescribe: jest.fn(), ...overrides };
  return { props, view: render(<ScanVinScreen {...props} />) };
}

/** Deliver a read the way the native module does. */
async function read(view: Awaited<ReturnType<typeof render>>, data: string, type = 'code39') {
  const camera = view.getByTestId('camera-view');
  await act(async () => {
    camera.props.onBarcodeScanned?.({ type, data, cornerPoints: [], bounds: { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } } });
  });
}

beforeEach(() => {
  mockDecode.mockReset();
  __camera.reset();
  (Haptics.impactAsync as jest.Mock).mockClear();
});

describe('the frame', () => {
  it('asks the camera for the four symbologies a VIN label uses, and draws no shutter', async () => {
    const { view } = mount();
    const camera = (await view).getByTestId('camera-view');
    expect(camera.props.barcodeScannerSettings).toEqual({ barcodeTypes: VIN_BARCODE_TYPES });
    expect(VIN_BARCODE_TYPES).toEqual(['code39', 'code128', 'datamatrix', 'pdf417']);
    expect((await view).queryByLabelText('Capture')).toBeNull();
    expect((await view).getByText('Scan the sticker')).toBeTruthy();
  });

  it('targets a barcode-shaped band, not the whole frame, and says how close to hold it (seen live, 21 Sep)', async () => {
    /*
      The first real read took several tries: the corner brackets framed the
      whole feed, so the label was held at arm's length and the barcode was
      half the frame wide. In barcode mode the brackets bound the frame's
      middle third — filling it with the barcode, at the live zoom, is a
      distance the lens will focus at.
    */
    const { view } = mount();
    const band = (await view).getByTestId('viewfinder-brackets-band');
    const flat = Object.assign({}, ...[band.props.style].flat(Infinity).filter(Boolean));
    // A third, not a fifth: the fifth asked for a distance the lens will not focus at (21 Sep, second walk).
    expect(flat.top).toBe('33%');
    expect(flat.bottom).toBe('33%');
    expect((await view).queryByTestId('viewfinder-brackets')).toBeNull();
    (await view).getByText(/Move in until the barcode fills the brackets/);
  });

  it('offers the keyboard beside the frame', async () => {
    const user = userEvent.setup();
    const { props, view } = mount();
    await user.press((await view).getByLabelText('Type it instead'));
    expect(props.onType).toHaveBeenCalledTimes(1);
  });

  it('says so on a device with no camera, and names the way out', async () => {
    __camera.getAvailableLensesAsync.mockResolvedValue([]);
    const { view } = mount();
    await (await view).findByText('No camera');
    expect((await view).getByText(/This device has no camera. Type the number instead./)).toBeTruthy();
  });
});

describe('a read', () => {
  it('takes the number out of the label, fires one haptic, pauses the camera and starts the log', async () => {
    mockDecode.mockResolvedValue(ACCORD_DECODE);
    const { view } = mount();
    await (await view).findByText('Ready');

    await read(await view, `*I${ACCORD}*`);

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(mockDecode).toHaveBeenCalledWith(ACCORD, expect.anything());
    // The viewfinder gives way to the log; the number is its first answer.
    await (await view).findByText(`→ ${ACCORD}`);
    await (await view).findByText('→ 2003 Honda Accord EX-V6, 3.0L V6.');
    expect((await view).queryByTestId('camera-view')).toBeNull();
  });

  it('zooms the live frame so the band fills from a distance the lens will focus at (21 Sep)', async () => {
    const { view } = mount();
    const camera = (await view).getByTestId('camera-view');
    expect(camera.props.zoom).toBeGreaterThan(0);
    expect(camera.props.zoom).toBeLessThan(0.2);
  });

  it('reads a still taken on purpose, through the same decode as a live read', async () => {
    /*
      21 Sep: the live reader could not be made to see a Forester's sticker,
      and there was nothing to press. The shutter takes a picture, the phone
      decodes it, and the VIN goes where a live read's would.
    */
    mockDecode.mockResolvedValue(ACCORD_DECODE);
    __camera.scanFromURLAsync.mockResolvedValue([{ type: 'code39', data: `*I${ACCORD}*`, cornerPoints: [], bounds: {} }]);
    const user = userEvent.setup();
    const { view } = mount();
    await (await view).findByText('Ready');

    await user.press((await view).getByLabelText('Read a photo'));

    expect(__camera.takePictureAsync).toHaveBeenCalledTimes(1);
    expect(__camera.scanFromURLAsync).toHaveBeenCalledWith('file:///tmp/capture.jpg', VIN_BARCODE_TYPES);
    expect(mockDecode).toHaveBeenCalledWith(ACCORD, expect.anything());
    await (await view).findByText(`→ ${ACCORD}`);
  });

  it('says what to change when nothing was read from the photo, and keeps the frame', async () => {
    __camera.scanFromURLAsync.mockResolvedValue([]);
    const user = userEvent.setup();
    const { view } = mount();
    await (await view).findByText('Ready');

    await user.press((await view).getByLabelText('Read a photo'));

    expect((await view).getByText(/No barcode could be read from that photo/)).toBeTruthy();
    expect(mockDecode).not.toHaveBeenCalled();
    expect((await view).getByTestId('camera-view')).toBeTruthy();
  });

  it('refuses a barcode that is not a VIN, says so, and keeps looking', async () => {
    const { view } = mount();
    await (await view).findByText('Ready');

    await read(await view, 'SKU-000123');

    expect(mockDecode).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect((await view).getByText(/That barcode is not a VIN/)).toBeTruthy();
    // Still delivering: the next symbol can be the right one.
    expect((await view).getByTestId('camera-view').props.onBarcodeScanned).toBeDefined();
  });

  it('hands the named car on, with the sticker as its source, once confirmed', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue(ACCORD_DECODE);
    const { props, view } = mount();
    await (await view).findByText('Ready');

    await read(await view, ACCORD);
    await user.press(await (await view).findByLabelText("That's my car"));

    expect(props.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ vin: ACCORD, source: 'sticker', make: 'Honda' }));
  });

  it('returns to the frame from "Not my car", ready to read again', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue(ACCORD_DECODE);
    const { props, view } = mount();
    await (await view).findByText('Ready');

    await read(await view, ACCORD);
    await user.press(await (await view).findByLabelText('Not my car'));

    expect(props.onIdentified).not.toHaveBeenCalled();
    expect((await view).getByTestId('camera-view').props.onBarcodeScanned).toBeDefined();
  });

  it('states a failed decode and offers the described car with the number it read', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue({ status: 'unplaced' });
    const { props, view } = mount();
    await (await view).findByText('Ready');

    await read(await view, ACCORD);
    await (await view).findByText('Not identified');
    await user.press((await view).getByLabelText('Describe the car instead'));

    expect(props.onDescribe).toHaveBeenCalledWith({ vin: ACCORD, prefill: undefined });
  });
});
