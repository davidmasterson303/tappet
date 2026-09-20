import { act, render, userEvent } from '@testing-library/react-native';

import { DescribeCarScreen } from '../DescribeCarScreen';
import { fetchModels } from '../../api/vpic';

/**
 * The escape hatch: the described car.
 *
 * These are the old add form's catalogue cases, moved with the fields on 20
 * Sep. What they prove is unchanged — the spelling applied on submit and never
 * under the finger, an unlisted make left alone, the model cleared when the
 * make changes, the year refused with a sentence, vPIC asked only once a year
 * and a make are settled — plus what is new: the screen identifies the car and
 * hands it on rather than saving it, and a failed decode's number arrives in a
 * field of its own.
 */

jest.mock('../../api/vpic', () => ({
  decodeVin: jest.fn(),
  fetchModels: jest.fn().mockResolvedValue([]),
}));

const mockModels = fetchModels as jest.MockedFunction<typeof fetchModels>;

function mount(overrides: Partial<Parameters<typeof DescribeCarScreen>[0]> = {}) {
  const props = { onIdentified: jest.fn(), ...overrides };
  return { props, view: render(<DescribeCarScreen {...props} />) };
}

beforeEach(() => {
  mockModels.mockReset().mockResolvedValue([]);
});

describe('identifying the car', () => {
  it('hands on year, make and model, described, with no number', async () => {
    const user = userEvent.setup();
    const { props, view } = mount();

    await user.type((await view).getByLabelText('Model year'), '2018');
    await user.type((await view).getByLabelText('Make'), 'Honda');
    await user.type((await view).getByLabelText('Model'), 'Accord');
    await user.press((await view).getByLabelText('Continue'));

    expect(props.onIdentified).toHaveBeenCalledWith({
      vin: null,
      year: 2018,
      make: 'Honda',
      model: 'Accord',
      trim: '',
      engine: null,
      source: 'described',
    });
  });

  it('draws no VIN field when the owner said they do not have one', async () => {
    const { view } = mount();
    expect((await view).queryByLabelText(/^VIN/)).toBeNull();
  });

  it('shows a number that failed to decode, editable, and sends it as typed', async () => {
    const user = userEvent.setup();
    const { props, view } = mount({ vin: 'JF1VA1E60G9800001', prefill: { year: 2016, make: 'Subaru' } });

    const field = (await view).getByLabelText('VIN, as read');
    expect(field.props.value).toBe('JF1VA1E60G9800001');
    expect((await view).getByLabelText('Model year').props.value).toBe('2016');
    expect((await view).getByLabelText('Make').props.value).toBe('Subaru');

    await user.type((await view).getByLabelText('Model'), 'WRX');
    await user.press((await view).getByLabelText('Continue'));

    expect(props.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ vin: 'JF1VA1E60G9800001', year: 2016, make: 'Subaru', model: 'WRX' }));
  });

  it('refuses a half-typed number in the field’s own words, and lets a cleared one through as null', async () => {
    const user = userEvent.setup();
    const { props, view } = mount({ vin: 'JF1VA1E60G98' });

    await user.type((await view).getByLabelText('Model year'), '2016');
    await user.type((await view).getByLabelText('Make'), 'Subaru');
    await user.type((await view).getByLabelText('Model'), 'WRX');
    await user.press((await view).getByLabelText('Continue'));
    expect(props.onIdentified).not.toHaveBeenCalled();
    expect((await view).getAllByText(/5 to go — a VIN is 17 characters/).length).toBeGreaterThan(0);

    await user.clear((await view).getByLabelText('VIN, as read'));
    await user.press((await view).getByLabelText('Continue'));
    expect(props.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ vin: null }));
  });

  it('cannot continue until year, make and model are in', async () => {
    const { view } = mount();
    expect((await view).getByLabelText('Continue').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('naming the car', () => {
  it('sends the catalogue spelling, not the one that was typed', async () => {
    const user = userEvent.setup();
    const { props, view } = mount();

    await user.type((await view).getByLabelText('Model year'), '2015');
    await user.type((await view).getByLabelText('Make'), 'bmw');
    await user.type((await view).getByLabelText('Model'), 'M235i');
    await user.press((await view).getByLabelText('Continue'));

    expect(props.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ make: 'BMW' }));
    // And never under the finger: the field still holds what was typed.
    expect((await view).getByLabelText('Make').props.value).toBe('bmw');
  });

  it('leaves a make it has never heard of exactly as it was typed', async () => {
    const user = userEvent.setup();
    const { props, view } = mount();

    await user.type((await view).getByLabelText('Model year'), '1999');
    await user.type((await view).getByLabelText('Make'), 'Tradesonic');
    await user.type((await view).getByLabelText('Model'), 'Runabout');
    await user.press((await view).getByLabelText('Continue'));

    expect(props.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ make: 'Tradesonic' }));
  });

  it('offers makes as they are typed, and taking one clears the model under it', async () => {
    const user = userEvent.setup();
    const { view } = mount();

    await user.type((await view).getByLabelText('Model'), 'Accord');
    await user.type((await view).getByLabelText('Make'), 'hon');
    await user.press(await (await view).findByText('Honda'));

    expect((await view).getByLabelText('Make').props.value).toBe('Honda');
    expect((await view).getByLabelText('Model').props.value).toBe('');
  });

  it('says what a model year can be, and will not send one that cannot', async () => {
    const user = userEvent.setup();
    const { props, view } = mount();

    await user.type((await view).getByLabelText('Model year'), '2055');
    await user.type((await view).getByLabelText('Make'), 'Honda');
    await user.type((await view).getByLabelText('Model'), 'Accord');

    expect(JSON.stringify((await view).toJSON())).toMatch(/Model years run from 1981/);
    await user.press((await view).getByLabelText('Continue'));
    expect(props.onIdentified).not.toHaveBeenCalled();
  });

  it('asks vPIC for models once a year and a make are both settled', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockModels.mockResolvedValue(['M235i', 'X5']);
      const { view } = mount();

      await user.type((await view).getByLabelText('Make'), 'BMW');
      expect(mockModels).not.toHaveBeenCalled();

      await user.type((await view).getByLabelText('Model year'), '2015');
      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      expect(mockModels).toHaveBeenCalledWith('BMW', 2015, expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });

  it('says why a model list is empty rather than sitting blank', async () => {
    const user = userEvent.setup();
    const { view } = mount();

    // Typing opens the panel; a press alone is a focus the harness does not model.
    await user.type((await view).getByLabelText('Model'), 'W');
    expect(JSON.stringify((await view).toJSON())).toMatch(/Pick a model year and a make/);
  });
});
