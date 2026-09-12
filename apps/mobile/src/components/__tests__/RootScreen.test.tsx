import { NavigationContext } from '@react-navigation/native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import RootScreen, { useRootScroll } from '../RootScreen';
import { cornerCovers } from '../CutSurface';
import { TITLE_BAND } from '../ScreenTitle';
import { REFERENCE, withSafeArea } from '../../test-support/safe-area';
import { cut, space, surface, type } from '../../theme';

/**
 * The root's frame: one name at a time, in the right voice, and a collapse
 * that a scroll can actually drive.
 *
 * ── What is checked, and why each is a silent defect otherwise ──────────────
 *
 * B8 asks for a condensed large title that collapses into a mono nav title on
 * scroll. Every half of that can fail without an error: the two titles can
 * both be visible (two names on one screen), the collapse can be wired to
 * nothing (a `onScroll` nobody spreads), the compact title can carry the wrong
 * face (`fontWeight` without a `fontFamily` renders San Francisco), and a
 * pushed instance can draw the large title under a native header that already
 * names the screen.
 *
 * The masthead plate (11 Sep) adds four more of the same shape — see the
 * block at the foot of the file.
 */

/** A scroller that signs the contract, the way the segment screens do. */
function Content() {
  const scroll = useRootScroll();
  return (
    <ScrollView testID="scroller" {...scroll}>
      <Text>body</Text>
    </ScrollView>
  );
}

/*
  The band's height animates over 180ms on a timer. Fake timers keep that
  inside each case rather than firing into a torn-down environment, and let
  the collapse be driven to its end state deterministically.
*/
jest.useFakeTimers();

async function scrollTo(view: Awaited<ReturnType<typeof render>>, y: number, contentHeight = 2000) {
  await fireEvent.scroll(view.getByTestId('scroller'), {
    nativeEvent: {
      contentOffset: { y },
      contentSize: { height: contentHeight, width: 390 },
      layoutMeasurement: { height: 800, width: 390 },
    },
  });
  await act(async () => {
    jest.runAllTimers();
  });
}

/** Every host `Image` in the rendered tree, as its props. */
function hostImages(tree: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const host = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
    if (host.type === 'Image' && host.props) found.push(host.props);
    for (const child of host.children ?? []) walk(child);
  };
  walk(tree);
  return found;
}

/** The masthead's `Image`, by the asset it names. */
function plateImages(view: Awaited<ReturnType<typeof render>>) {
  return hostImages(view.toJSON()).filter((props) =>
    String((props.source as { testUri?: string } | undefined)?.testUri ?? '').includes('masthead-')
  );
}

/**
 * Both titles, large then compact.
 *
 * ⚠ `includeHiddenElements`: the compact band is hidden from assistive tech
 * while expanded (that is one of the things under test), and RNTL's default
 * queries skip hidden elements — so without this the band is invisible to the
 * test exactly when it is correctly invisible to VoiceOver.
 */
function titles(view: Awaited<ReturnType<typeof render>>, title: string) {
  const [large, compact] = view.getAllByText(title, { includeHiddenElements: true });
  return { large, compact, band: compact.parent! };
}

describe('RootScreen', () => {
  it('draws the root’s name in the condensed grotesk, and its collapsed form in mono', async () => {
    const view = await render(
      withSafeArea(
        <RootScreen title="Service">
          <Content />
        </RootScreen>
      )
    );

    const { large, compact } = titles(view, 'Service');

    /*
      Face and weight together — React Native does not synthesise weights, so a
      `fontWeight` without its `fontFamily` renders San Francisco and reads as a
      design choice. See `mobile-font-faces.test.ts`.
    */
    expect(StyleSheet.flatten(large.props.style)).toMatchObject({
      fontFamily: type.display.fontFamily,
      fontSize: 34,
      textTransform: 'uppercase',
    });
    expect(StyleSheet.flatten(compact.props.style)).toMatchObject({
      fontFamily: type.monoNav.fontFamily,
      fontSize: type.monoNav.fontSize,
      textTransform: 'uppercase',
    });
  });

  it('starts expanded, with the compact band hidden from assistive tech', async () => {
    const view = await render(
      withSafeArea(
        <RootScreen title="Plan">
          <Content />
        </RootScreen>
      )
    );

    expect(titles(view, 'Plan').band.props.accessibilityElementsHidden).toBe(true);
  });

  it('collapses once the content has scrolled, and expands back at the top', async () => {
    const view = await render(
      withSafeArea(
        <RootScreen title="Plan">
          <Content />
        </RootScreen>
      )
    );

    await scrollTo(view, 40);
    expect(titles(view, 'Plan').band.props.accessibilityElementsHidden).toBe(false);

    /*
      Two thresholds. Scrolling back to 10 is under the collapse line but over
      the expand line, so the band stays collapsed rather than flapping; only a
      return to the top expands it.
    */
    await scrollTo(view, 10);
    expect(titles(view, 'Plan').band.props.accessibilityElementsHidden).toBe(false);

    await scrollTo(view, 0);
    expect(titles(view, 'Plan').band.props.accessibilityElementsHidden).toBe(true);
  });

  it('leaves a page that cannot scroll alone, even when it bounces', async () => {
    /*
      The garage with one car is shorter than its viewport. Dragging it
      reports offsets past the threshold on the way into the bounce, and a
      band that collapsed on those would jump on a screen with nothing to
      scroll.
    */
    const view = await render(
      withSafeArea(
        <RootScreen title="Garage">
          <Content />
        </RootScreen>
      )
    );

    await scrollTo(view, 60, 780);
    expect(titles(view, 'Garage').band.props.accessibilityElementsHidden).toBe(true);
  });

  it('hands the same contract to a function child', async () => {
    let received: ReturnType<typeof useRootScroll> = null;

    await render(
      withSafeArea(
        <RootScreen title="Garage">
          {(scroll) => {
            received = scroll;
            return <Text>body</Text>;
          }}
        </RootScreen>
      )
    );

    expect(received).toEqual(
      expect.objectContaining({ onScroll: expect.any(Function), scrollEventThrottle: 32 })
    );
  });

  it('draws no large title under a native header, and hands out no contract', async () => {
    /*
      The pushed instance. `canGoBack()` is the same question `rootTitle` asks,
      so the two cannot disagree about whether a header is present.
    */
    const navigation = { canGoBack: () => true } as never;
    let received: ReturnType<typeof useRootScroll> | undefined;

    const view = await render(
      withSafeArea(
        <NavigationContext.Provider value={navigation}>
          <RootScreen title="Service">
            {(scroll) => {
              received = scroll;
              return <Text>body</Text>;
            }}
          </RootScreen>
        </NavigationContext.Provider>
      )
    );

    expect(view.queryByText('Service')).toBeNull();
    expect(received).toBeNull();
  });

  it('sizes the band from the title’s own metrics', () => {
    /*
      The expanded band is the title's line plus its air, so a change to
      `type.display` moves the band with it rather than leaving a gap or a clip.
    */
    expect(TITLE_BAND).toBe(space.sm + type.display.lineHeight + space.md);
  });

  /*
    ── The masthead plate ──────────────────────────────────────────────────────

    Every half of this fails without an error: a root that names a plate and
    draws none looks like the graphite it replaced; a plate that survives the
    collapse puts the night behind a mono nav title the brief wants on
    graphite; a cut painted at the wrong corner or size reads as a deliberate
    notch; and a plate announced to VoiceOver as "image" says nothing the band
    does not already say.
  */

  it('draws the night behind a root that names a plate, and nothing behind one that does not', async () => {
    const withPlate = await render(
      withSafeArea(
        <RootScreen title="Service" plate="service">
          <Content />
        </RootScreen>
      )
    );
    const plates = plateImages(withPlate);
    expect(plates).toHaveLength(1);
    expect(String((plates[0].source as { testUri: string }).testUri)).toContain('masthead-service');
    /* `cover`, never `contain` — B2 retires the letterbox on every plate. */
    expect(plates[0].resizeMode).toBe('cover');

    const without = await render(
      withSafeArea(
        <RootScreen title="Garage">
          <Content />
        </RootScreen>
      )
    );
    expect(plateImages(without)).toHaveLength(0);
  });

  it('opens each image root on its own plate', async () => {
    for (const key of ['service', 'plan', 'advisor'] as const) {
      const view = await render(
        withSafeArea(
          <RootScreen title={key} plate={key}>
            <Content />
          </RootScreen>
        )
      );
      const [plate] = plateImages(view);
      expect(String((plate.source as { testUri: string }).testUri)).toContain(`masthead-${key}`);
    }
  });

  /** The plate's own host view, and its parent — the animated wrapper that fades it. */
  function plateNodes(view: Awaited<ReturnType<typeof render>>) {
    type Host = { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
    let plate: Host | null = null;
    let parent: Host | null = null;
    const walk = (node: unknown, above: Host | null) => {
      if (!node || typeof node !== 'object') return;
      const host = node as Host;
      if (host.props?.testID === 'masthead-plate') {
        plate = host;
        parent = above;
        return;
      }
      for (const child of host.children ?? []) walk(child, host);
    };
    walk(view.toJSON(), null);
    return { plate: plate as Host | null, parent: parent as Host | null };
  }

  /** Every `RNSVGPath` in the host tree, as its props. */
  function svgPaths(tree: unknown): Array<Record<string, unknown>> {
    const found: Array<Record<string, unknown>> = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const host = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
      if (host.type === 'RNSVGPath' && host.props) found.push(host.props);
      for (const child of host.children ?? []) walk(child);
    };
    walk(tree);
    return found;
  }

  it('paints the plate’s cut at the band’s expanded height, bottom-right, in the page colour', async () => {
    const view = await render(
      withSafeArea(
        <RootScreen title="Plan" plate="plan">
          <Content />
        </RootScreen>
      )
    );

    /* The plate measures its width on layout; the band's height it is told. */
    expect(svgPaths(view.toJSON())).toHaveLength(0);
    /* Hidden from assistive tech by design, so the query must be told to look. */
    await fireEvent(view.getByTestId('masthead-plate', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { width: 390, height: 105, x: 0, y: 0 } },
    });

    const expanded = REFERENCE.insets.top + TITLE_BAND;
    const paths = svgPaths(view.toJSON());
    /* One corner, not four — B2's "one 45° cut" — and the geometry the garage plate's cover uses. */
    expect(paths).toHaveLength(1);
    expect(paths[0].d).toBe(cornerCovers(390, expanded, cut.plate, ['bottomRight'])[0]);
    /*
      Painted in the page colour. `react-native-svg` hands the host a brush —
      `{ type: 0, payload }` with the colour as an ARGB integer — so the token
      is compared in that form rather than as the string the component wrote.
    */
    const argb = (hex: string) =>
      ((0xff << 24) | parseInt(hex.slice(1), 16)) >>> 0;
    expect(paths[0].fill).toEqual({ type: 0, payload: argb(surface.page) });
  });

  it('hides the plate from assistive technology', async () => {
    const view = await render(
      withSafeArea(
        <RootScreen title="Advisor" plate="advisor">
          <Content />
        </RootScreen>
      )
    );
    const [image] = plateImages(view);
    expect(image).toBeTruthy();
    /* The image carries no label to announce; the view around it hides the subtree. */
    expect(image.accessibilityLabel).toBeUndefined();
    expect(image.accessibilityRole).toBeUndefined();
    const { plate } = plateNodes(view);
    expect(plate?.props?.accessibilityElementsHidden).toBe(true);
    expect(plate?.props?.importantForAccessibility).toBe('no-hide-descendants');
    expect(plate?.props?.pointerEvents).toBe('none');
  });

  it('draws no plate under a native header', async () => {
    const navigation = { canGoBack: () => true } as never;
    const view = await render(
      withSafeArea(
        <NavigationContext.Provider value={navigation}>
          <RootScreen title="Service" plate="service">
            <Content />
          </RootScreen>
        </NavigationContext.Provider>
      )
    );
    expect(plateImages(view)).toHaveLength(0);
  });

  it('takes the plate away with the large title when the band collapses', async () => {
    const view = await render(
      withSafeArea(
        <RootScreen title="Plan" plate="plan">
          <Content />
        </RootScreen>
      )
    );

    /*
      The wrapper around the plate carries the large title's own opacity, so
      the two go together. The timing lands under fake timers, and the host
      tree then holds the resolved number.
    */
    const opacityOf = () => {
      const { parent } = plateNodes(view);
      return (StyleSheet.flatten(parent?.props?.style as StyleProp<ViewStyle>) as ViewStyle).opacity;
    };

    expect(opacityOf()).toBe(1);
    await scrollTo(view, 40);
    expect(opacityOf()).toBe(0);
    await scrollTo(view, 0);
    expect(opacityOf()).toBe(1);
  });
});
