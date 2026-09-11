import { NavigationContext } from '@react-navigation/native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ScrollView, StyleSheet, Text } from 'react-native';

import RootScreen, { useRootScroll } from '../RootScreen';
import { TITLE_BAND } from '../ScreenTitle';
import { withSafeArea } from '../../test-support/safe-area';
import { space, type } from '../../theme';

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
});
