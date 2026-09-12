/**
 * What has been done to this car, on the phone.
 *
 * The phone could write to the service record three ways and read it back
 * nowhere. These cover the reading — and specifically the part that is easy to
 * ship wrong: a list makes every row look equally solid, and one of them may be
 * something the owner half-remembered on a sign-up screen.
 */

import { Alert } from 'react-native';
import { render, userEvent, waitFor } from '@testing-library/react-native';

import { ServiceHistoryScreen } from '../ServiceHistoryScreen';
import { apiRequest, ApiRequestError } from '../../api/client';

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

/**
 * ⚠ Both keys, always, and carrying different things.
 *
 * `/load-maintenance-data` returns `lineItems` (`invoice_line_items` — a
 * description and a price, no date) alongside `maintenanceLineItems` (the
 * service record). `ServiceMilestoneScreen` read the wrong one until 12 Aug
 * 2026 and its suite could not tell, because the mock returned only the key the
 * screen happened to read.
 *
 * The decoy here names a service that is not in the real record, so a screen
 * reading it would show a row that should not exist.
 */
function respondWith(maintenanceLineItems: unknown[]) {
  request.mockImplementation(async () => ({
    lineItems: [{ description: 'Cabin air filter', quantity: 1, total_price: 40 }],
    maintenanceLineItems,
  }) as never);
}

const INVOICE_ROW = {
  id: 'm1',
  item_description: 'Front brake pads & rotors, replace',
  service_date: '2026-08-02',
  shop_name: 'BLACKMARKET MOTORSPORTS',
  total_cost: 678,
  mileage_at_service: 61_400,
  source: 'vision',
  // 22 of 35 live rows carry one. Without it the removal copy correctly
  // withholds the "the invoice survives" reassurance — which is how the first
  // version of this fixture found out the rule is precise.
  source_document_id: 'doc-1',
};

const RECOLLECTION_ROW = {
  id: 'm2',
  item_description: 'Timing belt',
  service_date: '2024-05-01',
  total_cost: null,
  mileage_at_service: 48_000,
  source: 'owner-onboarding',
};

function mount() {
  return render(<ServiceHistoryScreen vehicleId="v1" onScan={jest.fn()} onOpenVisit={jest.fn()} onSignOut={jest.fn()} />);
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  request.mockReset();
  // Spying rather than stubbing the module keeps the rest of react-native real.
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('reading the record', () => {
  it('draws what the service record returned', async () => {
    respondWith([INVOICE_ROW]);
    const view = await mount();

    expect(await view.findByText(/Front brake pads/)).toBeTruthy();

    /*
      ⚠ **R34, 23 Aug.** The shop is the visit's heading now, and it appears
      **once** — it used to render twice per row, in caps both times, and up to
      six times on a five-line invoice.

      Title-cased on display because the source is OCR off a printed header, not
      something anybody typed. `displayShopName` only does this to a name that
      is entirely upper-case; a name with any lower-case letter is left alone.
    */
    expect(view.getAllByText('Blackmarket Motorsports')).toHaveLength(1);
    expect(view.queryByText(/BLACKMARKET MOTORSPORTS/)).toBeNull();
  });

  it('does not draw invoice lines as though they were services', async () => {
    /*
      The bug that was live on the sibling screen. If this one ever reads
      `lineItems`, the decoy appears and this goes red.
    */
    respondWith([INVOICE_ROW]);
    const view = await mount();

    await view.findByText(/Front brake pads/);
    expect(view.queryByText(/Cabin air filter/)).toBeNull();
  });

  it('says the list is empty rather than rendering nothing', async () => {
    respondWith([]);
    const view = await mount();

    expect(await view.findByText('Nothing recorded yet')).toBeTruthy();
  });
});

describe('provenance', () => {
  /*
    The reason this screen is worth building carefully. `20260808150000` added
    `'owner-onboarding'` rather than reusing `'manual'` so the product could say
    "an invoice is evidence, a recollection is not" — and a list is where that
    distinction is either visible or lost.
  */

  it('attributes a visit read from an invoice, and says how many lines', async () => {
    /*
      ⚠ **R17.** The provenance belongs to the **visit**, not to each line, and
      it now names the invoice's size — which is the fact that used to be
      repeated on every child row and is true exactly once here.
    */
    respondWith([INVOICE_ROW]);
    const view = await mount();

    expect(await view.findByText('Read from a 1-line invoice you scanned')).toBeTruthy();
  });

  it('says it once for a multi-line invoice, not once per line', async () => {
    /*
      The defect in full: five line items off one document drew five cards, each
      repeating "From a scan of 5 lines · BLACKMARKET MOTORSPORTS · $1,461
      total". One visit, one sentence, and the shop above it rather than inside
      it five times.
    */
    respondWith([
      INVOICE_ROW,
      { ...INVOICE_ROW, id: 'm2', item_description: 'Oil change', total_cost: 152 },
      { ...INVOICE_ROW, id: 'm3', item_description: 'Spark plugs', total_cost: 294 },
    ]);
    const view = await mount();

    expect(await view.findByText('Read from a 3-line invoice you scanned')).toBeTruthy();
    expect(view.getAllByText('Blackmarket Motorsports')).toHaveLength(1);

    /*
      The visit's total is summed over its three lines. Two nodes carry it here
      and both are right: the screen's summary covers the whole history, and
      with one visit on file the two scopes happen to agree. The line items
      themselves must still show their own figures.
    */
    expect(view.getAllByText('$1,124')).toHaveLength(2);
    view.getByText('$678');
    view.getByText('$152');
    view.getByText('$294');
  });

  it('keeps a hand-recorded line as its own visit', async () => {
    /*
      ⚠ Marking something done on the wishlist writes a line with no source
      document. Those are separate events, and bucketing them together would
      claim they happened on one afternoon at one shop.
    */
    respondWith([
      { ...RECOLLECTION_ROW, id: 'r1', item_description: 'Coolant flush' },
      { ...RECOLLECTION_ROW, id: 'r2', item_description: 'Alignment' },
    ]);
    const view = await mount();

    await view.findByText('Coolant flush');
    expect(view.getAllByText(/told us at sign-up/i)).toHaveLength(2);
  });

  it('marks a recollection as one, in different words', async () => {
    respondWith([RECOLLECTION_ROW]);
    const view = await mount();

    const label = await view.findByText(/told us at sign-up/i);
    expect(label).toBeTruthy();
    // And it must not be dressed as a record.
    expect(view.queryByText(/invoice you scanned/)).toBeNull();
  });

  it('says nothing at all for a row with no source', async () => {
    /*
      Rows predate the column. An unattributed row is old, not suspicious, and
      inventing an attribution is the failure the column exists to prevent.
    */
    respondWith([{ ...INVOICE_ROW, source: null }]);
    const view = await mount();

    await view.findByText(/Front brake pads/);
    expect(view.queryByText(/Read from an invoice/)).toBeNull();
    expect(view.queryByText(/told us at sign-up/i)).toBeNull();
  });
});

describe('the total', () => {
  it('says how many rows it covers when it does not cover them all', async () => {
    /*
      A total over some rows read as a total over all of them is the misreading
      this line exists to prevent. `RECOLLECTION_ROW` has no cost.
    */
    respondWith([INVOICE_ROW, RECOLLECTION_ROW]);
    const view = await mount();

    /*
      ⚠ Re-pointed 11 Sep from "across 1 of 2". The qualifier is one word now —
      "1 priced" beside "2 services" — because "recorded across 1 of 2" read as
      an unfinished sentence. The claim is the same: a total over some rows is
      never read as a total over all of them.
    */
    expect(await view.findByText(/2 services · 1 priced/)).toBeTruthy();
  });

  it('does not qualify a total that covers everything', async () => {
    respondWith([INVOICE_ROW]);
    const view = await mount();

    await view.findByText(/Front brake pads/);
    expect(view.queryByText(/priced/)).toBeNull();
  });
});

describe('failure', () => {
  it('shows an error rather than an empty list', async () => {
    /*
      "No service history" and "we could not load it" look identical as a blank
      screen and mean opposite things. The route was changed for this exact
      reason; throwing it away here would undo that.
    */
    request.mockRejectedValue(new ApiRequestError({ status: 0, message: 'Network unavailable' }));
    const view = await mount();

    expect(await view.findByText('Could not load the service history')).toBeTruthy();
    expect(view.queryByText('Nothing recorded yet')).toBeNull();
  });

  it('signs out on a 401', async () => {
    const onSignOut = jest.fn();
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

    await render(<ServiceHistoryScreen vehicleId="v1" onScan={jest.fn()} onOpenVisit={jest.fn()} onSignOut={onSignOut} />);

    await waitFor(() => expect(onSignOut).toHaveBeenCalled());
  });

  it('lets the person retry', async () => {
    request.mockRejectedValueOnce(new ApiRequestError({ status: 0, message: 'Network unavailable' }));
    const user = userEvent.setup();
    const view = await mount();

    await view.findByText('Could not load the service history');
    respondWith([INVOICE_ROW]);
    await user.press(view.getByLabelText('Try again'));

    expect(await view.findByText(/Front brake pads/)).toBeTruthy();
  });
});

describe('removing a record', () => {
  /*
    Irreversible, and the consequences are invisible on the row — the schedule
    counts a service's next due date from the last record of it. So this is
    confirmed, and the confirmation says what is lost rather than asking a
    question the person cannot answer from what is in front of them.
  */
  const deletes = () =>
    request.mock.calls.filter(([path]) => String(path).includes('delete-maintenance-item'));

  it('asks before removing anything', async () => {
    respondWith([INVOICE_ROW]);
    const user = userEvent.setup();
    const view = await mount();

    await user.press(await view.findByLabelText(/Remove Front brake pads/));

    expect(alertSpy).toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });

  it('names what removal costs, not just that it is permanent', async () => {
    respondWith([INVOICE_ROW]);
    const user = userEvent.setup();
    const view = await mount();

    await user.press(await view.findByLabelText(/Remove Front brake pads/));

    const [, body] = alertSpy.mock.calls[0];
    // The consequence that reaches past this screen.
    expect(String(body).toLowerCase()).toContain('due date');
    // And the reassurance that this is a correction, not a loss.
    expect(String(body).toLowerCase()).toContain('invoice');
  });

  it('deletes only once the confirm is accepted', async () => {
    respondWith([INVOICE_ROW]);
    const user = userEvent.setup();
    const view = await mount();

    await user.press(await view.findByLabelText(/Remove Front brake pads/));

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const confirm = buttons.find((b) => b.text === 'Remove');
    confirm?.onPress?.();

    await waitFor(() => expect(deletes()).toHaveLength(1));

    const [, init] = deletes()[0] as [string, { method?: string; body?: Record<string, unknown> }];
    expect(init.method).toBe('POST');
    // The route's allowlist maps this to `maintenance_line_items`; sending the
    // wrong type would silently address a different table.
    expect(init.body!.itemType).toBe('maintenance_line_item');
    expect(init.body!.itemId).toBe('m1');
  });
});

/**
 * The maintenance history is searchable, and stays that way.
 *
 * ── ⚠ Why this is a test and not a roadmap line ─────────────────────────────
 *
 * David asked for "maintenance history needs to be searchable" as a
 * requirement. It was already built — the filter field has been on this screen
 * for a while — so filing it as planned work would have bought something that
 * already exists, which is the exact failure `CLAUDE.md` opens with.
 *
 * What it did **not** have was a guard. A search field is a `useState`, a
 * filter and a control, and any of the three can be dropped in a refactor
 * without a single test going red; the screen keeps rendering every row and
 * looks entirely correct. So the requirement is recorded here, where it is
 * enforced, rather than on a board that can drift out of date.
 */
describe('finding something in the record', () => {
  it('narrows the list to what was typed', async () => {
    respondWith([INVOICE_ROW, RECOLLECTION_ROW]);
    const view = await mount();
    await view.findByText(/Front brake pads/);

    await userEvent.type(view.getByLabelText('Search this service history'), 'timing');

    await waitFor(() => expect(view.queryByText(/Front brake pads/)).toBeNull());
    expect(view.getByText(/Timing belt/)).toBeTruthy();
  });

  /*
    ⚠ The anti-vacuous half. The case above passes if the filter matched
    nothing and the list happened to be empty for some other reason, so this
    proves both rows are reachable to begin with — without it, a search that
    hid *everything* would look like a search that worked.
  */
  it('shows both rows before anything is typed, so the case above is real', async () => {
    respondWith([INVOICE_ROW, RECOLLECTION_ROW]);
    const view = await mount();

    expect(await view.findByText(/Front brake pads/)).toBeTruthy();
    expect(view.getByText(/Timing belt/)).toBeTruthy();
  });
});

/**
 * ── 12 Sep · the search is the list's, and the scan is the root's ───────────
 *
 * Two things the round-30 critique cut, held here so they do not creep back:
 * the field was pinned above the scroller with the rail and the primary
 * (~220pt of chrome under the nav), and the empty state offered a second SCAN
 * AN INVOICE 400px under the pinned one.
 */
describe('what the list carries, and what the root does', () => {
  it('scrolls the search away with the list, rather than pinning it', async () => {
    respondWith([INVOICE_ROW, RECOLLECTION_ROW]);
    const view = await mount();
    await view.findByText(/Front brake pads/);

    /*
      The input is a descendant of the scroller in the host tree. Pinned, it
      sat beside the scroller as a sibling — which is what this walk refuses.
    */
    const inside = (node: unknown, within: boolean): boolean => {
      if (!node || typeof node !== 'object') return false;
      const host = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
      if (host.props?.accessibilityLabel === 'Search this service history') return within;
      const scroller = within || host.type === 'RCTScrollView';
      return (host.children ?? []).some((child) => inside(child, scroller));
    };

    expect(inside(view.toJSON(), false)).toBe(true);
  });

  it('offers one scan control per screen — the empty state carries none of its own', async () => {
    respondWith([]);
    const view = await mount();

    await view.findByText('Nothing recorded yet');
    // The pinned primary on the Service root is the door; a second button
    // with the same label is a screen that cannot decide.
    expect(view.queryByRole('button', { name: /scan/i })).toBeNull();
    // The body still names the way in — words, not a second control.
    expect(view.getByText(/Scan an invoice, or mark something done/)).toBeTruthy();
  });
});
