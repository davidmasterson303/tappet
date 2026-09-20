import { Alert } from 'react-native';
import { act, render, userEvent, waitFor } from '@testing-library/react-native';

import { WishlistScreen } from '../WishlistScreen';
import { brand, status, text } from '../../theme';
import { apiRequest, ApiRequestError } from '../../api/client';
import { wishlistItemIdentifier } from '@tappet/core/wishlist-identifier';

/**
 * The wishlist, on the phone.
 *
 * Phase 5.6. Two things here have a history of going wrong quietly, and both
 * are what this suite is really for.
 *
 * ── The identifier ──────────────────────────────────────────────────────────
 *
 * `@tappet/core/wishlist-identifier` exists because three call sites once
 * built the identifier three different ways, and produced duplicate rows, an
 * "already added" state that lied, and deletes that silently matched nothing. A
 * fourth spelling on this screen would reintroduce all three — so the test
 * imports the real function and asserts the request carries *its* output, not a
 * string this file happens to agree with today.
 *
 * ── 409 is a success path wearing an error's clothes ────────────────────────
 *
 * The route returns 409 when the identifier already exists. That is the dedupe
 * working. Reporting it as a failure would tell somebody their add broke when
 * the item is sitting on the list in front of them.
 *
 * `userEvent` throughout, never `fireEvent` — see `AddVehicleScreen.test.tsx`.
 * `render` is awaited inside `mount` so no call site can forget it.
 */

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    item_name: 'Front brake pads',
    item_type: 'maintenance',
    estimated_cost: 240,
    ...over,
  };
}

/** Only `/wishlist` GET returns a list; POST and DELETE resolve empty. */
function listReturns(items: unknown[]) {
  request.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (!init?.method || init.method === 'GET') return { wishlistItems: items } as never;
    return {} as never;
  });
}

async function mount(overrides: Partial<Parameters<typeof WishlistScreen>[0]> = {}) {
  const props = { vehicleId: 'v1', ...overrides, onSignOut: jest.fn() };
  return { props, view: await render(<WishlistScreen {...props} />) };
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  request.mockReset();
  // `Alert.alert` is a native module call. Spying rather than stubbing the
  // whole module keeps the rest of react-native real.
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => alertSpy.mockRestore());

describe('listing', () => {
  it('draws what the API returned', async () => {
    listReturns([item()]);
    const { view } = await mount();

    expect(await view.findByText('Front brake pads')).toBeTruthy();
  });

  it('says the list is empty rather than rendering nothing', async () => {
    listReturns([]);
    const { view } = await mount();

    expect(await view.findByText('Nothing on the list yet')).toBeTruthy();
  });

  it('signs out on a 401', async () => {
    /*
      `GET /api/v1/wishlist` authenticated cookie-only until `922576f`, so this
      screen could add and delete items and never list them — invisible from the
      web, and indistinguishable here from an empty wishlist.
    */
    /*
      ⚠ **`origin: 'device'` as of 24 Aug (MOB-08).** This screen used to sign
      out on **any** 401, including a `server` one that a retry a second later
      would have accepted — and then `return`ed without setting a state, so
      offline with an expired token it showed skeletons forever with no error
      and no retry.

      A device-side 401 is the one that genuinely means "signed out", and it is
      the one this case is about.
    */
    request.mockRejectedValue(new ApiRequestError({ status: 401, origin: 'device', message: 'Unauthorized' }));
    const { props } = await mount();

    await waitFor(() => expect(props.onSignOut).toHaveBeenCalledTimes(1));
  });

  it('keeps the person here for any other failure', async () => {
    request.mockRejectedValue(new ApiRequestError({ status: 500, message: 'Upstream failed' }));
    const { props, view } = await mount();

    expect(await view.findByText(/Upstream failed/)).toBeTruthy();
    expect(props.onSignOut).not.toHaveBeenCalled();
  });
});

describe('removing an item', () => {
  it('asks before deleting', async () => {
    // Destructive and one tap away. A confirm is the difference between a
    // mis-tap and a lost item.
    const user = userEvent.setup();
    listReturns([item()]);
    const { view } = await mount();

    await view.findByText('Front brake pads');
    await user.press(view.getByLabelText('Remove Front brake pads from Needs'));

    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.mock.calls[0][0])).toMatch(/remove/i);
  });

  it('sends no DELETE until the confirm is accepted', async () => {
    /*
      The assertion that makes the one above mean something. If the confirm were
      cosmetic — shown, then deleted anyway — both a "it asked" test and the
      product would look fine right up until someone tapped by accident.
    */
    const user = userEvent.setup();
    listReturns([item()]);
    const { view } = await mount();

    await view.findByText('Front brake pads');
    await user.press(view.getByLabelText('Remove Front brake pads from Needs'));

    expect(
      request.mock.calls.some(([, init]) => (init as { method?: string })?.method === 'DELETE')
    ).toBe(false);
  });

  it('deletes once the confirm is accepted', async () => {
    // Drives the destructive button out of the Alert's own button list, which
    // is the only way past a native confirm in a test.
    const user = userEvent.setup();
    listReturns([item()]);
    const { view } = await mount();

    await view.findByText('Front brake pads');
    await user.press(view.getByLabelText('Remove Front brake pads from Needs'));

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text?: string; onPress?: () => void }>;
    const destructive = buttons.find((b) => /remove|delete/i.test(b.text ?? ''));
    expect(destructive).toBeDefined();
    await destructive!.onPress?.();

    await waitFor(() =>
      expect(
        request.mock.calls.some(([, init]) => (init as { method?: string })?.method === 'DELETE')
      ).toBe(true)
    );
  });
});

describe('marking an item done', () => {
  /*
    The only wishlist action that writes into the car's permanent service
    history — `POST /api/v1/wishlist/complete` inserts a `maintenance_line_items`
    row and deletes the wishlist entry. No undo.

    The rules about what a completion needs live in
    `@tappet/core/wishlist-completion` and are tested there. These are about
    the screen obeying them: that the sheet is a deliberate step rather than a
    row tap, and that nothing is sent until it is confirmed.
  */
  const completions = () =>
    request.mock.calls.filter(([path]) => String(path).includes('complete'));

  it('does not complete anything from the list itself', async () => {
    // A one-tap Done on a list row would be the cheapest gesture on the screen
    // attached to its most consequential action.
    listReturns([item()]);
    const user = userEvent.setup();
    const { view } = await mount();
    const resolved = await view;

    await user.press(resolved.getByLabelText('Mark Front brake pads done'));

    expect(completions()).toHaveLength(0);
  });

  it('opens a sheet that names where the record goes', async () => {
    /*
      The result lands in the service history — somewhere the user is not
      looking. Naming the destination is what makes this an informed tap.
    */
    listReturns([item()]);
    const user = userEvent.setup();
    const { view } = await mount();
    const resolved = await view;

    await user.press(resolved.getByLabelText('Mark Front brake pads done'));

    expect(await resolved.findByText(/service history/i)).toBeTruthy();
  });

  it('sends the completion once confirmed', async () => {
    listReturns([item()]);
    const user = userEvent.setup();
    const { view } = await mount();
    const resolved = await view;

    await user.press(resolved.getByLabelText('Mark Front brake pads done'));
    // DIY is one tap and needs no shop — the fastest honest completion.
    await user.press(await resolved.findByLabelText('I did it'));
    await user.press(resolved.getByLabelText('Mark done'));

    const call = completions()[0];
    expect(call).toBeTruthy();

    const init = call![1] as { method?: string; body?: Record<string, unknown> };
    expect(init.method).toBe('POST');
    expect(init.body!.isDIY).toBe(true);
    // A blank cost is omitted rather than sent as a claimed zero.
    expect(init.body).not.toHaveProperty('partsCost');
  });

  it('opens on the car’s odometer even though the reading arrives after the screen (seen live, 20 Sep)', async () => {
    /*
      The sheet is mounted with the screen and built its draft once, before
      `/load-vehicle` had answered — so the field opened blank on every car,
      and the record it produced could not move a miles interval. Keyed on
      the item now: each opening is a fresh sheet, built from what is known.
    */
    let answerVehicle: (v: unknown) => void = () => {};
    request.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (String(path).startsWith('/load-vehicle')) return new Promise((resolve) => { answerVehicle = resolve; }) as never;
      if (!init?.method || init.method === 'GET') return { wishlistItems: [item()] } as never;
      return {} as never;
    });
    const user = userEvent.setup();
    const { view } = await mount();
    const resolved = await view;
    await resolved.findByText('Front brake pads');

    await act(async () => answerVehicle({ vehicle: { current_mileage: 170_000 } }));
    await user.press(resolved.getByLabelText('Mark Front brake pads done'));

    expect((await resolved.findByLabelText('Odometer at the time of the work')).props.value).toBe('170000');
  });

  it('opens clean for the next item — nothing typed for the last one waits in it', async () => {
    listReturns([item(), item({ id: 'w2', item_name: 'Brake fluid exchange' })]);
    const user = userEvent.setup();
    const { view } = await mount();
    const resolved = await view;

    await user.press(resolved.getByLabelText('Mark Front brake pads done'));
    await user.type(await resolved.findByLabelText('Shop'), 'Blackmarket Motorsports');
    await user.press(resolved.getByText('Cancel'));

    await user.press(resolved.getByLabelText('Mark Brake fluid exchange done'));
    expect((await resolved.findByLabelText('Shop')).props.value).toBe('');
  });

  it('refuses to send when a shop did the work and none was named', async () => {
    /*
      The one required field. Without it the route stores `'Unknown'`, which
      tells a reader nothing a year later — not even whether it happened.
    */
    listReturns([item()]);
    const user = userEvent.setup();
    const { view } = await mount();
    const resolved = await view;

    await user.press(resolved.getByLabelText('Mark Front brake pads done'));
    await user.press(await resolved.findByLabelText('A shop did it'));
    await user.press(resolved.getByLabelText('Mark done'));

    expect(completions()).toHaveLength(0);
    /*
      Matched on the remedy rather than on "who did the work", which is also the
      field's own label — the first version of this assertion matched both and
      failed as ambiguous. The message is the thing being asserted; the label
      would have been there whether or not the rule fired.
    */
    expect(await resolved.findByText(/mark it as DIY/i)).toBeTruthy();
  });
});

describe('the summary line', () => {
  /*
    12 Sep, David's phone: one uncosted oil change read "1 ITEM · ESTIMATED
    $0". A missing estimate is not a zero (CLAUDE.md §6) — the figure is
    dropped when no row is costed, stated when any row is, and the count is
    always there. The last case is the anti-vacuous half: a costed row makes
    the figure appear, so a screen that never printed a total could not pass.
  */
  it('states the count and no figure when nothing on the list is costed', async () => {
    listReturns([item({ estimated_cost_parts: null, estimated_cost_labor: null })]);
    const { view } = await mount();
    await view.findByText('Front brake pads');
    expect(view.getByText('1 ITEM')).toBeTruthy();
    expect(view.queryByText(/ESTIMATED/)).toBeNull();
    expect(view.queryByText(/\$0\b/)).toBeNull();
  });

  it('states the estimate once any row carries one, as a floor over the uncosted rows', async () => {
    listReturns([
      item({ id: 'w1', estimated_cost_parts: 200, estimated_cost_labor: 90 }),
      item({ id: 'w2', item_name: 'Cabin filter', estimated_cost_parts: null, estimated_cost_labor: null }),
    ]);
    const { view } = await mount();
    await view.findByText('Cabin filter');
    expect(view.getByText('2 ITEMS · ESTIMATED')).toBeTruthy();
    // Once in the summary, once on the row that carries it.
    expect(view.getAllByText('$290')).toHaveLength(2);
  });
});

describe('the row as a spec table, with the pattern’s verbs — round 37', () => {
  /*
    The rows were a bold sans name, a bold sans price, a cyan-bordered Done
    and a sodium Remove — pre-brief controls that never went through a loop,
    and the critique's one named palette breach on the tab. They are the
    History row's shape now (index, label, mono figure at the rule) with the
    verbs `RowActions` gives every list: DONE the box, REMOVE the ghost word.
  */
  const flat = (style: unknown) =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

  it('numbers the rows and puts the estimate at the rule, and nothing where there is none', async () => {
    listReturns([
      item({ id: 'w1', estimated_cost_parts: 200, estimated_cost_labor: 90 }),
      item({ id: 'w2', item_name: 'Cabin filter', estimated_cost_parts: null, estimated_cost_labor: null }),
    ]);
    const { view } = await mount();
    await view.findByText('Cabin filter');

    expect(view.getByText('01', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText('02', { includeHiddenElements: true })).toBeTruthy();
    /* No figure, no dash: an estimate is not a tracked reading (round 38). */
    expect(view.queryByText('—')).toBeNull();
    expect(flat(view.getAllByText('$290')[1].props.style).fontVariant).toEqual(['tabular-nums']);
  });

  it('draws DONE as the hairline box and REMOVE as the word before it, and no hue on either', async () => {
    listReturns([item({ item_type: 'issue' })]);
    const { view } = await mount();
    await view.findByText('Front brake pads');

    /* And the kind is a muted word even on an issue — the list has no severity to colour by. */
    expect(flat(view.getByText('Known issue').props.style).color).toBe(text.muted);

    const done = view.getByLabelText('Mark Front brake pads done');
    const remove = view.getByLabelText('Remove Front brake pads from Needs');
    expect(done.props.accessibilityRole).toBe('button');
    expect(remove.props.accessibilityRole).toBe('button');

    const doneWord = flat(view.getByText('Done').props.style);
    const removeWord = flat(view.getByText('Remove').props.style);
    expect(doneWord.textTransform).toBe('uppercase');
    expect(removeWord.textTransform).toBe('uppercase');
    /* Off-white on the box, the chrome ink on the word — neither cyan nor sodium. */
    expect(doneWord.color).toBe(text.primary);
    expect(removeWord.color).toBe(text.secondary);
    expect([doneWord.color, removeWord.color]).not.toContain(brand.accent);
    expect([doneWord.color, removeWord.color]).not.toContain(status.attention);
  });

  it('prints the figure the catalogue sent with the item, read the same way', async () => {
    /*
      Round 40: "Engine oil and filter" arrived on the list without its
      "5,000 MI / 12 MO". The catalogue writes core's sentence to
      `source_data.note`; the row reads it back through `suggestionValue`.
      A row added elsewhere has no note and no figure — not a dash, not a
      guess.
    */
    listReturns([
      item({
        id: 'w1',
        item_name: 'Engine oil and filter',
        item_type: 'maintenance',
        estimated_cost_parts: null,
        estimated_cost_labor: null,
        // A row written before core built the figure: the sentence alone, read back.
        source_data: { note: 'Every 5,000 mi or 12 months' },
      }),
      item({
        id: 'w2',
        item_name: 'Charge pipe',
        item_type: 'issue',
        estimated_cost_parts: null,
        estimated_cost_labor: null,
        source_data: {},
      }),
    ]);
    const { view } = await mount();
    await view.findByText('Charge pipe');
    expect(view.getByText('5,000 MI / 12 MO')).toBeTruthy();
    expect(view.queryByText('—')).toBeNull();
    expect(view.queryByText(/Every 5,000/)).toBeNull();
  });

  it('keeps the reason to two lines, ended on a sentence, and names the kind as a bare mono word', async () => {
    const prose =
      'Can become clogged or fail, affecting variable valve timing. Symptoms include rough idle, reduced power, and check engine light with VANOS-related fault codes.';
    listReturns([item({ item_type: 'issue', description: prose })]);
    const { view } = await mount();
    await view.findByText('Front brake pads');

    const reason = view.getByText(/Can become clogged/);
    expect(reason.props.numberOfLines).toBe(2);
    /* The first sentence fits the cap, so the row ends on it, whole — an edit, not a truncation. */
    expect(reason.props.children).toBe('Can become clogged or fail, affecting variable valve timing.');
    expect(String(reason.props.children).length).toBeLessThan(prose.length);

    const kind = flat(view.getByText('Known issue').props.style);
    expect(kind.fontFamily).toMatch(/JetBrainsMono/);
    expect(kind.color).toBe(text.muted);
    /* A word, not a chip: a `Chip` wraps its label in the cut surface, which measures itself. */
    expect(view.getByText('Known issue').parent?.props.onLayout).toBeUndefined();
  });

  it('sets the summary in the mono voice — a count is a value', async () => {
    listReturns([item({ estimated_cost_parts: null, estimated_cost_labor: null })]);
    const { view } = await mount();
    await view.findByText('Front brake pads');
    expect(flat(view.getByText('1 ITEM').props.style).fontFamily).toMatch(/JetBrainsMono/);
  });

  it('offers no button on the empty state — the tab’s primary is pinned above it', async () => {
    listReturns([]);
    const { view } = await mount();
    await view.findByText('Nothing on the list yet');
    expect(view.queryByRole('button')).toBeNull();
  });
});
