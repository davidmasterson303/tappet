/**
 * The cost-of-ownership dialog says *Saved* only when the server saved
 * (audit 360, UX-21).
 *
 * @jest-environment jsdom
 *
 * `TCOInputsModal` awaited `updateVehicleTCOFields`, discarded its answer and
 * showed a green *Saved*, then pushed the typed numbers into the page's cost
 * figures. The action never throws — a lapsed session, a refused patch and a
 * failed write all answer `{ success: false, error }` — so every refusal read
 * as a save, and the figures on the page were never stored.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

const update = jest.fn();
jest.mock('@/app/actions', () => ({ updateVehicleTCOFields: (...a: unknown[]) => update(...a) }));

import TCOInputsModal, { NEGATIVE_FIGURE } from '@/components/TCOInputsModal';
import { COULD_NOT_SAVE, NOT_SIGNED_IN, NO_ANSWER } from '@/lib/api-error-copy';

const VEHICLE = { id: 'v1', purchase_price: 28000, avg_mpg: 28, fuel_price_per_gallon: 3.89, insurance_monthly: 120 };

function mount() {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(<TCOInputsModal open onOpenChange={onOpenChange} vehicleId="v1" vehicle={VEHICLE} onSaved={onSaved} />);
  return { onSaved, onOpenChange };
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
  });
}

beforeEach(() => update.mockReset());

describe('the dialog reports what the action answered', () => {
  it('a refusal keeps the dialog open with the server’s sentence, and the page keeps its figures', async () => {
    update.mockResolvedValue({ success: false, error: NOT_SIGNED_IN });
    const { onSaved, onOpenChange } = mount();
    await save();

    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain(NOT_SIGNED_IN);
    expect(screen.queryByText('Saved')).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('a refusal with no sentence says Tappet could not save', async () => {
    update.mockResolvedValue({ success: false });
    const { onSaved } = mount();
    await save();
    expect(screen.getByRole('alert').textContent).toContain(COULD_NOT_SAVE);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a request that threw says it may have gone through, and repaints nothing', async () => {
    update.mockRejectedValue(new Error('network'));
    const { onSaved } = mount();
    await save();
    expect(screen.getByRole('alert').textContent).toContain(NO_ANSWER);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a negative figure is refused before the request, in words that say what to fix', async () => {
    const { onSaved } = mount();
    const insurance = screen.getByDisplayValue('120');
    fireEvent.change(insurance, { target: { value: '-120' } });
    await save();
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(NEGATIVE_FIGURE);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a save that landed says Saved and repaints the page (anti-vacuous)', async () => {
    update.mockResolvedValue({ success: true });
    const { onSaved } = mount();
    await save();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSaved).toHaveBeenCalledWith({
      purchase_price: 28000,
      avg_mpg: 28,
      fuel_price_per_gallon: 3.89,
      insurance_monthly: 120,
    });
  });
});
