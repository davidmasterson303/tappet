import { AccessibilityInfo, processColor } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { R } from '@tappet/core/cluster-geometry';

import Working, {
  ARC_LENGTH,
  PIP_CENTRE,
  PIP_FOOT,
  PIP_HEAD,
  SEGMENT,
  WorkingMark,
} from '../Working';
import PlateStatusLine from '../PlateStatusLine';
import { scanLine, scanStages } from '../working-stages';
import { register, status, text } from '../../theme';

/**
 * The wait instrument's invariants.
 *
 * Not snapshots — the reasons `instruments.test.tsx` gives. These are the
 * properties that must survive a redesign, and each is either a mistake the
 * web loop made on the way to 9/10 or one the phone's renderer invites:
 *
 *   - the pip is a fixed length and only its offset moves (it swings, it
 *     does not fill — a growing dash is a progress bar);
 *   - the dash is in user units against the real arc length, because
 *     `react-native-svg` drops `pathLength` silently;
 *   - reduced motion and `frozen` are the same designed still, twelve o'clock;
 *   - a page-level wait holds invisible before it paints;
 *   - the ledger's marks come from the stage list and nowhere else.
 *
 * ── One mount per test, for the reason `Skeleton.test.tsx` gave ────────────
 *
 * `motion/reduced-motion.ts` caches the device preference in a module-level
 * variable, and a second mount in one test leaks an `isReduceMotionEnabled`
 * promise past the act scope. The reduced case comes last for the same
 * reason: it leaves `true` in the cache.
 */

interface HostNode {
  type?: unknown;
  props?: Record<string, unknown>;
  children?: HostNode[];
}

/** Every rendered host node of a kind, with its processed props. */
function hostNodes(root: unknown, kind: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: HostNode | null | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === kind && node.props) found.push(node.props);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root as HostNode);
  return found;
}

const flat = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

/** The pip: the one dashed path. */
function pipOf(root: unknown): Record<string, unknown> {
  const pip = hostNodes(root, 'RNSVGPath').find((props) => Array.isArray(props.strokeDasharray));
  if (!pip) throw new Error('no pip drawn');
  return pip;
}

const paintOf = (colour: string) => Number(processColor(colour));
const fillOf = (props: Record<string, unknown>) =>
  Number((props.fill as { payload?: unknown } | undefined)?.payload);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the geometry', () => {
  it('is the dial’s arc, with a pip of fixed length and one pip on the scale', async () => {
    const view = await render(<Working frozen line="Opening this car" />);
    const pip = pipOf(view.toJSON());

    // 270° at r=70, not a percentage: `pathLength` does not exist here.
    expect(ARC_LENGTH).toBeCloseTo(1.5 * Math.PI * R, 6);
    expect(pip.strokeDasharray).toEqual([SEGMENT, ARC_LENGTH]);
    // 9% of the scale — the web's `SEGMENT`, which is the brief's "24°" of 270.
    expect(SEGMENT / ARC_LENGTH).toBeCloseTo(0.09, 6);
    expect((SEGMENT / ARC_LENGTH) * 270).toBeCloseTo(24, 0);
    // The head is one pip short of the arc, and the centre is halfway.
    expect(PIP_HEAD).toBeCloseTo(-(ARC_LENGTH - SEGMENT), 6);
    expect(PIP_CENTRE).toBeCloseTo(PIP_HEAD / 2, 6);
    expect(PIP_FOOT).toBe(0);
  });

  it('draws a solid hairline track under the pip, and the pip in the info blue', async () => {
    const view = await render(<Working frozen variant="compact" line="Answering" />);
    const paths = hostNodes(view.toJSON(), 'RNSVGPath');

    // Track and pip, in that order; the track is never dashed (brief B1).
    expect(paths).toHaveLength(2);
    expect(paths[0].strokeDasharray).toBeUndefined();
    expect(Number((paths[0].stroke as { payload: unknown }).payload)).toBe(paintOf(text.nonText));
    expect(Number((paths[1].stroke as { payload: unknown }).payload)).toBe(paintOf(register.accent));
  });

  it('keeps the terminals on the full and compact faces, and drops them from the mark', async () => {
    const full = await render(<Working frozen line="Opening this car" />);
    // Two terminals in the off-white good news is set in, and their two flashes.
    const circles = hostNodes(full.toJSON(), 'RNSVGCircle');
    expect(circles).toHaveLength(4);
    expect(circles.slice(0, 2).map(fillOf)).toEqual([paintOf(status.confirm), paintOf(status.confirm)]);
    expect(circles.slice(2).map(fillOf)).toEqual([
      paintOf(register.accentStrong),
      paintOf(register.accentStrong),
    ]);
    await full.unmount();

    const mark = await render(<WorkingMark frozen />);
    expect(hostNodes(mark.toJSON(), 'RNSVGCircle')).toHaveLength(0);
    expect(hostNodes(mark.toJSON(), 'RNSVGPath')).toHaveLength(2);
  });
});

describe('the still frame', () => {
  it('holds the pip at twelve o’clock and the flashes dark when frozen', async () => {
    const view = await render(<Working frozen line="Opening this car" />);
    await act(async () => {});
    await view.rerender(<Working frozen line="Opening this car" />);

    expect(pipOf(view.toJSON()).strokeDashoffset).toBeCloseTo(PIP_CENTRE, 6);
    const flashes = hostNodes(view.toJSON(), 'RNSVGCircle').slice(2);
    expect(flashes.map((props) => props.opacity)).toEqual([0, 0]);
  });

  it('leaves the centre when live — it is an instrument, not a still', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const view = await render(<Working line="Opening this car" />);
    await act(async () => {});
    await view.rerender(<Working line="Opening this car" />);

    /*
      The sweep starts at the foot and traverses to the head; a re-render a few
      milliseconds in reads a value on that leg, never the rest frame. If the
      loop silently never started, the value would still be `PIP_CENTRE` —
      which is what this refuses.
    */
    const offset = Number(pipOf(view.toJSON()).strokeDashoffset);
    expect(offset).not.toBeCloseTo(PIP_CENTRE, 3);
    expect(offset).toBeLessThanOrEqual(PIP_FOOT);
    expect(offset).toBeGreaterThanOrEqual(PIP_HEAD);
  });

  it('is the same frame under reduced motion — a designed still, not a stopped sweep', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const view = await render(<Working line="Opening this car" />);
    await act(async () => {});
    await view.rerender(<Working line="Opening this car" />);

    expect(pipOf(view.toJSON()).strokeDashoffset).toBeCloseTo(PIP_CENTRE, 6);
  });
});

describe('the copy and the entry', () => {
  it('sets the line in mono caps and announces the wait as one thing', async () => {
    const view = await render(
      <Working frozen line="Answering" detail="Your 2015 BMW M235i’s records go to the model with the question." />
    );

    const line = view.getByText('Answering');
    const style = flat(line.props.style);
    expect(style.textTransform).toBe('uppercase');
    expect(String(style.fontFamily)).toMatch(/JetBrainsMono/);

    view.getByLabelText('Answering. Your 2015 BMW M235i’s records go to the model with the question.');
    expect(view.getByRole('progressbar')).toBeTruthy();
  });

  it('sets a bare value in the mono a value takes, apart from the sentence', async () => {
    /*
      Brief B1 gives every value to the mono; the critic's round-29 gap 2 read
      a file name in Inter as the slip it was. The sentence stays in the sans.
    */
    const view = await render(
      <Working frozen line="Reading the invoice" value="IMG_0005.jpg" detail="One sentence." />
    );
    const value = flat(view.getByText('IMG_0005.jpg').props.style);
    expect(String(value.fontFamily)).toMatch(/JetBrainsMono/);
    expect(value.textTransform).toBeUndefined();
    expect(String(flat(view.getByText('One sentence.').props.style).fontFamily)).toMatch(/Inter/);
    view.getByLabelText('Reading the invoice. IMG_0005.jpg. One sentence.');
  });

  it('holds a page-level wait invisible until the delay has run', async () => {
    const view = await render(<Working delay line="Opening the garage" />);
    const region = view.getByRole('progressbar');
    expect(flat(region.props.style).opacity).toBe(0);
  });

  it('paints at once when the wait was just started by a press', async () => {
    const view = await render(<Working line="Reading the invoice" />);
    expect(flat(view.getByRole('progressbar').props.style).opacity).toBe(1);
  });

  it('paints the specimen frame at once even when asked to delay', async () => {
    const view = await render(<Working frozen delay line="Opening the plan" />);
    expect(flat(view.getByRole('progressbar').props.style).opacity).toBe(1);
  });
});

describe('the ledger', () => {
  it('draws every stage with its number, its label and its spoken state', async () => {
    const view = await render(
      <Working frozen line="Reading the invoice" stages={scanStages('reading', 'camera')}>
        7 line items so far
      </Working>
    );

    view.getByText('01');
    view.getByText('02');
    view.getByLabelText('Opening the camera — done');
    view.getByLabelText('Reading the invoice — in progress');
    // The footer is a real count in the state voice.
    expect(flat(view.getByText('7 line items so far').props.style).textTransform).toBe('uppercase');
  });

  it('inks the active stage in the info blue and a done stage in off-white', async () => {
    const view = await render(
      <Working frozen line="Reading the invoice" stages={scanStages('reading', 'library')} />
    );

    // Two labels, two rows: the one that is done and the one that is running.
    const done = view.getByLabelText('Opening your photos — done');
    const active = view.getByLabelText('Reading the invoice — in progress');
    const inkOf = (row: { children: unknown[] }) =>
      flat((row.children[1] as { props: { style: unknown } }).props.style).color;
    expect(inkOf(done as unknown as { children: unknown[] })).toBe(text.primary);
    expect(inkOf(active as unknown as { children: unknown[] })).toBe(register.accent);
  });

  it('draws no ledger when the work is one opaque call', async () => {
    const view = await render(<Working frozen line="Opening this car" />);
    expect(view.queryByText('01')).toBeNull();
  });
});

describe('the scanner’s stages are facts', () => {
  it('has two stages in the ordinary flow and three only on the confirm path', () => {
    expect(scanStages('picking', 'camera')).toEqual([
      { label: 'Opening the camera', state: 'active' },
      { label: 'Reading the invoice', state: 'pending' },
    ]);
    expect(scanStages('reading', 'library')).toEqual([
      { label: 'Opening your photos', state: 'done' },
      { label: 'Reading the invoice', state: 'active' },
    ]);
    expect(scanStages('filing', 'camera')).toEqual([
      { label: 'Opening the camera', state: 'done' },
      { label: 'Reading the invoice', state: 'done' },
      { label: 'Filing it against this car', state: 'active' },
    ]);
  });

  it('prints the active stage as the line, so the two never disagree', () => {
    expect(scanLine('picking', 'library')).toBe('Opening your photos');
    expect(scanLine('reading', 'camera')).toBe('Reading the invoice');
    expect(scanLine('filing', 'camera')).toBe('Filing it against this car');
  });
});

describe('the plate line', () => {
  it('carries the mark while the plate is being drawn, and nothing that moves when it failed', async () => {
    const drawing = await render(<PlateStatusLine status="generating" frozen />);
    drawing.getByLabelText("Drawing this car's plate");
    expect(hostNodes(drawing.toJSON(), 'RNSVGPath')).toHaveLength(2);
    await drawing.unmount();

    const failed = await render(<PlateStatusLine status="failed" />);
    failed.getByLabelText('Plate not drawn yet');
    // B8: an absence carries no arc.
    expect(hostNodes(failed.toJSON(), 'RNSVGPath')).toHaveLength(0);
  });

  it('draws nothing at all when there is nothing to say', async () => {
    const ready = await render(<PlateStatusLine status="ready" />);
    expect(ready.toJSON()).toBeNull();
    await ready.unmount();

    const nothing = await render(<PlateStatusLine status={null} />);
    expect(nothing.toJSON()).toBeNull();
  });
});
