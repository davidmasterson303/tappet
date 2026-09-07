import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { space, status, surface, type } from '../theme';

/**
 * A row that slides left to reveal one destructive action.
 *
 * ── ⚠ Why `PanResponder` and not `react-native-gesture-handler` ─────────────
 *
 * `ServiceHistoryScreen` carried a note saying this should become swipe-to-
 * delete, and that it was waiting because gesture-handler "is a native module
 * and therefore an EAS build (§9), so it waits for one that is being spent
 * anyway." That was the right call at the time and it is still true — the
 * library is not installed and adding it costs one of roughly fifteen builds a
 * month.
 *
 * `PanResponder` is core React Native. The gesture is the same, it costs
 * nothing, and it ships today.
 *
 * ⚠ **What is genuinely worse:** the pan runs on the JS thread, so a swipe
 * during a heavy render can stutter where gesture-handler's would not, and
 * there is no native handoff with the parent `ScrollView` — the claim below is
 * arithmetic rather than a negotiation between two native recognisers. If the
 * list ever grows long enough for that to show, this is the component to
 * replace and the docblock above is the reason to spend the build.
 *
 * ── ⚠ The gesture must not steal the scroll ─────────────────────────────────
 *
 * These rows live inside a vertical `ScrollView`, so claiming every horizontal
 * movement would make the list impossible to scroll near a row. The responder
 * only claims a gesture that is **more horizontal than vertical and past a
 * threshold** — a diagonal flick stays with the scroller, which is what a
 * person doing it means.
 *
 * ── The action still confirms ───────────────────────────────────────────────
 *
 * ⚠ Revealing is not doing. The swipe uncovers a control; pressing it raises
 * the same `Alert` the inline link raised, with the same wording about what a
 * removal costs. David: *"ok w/ swipe to delete as long as there's a confirm
 * after."* A swipe that deleted on release would be a gesture with no undo
 * behind it, on rows that hold somebody's service history.
 */
const REVEAL = 96;

export default function SwipeToRemove({
  onRemove,
  accessibilityLabel,
  children,
}: {
  onRemove: () => void;
  /** Names the record, so the action is not announced as a bare "Remove". */
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const settle = (to: number) => {
    open.current = to !== 0;
    Animated.spring(slide, { toValue: to, useNativeDriver: true, bounciness: 0 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      /*
        ⚠ `onMoveShouldSetPanResponder`, not `onStartShould…`. Claiming on touch
        *start* would take every tap on the row — including the one that opens
        the invoice — and a list whose rows cannot be tapped is worse than one
        without swipe.
      */
      /*
        ⚠ **Capture**, not the bubbling phase. The row's own `Pressable` becomes
        the responder on touch-start — it has to, it opens the invoice — and a
        parent asking on the bubbling phase is never consulted, so the first
        build of this simply did not move.

        Capture gives this a first refusal on every *move*, and it refuses
        everything that is not clearly a horizontal drag, so the tap still
        reaches the row underneath.
      */
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 8,
      onPanResponderMove: (_e, g) => {
        const base = open.current ? -REVEAL : 0;
        // Clamped: it opens to exactly one action's width and does not rubber-band.
        slide.setValue(Math.min(0, Math.max(-REVEAL, base + g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        const base = open.current ? -REVEAL : 0;
        const at = base + g.dx;
        settle(at < -REVEAL / 2 ? -REVEAL : 0);
      },
      onPanResponderTerminate: () => settle(0),
    })
  ).current;

  return (
    <View style={styles.wrap}>
      {/*
        Behind the row, revealed rather than animated in — so what the swipe
        uncovers is already there, which is what makes the gesture feel like
        moving a card rather than triggering an effect.
      */}
      <View style={styles.behind} pointerEvents="box-none">
        <Text
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={() => {
            settle(0);
            onRemove();
          }}
          style={styles.action}
          suppressHighlighting
        >
          Remove
        </Text>
      </View>

      {/*
        ⚠ **Opaque.** The action sits *behind* this layer, so without a ground
        of its own the row is a window onto it and REMOVE reads at rest on every
        line — which is the inline link this gesture replaced, with extra steps.

        `surface.page` because these rows sit directly on the page; a row that
        painted `surface.raised` here would announce a card the design system
        spent the whole port removing.
      */}
      <Animated.View
        style={[styles.row, { transform: [{ translateX: slide }] }]}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { backgroundColor: surface.page },
  behind: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: space.lg,
  },
  /*
    ⚠ Sodium as *line* is B7's rule, but this is a label with nothing to draw a
    line around — so it takes the destructive ink, which is the one place B7
    allows hue on type: the confirm itself. It is revealed by a deliberate
    gesture rather than sitting at rest in the list, which is the objection the
    inline link earned.
  */
  action: { ...type.monoLabel, color: status.dangerText, textTransform: 'uppercase' },
});
