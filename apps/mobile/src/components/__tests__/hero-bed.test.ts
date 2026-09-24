import { COVER_FLOOR, bedAlphaAt, bedStops } from '../HeroBed';
import { contrastRatio } from '../../test-support/contrast';
import { text } from '../../theme';

/**
 * The floor under the type on the photograph — that it is still there.
 *
 * ── ⚠ 23 Sep · what this exists to stop happening a second time ─────────────
 *
 * `HeroBed` is the reason this app is allowed to print type over an owner's
 * photograph at all: web's rule is that nothing is printed over a photograph,
 * and the phone satisfies the rule underneath it — *no type whose contrast
 * depends on the photograph* — with a guaranteed dark floor instead.
 *
 * The floor was three fixed fractions: 0.95 at the hero's foot, 0.55 at 22%,
 * **zero at 52%**. Correct when written. Then the identity block grew three
 * times — the stat strip, the `THIS CAR` legend, and the switcher's
 * `CAR 01 OF 03` eyebrow — until its top sat at about 48% of the hero, where
 * the bed was delivering 0.08. Worst case on a bright sky, every string on
 * the plate was under AA and the car's 36pt name measured **1.61:1**.
 *
 * Nothing failed. The screen's own style sheet said the type was *"Legal here
 * because of `HeroBed`'s guaranteed floor"* while the floor guaranteed
 * nothing where the type was, and every captured round of the design loop was
 * shot against a night photograph, which is the one input that hides it.
 *
 * So the bed is driven by the block now, and this holds the property rather
 * than the numbers: **whatever the block's extent, the bed still delivers
 * enough alpha at its top for the dimmest ink on the plate to clear AA over
 * any photograph.** A fourth thing added to the block moves `coverTo` and
 * this stays true; a fourth thing added with a *dimmer ink* fails here.
 */

/** Pure white — the worst photograph an owner can hand this screen. */
const WHITE = '#FFFFFF';

/**
 * The ground a string sits on: the bed's shadow at `alpha` over a white
 * photograph, as a colour the contrast helper can parse.
 *
 * ⚠ `hero.shadow` is `#08090B`. Written out rather than imported for the
 * reason `SCREEN_BACKGROUND` is: a harness that reads the value it checks
 * agrees with any drift. `theme-backdrop.test.ts` keeps that pair honest and
 * the same argument applies here.
 */
function groundAt(alpha: number): string {
  const shadow = [8, 9, 11];
  const composited = shadow.map((c) => Math.round(alpha * c + (1 - alpha) * 255));
  return `rgb(${composited.join(',')})`;
}

describe('the bed covers the block it exists for', () => {
  it('holds the floor across the whole type block, top and bottom', () => {
    /*
      ⚠ Both ends. The first version of this bed held its darkest value all
      the way to the hero's foot, which took the last 40pt of photograph
      below `THIS CAR` darker than the panel underneath it — so the plate's
      bottom edge, and the 45° cut that lives on it, had nothing to read
      against. Nothing is printed down there; the floor is for the type.
    */
    for (const frac of [0.16, 0.25, 0.35, 0.45, 0.48]) {
      expect(bedAlphaAt(frac, 0.48)).toBeGreaterThanOrEqual(COVER_FLOOR - 1e-9);
    }
    /* And it is lighter at the foot than across the type, so the plate's edge reads. */
    expect(bedAlphaAt(0.02, 0.48)).toBeGreaterThan(COVER_FLOOR);
    expect(bedAlphaAt(0.02, 0.48)).toBeLessThan(0.9);
  });

  it('still delivers the floor where a three-line plate ends', () => {
    /*
      0.48 is where the block's top sits on the reference display with the
      eyebrow drawn — the position that broke it. The bed is told to cover
      exactly that.
    */
    expect(bedAlphaAt(0.48, 0.48)).toBeCloseTo(COVER_FLOOR, 5);
  });

  it('fails the way the shipped bed failed, so this is not measuring nothing', () => {
    /*
      ⚠ The anti-vacuous case, and it is the real one: these are the stops
      that shipped — 0.95 / 0.55 at 22% / 0 at 52% — evaluated at the same
      height. If `bedAlphaAt` ever agreed with them again, every assertion
      above would still be green and the defect would be back.
    */
    const shipped = (frac: number) =>
      frac <= 0.22 ? 0.95 + (0.55 - 0.95) * (frac / 0.22) : frac <= 0.52 ? 0.55 * (1 - (frac - 0.22) / 0.3) : 0;

    expect(shipped(0.48)).toBeLessThan(0.1);
    expect(bedAlphaAt(0.48, 0.48)).toBeGreaterThan(shipped(0.48) * 5);
  });

  it('never leaves a gradient without a zero stop, whatever it is told', () => {
    /*
      `coverTo` is a layout measurement divided by a layout measurement. A
      block taller than the hero, a zero height mid-transition, a NaN from a
      display nobody has tried — each would otherwise produce a bed over the
      entire photograph, or none at all, silently.
    */
    for (const asked of [-1, 0, 0.01, 0.48, 0.9, 1, 4]) {
      const stops = bedStops(asked);
      expect(stops).toHaveLength(4);

      /*
        ⚠ Monotonic offsets. The plateau's start is fixed and its end comes
        from a measurement, so a small enough `coverTo` would otherwise put
        the two out of order — and `LinearGradient` does not reject that, it
        draws something. Something is not a floor.
      */
      const offsets = stops.map(([offset]) => offset);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      expect(offsets[offsets.length - 1]).toBeLessThanOrEqual(1);

      /* Darkest at the foot, the plateau flat across the type, nothing at the top. */
      expect(stops[0][1]).toBeGreaterThan(stops[1][1]);
      expect(stops[1][1]).toBe(stops[2][1]);
      expect(stops[3][1]).toBe(0);
    }
  });

  it('keeps its default long enough for a real plate, because a missing layout keeps it', () => {
    /*
      ⚠ `CutSurface` records forty surfaces on this app rendering with no
      `onLayout` at all. If that happens to the identity block the bed never
      hears `coverTo`, so the default is not a placeholder — it is what ships
      on that render.
    */
    expect(bedAlphaAt(0.48)).toBeGreaterThanOrEqual(COVER_FLOOR * 0.9);
  });
});

describe('the floor is enough for the inks that sit on it', () => {
  /*
    ⚠ The plate's ink ladder, and why it stops where it does. Over a white
    photograph at the 12pt type floor, AA arrives at bed alpha 0.583 for
    `text.primary` and 0.671 for `text.secondary`; `text.muted` needs 0.837,
    which is a scrim heavy enough to lose the car. So the plate carries the
    first two and never the third.
  */
  it('clears AA for every ink the plate uses, over a white photograph', () => {
    const ground = groundAt(COVER_FLOOR);
    for (const ink of [text.primary, text.secondary]) {
      const ratio = contrastRatio(ink, ground);
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('would not clear it for the muted ink, which is why the plate may not use it', () => {
    const ratio = contrastRatio(text.muted, groundAt(COVER_FLOOR));
    expect(ratio!).toBeLessThan(4.5);
  });
});
