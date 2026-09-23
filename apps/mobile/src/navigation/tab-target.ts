import type { PlanSegment } from '../screens/PlanScreen';
import type { ServiceSegment } from '../screens/ServiceScreen';

/**
 * The four tabs, in the order the bar draws them.
 *
 * ── ⚠ 11 Sep · the order is the brief's, and so is the first root ───────────
 *
 * `Garage`, `Service`, `Plan`, `Advisor` — the three things you do to a car in
 * the order you do them (look at it, record what was done, decide what is
 * next), then the conversation about all of it. The first tab used to be
 * labelled "Car" and opened the vehicle screen over the garage, on David's
 * 30 Aug reasoning that *"there's no reason people need to go back to garage so
 * often"*. The locked brief (6 Sep) settles it the other way: *"the dossier
 * stack (Garage → Vehicle → Health/Service/Plan) lives in the first tab"* and
 * *"Garage is the web dossier header re-stacked"* — the garage **is** the car
 * now, plate and dial included, so the tab and its root can finally agree on a
 * name. The traffic argument survives structurally: a tab keeps its own stack,
 * so leaving the car for Service and coming back lands on the car.
 */
/*
  ── 21 Sep · five, in David's order ─────────────────────────────────────────

  `Garage`, `Car`, `Advisor`, `Service`, `Plan`. The car is its own tab —
  most owners have one, and the car's page is what they come back to — and
  the garage keeps its own, for the bays, ADD CAR and switching between
  cars; it keeps landing on the garage. Both persistent, which David chose
  over a label that changes with the garage's size: "better than being too
  clever with dynamic". The order is his: the garage leads, the car beside
  it, then the conversation, then the record and the plan.
*/
export const TAB_NAMES = ['CarTab', 'AdvisorTab', 'ServiceTab', 'PlanTab'] as const;

export type TabName = (typeof TAB_NAMES)[number];

/** The car a tab should be about. */
export type Car = { vehicleId: string; title?: string };

/**
 * The root each car tab opens, and the segment it opens on.
 *
 * ⚠ `history` for Service is David's, 30 Aug: *"I wanted history tab to show
 * searchable history of line items, like web app version."* The route's own
 * default is `due`, which is what a service-due notification is about; the tab
 * asks for the record.
 *
 * ⚠ **22 Sep · this line survived a challenge to it, and the screen moved
 * instead.** David, seeing the landing: *"i think we should always land user
 * on leftmost subnav tab, right? im landing on history, which is right tab.
 * either flip them, or land user on Due."* Two ways to satisfy that, and only
 * one of them keeps the sentence above: `ServiceScreen` puts **History
 * leftmost** now, so the tab still opens the record *and* lands on the first
 * segment. Changing this value to `'due'` would have satisfied the ordering
 * rule by reversing the 30 Aug decision — which is the kind of quiet reversal
 * this file's own note exists to prevent.
 */
const CAR_TAB_ROOT = {
  CarTab: { screen: 'VehicleDetail', segment: undefined },
  ServiceTab: { screen: 'Service', segment: 'history' as ServiceSegment },
  PlanTab: { screen: 'Plan', segment: undefined as PlanSegment | undefined },
  AdvisorTab: { screen: 'Advisor', segment: undefined },
} as const;

export type TabTarget =
  | { name: TabName; params?: undefined }
  /** The garage, popped to (21 Sep): the tab's word is the screen it lands on. */
  | {
      name: TabName;
      params: {
        screen: 'VehicleDetail' | 'Service' | 'Plan' | 'Advisor';
        params: { vehicleId: string; title?: string; segment?: ServiceSegment | PlanSegment };
        pop: true;
      };
    };

/**
 * Where a tab press goes.
 *
 * ── ⚠ Three tabs need a car, and the bar has none ───────────────────────────
 *
 * `/api/v1/consultant` requires a `vehicleId` and authorizes against it; the
 * service record and the plan are each *about* one car. The bar knows nothing
 * of cars, so the press resolves one from `lastVehicle()` — the car most
 * recently on screen, or the garage's only car — and hands it to the tab's root
 * as params.
 *
 * ── ⚠ Only when the tab is not already about that car ──────────────────────
 *
 * A tab owns its own stack, which is the thing `@react-navigation/bottom-tabs`
 * was installed for: leave Service three screens deep, come back, and you are
 * three screens deep. Passing params on every press would `pop` that stack to
 * its root each time and throw the history away. So the params travel only
 * when they would *change* something — the tab has never mounted, or it is
 * about a different car than the one last opened. Then the root is popped to
 * and re-keyed, because a thread or a record about car A must not carry on
 * under car B's name.
 *
 * ── When there is no car at all ─────────────────────────────────────────────
 *
 * A two-car garage on a cold start. This used to bounce the press back to the
 * garage — David, from a real phone: *"I can only access first tab"* — and the
 * silence was the defect. Now the tab opens and its root says what it needs
 * (`ChooseACar`), which is an explanation rather than a bounce.
 */
export function tabTarget(
  tab: TabName,
  mountedVehicleId: string | undefined,
  car: Car | null
): TabTarget {
  /*
    ⚠ 23 Sep · **no garage branch any more.** The Garage tab used to pop its
    stack to the garage on every press, because David asked for a tab whose
    word is the screen it lands on — *"tapping Garage twice… should the label
    change to say where the first tap goes?"* — and the answer was that the
    label should not change, the destination should be fixed.

    That rule survives its tab: every remaining tab's word is what it lands
    on. The garage is gone because a bay was a strict subset of the car's
    page, and switching cars is the car's own name and the sheet it opens.
  */
  if (!car || mountedVehicleId === car.vehicleId) {
    return { name: tab };
  }

  const root = CAR_TAB_ROOT[tab];

  return {
    name: tab,
    params: {
      screen: root.screen,
      params: {
        vehicleId: car.vehicleId,
        title: car.title,
        ...(root.segment ? { segment: root.segment } : {}),
      },
      pop: true,
    },
  };
}
