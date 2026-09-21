import { render, userEvent } from '@testing-library/react-native';

import { OwnerAnswersScreen } from '../OwnerAnswersScreen';
import { apiRequest, ApiRequestError } from '../../api/client';
import type { CarIdentity } from '../../onboarding/car-identity';

/**
 * What the second screen actually sends.
 *
 * The one `POST /api/v1/vehicles` in the flow lives here, whichever door
 * identified the car, so this is the one place its body is asserted: the
 * identity as it arrived, the odometer, the modifications answer, the
 * baseline — and what is *not* in it. Every "it did not send" assertion is
 * paired with one that proves the same interaction does send under valid
 * input; an absence is only evidence when the presence is demonstrated
 * beside it.
 */

jest.mock('../../api/client', () => {
  // Spread the real module so `ApiRequestError` stays a real class — a stubbed
  // one would make `instanceof` and `.status` behave differently here than in
  // the app, which is the shape of bug this suite is meant to catch.
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

/*
  The busy control carries the wait instrument's mark, whose sweep is an
  `Animated.loop` on JS timers — and a loop still running when a test ends
  logs React's act warning for every frame. Reduced motion holds the pip
  still (`Working.tsx`: a designed still, not a stopped animation), which is
  the one thing this suite does not assert on, so it is set here rather than
  each case being wrapped in fake timers it has no other use for.
*/
jest.mock('../../motion/reduced-motion', () => ({ useReducedMotion: () => true }));

const mockApi = apiRequest as jest.MockedFunction<typeof apiRequest>;

const ACCORD: CarIdentity = {
  vin: '1HGCM82633A004352',
  year: 2003,
  make: 'Honda',
  model: 'Accord',
  trim: 'EX-V6',
  engine: '3.0L V6',
  source: 'typed',
};

function mount(overrides: Partial<Parameters<typeof OwnerAnswersScreen>[0]> = {}) {
  const props = { identity: ACCORD, onAdded: jest.fn(), onSignOut: jest.fn(), ...overrides };
  return { props, view: render(<OwnerAnswersScreen {...props} />) };
}

async function fillOdometer(
  user: ReturnType<typeof userEvent.setup>,
  view: Awaited<ReturnType<typeof render>>,
  mileage = '94800'
) {
  await user.type(view.getByLabelText('Odometer, miles'), mileage);
}

beforeEach(() => {
  mockApi.mockReset();
});

describe('adding the car', () => {
  it('names the car it is about to save, and sends what it was handed plus the odometer', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { props, view } = mount();

    expect((await view).getByText('2003 Honda Accord')).toBeTruthy();
    expect((await view).getByText('EX-V6 · 3.0L V6')).toBeTruthy();
    expect((await view).getByText('1HGCM82633A004352')).toBeTruthy();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [path, init] = mockApi.mock.calls[0];
    expect(path).toBe('/vehicles');
    expect(init).toMatchObject({ method: 'POST' });
    expect(init?.body).toEqual({
      vin: '1HGCM82633A004352',
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: 'EX-V6',
      currentMileage: 94_800,
      wantsModifications: true,
      lastServiceMileage: null,
      lastServiceAge: null,
    });
    expect(props.onAdded).toHaveBeenCalledWith('v1', '2003 Honda Accord');
  });

  it('sends null for a described car with no number — never the empty string, which UNIQUE allows once', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v2' } } as never);
    const { view } = mount({ identity: { ...ACCORD, vin: null, engine: null, trim: '', source: 'described' } });

    expect((await view).queryByText('1HGCM82633A004352')).toBeNull();
    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));

    expect((mockApi.mock.calls[0][1]?.body as Record<string, unknown>).vin).toBeNull();
  });

  it('never puts a user_id in the body', async () => {
    /*
      Ownership comes from the verified session, and the route takes it from
      `caller.userId`. A client-supplied `user_id` reads as authoritative even
      when the handler ignores it. `create-vehicle-route.test.ts` holds the
      server half; this is the client half of the same rule.
    */
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { view } = mount();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));

    const keys = Object.keys(mockApi.mock.calls[0][1]?.body as Record<string, unknown>).map((k) => k.toLowerCase());
    expect(keys).not.toContain('user_id');
    expect(keys).not.toContain('userid');
  });

  it('cannot be pressed until the odometer is in — the one keyboard on the screen', async () => {
    const { view } = mount();
    expect((await view).getByLabelText('Add to my garage').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('the mileage rule', () => {
  it('refuses an implausible reading without spending a round trip, and says why', async () => {
    const user = userEvent.setup();
    const { view } = mount();

    await fillOdometer(user, await view, '9999999');
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(mockApi).not.toHaveBeenCalled();
    expect((await view).getByText(/(digits|reading|mileage)/i)).toBeTruthy();
  });

  it('but does send when the reading is fine — proving the refusal is real', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { view } = mount();

    await fillOdometer(user, await view, '170000');
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(mockApi).toHaveBeenCalledTimes(1);
    expect((mockApi.mock.calls[0][1]?.body as Record<string, unknown>).currentMileage).toBe(170_000);
  });
});

describe('the modifications question', () => {
  it('defaults to interested, and carries "not for me" through because it hides a whole surface', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { view } = mount();

    expect((await view).getByLabelText('Yes').props.accessibilityState).toMatchObject({ selected: true });
    await user.press((await view).getByLabelText('Not for me'));
    expect((await view).getByLabelText('Not for me').props.accessibilityState).toMatchObject({ selected: true });

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));
    expect((mockApi.mock.calls[0][1]?.body as Record<string, unknown>).wantsModifications).toBe(false);
  });
});

describe('the oil-change baseline, one chip row', () => {
  it('offers the five answers by their full names to a screen reader', async () => {
    const { view } = mount();
    for (const label of ['Just done', 'In the last 6 months', '6 to 12 months ago', 'Over a year ago', "I'm not sure"]) {
      expect((await view).getByLabelText(label)).toBeTruthy();
    }
    // And there is no keyboard for it: no mileage-at-service field.
    expect((await view).queryByLabelText(/last oil change/i)).toBeNull();
  });

  it('sends "just done" with the odometer as the service mileage', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { view } = mount();

    await fillOdometer(user, await view, '94800');
    await user.press((await view).getByLabelText('Just done'));
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(mockApi.mock.calls[0][1]?.body).toMatchObject({ lastServiceAge: 'just-done', lastServiceMileage: 94_800 });
  });

  it('sends any other age on its own — no mileage is inferred for it', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { view } = mount();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('In the last 6 months'));
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(mockApi.mock.calls[0][1]?.body).toMatchObject({ lastServiceAge: 'under-6-months', lastServiceMileage: null });
  });

  it('lets an answer be unselected, so a mis-tap is recoverable', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({ vehicle: { id: 'v1' } } as never);
    const { view } = mount();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Over a year ago'));
    await user.press((await view).getByLabelText('Over a year ago'));
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(mockApi.mock.calls[0][1]?.body).toMatchObject({ lastServiceAge: null, lastServiceMileage: null });
  });
});

describe('when the request fails', () => {
  it('signs out on a device-side 401 rather than showing an error nobody can act on', async () => {
    const user = userEvent.setup();
    mockApi.mockRejectedValue(new ApiRequestError({ status: 401, message: 'Not signed in', origin: 'device' }));
    const { props, view } = mount();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));

    expect(props.onSignOut).toHaveBeenCalledTimes(1);
    expect(props.onAdded).not.toHaveBeenCalled();
  });

  it("shows the route's own sentence for a VIN that is already somebody's car", async () => {
    /*
      The 22 Aug dead end: another account's VIN bounced to the garage with no
      message. The route answers 409 with a sentence now, and it is shown
      here, with the answers kept, so the owner can read the number over.
    */
    const user = userEvent.setup();
    mockApi.mockRejectedValue(
      new ApiRequestError({ status: 409, message: 'A car with that VIN is already in a garage.', origin: 'server' })
    );
    const { props, view } = mount();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));

    expect((await view).getByText('A car with that VIN is already in a garage.')).toBeTruthy();
    expect(props.onSignOut).not.toHaveBeenCalled();
    expect(props.onAdded).not.toHaveBeenCalled();
    expect((await view).getByLabelText('Odometer, miles').props.value).toBe('94800');
  });

  it('reports a 200 that carried no vehicle rather than navigating nowhere', async () => {
    const user = userEvent.setup();
    mockApi.mockResolvedValue({} as never);
    const { props, view } = mount();

    await fillOdometer(user, await view);
    await user.press((await view).getByLabelText('Add to my garage'));

    expect((await view).getByText('The car was not saved. Try again.')).toBeTruthy();
    expect(props.onAdded).not.toHaveBeenCalled();
  });
});
