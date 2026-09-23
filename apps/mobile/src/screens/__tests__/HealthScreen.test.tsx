import { render, userEvent } from '@testing-library/react-native';

import { HealthScreen } from '../HealthScreen';
import { apiRequest } from '../../api/client';

/**
 * The account of the score, and the act under it.
 *
 * ── Why this file exists (22 Sep) ───────────────────────────────────────────
 *
 * The screen had no behaviour coverage of its own — `RecallDetailScreen.test`
 * covers the recalls section it embeds, and nothing covered the screen around
 * it. David asked for the record act here: *"add to the Health page, where
 * user lands after clicking health score. find a nice looking and logical
 * placement."* What that needs held is not that a button renders, but the two
 * things about it a later edit could quietly undo:
 *
 *   - **Where it is.** Under the verdict and its provenance, above the WHAT
 *     IS DRIVING IT divider — against the words that name the gap, the only
 *     control on that part of the page, and above the fold. The first draft
 *     put it under the drivers card and a device showed three things the
 *     source could not: it lands wedged between that card's note and the
 *     recall chip, proximity makes it read as the recalls section's act, and
 *     nine tappable controls follow it. `HealthScreen`'s own note carries
 *     the argument; this holds the order.
 *   - ⛔ **What it may not claim.** Scanning an invoice files what was done;
 *     whether the reading moves is the model's business, and on a 168k-mile
 *     car one invoice may move it a little, a lot or not at all. A button
 *     here that promised a better score would be this codebase's oldest
 *     defect family — the scan sweep that depicted an examination nobody
 *     performed, the hero timer that counted nothing, the quote bar that
 *     reached 100% mid-flight. So the wording is asserted, not just read.
 */

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

/** A car with a reading, a schedule and records — so the drivers card renders. */
function respond(over: Record<string, unknown> = {}, records = 5) {
  request.mockImplementation((path: string) => {
    if (path.startsWith('/load-maintenance-data')) {
      return Promise.resolve({
        maintenanceLineItems: Array.from({ length: records }, (_, i) => ({
          id: String(i),
          created_at: '2020-01-01T00:00:00Z',
        })),
      }) as never;
    }
    return Promise.resolve({
      vehicle: {
        id: 'v1',
        year: 2018,
        make: 'Honda',
        model: 'Accord',
        current_mileage: 94_800,
        vehicle_health_summary: {
          health_score: 61,
          summary: 'Fair.',
          last_generated: '2026-09-21T00:00:00Z',
        },
        nhtsa_data: { recalls: [] },
        ...over,
      },
      health_drivers: [
        { key: 'maintenance', label: 'Maintenance', score: 56, detail: '2 services overdue, across 9 tracked services.' },
        { key: 'recalls', label: 'Recalls', score: 100, detail: 'No open recalls on record.' },
      ],
      health_history: [],
    }) as never;
  });
}

async function mount(overrides: Partial<Parameters<typeof HealthScreen>[0]> = {}) {
  const props = {
    vehicleId: 'v1',
    title: '2018 Honda Accord',
    onSignOut: jest.fn(),
    onAskAdvisor: jest.fn(),
    onScanInvoice: jest.fn(),
    ...overrides,
  };
  return { props, view: await render(<HealthScreen {...props} />) };
}

beforeEach(() => {
  request.mockReset();
});

describe('the record act (22 Sep, David)', () => {
  /** Every string the tree rendered, in order — the order is the assertion. */
  function textInOrder(view: { toJSON: () => unknown }): string[] {
    const out: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') {
        out.push(node);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const child of (node as { children?: unknown[] }).children ?? []) walk(child);
    };
    walk(view.toJSON());
    return out;
  }

  it('sits under the verdict and its provenance, above what is driving the number', async () => {
    respond();
    const { view } = await mount();
    await view.findByText('WHAT IS DRIVING IT');

    const order = textInOrder(view);
    const at = (needle: string) => order.findIndex((line) => line.includes(needle));

    // After the sentence that names the gap, and after what it was read from.
    expect(at('Fair.')).toBeGreaterThan(-1);
    expect(at('Fair.')).toBeLessThan(at('Scan invoice'));
    expect(at('recorded service')).toBeLessThan(at('Scan invoice'));

    /*
      ⚠ And **before** the drivers — the placement a device overruled. Under
      that card the act lands between `DRIVERS_NOTE` and the recall chip,
      reads as the recalls section's, and is followed by nine controls.
    */
    expect(at('Scan invoice')).toBeLessThan(at('WHAT IS DRIVING IT'));
    expect(at('Scan invoice')).toBeLessThan(at('The score is the assessment'));
  });

  it('says what the act does, and never what it will do to the score', async () => {
    /*
      ⛔ The load-bearing case. Filing an invoice may move the reading a
      little, a lot, or not at all — the score is the model's assessment of
      the file, and a button that promised otherwise would be promising an
      outcome the product cannot deliver.
    */
    respond();
    const { view } = await mount();
    const line = await view.findByText(/An invoice adds what was done/);

    expect(line).toBeTruthy();
    for (const promise of [
      /improve/i,
      /raise/i,
      /boost/i,
      /increase/i,
      /better score/i,
      /higher/i,
      /go up/i,
      /fix (your|the) score/i,
    ]) {
      expect(textInOrder(view).join(' ')).not.toMatch(promise);
    }
  });

  it('opens the scan, and the label names the act rather than the outcome', async () => {
    respond();
    const { props, view } = await mount();
    const act = await view.findByLabelText(/^Scan an invoice/);

    expect(view.getByText('Scan invoice')).toBeTruthy();
    await userEvent.press(act);
    expect(props.onScanInvoice).toHaveBeenCalledTimes(1);
  });

  it('renders no act where the caller handed no way to scan', async () => {
    // A dead button is worse than none; the prop is optional for exactly this.
    respond();
    const { view } = await mount({ onScanInvoice: undefined });
    await view.findByText('WHAT IS DRIVING IT');

    expect(view.queryByLabelText(/^Scan an invoice/)).toBeNull();
  });

  it('carries one filled primary, and it is the act', async () => {
    /*
      `Button`'s rule — two filled primaries on one screen means neither is
      one. The only other button on this screen is the error state's
      `outline`, and that branch returns before this one.
    */
    respond();
    const { view } = await mount();
    await view.findByText('WHAT IS DRIVING IT');

    const labels = view
      .getAllByRole('button', { includeHiddenElements: true })
      .map((button) => button.props.accessibilityLabel as string | undefined);

    expect(labels.filter((label) => label?.startsWith('Scan an invoice'))).toHaveLength(1);
  });
});
