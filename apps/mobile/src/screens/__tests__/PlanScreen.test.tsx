/**
 * The Plan root keeps a way to add to Needs once rows exist.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * `WishlistScreen`'s empty state carries "See suggestions" and, by its own
 * note, hands the job to the header's `+` once there are rows. The 11 Sep
 * tab rebuild replaced that header with `RootScreen`'s band and nothing put
 * the control back — a list with one item on it had no way to gain a second,
 * which David hit on his phone the same night. The control now lives in the
 * band's trailing slot, as the Garage's "Add car" does, on the Needs segment
 * only. Both halves are pinned: present and wired on Needs, absent on Mods.
 */
import { render, userEvent } from '@testing-library/react-native';

import { PlanScreen } from '../PlanScreen';

jest.mock('../WishlistScreen', () => ({
  WishlistScreen: () => null,
}));
jest.mock('../BuildScreen', () => ({
  BuildScreen: () => null,
}));

describe('the Plan root', () => {
  it('offers Add in the band on Needs, wired to the catalogue', async () => {
    const onAdd = jest.fn();
    const view = await render(
      <PlanScreen vehicleId="v1" showsMods onSignOut={jest.fn()} onAdd={onAdd} />
    );
    const add = view.getByLabelText('Add something this car needs');
    expect(add).toBeTruthy();
    await userEvent.setup().press(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('offers it without the segment switcher too — a stock car still has needs', async () => {
    const view = await render(
      <PlanScreen vehicleId="v1" showsMods={false} onSignOut={jest.fn()} onAdd={jest.fn()} />
    );
    expect(view.getByLabelText('Add something this car needs')).toBeTruthy();
  });

  it('does not offer it on Mods, which has its own ladder', async () => {
    const view = await render(
      <PlanScreen vehicleId="v1" showsMods initialSegment="mods" onSignOut={jest.fn()} onAdd={jest.fn()} />
    );
    expect(view.queryByLabelText('Add something this car needs')).toBeNull();
  });
});
