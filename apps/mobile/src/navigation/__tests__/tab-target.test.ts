import { TAB_NAMES, tabTarget } from '../tab-target';

/**
 * Where a tab press goes — the pure half of the bar.
 *
 * `tabTarget` is what decides whether a press carries a car, and it is the
 * decision that turned "I can only access first tab" into a tab that opens and
 * says what it needs. Each rule in its docblock has a case here.
 */
describe('tabTarget', () => {
  const car = { vehicleId: 'car-b', title: '2015 BMW M235i' };

  it('lists the four tabs in the order the bar draws them (23 Sep)', () => {
    /*
      David's order of 21 Sep, minus the garage: *"i like this much better,
      ship it."* A garage bay was a strict subset of the car's page — the
      same plate, strip, dial, next service and recall count, one tap from
      the fuller version — so the bar was spending a slot on a lesser copy of
      its neighbour, and a bay press changed the selected tab programmatically
      on top of it. Switching cars is the car's own name and the sheet it
      opens; `docs/design-system-drift.md` §6.23 carries the loop.
    */
    expect(TAB_NAMES).toEqual(['CarTab', 'AdvisorTab', 'ServiceTab', 'PlanTab']);
    expect(TAB_NAMES).not.toContain('GarageTab');
  });

  it('the Car tab is about a car like the other three: the last one opened, popped to when it changes', () => {
    expect(tabTarget('CarTab', undefined, car)).toEqual({
      name: 'CarTab',
      params: { screen: 'VehicleDetail', params: { vehicleId: 'car-b', title: '2015 BMW M235i' }, pop: true },
    });
    expect(tabTarget('CarTab', 'car-b', car)).toEqual({ name: 'CarTab' });
    expect(tabTarget('CarTab', undefined, null)).toEqual({ name: 'CarTab' });
  });

  it('gives every tab the rule the garage press was written for (23 Sep)', () => {
    /*
      The garage had a branch of its own: every press popped its stack, so
      the tab's word was the screen it landed on rather than whichever car
      you were last looking at. David asked for that — *"tapping Garage
      twice… should the label change to say where the first tap goes?"* — and
      the answer was that the destination should be fixed, not the label.

      The tab is gone and the rule is not: each remaining tab lands on its
      own word, and a car change pops it there. Pinned so that a fifth tab
      arriving later cannot quietly re-introduce a press that means two
      things.
    */
    for (const tab of TAB_NAMES) {
      const target = tabTarget(tab, 'car-a', car) as { name: string; params?: { pop?: boolean } };
      expect(target.name).toBe(tab);
      expect(target.params?.pop).toBe(true);
    }
  });

  it('opens a car tab plainly when there is no car to hand it', () => {
    /*
      The tab, not the garage. The root explains what it needs (`ChooseACar`)
      rather than the press bouncing back to the garage in silence.
    */
    expect(tabTarget('ServiceTab', undefined, null)).toEqual({ name: 'ServiceTab' });
  });

  it('hands a car tab the last car when it is not yet about it', () => {
    expect(tabTarget('ServiceTab', undefined, car)).toEqual({
      name: 'ServiceTab',
      params: {
        screen: 'Service',
        params: { vehicleId: 'car-b', title: '2015 BMW M235i', segment: 'history' },
        pop: true,
      },
    });
    expect(tabTarget('PlanTab', 'car-a', car).params).toMatchObject({
      screen: 'Plan',
      params: { vehicleId: 'car-b' },
      pop: true,
    });
    expect(tabTarget('AdvisorTab', 'car-a', car).params).toMatchObject({
      screen: 'Advisor',
      params: { vehicleId: 'car-b' },
      pop: true,
    });
  });

  it('opens the Service tab on the record, not on what is due', () => {
    /*
      David, 30 Aug: the tab is the searchable history. The route's own default
      is `due`, for a service-due notification; the two are different intents.

      ⚠ 22 Sep · challenged and kept. *"im landing on history, which is right
      tab. either flip them, or land user on Due."* `ServiceScreen` flipped
      the segments — History is leftmost — so the tab lands on the record
      **and** on the first segment. A change of this value to `'due'` is the
      reversal that was not taken; the case below holds the pair together.
    */
    const carParams = (target: ReturnType<typeof tabTarget>) =>
      target.params && 'params' in target.params ? target.params.params : undefined;
    expect(carParams(tabTarget('ServiceTab', undefined, car))?.segment).toBe('history');
    /*
      ⚠ That this is also the **leftmost** segment — the whole of David's
      22 Sep ask — is held in `lib/__tests__/mobile-tab-roots.test.ts`, which
      reads `ServiceScreen`'s source. The order is a literal in JSX that no
      import exposes, and this runner has no `node:fs`.
    */
    expect(carParams(tabTarget('PlanTab', undefined, car))).not.toHaveProperty('segment');
  });

  it('leaves a tab alone when it is already about that car', () => {
    /*
      The whole reason bottom-tabs was installed: a tab keeps its own history.
      Params on every press would pop that history each time.
    */
    expect(tabTarget('ServiceTab', 'car-b', car)).toEqual({ name: 'ServiceTab' });
    expect(tabTarget('AdvisorTab', 'car-b', car)).toEqual({ name: 'AdvisorTab' });
  });
});
