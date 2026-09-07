import 'react-native';

/**
 * `auditSurface` — a view declaring the ground its children actually sit on.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `src/test-support/contrast.ts` measures every string in the app against the
 * surface behind it, and it finds that surface by reading `backgroundColor` off
 * each view as it walks down the tree. That worked for every surface this app
 * had until the 45° panel cut arrived.
 *
 * **A cut cannot be a `backgroundColor`.** React Native has no `clip-path`, so
 * `CutSurface` paints its ground as an SVG path — which the walk cannot see. The
 * first attempt at moving buttons onto the cut made roughly twenty contrast
 * cases fail outright, and the dangerous half was the cases that *did not* fail:
 * a label on a cut surface would have been measured against whatever sat behind
 * the button, silently, and passed at a ratio it does not achieve. That is the
 * exact defect class the contrast suite exists to catch, arriving underneath it.
 *
 * So a component that paints its own ground declares it here instead.
 *
 * ── ⚠ It is a declaration, and declarations can lie ─────────────────────────
 *
 * Setting `auditSurface` to a colour the component does not actually paint would
 * mislead the audit as thoroughly as painting in SVG hides from it. Two guards
 * hold the two halves in `components/__tests__/cut-geometry.test.tsx`: one
 * asserts `CutSurface` emits the fill it was given, the other proves the walk
 * *uses* it — by declaring a near-white ground under near-white ink and
 * requiring the failure, with a third case showing the same ink passes when
 * nothing is declared.
 *
 * ⚠ **Inert at runtime.** React Native drops props it does not recognise on a
 * `View`; nothing is sent across the bridge and nothing renders differently.
 * Its only reader is the audit.
 */
declare module 'react-native' {
  interface ViewProps {
    /**
     * The colour this view paints behind its children, when that colour is not
     * a `backgroundColor` the contrast walk could otherwise see.
     *
     * Set it only if the component genuinely paints this ground.
     */
    auditSurface?: string;
  }
}
