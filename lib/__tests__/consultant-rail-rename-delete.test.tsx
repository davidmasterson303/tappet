/**
 * The conversations rail can rename and delete — David, 11 Sep: *"i need
 * options to rename and delete chats."*
 *
 * @jest-environment jsdom
 *
 * Rendered rather than reasoned about, because the properties worth pinning
 * are about what a person sees and touches, and each is a decision somebody
 * could reverse without noticing what it cost:
 *
 *   · **The menu is reachable by keyboard and named for its row.** It is
 *     revealed by hover, so a keyboard user's only route is Tab and Enter, and
 *     a screen reader hearing "Options" five times cannot tell the rows apart.
 *   · **Rename happens in place, and the search sees it.** A title changed
 *     in the row but not in the list the search filters would match the old
 *     name and miss the new one — the same list, in two states.
 *   · **Delete asks exactly once, and the row goes only on confirm.** The
 *     wishlist shipped a delete with no question and a mis-tap cost a row.
 *   · **A refused write puts the rail back.** An optimistic change that
 *     survives its own failure shows a rail that reverts on the next load,
 *     which is worse than an error because nothing says it did not take.
 *
 * The server actions are mocked; what they decide is pinned in
 * `consultant-session-actions.test.ts`.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

const toasts: Array<{ kind: 'success' | 'error' | 'info'; message: string }> = [];
jest.mock('sonner', () => ({
  toast: {
    success: (message: string) => toasts.push({ kind: 'success', message }),
    error: (message: string) => toasts.push({ kind: 'error', message }),
    info: (message: string) => toasts.push({ kind: 'info', message }),
  },
}));

jest.mock('@/lib/supabase', () => ({ getClientSupabase: () => ({}) }));
jest.mock('@/components/QuoteRequestDialogV2', () => ({ QuoteRequestDialogV2: () => null }));

const renameConsultantSession = jest.fn();
const deleteConsultantSession = jest.fn();
const getConsultantSession = jest.fn();
const sendConsultantMessage = jest.fn();

jest.mock('@/app/actions', () => ({
  getConsultantSession: (...args: unknown[]) => getConsultantSession(...args),
  renameConsultantSession: (...args: unknown[]) => renameConsultantSession(...args),
  deleteConsultantSession: (...args: unknown[]) => deleteConsultantSession(...args),
  sendConsultantMessage: (...args: unknown[]) => sendConsultantMessage(...args),
  getConsultantSessions: jest.fn(),
  createConsultantSession: jest.fn(),
  generateSessionTitle: jest.fn(),
  recordQuotePullClick: jest.fn(),
  getSignedStorageUrl: jest.fn(),
}));

import ConsultantChat from '@/components/ConsultantChat';
import { CONSULTANT_TITLE_MAX } from '@/lib/consultant-title';

beforeAll(() => {
  // Radix's popper measures with ResizeObserver, which jsdom does not ship.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // The thread scrolls itself after a send, in a requestAnimationFrame;
  // jsdom lays nothing out and has no `scrollTo` on elements.
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
  }
});

// A real, non-demo vehicle: the demo refusal is a separate path and the
// point here is the write that goes through.
const VEHICLE = 'b2000000-0000-4000-8000-000000000001';
const VEHICLE_ROW = { id: VEHICLE, year: 2015, make: 'BMW', model: 'M235i', current_mileage: 67400 };

const BRAKES = { id: 'a1a1a1a1-0000-4000-8000-000000000001', title: 'Brake judder at speed', updated_at: '2026-03-14T10:00:00.000Z' };
const TYRES = { id: 'a2a2a2a2-0000-4000-8000-000000000002', title: 'Tyre choice for track days', updated_at: '2026-03-10T10:00:00.000Z' };
const OIL = { id: 'a3a3a3a3-0000-4000-8000-000000000003', title: 'Oil consumption after 60k', updated_at: '2026-03-01T10:00:00.000Z' };

function mount(sessions = [BRAKES, TYRES, OIL], initialSessionId: string | undefined = sessions[0]?.id) {
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

/**
 * The rail's rows, in the order they are drawn, by title.
 *
 * `hidden: true` because an open AlertDialog marks everything outside itself
 * `aria-hidden`, and the rail's state while the question is being asked is
 * exactly what two of the delete cases assert.
 */
function railTitles(): string[] {
  return screen
    .queryAllByRole('button', { name: /^Options for /, hidden: true })
    .map((button) => button.getAttribute('aria-label')!.replace(/^Options for /, ''));
}

/** Open a row's menu the way a keyboard user must — Tab lands on it, Enter opens it. */
async function openMenuFor(title: string) {
  const trigger = screen.getByRole('button', { name: `Options for ${title}` });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return {
    trigger,
    rename: await screen.findByRole('menuitem', { name: /rename/i }),
    remove: await screen.findByRole('menuitem', { name: /delete/i }),
  };
}

async function beginRename(title: string) {
  const { rename } = await openMenuFor(title);
  fireEvent.click(rename);
  return (await screen.findByRole('textbox', { name: /conversation name/i })) as HTMLInputElement;
}

beforeEach(() => {
  toasts.length = 0;
  renameConsultantSession.mockReset();
  deleteConsultantSession.mockReset();
  getConsultantSession.mockReset();
  sendConsultantMessage.mockReset();
  renameConsultantSession.mockResolvedValue({ success: true });
  deleteConsultantSession.mockResolvedValue({ success: true });
  getConsultantSession.mockResolvedValue({ success: true, data: { message_history: [] } });
});

// ---------------------------------------------------------------------------

describe('the row menu', () => {
  it('exists on every row and is named for its conversation', () => {
    mount();
    expect(railTitles()).toEqual([BRAKES.title, TYRES.title, OIL.title]);
  });

  it('opens from the keyboard with Rename and Delete, portaled out of the rail', async () => {
    mount();
    const { trigger, rename, remove } = await openMenuFor(TYRES.title);

    expect(rename).toBeInTheDocument();
    expect(remove).toBeInTheDocument();
    /*
      The rail scrolls (`overflow-y-auto`), and a menu drawn inside it would
      be clipped at its edge — the tooltip lesson of the same day. The menu
      must hang off the body, not off the row.
    */
    const row = trigger.closest('.group') as HTMLElement;
    expect(row.contains(rename)).toBe(false);
    expect(document.body.contains(rename)).toBe(true);
  });

  it('is disabled while the advisor is answering, and back once it has', async () => {
    /*
      Nothing may be renamed or deleted underneath a turn that is still being
      written to it: the server's update would land on a row that is gone, and
      the answer would arrive in a thread the rail no longer shows. The send is
      held open with an unresolved promise so the state can be observed on
      both sides of it — the resting half alone would prove nothing.
    */
    let answer!: (value: unknown) => void;
    sendConsultantMessage.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    mount();
    const trigger = screen.getByRole('button', { name: `Options for ${BRAKES.title}` });
    expect(trigger).not.toBeDisabled();

    const composer = screen.getByPlaceholderText('What do you want to know about this car?');
    fireEvent.change(composer, { target: { value: 'Is the judder the discs or the hubs?' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => expect(trigger).toBeDisabled());
    expect(sendConsultantMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer({ success: true, response: 'Discs, usually.', contextKinds: [], wishlistActions: [] });
    });
    await waitFor(() => expect(trigger).not.toBeDisabled());
  });
});

describe('rename', () => {
  it('edits in place, pre-filled and capped at the shared limit', async () => {
    mount();
    const field = await beginRename(TYRES.title);

    expect(field.value).toBe(TYRES.title);
    expect(field.maxLength).toBe(CONSULTANT_TITLE_MAX);
    // The row is the field now, not a row plus a field.
    expect(screen.queryByText(TYRES.title)).not.toBeInTheDocument();
  });

  it('saves on Enter, updates the title in place, and the search matches the new name', async () => {
    mount();
    const field = await beginRename(TYRES.title);

    fireEvent.change(field, { target: { value: 'Tyres — settled on PS4S' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    // In place: same position in the rail, new name, old name gone.
    expect(railTitles()).toEqual([BRAKES.title, 'Tyres — settled on PS4S', OIL.title]);
    expect(screen.queryByText(TYRES.title)).not.toBeInTheDocument();
    expect(screen.getByText('Tyres — settled on PS4S')).toBeInTheDocument();

    await waitFor(() =>
      expect(renameConsultantSession).toHaveBeenCalledWith(TYRES.id, 'Tyres — settled on PS4S')
    );
    expect(renameConsultantSession).toHaveBeenCalledTimes(1);

    /*
      The search filters the same list the rail draws. Searching for the new
      name finds the row; searching for the old name finds nothing — which is
      the assertion that there is one list, not a rail and a stale copy.
    */
    const search = screen.getByPlaceholderText('Search chats...');
    fireEvent.change(search, { target: { value: 'PS4S' } });
    expect(railTitles()).toEqual(['Tyres — settled on PS4S']);
    fireEvent.change(search, { target: { value: 'track days' } });
    expect(screen.getByText('No matching conversations')).toBeInTheDocument();
  });

  it('does not move the row or change its date', async () => {
    // A rename is housekeeping; the rail is ordered and dated by when the
    // thread was last spoken in.
    mount();
    const field = await beginRename(OIL.title);
    fireEvent.change(field, { target: { value: 'Oil — burning a quart per 1k' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(railTitles()[2]).toBe('Oil — burning a quart per 1k');
    const row = screen.getByText('Oil — burning a quart per 1k').closest('button') as HTMLElement;
    expect(within(row).getByText('Mar 1')).toBeInTheDocument();
    await act(async () => {});
  });

  it('discards on Escape and asks the server nothing', async () => {
    mount();
    const field = await beginRename(TYRES.title);

    fireEvent.change(field, { target: { value: 'should be thrown away' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(screen.getByText(TYRES.title)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /conversation name/i })).not.toBeInTheDocument();
    expect(renameConsultantSession).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('saves on blur — the typed name is on screen, losing it is the surprise', async () => {
    mount();
    const field = await beginRename(TYRES.title);

    fireEvent.change(field, { target: { value: 'Tyres, blurred away' } });
    fireEvent.blur(field);

    expect(screen.getByText('Tyres, blurred away')).toBeInTheDocument();
    await waitFor(() => expect(renameConsultantSession).toHaveBeenCalledWith(TYRES.id, 'Tyres, blurred away'));
  });

  it('commits once when Enter is followed by the blur it causes', async () => {
    mount();
    const field = await beginRename(TYRES.title);

    fireEvent.change(field, { target: { value: 'Once only' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);

    await act(async () => {});
    expect(renameConsultantSession).toHaveBeenCalledTimes(1);
  });

  it('treats an emptied field as a change of mind, not a request', async () => {
    mount();
    const field = await beginRename(TYRES.title);

    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByText(TYRES.title)).toBeInTheDocument();
    expect(renameConsultantSession).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('sends nothing when the name is unchanged', async () => {
    mount();
    const field = await beginRename(TYRES.title);
    fireEvent.keyDown(field, { key: 'Enter' });

    await act(async () => {});
    expect(renameConsultantSession).not.toHaveBeenCalled();
  });

  it('puts the old title back and says so when the server refuses', async () => {
    renameConsultantSession.mockResolvedValue({ success: false, error: 'Could not rename this conversation' });
    mount();
    const field = await beginRename(TYRES.title);

    fireEvent.change(field, { target: { value: 'Will not take' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    // Optimistic first…
    expect(screen.getByText('Will not take')).toBeInTheDocument();
    // …then reverted, loudly.
    await waitFor(() => expect(screen.getByText(TYRES.title)).toBeInTheDocument());
    expect(screen.queryByText('Will not take')).not.toBeInTheDocument();
    expect(toasts).toEqual([{ kind: 'error', message: 'Could not rename this conversation' }]);
  });
});

describe('delete', () => {
  it('asks once, naming the thread, and removes nothing until confirmed', async () => {
    mount();
    const { remove } = await openMenuFor(TYRES.title);
    fireEvent.click(remove);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete this conversation?')).toBeInTheDocument();
    expect(within(dialog).getByText(TYRES.title)).toBeInTheDocument();
    expect(within(dialog).getByText(/Its messages go with it\. This cannot be undone\./)).toBeInTheDocument();

    // Nothing has happened yet.
    expect(deleteConsultantSession).not.toHaveBeenCalled();
    expect(railTitles()).toEqual([BRAKES.title, TYRES.title, OIL.title]);

    fireEvent.click(within(dialog).getByRole('button', { name: /keep it/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteConsultantSession).not.toHaveBeenCalled();
    expect(railTitles()).toEqual([BRAKES.title, TYRES.title, OIL.title]);
  });

  it('removes the row on confirm and leaves the others', async () => {
    mount();
    const { remove } = await openMenuFor(TYRES.title);
    fireEvent.click(remove);
    const dialog = await screen.findByRole('alertdialog');

    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(railTitles()).toEqual([BRAKES.title, OIL.title]);
    await waitFor(() => expect(deleteConsultantSession).toHaveBeenCalledWith(TYRES.id));
    expect(deleteConsultantSession).toHaveBeenCalledTimes(1);
    // The open thread was BRAKES; deleting another row must not reload it.
    expect(getConsultantSession).toHaveBeenCalledTimes(1);
    expect(getConsultantSession).toHaveBeenCalledWith(BRAKES.id);
  });

  it('lands on the next most recent thread when the open one is deleted', async () => {
    // The same choice the page makes on load: sessions[0].
    mount();
    expect(getConsultantSession).toHaveBeenLastCalledWith(BRAKES.id);

    const { remove } = await openMenuFor(BRAKES.title);
    fireEvent.click(remove);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(railTitles()).toEqual([TYRES.title, OIL.title]);
    await waitFor(() => expect(getConsultantSession).toHaveBeenLastCalledWith(TYRES.id));
  });

  it('lands on the empty state when the last thread is deleted', async () => {
    mount([OIL], OIL.id);
    const { remove } = await openMenuFor(OIL.title);
    fireEvent.click(remove);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(await screen.findByText(/Hey, .* here\./)).toBeInTheDocument();
    await waitFor(() => expect(deleteConsultantSession).toHaveBeenCalledWith(OIL.id));
  });

  it('puts the row back in its place and says so when the server refuses', async () => {
    deleteConsultantSession.mockResolvedValue({ success: false, error: 'Could not delete this conversation' });
    mount();
    const { remove } = await openMenuFor(TYRES.title);
    fireEvent.click(remove);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    // Optimistically gone…
    expect(railTitles()).toEqual([BRAKES.title, OIL.title]);
    // …then back where it was, not at the end.
    await waitFor(() => expect(railTitles()).toEqual([BRAKES.title, TYRES.title, OIL.title]));
    expect(toasts).toEqual([{ kind: 'error', message: 'Could not delete this conversation' }]);
  });
});
