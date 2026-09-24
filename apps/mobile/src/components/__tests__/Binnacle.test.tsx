import { render, userEvent } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import Binnacle, { BINNACLE_CELL_MIN, BinnacleCell, BinnacleRow } from '../Binnacle';
import { TARGET_MIN, status, surface } from '../../theme';

/**
 * The binnacle — the panel of readings the vehicle hub became on 13 Sep.
 *
 * What is pinned is what separated it from the list of rows it replaced, and
 * what a screenshot cannot show: a cell is a named, pressable door and says
 * so to a reader; the value comes before the legend; sodium is a line beside
 * a genuine warning and nothing else; the rules between cells are drawn on
 * the left of every cell after the first so a dropped cell leaves no rule
 * hanging; and every cell clears the touch floor.
 */

const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

/** Every string the tree rendered, in order — the order is the assertion. */
function textInOrder(view: { toJSON: () => unknown }): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const child of (node as { children?: unknown[] }).children ?? []) walk(child);
  };
  walk(view.toJSON());
  return out;
}

function panel(cells: Array<{ legend: string; value: string; warning?: boolean; onPress?: () => void }>) {
  return (
    <Binnacle accessibilityLabel="Readings">
      <BinnacleRow first>
        {cells.map((cell, i) => (
          <BinnacleCell
            key={cell.legend}
            legend={cell.legend}
            rule={i > 0}
            warning={cell.warning}
            onPress={cell.onPress ?? jest.fn()}
            accessibilityLabel={`${cell.legend}, ${cell.value}. Opens it.`}
          >
            <Text>{cell.value}</Text>
          </BinnacleCell>
        ))}
      </BinnacleRow>
    </Binnacle>
  );
}

describe('Binnacle', () => {
  it('names each cell as a door and opens where it says', async () => {
    const onPress = jest.fn();
    const view = await render(panel([{ legend: 'History', value: '5', onPress }]));

    const cell = view.getByLabelText('History, 5. Opens it.');
    expect(cell.props.accessibilityRole).toBe('button');

    await userEvent.press(cell);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sets the value before the legend, so a cell is not a stat-strip cell', async () => {
    // The strip on the plate is eyebrow-over-value and is not pressable; the
    // binnacle inverts the pair so the two objects never read as one.
    const view = await render(panel([{ legend: 'History', value: '5' }]));

    const order = textInOrder(view);
    expect(order.indexOf('5')).toBeGreaterThan(-1);
    expect(order.indexOf('5')).toBeLessThan(order.indexOf('History'));
  });

  it('draws the sodium triangle only beside a warning', async () => {
    const warned = await render(panel([{ legend: 'Recalls', value: '2', warning: true }]));
    const mark = flat(warned.getByText('△', { includeHiddenElements: true }).props.style);
    expect(mark.color).toBe(status.attention);

    const plain = await render(panel([{ legend: 'History', value: '5' }]));
    expect(plain.queryByText('△', { includeHiddenElements: true })).toBeNull();
  });

  it('rules the left edge of every cell after the first, and never the first', async () => {
    const view = await render(
      panel([
        { legend: 'Recalls', value: '2' },
        { legend: 'History', value: '5' },
        { legend: 'Plan', value: '0' },
      ])
    );

    const edge = (label: string) => flat(view.getByLabelText(label).props.style).borderLeftWidth;
    expect(edge('Recalls, 2. Opens it.')).toBeUndefined();
    expect(edge('History, 5. Opens it.')).toBeGreaterThan(0);
    expect(edge('Plan, 0. Opens it.')).toBeGreaterThan(0);
  });

  it('pins the value to the head of the cell and the legend to its foot', async () => {
    /*
      Round 51 (22 Sep) measured the count row at 1:1: cells anchored to the
      foot, so "11" over two caption lines sat 20pt under "24" over three,
      and the row's numerals never shared a cap line. Space-between is the
      whole fix — one cap line at the head, one legend baseline at the foot,
      only the captions between them varying — and it is a style a still
      cannot prove was not quietly returned to `flex-end`.
    */
    const view = await render(panel([{ legend: 'History', value: '5' }]));
    const style = flat(view.getByLabelText('History, 5. Opens it.').props.style);

    expect(style.justifyContent).toBe('space-between');
  });

  it('clears the touch floor, and presses with a fill rather than a fade', async () => {
    const view = await render(panel([{ legend: 'History', value: '5' }]));
    const style = flat(view.getByLabelText('History, 5. Opens it.').props.style);

    /*
      The floor is the thumb's exactly (22 Sep, round 51). Above it the floor
      was a rhythm — 96, then 80 — and the only cell it ever reached was the
      one shorter than it, which it stretched into a band with a title's
      worth of graphite over its reading. A cell is its content's height; the
      floor is for a cell with nothing read yet, whose legend alone would
      fall under the thumb.
    */
    expect(BINNACLE_CELL_MIN).toBe(TARGET_MIN);
    expect(style.minHeight).toBe(BINNACLE_CELL_MIN);
    // The rest state paints no fill; `mobile-pressed-states` holds the swap
    // is to `surface.well` and never an opacity — the fill has to exist.
    expect(style.backgroundColor).toBeUndefined();
    expect(surface.well).not.toBe(surface.page);
  });

  it('closes the panel with a rule beneath and draws none above it', async () => {
    // The sheet's own leading edge is the rule above the first row; a second
    // hairline a pixel under it would read as a seam.
    const view = await render(panel([{ legend: 'History', value: '5' }]));
    const style = flat(view.getByLabelText('Readings').props.style);

    expect(style.borderBottomWidth).toBeGreaterThan(0);
    expect(style.borderTopWidth).toBeUndefined();
  });
});
