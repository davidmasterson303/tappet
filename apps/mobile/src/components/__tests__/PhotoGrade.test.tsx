import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import PhotoGrade from '../PhotoGrade';
import { grade, surface } from '../../theme';

/**
 * The house grade over an owner's photograph — B9's "owner photos are graded".
 *
 * Round 47 (21 Sep) was the first critique to see a real daylight snapshot
 * under it: *"the sky blows to a milky haze under CHANGE PHOTO, the grass
 * stays green, and the nav controls sit on near-white."* Two layers answer
 * that — a multiplied highlight pull over the whole frame, and a graphite
 * scrim falling from the top edge where the nav controls stand — and this
 * pins that both are drawn, in the order a print is graded, with the grain
 * last. What a still cannot prove (the blend modes compositing on a device)
 * `PhotoGrade`'s docblock argues; what it can prove is here.
 */

function flat(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

describe('the house grade', () => {
  it('pulls the highlights down over the whole frame, by multiplying', async () => {
    const view = await render(<PhotoGrade />);
    const pull = flat(view.getByTestId('grade-pull', { includeHiddenElements: true }).props.style);

    expect(pull.mixBlendMode).toBe('multiply');
    expect(pull.backgroundColor).toBe(grade.pull);
    // Enough to take a white sky to dusk; not enough to lose a mid-grey car.
    expect(pull.opacity).toBeGreaterThanOrEqual(0.5);
    expect(pull.opacity).toBeLessThanOrEqual(0.6);
  });

  it('darkens the top of the frame for the nav controls, in the page\'s own graphite, clear by two-fifths', async () => {
    const view = await render(<PhotoGrade />);
    const scrim = view.getByTestId('grade-scrim', { includeHiddenElements: true });
    // No blend: it is the page showing through, not a treatment of the photograph.
    expect(flat(scrim.props.style).mixBlendMode).toBeUndefined();

    /*
      `react-native-svg` flattens the stops into `gradient`: [offset, ARGB,
      offset, ARGB], the colours as signed 32-bit ints. The alpha is the top
      byte; the page colour is the low three.
    */
    let gradient: number[] | undefined;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const host = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] };
      if (host.type === 'RNSVGLinearGradient' && host.props?.name === 'houseScrim') gradient = host.props.gradient as number[];
      for (const child of host.children ?? []) walk(child);
    };
    walk(view.toJSON());

    expect(gradient).toBeDefined();
    const [topOffset, topColour, endOffset, endColour] = gradient as number[];
    const alpha = (argb: number) => ((argb >>> 24) & 0xff) / 255;
    const rgb = (argb: number) => (argb & 0xffffff).toString(16).padStart(6, '0');
    expect(topOffset).toBe(0);
    expect(endOffset).toBe(0.4);
    expect(alpha(topColour)).toBeGreaterThanOrEqual(0.7);
    expect(alpha(endColour)).toBe(0);
    // The page's own graphite, both ends.
    expect(`#${rgb(topColour)}`).toBe(surface.page.toLowerCase());
    expect(`#${rgb(endColour)}`).toBe(surface.page.toLowerCase());
  });

  it('lays the grain last, over the grade', async () => {
    const view = await render(<PhotoGrade />);
    const json = JSON.stringify(view.toJSON());
    const grainAt = json.lastIndexOf('grain.png');
    const scrimAt = json.indexOf('houseScrim');
    const pullAt = json.indexOf('grade-pull');

    expect(pullAt).toBeGreaterThan(-1);
    expect(scrimAt).toBeGreaterThan(pullAt);
    expect(grainAt).toBeGreaterThan(scrimAt);
  });

  it('is inert: nothing in it is a target or a spoken element', async () => {
    const view = await render(<PhotoGrade />);
    for (const id of ['grade-pull', 'grade-scrim']) {
      const layer = view.getByTestId(id, { includeHiddenElements: true });
      expect(layer.props.pointerEvents).toBe('none');
      expect(layer.props.accessibilityElementsHidden).toBe(true);
    }
  });
});
