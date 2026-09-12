/**
 * The advisor's waits are the wait instrument, and the empty thread is not one.
 *
 * @jest-environment jsdom
 *
 * ── What this pins, and why it is rendered ──────────────────────────────────
 *
 * `ConsultantChat` said "working" in three dialects until 12 Sep: a spinner
 * beside five "thinking" stages that a 1.8s `setInterval` advanced with a
 * wrapping modulo, a spinner in the send control while files uploaded, and a
 * spinner in the add-to-needs row. The first was the invoice scanner's UX-15
 * defect in a chat — a stage list claiming boundaries the client cannot see.
 * `one-wait-instrument.test.ts` refuses the markers; this suite renders the
 * real component and pins what a person now sees at each of its waits:
 *
 *   · **The turn being written is the instrument, and it owns no clock.** The
 *     send is held open with an unresolved promise, and no interval is
 *     scheduled while it is.
 *   · **Two stages, both real.** With a file attached the thread first says it
 *     is uploading *that* file, with no byline, and only once the upload has
 *     answered does Jay's byline and "Answering" appear.
 *   · **The control that started the work says so.** The send control is
 *     `aria-busy`, carries the mark, and its accessible name is the state.
 *   · **Opening a conversation is a wait; an empty thread is not.** A session
 *     being fetched shows the instrument rather than the greeting; a thread
 *     with nothing in it shows the greeting and no arc at all.
 *
 * The server actions are mocked, as in `consultant-rail-rename-delete`.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ getClientSupabase: () => ({}) }));
jest.mock('@/components/QuoteRequestDialogV2', () => ({ QuoteRequestDialogV2: () => null }));
// An uploaded attachment renders a chip that signs its URL through TanStack;
// the chip is not under test here, and there is no QueryClient in this tree.
jest.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => null, useVehicleImage: () => null }));

const getConsultantSession = jest.fn();
const sendConsultantMessage = jest.fn();

jest.mock('@/app/actions', () => ({
  getConsultantSession: (...args: unknown[]) => getConsultantSession(...args),
  sendConsultantMessage: (...args: unknown[]) => sendConsultantMessage(...args),
  renameConsultantSession: jest.fn(),
  deleteConsultantSession: jest.fn(),
  getConsultantSessions: jest.fn(),
  createConsultantSession: jest.fn(),
  generateSessionTitle: jest.fn(),
  recordQuotePullClick: jest.fn(),
  getSignedStorageUrl: jest.fn(),
}));

import ConsultantChat from '@/components/ConsultantChat';
import { AdvisorWait } from '@/components/AdvisorWait';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
  }
});

// A real, non-demo vehicle, so the upload path runs and the model sentence prints.
const VEHICLE = 'b2000000-0000-4000-8000-000000000001';
const VEHICLE_ROW = { id: VEHICLE, year: 2015, make: 'BMW', model: 'M235i', current_mileage: 67400 };
const THREAD = { id: 'a1a1a1a1-0000-4000-8000-000000000001', title: 'Brake judder at speed', updated_at: '2026-03-14T10:00:00.000Z' };
const PLACEHOLDER = 'What do you want to know about this car?';

function mount(sessions: Array<typeof THREAD> = [THREAD], initialSessionId: string | undefined = sessions[0]?.id) {
  return render(
    <ConsultantChat
      vehicleId={VEHICLE}
      vehicle={VEHICLE_ROW}
      wishlistItems={[]}
      allServiceItems={[]}
      sessions={sessions}
      initialSessionId={initialSessionId}
    />
  );
}

/** Type a question and press Enter. */
function ask(question: string) {
  const composer = screen.getByPlaceholderText(PLACEHOLDER);
  fireEvent.change(composer, { target: { value: question } });
  fireEvent.keyDown(composer, { key: 'Enter' });
}

beforeEach(() => {
  getConsultantSession.mockReset();
  sendConsultantMessage.mockReset();
  getConsultantSession.mockResolvedValue({ success: true, data: { message_history: [] } });
});

describe('the turn being written', () => {
  it('is the instrument, in the state voice, and schedules no interval', async () => {
    let answer!: (value: unknown) => void;
    sendConsultantMessage.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const setInterval = jest.spyOn(window, 'setInterval');
    const { container } = mount();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    ask('Is the judder the discs or the hubs?');

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('data-working', 'compact');
    expect(status).toHaveAttribute('data-motion', 'live');
    expect(status.textContent).toContain('Answering');
    // The fact that is true for the whole call, naming the car it was handed.
    expect(status.textContent).toContain('Your 2015 BMW M235i’s records go to the model with the question.');
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelector('.working-sweep.is-live')).not.toBeNull();
    // Jay's byline sits above the instrument, where the answer will land.
    const turn = status.parentElement!;
    expect(turn.textContent).toMatch(/^JAY/i);
    // No timer advances anything: the five-stage list is gone, and so is its
    // clock. The only interval on the page is testing-library's own 50ms poll
    // behind `findByRole`, which is not the component's.
    expect(setInterval.mock.calls.filter(([, ms]) => ms !== 50)).toEqual([]);
    expect(container.textContent).not.toMatch(/Reviewing vehicle profile|Preparing response/);

    await act(async () => {
      answer({ success: true, response: 'Discs, usually.', contextKinds: [], wishlistActions: [] });
    });
    // Content arriving is the payoff: the instrument unmounts the moment it lands.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Discs, usually.')).toBeInTheDocument();
    setInterval.mockRestore();
  });

  it('the send control drops to the busy form and its name is the state', async () => {
    sendConsultantMessage.mockReturnValue(new Promise(() => {}));
    mount();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).not.toHaveAttribute('aria-busy');
    expect(send.querySelector('svg.working-mark')).toBeNull();

    ask('What does a hub cost?');

    const busy = await screen.findByRole('button', { name: 'Answering' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    // Not `disabled`: the primitive swallows the click and keeps focus.
    expect(busy).not.toBeDisabled();
    expect(busy.querySelector('svg.working-mark')).not.toBeNull();
    // A second press cannot fire a second send.
    fireEvent.click(busy);
    expect(sendConsultantMessage).toHaveBeenCalledTimes(1);
  });

  it('with a file attached, says it is uploading that file first — no byline — and then answers', async () => {
    let uploaded!: (value: unknown) => void;
    const fetchMock = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        uploaded = resolve;
      })
    );
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    let answer!: (value: unknown) => void;
    sendConsultantMessage.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

    const { container } = mount();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'shop-quote.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('shop-quote.pdf')).toBeInTheDocument();

    ask('Is this quote fair?');

    // Stage one: the composer's own work, named by the file, and not Jay's.
    const uploading = await screen.findByRole('status');
    expect(uploading.textContent).toContain('Uploading the file');
    expect(uploading.textContent).toContain('shop-quote.pdf');
    expect(uploading.parentElement!.textContent).not.toMatch(/^JAY/i);
    expect(screen.getByRole('button', { name: 'Uploading the file' })).toHaveAttribute('aria-busy', 'true');
    // A question has been sent, so the greeting — the un-answered state — is gone.
    expect(screen.queryByText(/Hey, Jay here/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendConsultantMessage).not.toHaveBeenCalled();

    // The boundary is the upload answering, not a timer.
    await act(async () => {
      uploaded({ json: async () => ({ success: true, document: { file_name: 'shop-quote.pdf', file_url: 'docs/q.pdf' } }) });
    });

    // Stage two: the question is with the model, and now it is Jay's turn.
    await waitFor(() => expect(sendConsultantMessage).toHaveBeenCalledTimes(1));
    const answering = screen.getByRole('status');
    expect(answering.textContent).toContain('Answering');
    expect(answering.textContent).not.toContain('Uploading');
    expect(answering.parentElement!.textContent).toMatch(/^JAY/i);
    expect(screen.getByRole('button', { name: 'Answering' })).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      answer({ success: true, response: 'Fair for the area.', contextKinds: [], wishlistActions: [] });
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    delete (globalThis as { fetch?: unknown }).fetch;
  });
});

describe('opening a conversation is a wait; an empty thread is not', () => {
  it('shows the instrument, not the greeting, while a conversation is fetched', async () => {
    let opened!: (value: unknown) => void;
    getConsultantSession.mockReturnValue(new Promise((resolve) => { opened = resolve; }));
    const { container } = mount();

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Opening this conversation');
    // Late on purpose: a fetch that lands inside 350ms paints nothing.
    expect(status.className).toMatch(/working-enter/);
    expect(screen.queryByText(/Hey, Jay here/)).not.toBeInTheDocument();

    await act(async () => {
      opened({
        success: true,
        data: {
          message_history: [
            { role: 'user', content: 'Is the judder the discs?', timestamp: '2026-03-14T10:00:00.000Z' },
            { role: 'assistant', content: 'Discs, usually.', timestamp: '2026-03-14T10:00:05.000Z' },
          ],
        },
      });
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Discs, usually.')).toBeInTheDocument();
    expect(container.querySelector('.working-sweep')).toBeNull();
  });

  it('a conversation that finishes fetching after New was pressed does not land in the new thread', async () => {
    let opened!: (value: unknown) => void;
    getConsultantSession.mockReturnValue(new Promise((resolve) => { opened = resolve; }));
    mount();
    expect(screen.getByRole('status').textContent).toContain('Opening this conversation');

    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    // New is the un-answered state at once: greeting, no instrument.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/Hey, Jay here/)).toBeInTheDocument();

    await act(async () => {
      opened({
        success: true,
        data: { message_history: [{ role: 'assistant', content: 'A late answer.', timestamp: '2026-03-14T10:00:05.000Z' }] },
      });
    });
    expect(screen.queryByText('A late answer.')).not.toBeInTheDocument();
    expect(screen.getByText(/Hey, Jay here/)).toBeInTheDocument();
  });

  it('a thread with nothing in it carries the greeting and no arc — the anti-vacuous half', () => {
    const { container } = mount([], undefined);
    expect(screen.getByText(/Hey, Jay here/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('.working-sweep')).toBeNull();
    expect(container.querySelector('.working-mark')).toBeNull();
  });
});

describe('the turn on its own', () => {
  it('prints the model sentence for a real car and not for the demo, which calls no model', () => {
    const live = render(<AdvisorWait vehicle={{ year: 2018, make: 'Honda', model: 'Accord' }} demo={false} />);
    expect(live.container.textContent).toContain('Your 2018 Honda Accord’s records go to the model with the question.');
    live.unmount();

    const demo = render(<AdvisorWait vehicle={{ year: 2018, make: 'Honda', model: 'Accord' }} demo />);
    expect(demo.container.textContent).toContain('Answering');
    expect(demo.container.textContent).not.toMatch(/model/);
  });

  it('counts the queue only when there is one', () => {
    const one = render(
      <AdvisorWait vehicle={{}} demo={false} uploading={{ fileName: 'a.pdf', fileIndex: 1, fileCount: 1 }} />
    );
    expect(one.container.textContent).toContain('Uploading the file');
    expect(one.container.textContent).not.toContain('File 1 of 1');
    one.unmount();

    const three = render(
      <AdvisorWait vehicle={{}} demo={false} uploading={{ fileName: 'b.pdf', fileIndex: 2, fileCount: 3 }} />
    );
    expect(three.container.textContent).toContain('Uploading the files');
    expect(three.container.textContent).toContain('b.pdf · File 2 of 3');
    expect(three.container.textContent).not.toMatch(/\d\s*%/);
  });
});
