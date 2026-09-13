import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

import { ServiceScreen } from '../ServiceScreen';
import { apiRequest } from '../../api/client';
import { border } from '../../theme';

/**
 * The Service root's frame — what stays pinned above both segments.
 *
 * The segments have their own suites; this one holds the two things the
 * container added in round 34 of the design loop, both of which a segment
 * test cannot see because neither is a segment's: the car's name under the
 * band, and the hairline that closes the pinned block so the list passes
 * under a rule rather than a slab.
 */

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (path: string) => {
    if (path.startsWith('/load-vehicle')) {
      return {
        vehicle: { year: 2015, make: 'BMW', model: 'M235i', current_mileage: 66_000 },
        knowledge: { maintenance_schedule: [] },
      } as never;
    }
    if (path.startsWith('/load-maintenance-data')) {
      return { lineItems: [], maintenanceLineItems: [] } as never;
    }
    return {} as never;
  });
});

async function mount(vehicleTitle?: string) {
  return render(
    <ServiceScreen
      vehicleId="v1"
      vehicleTitle={vehicleTitle}
      onScan={jest.fn()}
      onOpenVisit={jest.fn()}
      onSignOut={jest.fn()}
    />
  );
}

describe('the root names its car', () => {
  it('draws the title it is given, in the mono caps, above the rail', async () => {
    /*
      Round 34, B2: *"nothing says which car this Due list belongs to, and a
      garage can hold more than one."* The Advisor root's line, in its voice.
    */
    const view = await mount('2015 BMW M235i');

    const line = await view.findByText('2015 BMW M235i');
    expect(StyleSheet.flatten(line.props.style).textTransform).toBe('uppercase');
  });

  it('draws nothing when the route carried no name — never "undefined"', async () => {
    const view = await mount(undefined);

    await view.findByText('Scan invoice');
    expect(view.queryByText(/undefined/)).toBeNull();
  });

  it('leaves the name to the back label when pushed under a native header', async () => {
    /*
      Pushed from the car's hub the header already reads "‹ BMW M235I"; the
      same name under it is the two-names-on-one-screen `ScreenTitle` retired.
      `canGoBack()` is the question `RootScreen` asks, so they cannot disagree.
    */
    const navigation = { canGoBack: () => true } as never;
    const view = await render(
      <NavigationContext.Provider value={navigation}>
        <ServiceScreen
          vehicleId="v1"
          vehicleTitle="2015 BMW M235i"
          onScan={jest.fn()}
          onOpenVisit={jest.fn()}
          onSignOut={jest.fn()}
        />
      </NavigationContext.Provider>
    );

    await view.findByText('Scan invoice');
    expect(view.queryByText('2015 BMW M235i')).toBeNull();
  });
});

describe('the pinned band closes with a rule', () => {
  it('draws a hairline under the primary, so the list passes under a rule', async () => {
    /*
      Round 34, B5: content scrolled under the pinned SCAN INVOICE with nothing
      marking the edge. The rule is on the control's wrapper, full-bleed.
    */
    const view = await mount('2015 BMW M235i');
    await view.findByRole('button', { name: 'Scan invoice' });

    // The innermost host node that carries a bottom hairline and holds the
    // primary — measured off the rendered tree, not asserted off a style name.
    const ruled = ruledAncestorsOf(view.toJSON(), 'Scan invoice');
    expect(ruled.length).toBeGreaterThan(0);
    const style = StyleSheet.flatten(ruled[ruled.length - 1] as never) as {
      borderBottomWidth?: number;
      borderBottomColor?: string;
    };
    expect(style.borderBottomWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.borderBottomColor).toBe(border.panel);
  });
});

type Host = { type?: string; props?: { style?: unknown }; children?: unknown[] } | string | null;

/** The styles of every host node with a bottom hairline that contains `label`, outermost first. */
function ruledAncestorsOf(node: Host | Host[], label: string): unknown[] {
  const found: unknown[] = [];
  const holds = (n: Host | Host[]): boolean => {
    if (n === null || n === undefined) return false;
    if (typeof n === 'string') return n === label;
    if (Array.isArray(n)) return n.some(holds);
    return (n.children ?? []).some((child) => holds(child as Host));
  };
  const walk = (n: Host | Host[]) => {
    if (n === null || n === undefined || typeof n === 'string') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const style = StyleSheet.flatten(n.props?.style as never) as { borderBottomWidth?: number } | undefined;
    if (style?.borderBottomWidth && holds(n)) found.push(n.props?.style);
    (n.children ?? []).forEach((child) => walk(child as Host));
  };
  walk(node);
  return found;
}
