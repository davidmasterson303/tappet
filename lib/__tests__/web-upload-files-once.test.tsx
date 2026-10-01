/**
 * The website files each chosen invoice once (audit 360, TL-30, TL-31, TL-32).
 *
 * @jest-environment jsdom
 *
 * `DocumentUploadDialog` rendered against a recorded server that behaves as
 * `/api/v1/upload-document` does: a filing with a key the server has filed is
 * answered with that document (`lib/invoice-filing-replay.ts`); anything else
 * is a new document. The assertion is always the server's document count.
 *
 *   TL-30  a batch refused mid-way kept every filed file selected, so the
 *          retry the dialog invites filed them again; "Continue anyway" re-ran
 *          the list its closure held, filed files included.
 *   TL-31  a lost answer said "could not be uploaded… try again", and the
 *          retry was a fresh filing — no key, nothing to replay on.
 *   TL-32  the client's health refresh had no catch.
 *
 * And the legitimate cases, which must still file: two different invoices
 * in one batch; the same invoice chosen again later.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh }),
}));

const toasts: Array<{ kind: 'success' | 'error'; message: string }> = [];
jest.mock('sonner', () => ({
  toast: {
    success: (message: string) => toasts.push({ kind: 'success', message }),
    error: (message: string) => toasts.push({ kind: 'error', message }),
  },
}));

const health = jest.fn();
jest.mock('@/app/actions', () => ({ generateVehicleHealthSummary: (...a: unknown[]) => health(...a) }));
jest.mock('@/lib/image-downscale', () => ({ downscaleImage: async (file: File) => file }));
jest.mock('@/lib/ai-consent-web', () => ({ readWebAiConsent: () => 'granted', recordWebAiConsent: jest.fn() }));

import DocumentUploadDialog from '@/components/DocumentUploadDialog';
import { filingKeyToken, lostWebFilingAnswer, WEB_FILING_WAIT_MS } from '@/lib/invoice-filing-replay';

/* ── the recorded server ─────────────────────────────────────────────────── */

type Sent = { name: string; key: string | null; bypass: boolean };
let sent: Sent[];
let documents: Array<{ name: string; key: string | null }>;
/** Per-call override: 'lose' files and then drops the answer; 'html' is a gateway page; 'hang' never answers. */
let script: Array<'lose' | 'html' | 'hang' | undefined>;

const NOT_INVOICES = new Set(['photo-of-the-car.jpg']);
const OTHER_CAR = new Set(['other-car.pdf']);

function serverFiles(form: FormData): Record<string, unknown> {
  const file = form.get('file') as File;
  const key = filingKeyToken(form.get('filingKey'));
  const bypass = form.get('bypassVehicleCheck') === 'true';
  sent.push({ name: file.name, key, bypass });

  // The replay: an earlier filing that carried this key is the answer.
  const prior = key ? documents.findIndex((d) => d.key === key) : -1;
  if (prior >= 0) return { success: true, documentId: `doc-${prior}`, itemsExtracted: 2 };

  if (NOT_INVOICES.has(file.name)) {
    return { success: false, error: 'NOT_AUTOMOTIVE_INVOICE', message: 'That photo is not a service invoice.' };
  }
  if (OTHER_CAR.has(file.name) && !bypass) {
    return { success: false, error: 'VEHICLE_MISMATCH', extractedVehicle: '2015 Civic', expectedVehicle: '2019 Outback' };
  }
  documents.push({ name: file.name, key });
  return { success: true, documentId: `doc-${documents.length - 1}`, itemsExtracted: 2 };
}

const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  if (url !== '/api/v1/upload-document') return { status: 200, json: async () => ({}) };
  const mode = script.shift();
  if (mode === 'hang') {
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  }
  const body = serverFiles(init!.body as FormData);
  if (mode === 'lose') throw new TypeError('Failed to fetch');
  if (mode === 'html') return { status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  return { status: 200, json: async () => body };
});

const filedNamed = (name: string) => documents.filter((d) => d.name === name).length;
const pdf = (name: string) => new File(['%PDF-1.4 ' + name], name, { type: 'application/pdf' });
const jpg = (name: string) => new File(['\xff\xd8 ' + name], name, { type: 'image/jpeg' });

beforeEach(() => {
  sent = [];
  documents = [];
  script = [];
  toasts.length = 0;
  refresh.mockReset();
  health.mockReset().mockResolvedValue({ success: true });
  fetchMock.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(() => {
  jest.useRealTimers();
});

const onUploadComplete = jest.fn();
function open() {
  onUploadComplete.mockReset();
  return render(<DocumentUploadDialog vehicleId="v1" open onOpenChange={() => {}} onUploadComplete={onUploadComplete} />);
}

function choose(container: HTMLElement, files: File[]) {
  const input = (container.ownerDocument.querySelector('#file-upload') ??
    container.ownerDocument.querySelector('#file-upload-more')) as HTMLInputElement;
  expect(input).not.toBeNull();
  fireEvent.change(input, { target: { files } });
}

async function pressUpload() {
  fireEvent.click(await screen.findByRole('button', { name: /^Upload \d+ Files?$/ }));
}

/* ── TL-30 ────────────────────────────────────────────────────────────────── */

describe('a batch refused mid-way (TL-30)', () => {
  it('leaves only the unfiled file selected, so pressing Upload again files nothing twice', async () => {
    const { container } = open();
    choose(container, [pdf('saturday-oil-change.pdf'), jpg('photo-of-the-car.jpg')]);
    await pressUpload();

    await screen.findByText('That photo is not a service invoice.');
    expect(filedNamed('saturday-oil-change.pdf')).toBe(1);
    expect(screen.queryByText('saturday-oil-change.pdf')).toBeNull();
    expect(screen.getByText('photo-of-the-car.jpg')).toBeTruthy();
    // What did land is shown: the history is reloaded on the refusal.
    expect(onUploadComplete).toHaveBeenCalled();

    // The owner presses the button the dialog still offers.
    await pressUpload();
    await waitFor(() => expect(sent.filter((s) => s.name === 'photo-of-the-car.jpg')).toHaveLength(2));
    expect(sent.filter((s) => s.name === 'saturday-oil-change.pdf')).toHaveLength(1);
    expect(filedNamed('saturday-oil-change.pdf')).toBe(1);
  });

  it('"Continue anyway" files the mismatched invoice once and goes on to the rest only', async () => {
    const { container } = open();
    choose(container, [pdf('first.pdf'), pdf('other-car.pdf'), pdf('third.pdf')]);
    await pressUpload();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue anyway' }));

    await waitFor(() => expect(filedNamed('third.pdf')).toBe(1));
    await waitFor(() => expect(toasts.some((t) => /Processed 1 invoice/.test(t.message))).toBe(true));
    expect(filedNamed('first.pdf')).toBe(1);
    expect(filedNamed('other-car.pdf')).toBe(1);
    // Nothing already filed was sent again — not even to be answered by the replay.
    expect(sent.map((s) => s.name)).toEqual(['first.pdf', 'other-car.pdf', 'other-car.pdf', 'third.pdf']);
    expect(sent[2].bypass).toBe(true);
    expect(sent[3].bypass).toBe(false);
  });

  it('a mismatch answered with Cancel leaves the filed invoice out of the list', async () => {
    const { container } = open();
    choose(container, [pdf('first.pdf'), pdf('other-car.pdf'), pdf('third.pdf')]);
    await pressUpload();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Continue anyway' })).toBeNull());

    expect(screen.queryByText('first.pdf')).toBeNull();
    expect(screen.getByText('other-car.pdf')).toBeTruthy();
    expect(screen.getByText('third.pdf')).toBeTruthy();
    expect(filedNamed('first.pdf')).toBe(1);
  });
});

/* ── TL-31 ────────────────────────────────────────────────────────────────── */

describe('a filing whose answer was lost (TL-31)', () => {
  it('says it may already be filed, reloads the history, and the retry is answered, not filed again', async () => {
    script = ['lose'];
    const { container } = open();
    choose(container, [pdf('dense-two-pages.pdf')]);
    await pressUpload();

    await screen.findByText(lostWebFilingAnswer('dense-two-pages.pdf'));
    expect(screen.queryByText(/could not be uploaded/)).toBeNull();
    expect(onUploadComplete).toHaveBeenCalled();
    expect(filedNamed('dense-two-pages.pdf')).toBe(1);
    // Still selected, so the retry is the same choice.
    expect(screen.getByText('dense-two-pages.pdf')).toBeTruthy();

    await pressUpload();
    await waitFor(() => expect(sent).toHaveLength(2));
    await waitFor(() => expect(toasts.some((t) => t.kind === 'success')).toBe(true));

    expect(sent[0].key).not.toBeNull();
    expect(sent[1].key).toBe(sent[0].key);
    expect(filedNamed('dense-two-pages.pdf')).toBe(1);
  });

  it('reads a gateway’s HTML page as a lost answer, not as a failure', async () => {
    script = ['html'];
    const { container } = open();
    choose(container, [pdf('slow.pdf')]);
    await pressUpload();
    await screen.findByText(lostWebFilingAnswer('slow.pdf'));
  });

  it('stops waiting at the phone’s bound and says the same', async () => {
    jest.useFakeTimers();
    script = ['hang'];
    const { container } = open();
    choose(container, [pdf('never-answers.pdf')]);
    await pressUpload();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(WEB_FILING_WAIT_MS - 1);
    });
    expect(screen.queryByText(lostWebFilingAnswer('never-answers.pdf'))).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await screen.findByText(lostWebFilingAnswer('never-answers.pdf'));
    expect(WEB_FILING_WAIT_MS).toBe(90_000);
  });
});

/* ── the legitimate cases ─────────────────────────────────────────────────── */

describe('what must still file', () => {
  it('two different invoices in one batch are two documents, under two keys', async () => {
    const { container } = open();
    choose(container, [pdf('brakes.pdf'), pdf('tyres.pdf')]);
    await pressUpload();
    await waitFor(() => expect(documents).toHaveLength(2));
    expect(sent[0].key).not.toBe(sent[1].key);
  });

  it('the same invoice chosen again later is filed again — a new choice, a new key', async () => {
    const { container } = open();
    choose(container, [pdf('receipt.pdf')]);
    await pressUpload();
    await waitFor(() => expect(documents).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('receipt.pdf')).toBeNull());

    // Later, deliberately: the same file from disk is a new File.
    choose(container, [pdf('receipt.pdf')]);
    await pressUpload();
    await waitFor(() => expect(documents).toHaveLength(2));
    expect(sent[1].key).not.toBe(sent[0].key);
  });
});

/* ── TL-32 ────────────────────────────────────────────────────────────────── */

describe('the client’s health refresh (TL-32)', () => {
  /*
    Jest fails a test on an unhandled rejection, which is the assertion: on
    the old shape (no catch) this test failed with the refresh's own error
    (observed 1 Oct). The anti-vacuous half is that the rejection really was
    produced and reached — a refresh never called would pass for nothing.
  */
  it('a thrown refresh is not an unhandled rejection', async () => {
    const thrown = new Error('An unexpected response was received from the server.');
    let rejected = 0;
    health.mockReset().mockImplementation(() => {
      rejected += 1;
      return Promise.reject(thrown);
    });
    const { container } = open();
    choose(container, [pdf('fine.pdf')]);
    await pressUpload();
    await waitFor(() => expect(rejected).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(health).toHaveBeenCalledWith('v1', true);
  });
});
