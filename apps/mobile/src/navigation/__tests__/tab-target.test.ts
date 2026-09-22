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

  it('lists the four tabs in the order the bar draws them', () => {
    expect(TAB_NAMES).toEqual(['GarageTab', 'ServiceTab', 'PlanTab', 'AdvisorTab']);
  });

  it('lands on the garage itself, popping whatever car the tab was left on (21 Sep)', () => {
    // The tab's word is the screen it lands on; the car is one bay away.
    expect(tabTarget('GarageTab', undefined, car)).toEqual({ name: 'GarageTab', params: { screen: 'Garage', pop: true } });
    expect(tabTarget('GarageTab', 'car-b', car)).toEqual({ name: 'GarageTab', params: { screen: 'Garage', pop: true } });
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
    */
    const carParams = (target: ReturnType<typeof tabTarget>) =>
      target.params && 'params' in target.params ? target.params.params : undefined;
    expect(carParams(tabTarget('ServiceTab', undefined, car))?.segment).toBe('history');
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
