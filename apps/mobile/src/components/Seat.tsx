import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../motion/reduced-motion';

/**
 * A value seating into its cell — the bay filling in (Pattern B, 20 Sep).
 *
 * ── The motion, and why it is this one ──────────────────────────────────────
 *
 * While the research runs, the detail screen's cells go from "No score yet"
 * to a number as each row lands. Rather than popping in complete, a value
 * *seats*: a short, firm ease-out over a small travel, to a definite stop.
 * The product is named after the part that carries the cam's motion to the
 * valve, and the brand direction follows from it — a part going home in its
 * seat, mechanical and quiet. So: no spring, no overshoot, no pulse, no
 * shimmer loop. `Easing.out(Easing.cubic)` is the curve every gauge on this
 * phone already uses, and 220 ms is short enough to read as a click rather
 * than a reveal.
 *
 * ── When it runs ────────────────────────────────────────────────────────────
 *
 * Once, on mount. The caller keys the wrapper on the value's *presence* —
 * `key={score === null ? 'absent' : 'present'}` — so the seat plays when a
 * reading first appears and never again for the same reading; a re-render
 * is not an arrival. Reduced motion renders at rest immediately: the value
 * is the information, and the motion is decoration over it.
 */
const TRAVEL = 6;
const DURATION_MS = 220;

export default function Seat({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [TRAVEL, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
