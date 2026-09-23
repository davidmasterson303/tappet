import { StyleSheet } from 'react-native';
import { render, within } from '@testing-library/react-native';

import { HealthScreen } from '../HealthScreen';
import { apiRequest } from '../../api/client';
import { surface } from '../../theme';

/**
 * The account of the score — and the act it deliberately does not carry.
 *
 * ── Why this file exists (22 Sep) ───────────────────────────────────────────
 *
 * The screen had no behaviour coverage of its own — `RecallDetailScreen.test`
 * covers the recalls section it embeds, and nothing covered the screen around
 * it. It gained a file because it gained a SCAN INVOICE primary that day
 * (David asked for it; it was placed under the verdict after a device showed
 * the slot under WHAT IS DRIVING IT wedged between two dense blocks), and
 * then lost the button again the same day:
 *
 *   *"revert #2, i dont think we need button there, it now feels redundant
 *   with button in #1."*
 *
 * ⚠ **The file stays, and holds the absence**, because an absence with a
 * reason is the thing a later pass re-adds by accident. A critic reading this
 * screen alone sees an explanation with no act on it and asks for one; the
 * answer is that the act moved to the head of the hub's lower sheet **in the
 * same change** — one tap away, at full width — so a second filled primary
 * here is one act asked for twice, not emphasis. `HealthScreen`'s own note
 * carries the reasoning; this makes losing it fail rather than merely read
 * wrong.
 */

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

/** A car with a reading, drivers and records — so the whole screen renders. */
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
          health_score: 88,
          summary: 'In good order.',
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
    ...overrides,
  };
  return { props, view: await render(<HealthScreen {...props} />) };
}

beforeEach(() => {
  request.mockReset();
});

describe('the screen carries no act of its own (22 Sep, David)', () => {
  it('explains the number and offers no scan — the hub one tap away carries that', async () => {
    respond();
    const { view } = await mount();

    // Rendered in full, so what follows are absences rather than a blank screen.
    await view.findByText('WHAT IS DRIVING IT');
    /* The band word is drawn inside the dial's SVG; its spoken name is the queryable surface. */
    expect(view.getByLabelText('Health score 88 out of 100 — Good')).toBeTruthy();
    expect(view.getByText(/Based on 5 recorded services/)).toBeTruthy();

    expect(view.queryByText('Scan invoice')).toBeNull();
    expect(view.queryByLabelText(/^Scan an invoice/)).toBeNull();
  });

  it('carries no filled primary at all while it is loaded', async () => {
    /*
      `Button`'s rule is one filled primary per screen; this screen's count is
      **zero**, which is the stronger statement and the one the decision
      makes. Counted by the label's ink: only `primaryLabel` is the page
      colour, because it is the only variant whose ground is off-white.

      ⚠ The error state keeps its `outline` "Try again"; that branch returns
      before this one, so the two never share a screen.
    */
    /*
      With a recall on file, so the screen carries its own controls — FIND A
      DEALER, MARK AS REPAIRED, ASK THE ADVISOR. Without them the count below
      would be zero for want of anything to count, which proves nothing.
    */
    respond({
      nhtsa_data: {
        recalls: [
          {
            NHTSACampaignNumber: '23V-441',
            Component: 'FUEL SYSTEM',
            Summary: 'Pump may fail.',
            Remedy: 'Dealers will replace the pump.',
          },
        ],
      },
    });
    const { view } = await mount();
    await view.findByText('WHAT IS DRIVING IT');

    const inkedPage = (node: { props: Record<string, unknown> }) =>
      ((StyleSheet.flatten(node.props.style as never) ?? {}) as { color?: unknown }).color === surface.page;

    const buttons = view.getAllByRole('button', { includeHiddenElements: true });
    // Anti-vacuous: there are controls here to have missed, and the reader can see one.
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.filter((button) => within(button).queryAllByText(/.+/).some(inkedPage))).toHaveLength(0);
    expect(inkedPage({ props: { style: { color: surface.page } } })).toBe(true);
  });
});
