/**
 * The strip odometer's ratchet — the caption and the run encode the same miles,
 * on the rendered geometry.
 *
 * ── Why a second proof, one level down ──────────────────────────────────────
 *
 * `lib/__tests__/tires.test.ts` proves the property at the model: `tireAxis`
 * and `tireReading` are one object. This proves it where the design loop
 * found the defect — in what is *drawn*. Round 2's HTML kept the figures in a
 * data object and the sodium's width in a CSS literal, and under a 7,000
 * interval the caption moved to `PAST 4,400 MI` while the line stayed at 5,400.
 * Nothing threw. The equivalent here would be a component that read
 * `reading.past` for the caption and a style constant for the run, and the
 * model-level proof cannot see that — only a render can.
 *
 * So: mount, deliver a layout width, read the run's rendered `width` and the
 * axis's, and convert the run to miles through the axis's own span — the way
 * the loop's `_finalproof.mjs` read the scale off the strip's `ON THIS SET`.
 * Then mutate the interval and the odometer and check the two still agree.
 * And first, the anti-vacuous case: the same reader must be able to tell a run
 * whose width was typed once from one that follows the data.
 *
 * ⚠ Known ceiling, as the model-level file states it: the span and the run
 * both derive from `odometerNow − installOdometer`, so a fault inside that
 * expression is invisible here.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { tireAxis, tireReading, type TireRotation, type TireSet } from '@tappet/core/tires';
import StripOdometer from '../StripOdometer';
import { status } from '../../theme';

const GOLF: TireSet = {
  id: 'set-1',
  vehicleId: 'v1',
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  sizeFront: '245/35R19',
  sizeRear: '245/35R19',
  installedOn: '2025-03-12',
  installOdometer: 54_232,
  purchasePlace: 'Discount Tire',
  rotationIntervalMiles: 6_000,
  intervalSource: 'owner',
  treadwearMilesEntered: 45_000,
  provenance: 'invoice',
};

const ROTATIONS: TireRotation[] = [
  { id: 'r1', setId: 'set-1', rotatedOn: '2025-06-28', odometer: 60_140, provenance: 'invoice' },
  { id: 'r2', setId: 'set-1', rotatedOn: '2025-11-09', odometer: 67_012, provenance: 'typed' },
];

/** The frame's content width: 393 less two 20pt gutters. */
const WIDTH = 353;

/* Every `render` and `fireEvent` awaited — RNTL 14's act scope; `jest.setup.js` refuses a test that leaves it open. */
async function mount(set: TireSet, rotations: TireRotation[], odometerNow: number) {
  const reading = tireReading(set, rotations, odometerNow);
  const axis = tireAxis(set, reading, odometerNow);
  const view = await render(<StripOdometer reading={reading} axis={axis} />);
  await fireEvent(view.getByTestId('odometer-axis'), 'layout', { nativeEvent: { layout: { width: WIDTH, height: 60 } } });
  return { view, reading, axis: axis! };
}

/** What the drawn run says, in miles, read through the drawn axis. */
type View = Awaited<ReturnType<typeof render>>;

function drawnRunMiles(view: View, span: number): number | null {
  const run = view.queryByTestId('odometer-run');
  if (!run) return null;
  const style = StyleSheet.flatten(run.props.style) as { width: number; left: number };
  return Math.round((style.width / WIDTH) * span);
}

/** What the caption says, in miles. */
function captionMiles(view: View): number | null {
  const caption = view.queryByTestId('odometer-past');
  if (!caption) return null;
  const text = String(caption.props.children);
  expect(text).toMatch(/^PAST [\d,]+ MI$/);
  return Number(text.replace(/[^\d]/g, ''));
}

describe('the strip odometer, as drawn', () => {
  it('§0.8 as written: a run of 5,400 under a caption of PAST 5,400 MI, 78.83pt long', async () => {
    const { view, axis } = await mount(GOLF, ROTATIONS, 78_412);
    expect(view.getByTestId('odometer-since').props.children).toBe('11,400');
    expect(captionMiles(view)).toBe(5_400);
    expect(drawnRunMiles(view, axis.span)).toBe(5_400);
    const style = StyleSheet.flatten(view.getByTestId('odometer-run').props.style) as { width: number };
    expect(style.width.toFixed(2)).toBe('78.83');
    // Four events on the line: install, two rotations, today.
    expect(view.getAllByTestId('odometer-event')).toHaveLength(4);
  });

  it('mutation 1 — interval 7,000: the run moves and shortens, and the caption follows', async () => {
    const { view, axis } = await mount({ ...GOLF, rotationIntervalMiles: 7_000 }, ROTATIONS, 78_412);
    expect(captionMiles(view)).toBe(4_400);
    expect(drawnRunMiles(view, axis.span)).toBe(4_400);
  });

  it('mutation 2 — odometer 80,412: the scale re-bases and every tick moves', async () => {
    const before = await mount(GOLF, ROTATIONS, 78_412);
    const after = await mount(GOLF, ROTATIONS, 80_412);
    expect(captionMiles(after.view)).toBe(7_400);
    expect(drawnRunMiles(after.view, after.axis.span)).toBe(7_400);
    const tickLeft = (v: View, i: number) => {
      const tick = v.getAllByTestId('odometer-event')[i].children[0] as unknown as { props: { style: unknown } };
      return (StyleSheet.flatten(tick.props.style) as { left: number }).left;
    };
    // The second rotation's tick sits further left once the span is longer.
    expect(tickLeft(after.view, 2)).toBeLessThan(tickLeft(before.view, 2));
  });

  it('a third rotation puts a third tick on the axis, and the run disappears with the overrun', async () => {
    const more = [...ROTATIONS, { id: 'r3', setId: 'set-1', rotatedOn: '2026-05-02', odometer: 74_000, provenance: 'typed' as const }];
    const { view } = await mount(GOLF, more, 78_412);
    expect(view.getAllByTestId('odometer-event')).toHaveLength(5);
    expect(view.queryByTestId('odometer-run')).toBeNull();
    expect(view.queryByTestId('odometer-past')).toBeNull();
    expect(view.getByTestId('odometer-since').props.children).toBe('4,412');
  });

  it('can still detect the round-2 failure — a run whose width was typed once', async () => {
    /*
      The reader above, pointed at a run that does not follow the data. If
      this test ever passes with a real component, the component has grown a
      second source of truth; if it fails to fail, the reader is vacuous.
    */
    const { axis } = await mount({ ...GOLF, rotationIntervalMiles: 7_000 }, ROTATIONS, 78_412);
    const typedWidth = (5_400 / axis.span) * WIDTH;
    const staleMiles = Math.round((typedWidth / WIDTH) * axis.span);
    expect(staleMiles).toBe(5_400);
    expect(staleMiles).not.toBe(axis.run!.miles);
  });
});

describe('no interval, no obligation', () => {
  it('draws no sodium and no caption, whatever the mileage', async () => {
    const { view } = await mount({ ...GOLF, rotationIntervalMiles: null, intervalSource: null }, ROTATIONS, 78_412);
    expect(view.queryByTestId('odometer-run')).toBeNull();
    expect(view.queryByTestId('odometer-past')).toBeNull();
    expect(view.queryByTestId('odometer-interval')).toBeNull();
    // The numeral still counts — a fact, not an obligation.
    expect(view.getByTestId('odometer-since').props.children).toBe('11,400');
  });

  it('the run is the only element in sodium, and it is a line, never ink', async () => {
    const { view } = await mount(GOLF, ROTATIONS, 78_412);
    const sodium = view.toJSON();
    const painted: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const el = node as { type?: string; props?: { style?: unknown; testID?: string }; children?: unknown[] };
      const style = StyleSheet.flatten(el.props?.style as never) as { backgroundColor?: string; color?: string } | undefined;
      if (style?.backgroundColor === status.attention) painted.push(`${el.type}:${el.props?.testID ?? ''}`);
      if (style?.color === status.attention) painted.push(`ink:${el.type}`);
      (el.children ?? []).forEach(walk);
    };
    walk(sodium);
    expect(painted).toEqual(['View:odometer-run']);
  });
});

describe('the reading counts from the install when nothing has been rotated', () => {
  it('says so in the caption', async () => {
    const { view } = await mount(GOLF, [], 78_412);
    expect(view.getByText('Miles since installed')).toBeTruthy();
    expect(view.getByTestId('odometer-since').props.children).toBe('24,180');
  });

  it('renders nothing at all with no odometer to count to', async () => {
    const reading = tireReading(GOLF, ROTATIONS, null);
    const view = await render(<StripOdometer reading={reading} axis={tireAxis(GOLF, reading, null)} />);
    expect(view.toJSON()).toBeNull();
  });
});
