import { render, userEvent } from '@testing-library/react-native';

import TabBar from '../TabBar';
import { withSafeArea } from '../../test-support/safe-area';

/**
 * The bar is how the app is navigated, and one of its four destinations is a
 * compliance requirement.
 *
 * ── What App Store 5.1.1(v) needs from this file ────────────────────────────
 *
 * Account deletion must be initiated from inside the app and must be genuinely
 * available. It used to be a text link in the garage header, guarded by five
 * cases in `GarageScreen.test.tsx` asserting that every one of that screen's
 * states still rendered it — a guarantee held together by vigilance, and one
 * that had already been lost when the loading and error states returned early.
 *
 * As a tab it cannot be lost that way: the bar is a sibling of the navigator,
 * not a child of any screen. What is left to check is that the control is
 * there, that it is named, and that it announces which position is current —
 * because a bar whose state is carried entirely by a tint is unusable to anyone
 * who cannot separate the two, and this bar is the app's navigation.
 */
describe('the tab bar', () => {
  it('offers all four destinations, by name', async () => {
    const view = await render(withSafeArea(<TabBar current="Garage" onSelect={jest.fn()} />));

    /*
      ⚠ 7 Sep: `Account` → `Plan`. The account left the bar so `Plan` — R15's
      merged Wishlist and Build — could take the slot, and moved to
      `AccountControl`, still a sibling of the navigator so App Store 5.1.1(v)
      keeps its structural guarantee rather than going back to vigilance.
    */
    for (const label of ['Car', 'Service', 'Advisor', 'Plan']) {
      expect(view.getByLabelText(label)).toBeTruthy();
    }
  });

  it('names the first tab for the car, not the garage', async () => {
    /*
      ⚠ 30 Aug. The tab is still called `Garage` internally — the route name and
      the fallback both are — but it reads "Car", because it now opens the
      vehicle you were last looking at rather than the list. David: *"there's no
      reason people need to go back to garage so often."*

      Asserted rather than left to the label, because the name and the
      destination disagreeing is exactly the sort of thing that gets "corrected"
      back to `Garage` by somebody tidying up.
    */
    const view = await render(withSafeArea(<TabBar current="Garage" onSelect={jest.fn()} />));

    expect(view.queryByLabelText('Garage')).toBeNull();
    expect(view.getByLabelText('Car')).toBeTruthy();
  });

  it('reports the second tab by its route name, not its label', async () => {
    /*
      The bar hands back a `TabName`; the navigator switches on it. A label
      leaking into that contract would route nowhere.

      ⚠ 7 Sep: this tab's label became "Service" while its route stayed
      `History`, which makes the case *stronger* than when it was written — the
      two now differ, so a label leaking into the contract would actually fail
      rather than coincidentally pass. The same is true of `Garage`/"Car" above.
    */
    const onSelect = jest.fn();
    const view = await render(withSafeArea(<TabBar current="Garage" onSelect={onSelect} />));

    await userEvent.press(view.getByLabelText('Service'));
    expect(onSelect).toHaveBeenCalledWith('History');
  });

  it('announces which one is current, not only tints it', async () => {
    const view = await render(withSafeArea(<TabBar current="Advisor" onSelect={jest.fn()} />));

    expect(view.getByLabelText('Advisor').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(view.getByLabelText('Car').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('reports the tab that was pressed', async () => {
    const onSelect = jest.fn();
    const view = await render(withSafeArea(<TabBar current="Garage" onSelect={onSelect} />));

    await userEvent.press(view.getByLabelText('Plan'));
    expect(onSelect).toHaveBeenCalledWith('Plan');
  });

  it('is reachable from every position, including its own', async () => {
    /*
      The anti-vacuous half of the compliance claim: a bar that hid the current
      tab's own control would pass both cases above and would strand somebody on
      the tab they are already looking at.
    */
    /*
      ⚠ Re-pointed 7 Sep from `Account`, which is no longer a tab — it moved to a
      root's trailing control so `Plan` could take the slot. The claim is
      unchanged and still the anti-vacuous half: a bar that hid the *current*
      tab's own control would pass both cases above and strand whoever is on it.
    */
    const view = await render(withSafeArea(<TabBar current="Plan" onSelect={jest.fn()} />));

    expect(view.getByLabelText('Plan')).toBeTruthy();
    expect(view.getByLabelText('Car')).toBeTruthy();
  });
});
