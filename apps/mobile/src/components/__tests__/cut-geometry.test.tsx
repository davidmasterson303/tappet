import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import CutSurface, { cutPath, type CutCorner } from '../CutSurface';
import { auditText, belowFloor } from '../../test-support/contrast';

/**
 * The 45° cut is 45°, and the path says so.
 *
 * ── Why this asserts geometry rather than rendering ─────────────────────────
 *
 * The failure this guards against has no visual alarm. A cut whose legs are
 * unequal is a chamfer at some other angle; it looks deliberate, it looks fine
 * beside itself, and it is a second geometry in a system whose locked brief
 * (B4) says the corner is a 45° cut. `CLAUDE.md` §6 collects exactly this shape
 * of defect — the one that does not break, it lies.
 *
 * A test that only checked "a path came back" would pass for a plain rectangle,
 * which is the vacuous green §5 is about. So the cases below measure the legs
 * of the diagonal, and one of them proves the test can still fail.
 */

/** Pull the `L`/`M` points back out of the path string. */
function pointsOf(path: string): Array<[number, number]> {
  return path
    .trim()
    .replace(/ Z$/, '')
    .split(' L')
    .map((chunk) => chunk.replace(/^M/, '').trim().split(/\s+/).map(Number) as [number, number]);
}

describe('the 45° cut', () => {
  it('has something to measure', () => {
    // Anti-vacuous floor: if `cutPath` ever returns empty, every assertion
    // below would pass by measuring nothing.
    expect(pointsOf(cutPath(100, 60, 12, ['bottomRight'])).length).toBeGreaterThan(3);
  });

  it('draws a plain rectangle when no corner is cut', () => {
    expect(pointsOf(cutPath(100, 60, 12, []))).toEqual([
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]);
  });

  it('can still detect an un-cut corner, so this is not vacuous', () => {
    const square = cutPath(100, 60, 12, []);
    const cut = cutPath(100, 60, 12, ['bottomRight']);
    expect(cut).not.toEqual(square);
    expect(pointsOf(cut).length).toBe(pointsOf(square).length + 1);
  });

  it.each<CutCorner>(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'])(
    'cuts %s at exactly 45°, equal legs',
    (corner) => {
      const points = pointsOf(cutPath(120, 80, 16, [corner]));

      // The cut introduces one extra vertex; the new edge is the only one that
      // moves in both axes at once. Every other edge is axis-aligned.
      const diagonals = points
        .map((point, i) => [point, points[(i + 1) % points.length]] as const)
        .filter(([a, b]) => a[0] !== b[0] && a[1] !== b[1]);

      expect(diagonals).toHaveLength(1);

      const [[ax, ay], [bx, by]] = diagonals[0];
      expect(Math.abs(bx - ax)).toBe(Math.abs(by - ay));
      expect(Math.abs(bx - ax)).toBe(16);
    },
  );

  it('clamps the cut so it cannot swallow the box', () => {
    // A 40pt cut on a 30pt-tall control would otherwise cross the midline and
    // fold the path over itself.
    const points = pointsOf(cutPath(100, 30, 40, ['bottomRight']));
    const diagonal = points
      .map((point, i) => [point, points[(i + 1) % points.length]] as const)
      .find(([a, b]) => a[0] !== b[0] && a[1] !== b[1]);

    expect(diagonal).toBeDefined();
    const [[ax], [bx]] = diagonal!;
    expect(Math.abs(bx - ax)).toBe(15);
  });

  it('cuts two corners when two are asked for', () => {
    const points = pointsOf(cutPath(100, 60, 10, ['topRight', 'bottomLeft']));
    const diagonals = points
      .map((point, i) => [point, points[(i + 1) % points.length]] as const)
      .filter(([a, b]) => a[0] !== b[0] && a[1] !== b[1]);

    expect(diagonals).toHaveLength(2);
    diagonals.forEach(([[ax, ay], [bx, by]]) => {
      expect(Math.abs(bx - ax)).toBe(Math.abs(by - ay));
    });
  });
});

/**
 * The declared surface, and the guard that stops the declaration being a lie.
 *
 * `CutSurface` paints its ground as an SVG path, which the contrast walk in
 * `test-support/contrast.ts` cannot see — so it declares that ground with an
 * `auditSurface` prop instead. A declaration is only worth having if something
 * checks it, and there are two ways it can rot:
 *
 *   - the prop stops being emitted, and every string on a cut surface goes back
 *     to being measured against the wrong thing in silence;
 *   - the walk stops reading it, with the same result.
 *
 * The cases below hold both ends.
 */
describe('the surface a cut declares', () => {
  it('emits the fill it was given', async () => {
    const view = await render(React.createElement(CutSurface, { fill: '#123456' }));

    /*
      Walks `toJSON()` — the host tree — rather than `root.findAll`, for the same
      reason the contrast audit does: this is what the platform was handed, so a
      prop that survives here is a prop that actually reached a view.
    */
    const declares = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      const host = node as { props?: Record<string, unknown>; children?: unknown[] };
      if (host.props?.auditSurface === '#123456') return true;
      return (host.children ?? []).some(declares);
    };

    expect(declares(view.toJSON())).toBe(true);
  });

  it('is read by the contrast walk as a real ground', async () => {
    /*
      ⚠ The anti-vacuous half. If the walk ignored `auditSurface`, this string
      would be measured against the page it sits on — near-white ink on
      near-black, which passes comfortably. Declaring a near-white ground makes
      the same ink fail, so the failure below is only reachable if the
      declaration was actually *used*.
    */
    const view = await render(
      React.createElement(
        CutSurface,
        { fill: '#F5F3F0' },
        React.createElement(Text, { style: { color: '#F5F3F0', fontSize: 16 } }, 'invisible'),
      ),
    );

    expect(auditText(view).map((entry) => entry.text)).toContain('invisible');
    expect(belowFloor(auditText(view)).join(' ')).toContain('invisible');
  });

  it('measures against the page when nothing is declared, so the case above is not free', async () => {
    /*
      The same near-white ink, with no declared ground. It lands on the page and
      passes — which is what proves the failure above came from the declaration
      rather than from the ink being unreadable everywhere.
    */
    const view = await render(
      React.createElement(
        CutSurface,
        {},
        React.createElement(Text, { style: { color: '#F5F3F0', fontSize: 16 } }, 'legible'),
      ),
    );

    expect(belowFloor(auditText(view))).toEqual([]);
  });
});
