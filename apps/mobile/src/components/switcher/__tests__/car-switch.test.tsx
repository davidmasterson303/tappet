import { render, userEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import * as RN from 'react-native';

import { VehicleDetailScreen } from '../../../screens/VehicleDetailScreen';
import { REFERENCE, withSafeArea } from '../../../test-support/safe-area';
import { AA_NORMAL, auditText, belowFloor, contrastRatio } from '../../../test-support/contrast';
import { TARGET_MIN, surface } from '../../../theme';

/**
 * Every host node carrying an `auditSurface` — i.e. every `CutSurface` — with
 * its declared ground and its flattened style.
 *
 * There is no accessible route to a painted shape, and there should not be;
 * `instruments.test.tsx` walks the host tree for the same reason.
 */
function cutSurfaces(view: { toJSON: () => unknown }): Array<{ ground: unknown; style: Record<string, unknown> }> {
  const found: Array<{ ground: unknown; style: Record<string, unknown> }> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const host = node as { props?: Record<string, unknown>; children?: unknown[] };
    if (host.props && 'auditSurface' in host.props) {
      found.push({
        ground: host.props.auditSurface,
        style: (StyleSheet.flatten(host.props.style as never) ?? {}) as Record<string, unknown>,
      });
    }
    for (const child of host.children ?? []) walk(child);
  };
  walk(view.toJSON());
  return found;
}
import { apiRequest } from '../../../api/client';

/**
 * The switcher's affordance — that there **is** one, and that it is legible.
 *
 * ── ⚠ Why this file exists, and what its absence cost ───────────────────────
 *
 * The switcher shipped on 22 Sep with **no test of any kind**: not the sheet,
 * not `car-set`, not the control, not the cold start. A design critic had
 * taken it to 9/10 from photographs, which measures how it looks and nothing
 * about whether it is on the screen.
 *
 * So this happened, and every suite stayed green through it. The navigator
 * dropped the Garage tab unconditionally while the hub still drew the
 * switcher behind `EXPO_PUBLIC_CAR_FIRST`, a `__DEV__`-only flag that is off
 * in production **and off under jest**. A release build would have had no
 * garage tab and no switcher: a three-car account could reach exactly one
 * car, with nothing on screen to suggest the other two existed. No error, no
 * crash, no red — CLAUDE.md §6's shape, and §5's: 54 suites proving the
 * working tree and none of them asking the question.
 *
 * The first case below is the one that fails against that build.
 *
 * ── The anti-vacuous pair ───────────────────────────────────────────────────
 *
 * Two fixtures through one harness, and they must disagree: three cars draw
 * the control, one car draws nothing. A guard that only ever sees the
 * three-car account cannot tell "the control is conditional" from "the
 * control is always there", and the one-car silence is the whole argument for
 * this structure (`BayRail`'s R20 — a pager for a set nobody has is chrome).
 */

jest.mock('../../../api/client', () => {
  const actual = jest.requireActual('../../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const CARS = [
  { id: 'v1', year: 2003, make: 'Honda', model: 'Accord', vehicle_health_summary: { health_score: 88 } },
  { id: 'v2', year: 2015, make: 'Subaru', model: 'Forester', vehicle_health_summary: { health_score: 61 } },
  { id: 'v3', year: 2017, make: 'Jaguar', model: 'F-Pace', vehicle_health_summary: { health_score: 74 } },
];

/**
 * One car on the hub, and `garage` cars in the set.
 *
 * ⚠ Dispatches on the path. The hub's own suite answers every request with
 * the same vehicle body, which leaves `/vehicles` returning no `vehicles`
 * key — so the set is empty there and the switcher is absent for a reason
 * that has nothing to do with what is being measured.
 */
function respond(garage: typeof CARS) {
  request.mockImplementation((path: string) => {
    if (path.startsWith('/vehicles')) return Promise.resolve({ vehicles: garage } as never);
    if (path.startsWith('/load-vehicle')) {
      return Promise.resolve({
        vehicle: {
          id: 'v1',
          year: 2003,
          make: 'Honda',
          model: 'Accord',
          current_mileage: 94_800,
          vehicle_health_summary: { health_score: 88, summary: 'Good.' },
        },
      } as never);
    }
    return Promise.reject(new Error('not needed'));
  });
}

async function mount(garage: typeof CARS, extra: Record<string, unknown> = {}) {
  jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
    width: REFERENCE.frame.width,
    height: REFERENCE.frame.height,
    scale: 3,
    fontScale: 1,
  });
  respond(garage);

  const props = {
    vehicleId: 'v1',
    onBack: jest.fn(),
    onSignOut: jest.fn(),
    onScanInvoice: jest.fn(),
    onViewRecalls: jest.fn(),
    onOpenWishlist: jest.fn(),
    onOpenHistory: jest.fn(),
    onOpenHealth: jest.fn(),
    onOpenMilestone: jest.fn(),
    onOpenProfile: jest.fn(),
    onSwitchCar: jest.fn(),
    onAddCar: jest.fn(),
    ...extra,
  };

  const view = await render(withSafeArea(<VehicleDetailScreen {...props} />, REFERENCE));
  /* `getAll`: the name is on the plate *and* in the collapsed nav title. */
  await waitFor(() => expect(view.getAllByText('2003 Honda Accord').length).toBeGreaterThan(0));
  return { props, view };
}

beforeEach(() => request.mockReset());
afterEach(() => jest.restoreAllMocks());

describe('the way to the other cars', () => {
  it('is on the hub of a three-car account, and opens the set', async () => {
    const { view } = await mount(CARS);

    const control = await waitFor(() => view.getByLabelText(/your cars/i));
    expect(control).toBeTruthy();

    /*
      ⚠ The label is asserted for what it *says*, not merely that it exists.
      The count is spoken and not drawn — `CAR 01 OF 03` over the name carries
      it visually — so a screen reader arriving at this corner has no
      neighbour to read it from.
    */
    expect(view.getByLabelText(/your cars\. 3 cars\./i)).toBeTruthy();

    await userEvent.press(control);
    await waitFor(() => expect(view.getByText('2015 SUBARU FORESTER')).toBeTruthy());
    expect(view.getByText('2017 JAGUAR F-PACE')).toBeTruthy();
    expect(view.getByText('ADD A CAR')).toBeTruthy();
  });

  it('is not drawn at all for an owner with one car', async () => {
    const { view } = await mount([CARS[0]]);

    expect(view.queryByLabelText(/your cars/i)).toBeNull();
    /* The eyebrow goes with it: "CAR 01 OF 01" counts a set nobody has. */
    expect(view.queryByText(/CAR 01 OF/)).toBeNull();
  });

  /**
   * ⚠ The defect the chevron hid, and the reason the handle moved.
   *
   * The name used to open the **switcher** once an owner had more than one
   * car, while the legend under it read `This car ›` and this label still
   * promised mileage, answers, photo and removal. A sighted owner was given
   * the wrong word; a screen reader was given the wrong sentence. David only
   * said the chevron was "perhaps not obvious for all users" — this is the
   * half of that which no amount of chevron could have fixed.
   */
  it('leaves the car’s own name opening the car, on a three-car account', async () => {
    const { view, props } = await mount(CARS);

    await userEvent.press(view.getByLabelText(/opens the car’s details|opens the car's details/i));
    expect(props.onOpenProfile).toHaveBeenCalled();
    /* And it did not open the set instead. */
    expect(view.queryByText('2015 SUBARU FORESTER')).toBeNull();
  });
});

describe('the control is legible where it sits', () => {
  /**
   * ⚠ It sits on the **owner's photograph**, which since `PhotoGrade` was
   * deleted on 22 Sep is their image unaltered — no house grade, no scrim, no
   * ground this app chooses. So the control paints its own opaque surface and
   * declares it to the audit through `CutSurface`'s `auditSurface`; this
   * measures the label against that declared ground rather than against the
   * page, which is not what is behind it.
   */
  it('clears the AA floor against the ground it paints for itself', async () => {
    const { view } = await mount(CARS);
    await waitFor(() => view.getByLabelText(/your cars/i));

    const label = auditText(view).filter((audit) => audit.text === 'Your cars');
    expect(label).toHaveLength(1);
    expect(belowFloor(label)).toEqual([]);
    expect(label[0].ratio).toBeGreaterThan(AA_NORMAL);
  });

  /**
   * ⚠ **The ground is the assertion, not the ratio.**
   *
   * On graphite almost any light ink passes — `text.muted` measures 5.34:1
   * here and `text.disabled` 5.32:1 — so a good ratio on this screen proves
   * very little on its own. The regression this control actually faces is
   * losing its **fill**: `Button`'s `outline` variant paints none
   * (`BUTTON_FILL`), and a control drawn that way in this corner would put
   * off-white type straight onto the owner's photograph. The audit would not
   * notice. With no `auditSurface` it falls back to the page colour, measures
   * ~19:1 against a ground that is not there, and reports green while the
   * device shows white on a bright sky.
   *
   * So this pins the opaque ground itself. Nothing here may be translucent.
   */
  it('paints its own opaque ground rather than borrowing the page’s', async () => {
    const { view } = await mount(CARS);
    await waitFor(() => view.getByLabelText(/your cars/i));

    /*
      Found by its ground rather than its height: the drawn box is inset
      inside a 44pt target, so its height is an implementation detail and
      keying on it is how this case broke the first time that changed.
      `surface.nav` is the only ground on this screen that is this
      component's, which is the identifying fact.
    */
    const control = cutSurfaces(view).find((node) => node.ground === surface.nav);
    expect(control).toBeDefined();
    expect(String(control!.ground)).toMatch(/^#[0-9a-f]{6}$/i);
    /* Opaque: no alpha channel, so the photograph behind it cannot leak through. */
    expect(String(control!.ground)).not.toMatch(/rgba/);
  });

  /*
    The anti-vacuous half: the measurement is live and can still return a
    failure on this exact ground. Not a token — a demonstration that dimming
    this label is caught rather than absorbed.
  */
  it('can still detect an ink that would fail there', () => {
    const dim = contrastRatio('rgba(255,255,255,0.3)', surface.nav);
    expect(dim).not.toBeNull();
    expect(dim!).toBeLessThan(AA_NORMAL);
  });

  it('clears the target floor and the type floor', async () => {
    const { view } = await mount(CARS);
    const control = await waitFor(() => view.getByLabelText(/your cars/i));

    /*
      ⚠ **The press target, not the drawn box** — and the difference is the
      point. The box is drawn at 32pt so the collapsed bar's rule does not
      double as its bottom edge; the `Pressable` around it keeps 44. An
      earlier version of this case asserted the *surface's* height, which
      would have failed on a change that is correct, and — far worse — would
      have passed on a 32pt box with no padding at all. Measuring the thing
      you can see is the usual way a design system stops meeting 44pt.
    */
    const target = (StyleSheet.flatten(control.props.style as never) ?? {}) as { minHeight?: number };
    expect(target.minHeight).toBeGreaterThanOrEqual(TARGET_MIN);

    /* And the box inside it is genuinely smaller, or the inset is not there. */
    const drawn = cutSurfaces(view).map((node) => node.style.height).filter((h): h is number => typeof h === 'number');
    expect(drawn.some((h) => h > 0 && h < TARGET_MIN)).toBe(true);

    const size = (StyleSheet.flatten(view.getByText('Your cars').props.style) as { fontSize?: number }).fontSize;
    expect(size).toBeGreaterThanOrEqual(12);
  });
});

/**
 * ── David's worry, measured rather than eyeballed ───────────────────────────
 *
 * *"in accessibility review in critic loop this time, i'm worried about small
 * fonts and contrast in some cases."* A design critic reads photographs, so
 * it can say a label looks small and cannot say it is 11pt, and it cannot
 * composite an alpha against the surface underneath. This does both, on the
 * three-car hub and on the open sheet — the two surfaces the switcher added.
 *
 * ⚠ The floors are the project's, and one of them is stricter than WCAG:
 * 12pt is this app's own type floor (`mobile-type-floor`), chosen because
 * "it's only a label" is available to every string on the phone the moment
 * one decorative exemption is granted.
 */
describe('every string the switcher put on screen', () => {
  it('clears the contrast floor on the hub, with three cars', async () => {
    const { view } = await mount(CARS);
    await waitFor(() => view.getByLabelText(/your cars/i));

    const audits = auditText(view);
    expect(audits.length).toBeGreaterThan(10);
    expect(belowFloor(audits)).toEqual([]);
  });

  it('clears the contrast floor inside the open sheet', async () => {
    const { view } = await mount(CARS);
    await userEvent.press(await waitFor(() => view.getByLabelText(/your cars/i)));
    await waitFor(() => expect(view.getByText('2015 SUBARU FORESTER')).toBeTruthy());

    /*
      ⚠ The sheet's own ground, not the page's. It paints `surface.page`
      through `CutSurface`, which is the same colour — but passing it
      explicitly is what keeps this honest if the sheet's fill ever moves.
    */
    const audits = auditText(view).filter((audit) =>
      /ACCORD|FORESTER|F-PACE|GOOD|THIN HISTORY|ADD A CAR|Your cars|^\d\d$|^0\d$/.test(audit.text)
    );
    expect(audits.length).toBeGreaterThan(8);
    expect(belowFloor(audits)).toEqual([]);
  });

  /**
   * ⚠ The property `HeroBed`'s `COVER_FLOOR` is derived from.
   *
   * The bed holds 0.68 where the plate's type ends, which is what
   * `text.secondary` needs to clear AA over a white photograph.
   * `text.muted` — the ink every label elsewhere in the app takes — needs
   * 0.837, and a scrim that heavy loses the car. So the floor is only
   * honest while nothing on the plate is muted, and that is a thing a later
   * change can break without touching `HeroBed` at all: add a label to the
   * plate, reach for the label ink, and the guarantee is quietly gone.
   *
   * `hero-bed.test.ts` holds the arithmetic; this holds the other half.
   */
  it('puts no muted ink on the photograph, which is what the floor assumes', async () => {
    const { view } = await mount(CARS);
    await waitFor(() => view.getByLabelText(/your cars/i));

    /* Everything drawn on the plate: the eyebrow, the name, the strip, the legend. */
    const onPlate = ['CAR 01 OF 03', '2003 Honda Accord', 'Mileage', '94,800 mi', 'This car'];
    for (const string of onPlate) {
      /*
        `getAll`: the car's name is on the plate *and* in the collapsed nav
        title, which is on the nav's own opaque plate and may be muted for
        all this case cares. Every node is checked rather than the first,
        because the one that matters is not reliably first.
      */
      for (const node of view.getAllByText(string, { includeHiddenElements: true })) {
        const ink = (StyleSheet.flatten(node.props.style as never) ?? {}) as { color?: string };
        expect([string, ink.color]).toEqual([string, expect.not.stringMatching(/,\s*0\.5\s*\)/)]);
      }
    }
  });

  it('sets nothing below the 12pt type floor', async () => {
    const { view } = await mount(CARS);
    await userEvent.press(await waitFor(() => view.getByLabelText(/your cars/i)));
    await waitFor(() => expect(view.getByText('2015 SUBARU FORESTER')).toBeTruthy());

    const sizes = auditText(view).map((audit) => ({ text: audit.text, size: audit.fontSize }));
    expect(sizes.length).toBeGreaterThan(10);
    expect(sizes.filter((entry) => entry.size > 0 && entry.size < 12)).toEqual([]);
  });
});
