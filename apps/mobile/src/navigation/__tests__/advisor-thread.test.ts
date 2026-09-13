/**
 * A question from another tab travels as a new thread with a way back.
 *
 * The navigator's `askAdvisor` sends every "Learn more" and "ask the advisor"
 * to the Advisor tab (13 Sep — the advisor is one place). What it sends is
 * pinned here without a navigator: an arrival (`askedAt`) the screen keys the
 * thread on, so the same words twice are two threads, and an origin (`from`)
 * read off the tab the screen stands in. `lib/__tests__/mobile-one-advisor.test.ts`
 * holds the other half from the source: no dossier stack pushes an advisor.
 */
import { advisorThreadParams, ORIGIN_LABELS, originTabOf } from '../RootNavigator';

describe('a question from another tab', () => {
  it('goes to the Advisor tab with an arrival and an origin', () => {
    const params = advisorThreadParams(
      { vehicleId: 'v1', title: 'BMW M235i' },
      'Tell me about the charge pipe',
      'PlanTab',
      () => 1234
    );
    expect(params).toEqual({
      screen: 'AdvisorTab',
      params: {
        screen: 'Advisor',
        params: { vehicleId: 'v1', title: 'BMW M235i', ask: 'Tell me about the charge pipe', askedAt: 1234, from: 'PlanTab' },
      },
    });
  });

  it('names the same words twice as two arrivals', () => {
    let tick = 0;
    const now = () => ++tick;
    const arrival = (p: ReturnType<typeof advisorThreadParams>) =>
      (p?.params?.params as { askedAt?: number } | undefined)?.askedAt;
    const first = advisorThreadParams({ vehicleId: 'v1' }, 'Same question', 'PlanTab', now);
    const second = advisorThreadParams({ vehicleId: 'v1' }, 'Same question', 'PlanTab', now);
    expect(arrival(first)).toBe(1);
    expect(arrival(second)).toBe(2);
  });

  it('reads its origin off the tab the screen stands in, and has a label for every tab it can name', () => {
    const tabs = { routes: [{ name: 'GarageTab' }, { name: 'PlanTab' }], index: 1 };
    expect(originTabOf({ getParent: () => ({ getState: () => tabs }) })).toBe('PlanTab');
    expect(originTabOf({ getParent: () => ({ getState: () => ({ ...tabs, index: 0 }) }) })).toBe('GarageTab');
    // No parent state (a screen rendered on its own): the garage is the
    // honest default — every dossier begins there.
    expect(originTabOf({})).toBe('GarageTab');
    for (const label of Object.values(ORIGIN_LABELS)) expect(label.length).toBeGreaterThan(0);
  });
});
