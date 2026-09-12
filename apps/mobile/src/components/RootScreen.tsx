import { NavigationContext } from '@react-navigation/native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useReducedMotion } from '../motion/reduced-motion';
import { border, space, surface, text, type } from '../theme';
import MastheadPlate, { MASTHEADS, type MastheadKey } from './MastheadPlate';
import { TITLE_BAND } from './ScreenTitle';

/**
 * A tab root's frame: the large title, whatever stays pinned under it, and the
 * collapse that turns the title into the mono nav title once the content has
 * scrolled.
 *
 * ── ⚠ B8, the half that was given up on 6 Sep ───────────────────────────────
 *
 * Locked brief B8: *"condensed large titles collapse to mono"*. `ScreenTitle`
 * drew the 34pt half in the screen and its docblock records why the platform's
 * own version — `headerLargeTitle` — could not be used: UIKit collapses the
 * title against the first scroll view it finds, and three of the four roots pin
 * a segment rail, a search field or a context line *above* their scroller. The
 * native title drew straight over them.
 *
 * So the collapse is the screen's own. The band under the status bar holds two
 * titles — the condensed 34pt one and the mono nav one — and the band's height
 * animates between the two heights as `collapsed` flips. Everything pinned
 * beneath the band (the rail, the scan button, the Advisor's "About" line)
 * moves with it, which is what a large title collapsing *looks* like, and the
 * screen's scroller needs to sign nothing but `onScroll`.
 *
 * ── ⚠ Why a threshold rather than a scroll-tracked height ────────────────────
 *
 * The obvious version binds the band's height to the scroll offset, so it
 * shrinks under the finger. It cannot: the band is *above* the scroller in
 * layout, and shrinking it by `s` moves the scroller up by `s` at the same
 * moment the scroller's own content has moved up by `s`. The content travels at
 * twice the finger, which reads as the list slipping. The alternative — an
 * absolutely-positioned band translating over an inset scroller — needs every
 * child screen to carry the inset, and two of them pin a search field *inside*
 * the content, which would be left behind by the translation.
 *
 * A threshold has neither problem. The band flips once the content has moved a
 * little (`COLLAPSE_AT`) and flips back once it is near the top (`EXPAND_AT`),
 * and the height change is a 180ms ease rather than a value the finger is
 * driving. Two thresholds, not one, so a reading that sits on the line does not
 * flap.
 *
 * ── ⚠ A pushed instance draws no large title ────────────────────────────────
 *
 * `Service` and `Plan` are each a root *and* a pushed screen — the car's hub
 * pushes them onto the dossier stack, where they arrive with a native header
 * and a back control. There the header already carries the mono title (see
 * `rootTitle` in `RootNavigator`), so the band would be a second name for one
 * screen. `canGoBack()` is the same question `rootTitle` asks, and the pushed
 * instance renders only the pinned block and the content.
 *
 * ── ⚠ 11 Sep · the band is a plate on three roots ───────────────────────────
 *
 * Service, Plan and Advisor name a `plate`, and the band draws that night
 * behind the large title — full-bleed under the status bar, the name over its
 * lower third, one 8pt cut bottom-right — and takes it away with the title as
 * the band collapses, so the mono nav title sits on graphite like a native
 * header's. `MastheadPlate` carries the argument, the frames and the rule that
 * lets a title be printed on a photograph here. The band's *height* does not
 * change for a plate: `AccountControl` floats on the nav row from outside the
 * navigator, and air added above the title would leave ACCOUNT alone in the
 * plate's lit upper half.
 *
 * ── Outside a navigator ─────────────────────────────────────────────────────
 *
 * Every screen suite mounts its screen bare. Both context reads return nothing
 * there, and both have an obviously right answer: no inset, and a root.
 */

/** The nav bar's height on iOS, which the collapsed band matches. */
export const NAV_BAND = 44;

/** Content has moved this far: collapse. */
const COLLAPSE_AT = 24;
/** Content is back within this of the top: expand. */
const EXPAND_AT = 4;

type RootScroll = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** iOS sends one event per gesture without this; 32ms is plenty for a flip. */
  scrollEventThrottle: number;
};

const RootScrollContext = createContext<RootScroll | null>(null);

/**
 * The scroll contract a root's content signs.
 *
 * Spread onto the screen's scroller: `<ScrollView {...useRootScroll()} />`.
 * `null` outside a `RootScreen`, which spreads to nothing — so a segment screen
 * mounted on its own, or pushed with a native header, scrolls exactly as before.
 *
 * A screen whose scroller is its own child rather than a descendant's — the
 * garage, the advisor — cannot read the context it is about to provide; it
 * takes `children` as a function and receives the same contract that way.
 */
export function useRootScroll(): RootScroll | null {
  return useContext(RootScrollContext);
}

/** What `useRootScroll()` returns inside a root, spelled out for the function form. */
export type RootScrollProps = RootScroll | null;

export default function RootScreen({
  title,
  plate,
  leading,
  trailing,
  pinned,
  children,
  style,
}: {
  /** The root's name. Caps are applied here — the same rule as `ScreenTitle`. */
  title: string;
  /**
   * The night behind the name — see `MastheadPlate`.
   *
   * ⚠ Named, not passed as a source, so the guard can hold that each image
   * root opens on its own plate. Omitted on the garage, whose plate is the
   * car's: a masthead over the bay would be two nights on one screen.
   */
  plate?: MastheadKey;
  /** Sits before the large title on its row — the garage's mark. */
  leading?: ReactNode;
  /** Sits at the row's trailing edge — the garage's `+`. Collapses with the title. */
  trailing?: ReactNode;
  /** Stays under the band in both states: a segment rail, a primary, a context line. */
  pinned?: ReactNode;
  children: ReactNode | ((scroll: RootScrollProps) => ReactNode);
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  /*
    ⚠ `useContext(NavigationContext)`, not `useNavigation()` — the hook throws
    outside a navigator and every screen suite mounts its screen bare. See
    `ScreenTitle`, which reads the same two contexts for the same reason.
  */
  const navigation = useContext(NavigationContext);
  const hasHeader = navigation?.canGoBack() ?? false;
  const reduced = useReducedMotion();

  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /*
      Height is a layout property, so this cannot run on the native driver —
      and does not need to: it is one 180ms ease per flip, not a value tracked
      per frame.
    */
    Animated.timing(progress, {
      toValue: collapsed ? 1 : 0,
      duration: reduced ? 0 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [collapsed, progress, reduced]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;

    /*
      ⚠ Only content that can actually scroll may collapse the band. A page
      shorter than its viewport — the garage with one car — still reports
      offsets past the threshold while the finger drags it into the bounce,
      and would collapse on the drag and expand on the spring back: a 14pt
      jump on a screen with nothing to scroll. Both measures are on every
      scroll event; a harness that omits them is treated as scrollable.
    */
    const overflow =
      contentSize && layoutMeasurement
        ? contentSize.height - layoutMeasurement.height
        : Number.POSITIVE_INFINITY;
    const scrollable = overflow > COLLAPSE_AT;

    const next = collapsedRef.current ? y > EXPAND_AT : scrollable && y >= COLLAPSE_AT;

    if (next !== collapsedRef.current) {
      collapsedRef.current = next;
      setCollapsed(next);
    }
  }, []);

  const scroll = useMemo<RootScroll>(
    () => ({ onScroll, scrollEventThrottle: 32 }),
    [onScroll]
  );

  const top = insets?.top ?? 0;
  const expanded = top + TITLE_BAND;
  const compact = top + NAV_BAND;

  const height = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [expanded, compact],
  });
  const largeOpacity = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 0, 0],
  });
  const compactOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const contract = hasHeader ? null : scroll;

  return (
    <RootScrollContext.Provider value={contract}>
      <View style={[styles.screen, style]}>
        {hasHeader ? null : (
          <Animated.View style={[styles.band, { height }]}>
            {/*
              ── ⚠ 11 Sep · the night is the large title's ground ───────────

              Drawn first, so the titles sit on it; faded with the large title,
              so the collapsed band is graphite like the native header a pushed
              instance arrives under. The band clips, so the plate's cut corner
              — painted at the expanded height — slides away with the name
              rather than surviving on the nav row.
            */}
            {plate ? (
              <Animated.View
                style={[StyleSheet.absoluteFill, { opacity: largeOpacity }]}
                pointerEvents="none"
              >
                <MastheadPlate source={MASTHEADS[plate]} height={expanded} />
              </Animated.View>
            ) : null}
            <Animated.View
              style={[styles.large, { top: top + space.sm, opacity: largeOpacity }]}
              pointerEvents={collapsed ? 'none' : 'auto'}
            >
              <View style={styles.titleRow}>
                {leading}
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              </View>
              {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
            </Animated.View>

            {/*
              The mono nav title — B1's voice for the collapsed state. Centred in
              the 44pt band the way a native title is, and nothing else lives on
              its row: the account control floats at this height as a sibling of
              the navigator, and a `+` that survived the collapse would sit under
              it.
            */}
            <Animated.View
              style={[styles.compact, { top, opacity: compactOpacity }]}
              pointerEvents="none"
              accessibilityElementsHidden={!collapsed}
              importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
            >
              <Text style={styles.navTitle} numberOfLines={1}>
                {title}
              </Text>
            </Animated.View>

            <Animated.View style={[styles.rule, { opacity: compactOpacity }]} />
          </Animated.View>
        )}

        {pinned}

        <View style={styles.content}>
          {typeof children === 'function' ? children(contract) : children}
        </View>
      </View>
    </RootScrollContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  /*
    Clips, so the 34pt title slides under the band's edge as the band shrinks
    rather than overflowing the rail below it.
  */
  band: { overflow: 'hidden', backgroundColor: surface.page },
  large: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  title: { ...type.display, color: text.primary, flexShrink: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
  compact: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: NAV_BAND,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  navTitle: { ...type.monoNav, color: text.primary },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: border.panel,
  },
  content: { flex: 1 },
});
