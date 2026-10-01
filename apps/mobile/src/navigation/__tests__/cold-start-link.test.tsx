import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
  getStateFromPath,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { carNamedAbove, linking, withCar } from '../RootNavigator';

/**
 * Audit 360, TL-1 (1 Oct) — a notification tapped from a cold start lands on
 * the car it names, and stays there.
 *
 * `carLinks` carries `initialRouteName: 'VehicleDetail'`, so the recall link
 * seeds the Car tab as `[VehicleDetail (no params), RecallDetail { id }]`.
 * The root drew `FirstCar`, which opened `cars[0]` with `pop: true` within a
 * second — popping the recall away and, on a two-car garage, showing the
 * other car. The earlier guard (`mobile-push-routing.test.ts`) asserted only
 * that the string `initialRouteName: 'VehicleDetail'` was in the source.
 *
 * This mounts real navigators seeded from the **real** linking config
 * through the library's own `getStateFromPath`, with the real `withCar` and
 * `FirstCar` at the root and only the car set stubbed.
 */

jest.mock('../../components/switcher/car-set', () => {
  const actual = jest.requireActual('../../components/switcher/car-set');
  return {
    ...actual,
    useCarSet: () => ({
      // The *other* car first, as the API may list it.
      cars: [
        { id: 'car-one', name: '2019 Honda Civic' },
        { id: 'car-two', name: '2015 BMW M235i' },
      ],
      status: 'ok',
      reload: () => undefined,
    }),
  };
});

const Root = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const Car = createNativeStackNavigator();

function CarStack() {
  return (
    <Car.Navigator initialRouteName="VehicleDetail">
      <Car.Screen name="VehicleDetail">
        {({ route, navigation }) =>
          withCar(route as never, navigation as never, 'Car', (id) => <Text>{`car page ${id}`}</Text>)
        }
      </Car.Screen>
      <Car.Screen name="RecallDetail">
        {({ route }) => <Text>{`recalls for ${(route.params as { vehicleId: string }).vehicleId}`}</Text>}
      </Car.Screen>
      <Car.Screen name="Health">{() => <Text>health</Text>}</Car.Screen>
      <Car.Screen name="Tires">{() => <Text>tires</Text>}</Car.Screen>
      <Car.Screen name="InvoiceScan">{() => <Text>scan</Text>}</Car.Screen>
    </Car.Navigator>
  );
}

function App({ url, navRef }: { url: string; navRef: ReturnType<typeof createNavigationContainerRef> }) {
  const initialState = getStateFromPath(url, linking.config as never);
  return (
    <NavigationContainer ref={navRef} initialState={initialState as never}>
      <Root.Navigator>
        <Root.Screen name="Tabs">
          {() => (
            <Tabs.Navigator>
              <Tabs.Screen name="CarTab" component={CarStack} />
            </Tabs.Navigator>
          )}
        </Root.Screen>
      </Root.Navigator>
    </NavigationContainer>
  );
}

function carTab(navRef: ReturnType<typeof createNavigationContainerRef>) {
  const root = navRef.getRootState()!;
  const tabs = root.routes[0].state as { routes: Array<{ name: string; state?: unknown }> };
  const car = tabs.routes.find((r) => r.name === 'CarTab')?.state as {
    index: number;
    routes: Array<{ name: string; params?: { vehicleId?: string } }>;
  };
  return car;
}

describe('a cold-start car link — audit 360, TL-1', () => {
  it('seeds the root with no car, which is the shape the fix answers', () => {
    // Pins the library behaviour the fix rests on: if a future React
    // Navigation seeds params, this fails and the adoption can be retired.
    const state = getStateFromPath('vehicle/car-two/recalls', linking.config as never) as never as {
      routes: Array<{ state: { routes: Array<{ state: { routes: Array<{ name: string; params?: object }> } }> } }>;
    };
    const car = state.routes[0].state.routes[0].state.routes;
    expect(car.map((r) => r.name)).toEqual(['VehicleDetail', 'RecallDetail']);
    expect(car[0].params).toBeUndefined();
  });

  it.each([
    ['vehicle/car-two/recalls', 'RecallDetail'],
    ['vehicle/car-two/health', 'Health'],
    ['vehicle/car-two/tires', 'Tires'],
    ['vehicle/car-two/scan', 'InvoiceScan'],
  ])('%s stays on %s, about the car it names', async (url, top) => {
    const navRef = createNavigationContainerRef();
    await render(<App url={url} navRef={navRef} />);
    // Let FirstCar's effect (old shape) or the adoption (new shape) run.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const car = carTab(navRef);
    expect(car.routes.map((r) => r.name)).toEqual(['VehicleDetail', top]);
    expect(car.index).toBe(1);
    // Back from the linked screen lands on the linked car, not cars[0].
    expect(car.routes[0].params?.vehicleId).toBe('car-two');
  });

  it('shows the linked screen and keeps the right car under it', async () => {
    const navRef = createNavigationContainerRef();
    const view = await render(<App url="vehicle/car-two/recalls" navRef={navRef} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(view.getByText('recalls for car-two')).toBeTruthy();
    expect(view.queryByText('car page car-one')).toBeNull();
  });
});

describe('carNamedAbove', () => {
  const nav = (routes: Array<{ key: string; params?: object }>) => ({ getState: () => ({ routes }) });

  it('finds the car a route above names', () => {
    expect(carNamedAbove(nav([{ key: 'a' }, { key: 'b', params: { vehicleId: 'v2' } }]), 'a')).toBe('v2');
  });

  it('ignores routes below, and a root with nothing above', () => {
    expect(carNamedAbove(nav([{ key: 'a', params: { vehicleId: 'v1' } }, { key: 'b' }]), 'b')).toBeUndefined();
    expect(carNamedAbove(nav([{ key: 'a' }]), 'a')).toBeUndefined();
    expect(carNamedAbove(nav([{ key: 'a' }]), undefined)).toBeUndefined();
  });
});
