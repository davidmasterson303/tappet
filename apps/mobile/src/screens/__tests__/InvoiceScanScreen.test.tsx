import { render, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as Haptics from 'expo-haptics';

import { InvoiceScanScreen } from '../InvoiceScanScreen';
import { uploadInvoice, type InvoiceFile } from '../../api/documents';
import { ApiRequestError } from '../../api/client';
import { onUpgradeRequested } from '../../purchases/upgrade-prompt';
import { READOUT } from '../../components/Viewfinder';

/**
 * Scanning an invoice.
 *
 * The product's own pitch — point the phone at a receipt in the shop's car park
 * — and the flow with the most ways to strand somebody, because every step can
 * fail differently: the picker can be dismissed, the model can decide it is not
 * an invoice, it can read a *different car*, and the upload can fail in ways
 * that either will or will not survive a retry.
 *
 * ── What is native here, and where it is stubbed ────────────────────────────
 *
 * `pickImage` is a **prop**. The screen never imports `expo-image-picker` —
 * `src/media/pick-image.ts` is the only module that does — so the library
 * path is injected as a plain function and exercised with no stubbing at all.
 *
 * ⚠ 12 Sep: the camera is not a prop. B9 made the first frame a viewfinder
 * (`components/Viewfinder.tsx`), which imports `expo-camera` and
 * `expo-haptics` itself, and `jest.setup.js` stubs both the way it stubs the
 * picker — a phone with a camera and a granted permission unless a test says
 * otherwise. `__camera` below is that stub's dial: the permission it answers,
 * whether the view reports ready, what the lens query finds, what a capture
 * returns. Turning each of those the wrong way is how the readout's words and
 * the capture's haptic are testable without a device.
 *
 * ── The two rules worth the whole file ──────────────────────────────────────
 *
 * **A retry is only offered when a retry could work.** A client-side rejection
 * — wrong type, too large — fails identically however many times the same file
 * is sent. Offering "Try again" there strands somebody on an error screen with
 * no way back to the picker, which is the 5 Aug dead end `retryable` exists to
 * fix.
 *
 * **A vehicle mismatch asks rather than files.** The model reading a different
 * car is the one failure that silently corrupts data if it guesses — an invoice
 * filed against the wrong vehicle is worse than one not filed at all.
 */

/*
  ── ⚠ LEG-02 · these tests are about scanning, not about consent ─────────────

  Guideline 5.1.2(i) (amended Nov 2025) requires explicit permission before
  personal data reaches a third-party AI, so the screen now asks before it opens
  the picker. Every case below assumes that question has already been answered —
  the consent flow itself is exercised in its own describe at the foot of this
  file.

  Mocked rather than written to `secureStorage`, because the store is
  `expo-secure-store` and there is none in a test runner.
*/
/*
  ⚠ Prefixed `mock` because jest forbids a factory referencing an out-of-scope
  variable — the guard against a mock reading a value that has not initialised
  yet. The prefix is the documented escape hatch.
*/
let mockConsent: 'granted' | 'declined' | 'unknown' = 'granted';

jest.mock('../../onboarding/ai-consent', () => ({
  readAiConsent: jest.fn(async () => mockConsent),
  recordAiConsent: jest.fn(async () => {}),
}));

jest.mock('../../api/documents', () => {
  const actual = jest.requireActual('../../api/documents');
  return { ...actual, uploadInvoice: jest.fn() };
});

const upload = uploadInvoice as jest.MockedFunction<typeof uploadInvoice>;

/** The camera stub's dial — see `jest.setup.js`. */
const { __camera: camera } = jest.requireMock('expo-camera') as {
  __camera: {
    permission: { status: string; granted: boolean; canAskAgain: boolean; expires: string };
    requestPermission: jest.Mock;
    getAvailableLensesAsync: jest.Mock;
    takePictureAsync: jest.Mock;
    ready: boolean;
    reset: () => void;
  };
};
const haptic = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;

/**
 * Typed as `InvoiceFile`, with no cast.
 *
 * The first draft wrote `mimeType` and cast the object into place — the field
 * is `type`, and the cast is what let a wrong fixture compile. Typing it
 * properly means the shape is checked rather than asserted, which is the whole
 * value of having the interface.
 */
const FILE: InvoiceFile = {
  uri: 'file:///tmp/receipt.jpg',
  name: 'receipt.jpg',
  type: 'image/jpeg',
};

async function mount(over: { pickImage?: jest.Mock } = {}) {
  const pickImage = over.pickImage ?? jest.fn(async () => FILE);
  const props = {
    vehicleId: 'v1',
    pickImage: pickImage as (s: 'library') => Promise<InvoiceFile | null>,
    onSignOut: jest.fn(),
    onFiled: jest.fn(),
  };
  return { props, pickImage, view: await render(<InvoiceScanScreen {...props} />) };
}

beforeEach(() => {
  upload.mockReset();
  camera.reset();
  haptic.mockClear();
});

/** The readout's right cell, as printed — uppercase is the style's, not the string's. */
const readout = (view: Awaited<ReturnType<typeof mount>>['view']): string | null => {
  const node = view.queryByTestId('viewfinder-readout');
  return node ? String(node.props.children) : null;
};

describe('the first frame is the viewfinder — brief B9', () => {
  it('opens on the camera, not on a page about the camera', async () => {
    /*
      SCAN INVOICE used to land on four lines of copy and a TAKE A PHOTO
      button — "a primary leading to another primary", in four critiques
      running. The first frame is the frame: the feed, its brackets, the
      readout, a capture control, and the library beside it.
    */
    const { view } = await mount();

    await view.findByTestId('camera-view');
    view.getByTestId('viewfinder-brackets');
    view.getByText('Photograph the invoice');
    view.getByRole('button', { name: 'Capture' });
    view.getByText('Choose from library');

    expect(view.queryByText('Take a photo')).toBeNull();
    expect(view.queryByText(/Its line items are read by a model/)).toBeNull();
  });

  it('keeps the model caveat before the capture, in one line', async () => {
    /*
      R49: a model reads the photograph into the owner's permanent record, and
      that is said before the photograph, not on a review step — there is no
      review step; lines file as they are read. Two critiques asked for it to
      move; what moved is its length.
    */
    const { view } = await mount();

    await view.findByTestId('camera-view');
    view.getByText(/A model reads the line items into this car's history/);
  });

  it('says READY only once the camera has, and finds a lens', async () => {
    const { view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
    expect(camera.getAvailableLensesAsync).toHaveBeenCalled();
  });

  it('says STARTING while the session has not reported ready', async () => {
    // Never READY on the strength of a granted permission alone.
    camera.ready = false;
    const { view } = await mount();

    await view.findByTestId('camera-view');
    expect(readout(view)).toBe(READOUT.starting);
    expect(view.getByRole('button', { name: 'Capture' }).props.accessibilityState.disabled).toBe(
      true
    );
  });

  it('says NO CAMERA when the device reports no lens, and keeps the library', async () => {
    /*
      ⚠ The simulator fires `onCameraReady` with no camera behind it; the
      lens query is what tells the truth there. A capture on that frame would
      hand a generated grey square to the model, so the control stands down —
      and the second way in is still on the frame.
    */
    camera.getAvailableLensesAsync.mockResolvedValue([]);
    const { view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.none));
    expect(view.getByRole('button', { name: 'Capture' }).props.accessibilityState.disabled).toBe(
      true
    );
    view.getByText(/This device has no camera/);
    view.getByText('Choose from library');
  });

  it('asks for the camera when nobody has answered yet', async () => {
    camera.permission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
    camera.requestPermission.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    const { view } = await mount();

    await waitFor(() => expect(camera.requestPermission).toHaveBeenCalledTimes(1));
    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
  });

  it('says CAMERA OFF when refused for good, points at Settings, and keeps the library', async () => {
    /*
      iOS asks once. After a refusal the only route back is Settings, and a
      dead end that does not say so is a dead end — the sentence names the
      switch, the control opens it, and the library is still offered.
    */
    camera.permission = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };
    const user = userEvent.setup();
    const { view } = await mount();

    await waitFor(() => expect(readout(view)).toBe(READOUT.off));
    expect(camera.requestPermission).not.toHaveBeenCalled();
    expect(view.queryByTestId('camera-view')).toBeNull();
    view.getByText(/Camera access is off for Tappet/);
    view.getByText('Choose from library');

    await user.press(view.getByRole('button', { name: 'Open Settings' }));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });
});

describe('the capture', () => {
  it('fires one firm haptic at the press, then takes the picture, then sends it', async () => {
    /*
      "One firm haptic on capture" — once, `Heavy`, and before the shutter:
      the feel is the press. The count is the assertion; a second impact
      anywhere on the path — a "success" tap when the file arrives, say — is
      exactly what this refuses.
    */
    const user = userEvent.setup();
    upload.mockResolvedValue({ status: 'uploaded', documentId: 'd1', itemsExtracted: 3 } as never);
    const { pickImage, view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
    await user.press(view.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
    expect(haptic.mock.invocationCallOrder[0]).toBeLessThan(
      camera.takePictureAsync.mock.invocationCallOrder[0]
    );

    // The picker is the library's; the camera path never touches it.
    expect(pickImage).not.toHaveBeenCalled();
  });

  it('hands send an InvoiceFile the upload will accept', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ status: 'uploaded', documentId: 'd1', itemsExtracted: 3 } as never);
    const { view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
    await user.press(view.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const { file } = upload.mock.calls[0][0];
    expect(file).toMatchObject({ uri: 'file:///tmp/capture.jpg', type: 'image/jpeg' });
    expect(file.name).toMatch(/\.jpg$/);
    // Unknown, not invented: the camera does not report bytes.
    expect(file.size).toBeUndefined();
  });

  it('encodes at the same quality as the library path', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ status: 'uploaded', documentId: 'd1', itemsExtracted: 3 } as never);
    const { view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
    await user.press(view.getByRole('button', { name: 'Capture' }));

    await waitFor(() => expect(camera.takePictureAsync).toHaveBeenCalledTimes(1));
    expect(camera.takePictureAsync).toHaveBeenCalledWith({ quality: 0.7 });
  });

  it('says the photograph failed, not the upload, when the shutter rejects', async () => {
    // Nothing was uploaded, so "That did not upload" would be a lie about
    // which act failed — and both ways forward are on the screen.
    camera.takePictureAsync.mockRejectedValue(new Error('Camera is not running'));
    const user = userEvent.setup();
    const { view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
    await user.press(view.getByRole('button', { name: 'Capture' }));

    await view.findByText('That photograph did not take');
    expect(upload).not.toHaveBeenCalled();
    view.getByText('Take a photo');
    view.getByText('Choose a different file');
  });

  it('returns to the viewfinder from "Take a photo", never to the system sheet', async () => {
    camera.takePictureAsync.mockRejectedValue(new Error('Camera is not running'));
    const user = userEvent.setup();
    const { pickImage, view } = await mount();

    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
    await user.press(view.getByRole('button', { name: 'Capture' }));
    await view.findByText('That photograph did not take');

    await user.press(view.getByText('Take a photo'));

    await view.findByTestId('camera-view');
    expect(pickImage).not.toHaveBeenCalled();
  });
});

describe('choosing an image', () => {
  it('offers the library beside the capture control', async () => {
    /*
      Both, deliberately. A receipt is often a photo taken days ago, and the
      simulator has no camera at all — a camera-only flow could never be
      exercised on the machine this is built on.
    */
    const { view } = await mount();

    await view.findByTestId('camera-view');
    expect(view.getByRole('button', { name: 'Capture' })).toBeTruthy();
    expect(view.getByText('Choose from library')).toBeTruthy();
  });

  it('asks the injected picker for the right source', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ status: 'uploaded', documentId: 'd1', itemsExtracted: 3 } as never);
    const { pickImage, view } = await mount();

    await user.press(view.getByText('Choose from library'));

    await waitFor(() => expect(pickImage).toHaveBeenCalledWith('library'));
  });

  it('uploads nothing when the picker is dismissed', async () => {
    // Backing out of the camera is the most common non-event in this flow.
    // Treating `null` as a file would send an empty upload and show an error
    // for something the person deliberately cancelled.
    const user = userEvent.setup();
    const pickImage = jest.fn(async () => null);
    const { view } = await mount({ pickImage });

    await user.press(view.getByText('Choose from library'));

    await waitFor(() => expect(pickImage).toHaveBeenCalled());
    expect(upload).not.toHaveBeenCalled();
  });

  it('but does upload when a file comes back — proving the refusal is real', async () => {
    // The pair. Without it, the assertion above is satisfied by a screen that
    // never uploads at all.
    const user = userEvent.setup();
    upload.mockResolvedValue({ status: 'uploaded', documentId: 'd1', itemsExtracted: 3 } as never);
    const { view } = await mount();

    await user.press(view.getByText('Choose from library'));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });
});

describe('a vehicle mismatch', () => {
  const mismatch = {
    status: 'vehicle-mismatch',
    message: 'This looks like a different car.',
    extracted: { year: 2015, make: 'BMW', model: 'M235i' },
    expected: { year: 2018, make: 'Honda', model: 'Accord' },
  };

  it('asks rather than filing', async () => {
    /*
      The one failure that corrupts data if it guesses. An invoice filed against
      the wrong vehicle is worse than one not filed at all, because nothing
      afterwards looks wrong.
    */
    const user = userEvent.setup();
    upload.mockResolvedValue(mismatch as never);
    const { view } = await mount();

    await user.press(view.getByText('Choose from library'));

    expect(await view.findByText('Is this the right car?')).toBeTruthy();
  });

  it('files it only once confirmed, and says so on the retry', async () => {
    // `confirmVehicle` is what tells the server the human overrode the model.
    // Sending the same unconfirmed request again would just mismatch forever.
    const user = userEvent.setup();
    upload.mockResolvedValueOnce(mismatch as never);
    upload.mockResolvedValueOnce({
      status: 'uploaded',
      documentId: 'd1',
      itemsExtracted: 2,
    } as never);

    const { view } = await mount();
    await user.press(view.getByText('Choose from library'));
    await view.findByText('Is this the right car?');

    await user.press(view.getByText('Yes, file it here'));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls[1][0]).toMatchObject({ confirmVehicle: true });
  });

  it('does not re-open the picker to confirm', async () => {
    /*
      Confirming re-sends what was already picked. Reopening the camera would
      make somebody photograph the same receipt twice to answer a yes/no
      question.
    */
    const user = userEvent.setup();
    upload.mockResolvedValueOnce(mismatch as never);
    upload.mockResolvedValueOnce({ status: 'uploaded', documentId: 'd1', itemsExtracted: 1 } as never);

    const { pickImage, view } = await mount();
    await user.press(view.getByText('Choose from library'));
    await view.findByText('Is this the right car?');

    const picksBefore = pickImage.mock.calls.length;
    await user.press(view.getByText('Yes, file it here'));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(pickImage.mock.calls.length).toBe(picksBefore);
  });

  it('sends nothing more if the answer is no', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(mismatch as never);
    const { view } = await mount();

    await user.press(view.getByText('Choose from library'));
    await view.findByText('Is this the right car?');

    await user.press(view.getByText('No, cancel'));

    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe('when it is not an invoice', () => {
  it('says so without offering a pointless retry of the same file', async () => {
    // Re-sending the same photo cannot change the model's mind about what it
    // is. The way forward is a different photo.
    const user = userEvent.setup();
    upload.mockResolvedValue({
      status: 'not-an-invoice',
      message: 'That looks like a parking ticket.',
    } as never);

    const { view } = await mount();
    await user.press(view.getByText('Choose from library'));

    expect(await view.findByText('That does not look like an invoice')).toBeTruthy();
    expect(view.getByText('Try another photo')).toBeTruthy();
  });
});

describe('when the upload fails', () => {
  it('signs out only when the session is genuinely gone', async () => {
    /*
      `isLocallySignedOut` — the token was cleared on this device, so there is
      nothing to retry with. A plain 401 from the server is shown as a message
      instead, because the session may still be recoverable.
    */
    const user = userEvent.setup();
    /*
      `isLocallySignedOut` is a GETTER — `status === 401 && origin === 'device'`
      — so it cannot be assigned. The first draft forced the property and the
      test failed, which is the getter doing its job: the only way to produce
      this state is to produce the real conditions, and that is what makes the
      assertion mean something.
    */
    upload.mockRejectedValue(
      new ApiRequestError({ status: 401, message: 'Unauthorized', origin: 'device' })
    );

    const { props, view } = await mount();
    await user.press(view.getByText('Choose from library'));

    await waitFor(() => expect(props.onSignOut).toHaveBeenCalledTimes(1));
  });

  it('keeps a server-side 401 on the screen rather than bouncing', async () => {
    // `origin: 'server'` — a token the server might accept a second later.
    // Destroying a working session over one response is how a spurious failure
    // becomes a forced re-login.
    const user = userEvent.setup();
    upload.mockRejectedValue(
      new ApiRequestError({ status: 401, message: 'Unauthorized', origin: 'server' })
    );

    const { props, view } = await mount();
    await user.press(view.getByText('Choose from library'));

    expect(await view.findByText('That did not upload')).toBeTruthy();
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('a paid-feature refusal keeps the server’s sentence, offers no retry, and asks for the paywall — E6’s wire, off', async () => {
    /*
      `/upload-document` forwards the gate's `code: 'needs-subscription'` as a
      402 beside its sentence. Trying again cannot help when the answer is a
      purchase, so the retry the other failures offer is withheld, the heading
      is not "That did not upload" (nothing failed), and the paywall is asked
      for with the feature named — the advisor's shape exactly. Reachable only
      with `PAID_FEATURES_ENFORCED` on, which it is not.
    */
    const user = userEvent.setup();
    upload.mockRejectedValue(
      new ApiRequestError({
        status: 402,
        message: 'Invoice scanning is part of Tappet Plus. Your garage, service log, mileage and recall alerts stay free.',
        code: 'needs-subscription',
      })
    );
    const upgrade = jest.fn();
    const stop = onUpgradeRequested(upgrade);

    const { view } = await mount();
    await user.press(view.getByText('Choose from library'));

    expect(await view.findByText(/is part of Tappet Plus/)).toBeTruthy();
    expect(view.getByText('Part of Tappet Plus')).toBeTruthy();
    expect(view.queryByText('That did not upload')).toBeNull();
    expect(view.queryByText('Try again')).toBeNull();
    expect(upgrade).toHaveBeenCalledWith({ feature: 'invoice-scanning' });

    stop();
  });

  it('shows the failure rather than returning silently to idle', async () => {
    // A flow that quietly resets looks like the button did nothing, which is
    // how somebody re-photographs a receipt four times.
    const user = userEvent.setup();
    upload.mockRejectedValue(new ApiRequestError({ status: 500, message: 'Upstream failed' }));

    const { view } = await mount();
    await user.press(view.getByText('Choose from library'));

    expect(await view.findByText('That did not upload')).toBeTruthy();
  });
});

describe('when it works', () => {
  it('tells the caller so the vehicle can refresh', async () => {
    /*
      `onFiled` is how the dossier learns its line items changed. Without it the
      invoice is stored and the screen behind still shows the old totals — which
      reads as the scan not having worked.
    */
    const user = userEvent.setup();
    upload.mockResolvedValue({ status: 'uploaded', documentId: 'd1', itemsExtracted: 4 } as never);

    const { props, view } = await mount();
    await user.press(view.getByText('Choose from library'));

    await waitFor(() => expect(props.onFiled).toHaveBeenCalled());
  });
});

/**
 * ── LEG-02: explicit permission before an invoice reaches Google ────────────
 *
 * Apple amended Guideline 5.1.2(i) in November 2025 to require **explicit
 * permission** before personal data is shared with a third-party AI — not
 * disclosure, permission. Tappet had the disclosure in its privacy policy;
 * the only consent was sign-up wrap.
 *
 * This is the screen where it mattered most and was least visible: it
 * photographs a document carrying **a third party's name and business
 * address**, sometimes a VIN, sends it to Gemini, and said nothing about
 * Google at all.
 */
describe('asking before an invoice goes to Google', () => {
  afterEach(() => {
    mockConsent = 'granted';
  });

  it('asks at the door, before the camera is even requested', async () => {
    /*
      ⚠ **Before**, and the ordering is the whole finding. Consent obtained
      after the photograph exists is consent for something that already
      happened. The screen now *opens* on the camera, so the question is asked
      as it opens: the sheet is up, the viewfinder is held, and the system's
      own camera alert is not stacked under it.
    */
    mockConsent = 'unknown';
    camera.permission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
    const pickImage = jest.fn();

    const view = await render(
      <InvoiceScanScreen vehicleId="v1" pickImage={pickImage} onSignOut={jest.fn()} />
    );

    await view.findByText('Reading an invoice uses Google’s AI');
    expect(camera.requestPermission).not.toHaveBeenCalled();
    expect(view.queryByTestId('camera-view')).toBeNull();
    expect(view.queryByRole('button', { name: 'Capture' })).toBeNull();
    expect(pickImage).not.toHaveBeenCalled();
  });

  it('names Google, and names what is in the photograph', async () => {
    /*
      "Third-party AI services" is the phrasing that satisfies nobody. Deciding
      needs to know **who** and **what** — and the part somebody would not think
      of is that an invoice is not only their own data.
    */
    mockConsent = 'unknown';

    const view = await render(
      <InvoiceScanScreen vehicleId="v1" pickImage={jest.fn()} onSignOut={jest.fn()} />
    );

    await view.findByText(/The photograph goes to Google/);
    await view.findByText(/the shop’s name and address/);
  });

  it('brings the camera up once they agree — the thing they came to do', async () => {
    /*
      Agreeing arms the viewfinder, which asks for the camera and comes up
      ready. Nobody is dropped back to press a button again, which is how a
      consent sheet reads as an obstacle rather than a question.
    */
    mockConsent = 'unknown';
    camera.permission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
    camera.requestPermission.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    const user = userEvent.setup();

    const view = await render(
      <InvoiceScanScreen vehicleId="v1" pickImage={jest.fn()} onSignOut={jest.fn()} />
    );

    await user.press(await view.findByText('Scan invoices'));

    await waitFor(() => expect(camera.requestPermission).toHaveBeenCalledTimes(1));
    await view.findByTestId('camera-view');
    await waitFor(() => expect(readout(view)).toBe(READOUT.ready));
  });

  it('stands the controls down when they decline — never the screen', async () => {
    /*
      ⚠ Declining means "no AI features", **never** "no app". Blocking the
      product on a privacy refusal trades a 5.1.2 problem for a
      5.1.1(v)-shaped one — and the garage, the history and the recall list are
      all useful without a model. The frame stays; nothing is filmed for
      nobody.
    */
    mockConsent = 'declined';

    const view = await render(
      <InvoiceScanScreen vehicleId="v1" pickImage={jest.fn()} onSignOut={jest.fn()} />
    );

    await view.findByText(/You can still add services by hand/);
    expect(view.queryByRole('button', { name: 'Capture' })).toBeNull();
    expect(view.queryByText('Choose from library')).toBeNull();
    expect(view.queryByTestId('camera-view')).toBeNull();
    expect(camera.requestPermission).not.toHaveBeenCalled();
    // …and it is a decision they can revisit, not a dead end.
    view.getByText('Change that');
    view.getByTestId('viewfinder-brackets');
  });

  it('sends nothing when they decline', async () => {
    mockConsent = 'declined';
    const pickImage = jest.fn();

    const view = await render(
      <InvoiceScanScreen vehicleId="v1" pickImage={pickImage} onSignOut={jest.fn()} />
    );

    await view.findByText(/You can still add services by hand/);
    expect(pickImage).not.toHaveBeenCalled();
    expect(camera.takePictureAsync).not.toHaveBeenCalled();
  });

  it('re-asks from "Change that", and a second refusal still reads as declined', async () => {
    mockConsent = 'declined';
    const user = userEvent.setup();

    const view = await render(
      <InvoiceScanScreen vehicleId="v1" pickImage={jest.fn()} onSignOut={jest.fn()} />
    );

    await user.press(await view.findByText('Change that'));
    await user.press(await view.findByText('Not now'));

    await view.findByText(/You can still add services by hand/);
    expect(view.queryByRole('button', { name: 'Capture' })).toBeNull();
  });
});
