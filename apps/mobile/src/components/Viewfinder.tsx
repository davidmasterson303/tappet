import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import type { InvoiceFile } from '../api/documents';
import { INVOICE_QUALITY, invoiceFileFromCapture } from '../media/invoice-image';
import { CONTROL_HEIGHT, border, brand, rhythm, space, status, surface, text, type } from '../theme';
import Button from './Button';

/**
 * The viewfinder — brief B9, the phone's headline act.
 *
 * *"Invoice scan is the phone's headline act: a SCAN INVOICE primary on
 * Service, a viewfinder with hairline corner brackets and a mono readout, one
 * firm haptic on capture."* Until 12 Sep the scan opened on a paragraph and a
 * TAKE A PHOTO button that handed the act to the system camera through
 * `expo-image-picker`; the critique named it in four consecutive rounds and
 * held the Service tab at 7/10 on that line alone (`critique-31.md` …
 * `critique-33.md`: *"the viewfinder is a full point"*). This is the frame:
 * the live feed full-bleed under the header, four hairline brackets at its
 * corners, a mono readout beneath, and a capture control that is a control.
 *
 * ── ⚠ This file imports two native modules, and that is a decision ──────────
 *
 * `InvoiceScanScreen` has never imported a native module — the picker reaches
 * it as a `pickImage` prop, because the dev client of 5 Aug was built before
 * the picker existed and importing it anywhere would have crashed the app at
 * launch. `expo-camera` requires its native module at import (`ExpoCamera.js`
 * is a bare `requireNativeViewManager`), so the same is true here: **the old
 * CrewChief dev client on the simulator cannot load a bundle containing this
 * file.** It is not the runtime any more. Expo Go carries both modules,
 * David's phone runs Expo Go, and the one device build
 * (`docs/runbook-eas-device-build.md`) compiles them in. The seam survives
 * for the library path, which is still the picker's.
 *
 * `expo-haptics` is the gentler of the two — an optional native module, so
 * the import is safe anywhere and `impactAsync` throws where the engine is
 * missing. The catch below is for exactly that: a haptic that cannot fire
 * must never stop a photograph being taken.
 *
 * ── The readout prints what the camera has said, never what it might ────────
 *
 * Every word on the right of the readout row is a state this component can
 * observe: the permission hook's answer, the request in flight, the session's
 * own `onCameraReady` and `onMountError`, the capture awaiting its promise.
 * There is no "scanning…" and nothing on a timer — the same rule
 * `working-stages.ts` holds for the wait ledger.
 *
 * ⚠ **`onCameraReady` fires on the simulator too**, where there is no camera.
 * `CameraView.swift`'s `startSessionIfNeeded` dispatches it unconditionally
 * after the props settle, so READY alone would lie on the machine this is
 * developed on. The iOS module can answer the real question:
 * `getAvailableLensesAsync()` reads `AVCaptureDevice`'s discovery session,
 * which lists nothing on a simulator and the wide lens (at least) on every
 * iPhone. So on iOS the readout says NO CAMERA when that list is empty, and
 * the capture control stands down — a generated grey square is what
 * `takePictureAsync` returns there, and filing one against a car would be a
 * lie the upload cannot see. `Camera.isAvailableAsync()` is not this check:
 * it is web-only in 57 and throws `UnavailabilityError` on iOS. On any other
 * platform the query is not made and the readout cannot say NO CAMERA at all,
 * which is the honest shape of not knowing.
 *
 * ⚠ The query is made **inside** the ready handler, not on mount. The class
 * method resolves `[]` when its native ref is unset (`?? []` in
 * `CameraView.js`), which an effect racing the mount could read as "no
 * lenses" on a real phone. Once the view has reported ready its ref exists.
 *
 * ── Denied is a state with a way out, not an error ──────────────────────────
 *
 * iOS asks once; a refusal at the alert returns `canAskAgain: false` and the
 * only route back is Settings. The readout says CAMERA OFF, the line beneath
 * says where the switch is, OPEN SETTINGS goes there, and the secondary the
 * screen places beside the capture control — CHOOSE FROM LIBRARY — is still
 * drawn, because there is a second way to complete the task and a dead end
 * that does not say so is a dead end.
 *
 * ── One haptic, at the press ────────────────────────────────────────────────
 *
 * `Heavy`, once, before `takePictureAsync` is awaited — the shutter's feel is
 * the press, as it is on the system camera, not the file arriving. It is not
 * awaited: the engine reports back after it has fired and there is nothing to
 * do with the answer. Nothing here animates (the native shutter blink is
 * turned off), so reduced motion has nothing to reduce; the haptic is not
 * motion and stays.
 *
 * ── The brackets are cyan, and the readout sits under the feed ──────────────
 *
 * B7 gives cyan three jobs — focus, the active rule, the refresh ramp — and a
 * viewfinder's frame is the focus of a capture; the critic's own picture of
 * this screen (`critique-32.md` §6) drew *"hairline cyan brackets"*. An
 * off-white hairline would vanish on the white paper it is framing, and
 * `border.*` at 8–24% would vanish on everything. No text sits over the feed:
 * a live image has no contrast anybody can promise, so the readout is a row on
 * the graphite beneath the frame, where `contrast.test.tsx` can measure it.
 */

/** What the camera has told this component so far. */
export type CameraState =
  /** Not running — the screen has not armed it (consent unresolved or declined). */
  | 'held'
  /** The permission has not been read yet. Nothing is said. */
  | 'unknown'
  /** The system alert is up. */
  | 'asking'
  /** Refused, and only Settings can change it. */
  | 'off'
  /** Granted; the session has not reported ready. */
  | 'starting'
  /** Granted; iOS reports no lens on this device — the simulator. */
  | 'none'
  | 'ready'
  | 'capturing'
  /** The session reported a mount error. */
  | 'failed';

/**
 * The readout's right cell. Exported so the test reads the words this
 * component prints rather than restating them.
 */
export const READOUT: Record<CameraState, string> = {
  held: '',
  unknown: '',
  asking: 'Asking',
  off: 'Camera off',
  starting: 'Starting',
  none: 'No camera',
  ready: 'Ready',
  capturing: 'Capturing',
  failed: 'Camera failed',
};

/** The bracket's leg. ~24pt, the figure the plate's cut measured at 4×. */
export const BRACKET_LEG = 24;

export default function Viewfinder({
  live,
  onCapture,
  onCaptureFailed,
  beside,
  foot,
}: {
  /**
   * Run the camera and draw the capture control. `false` keeps the frame on
   * screen with the camera stood down — the screen passes it while the AI
   * consent sheet is up or after it was declined, so a person who said "not
   * now" is never filmed for nothing.
   */
  live: boolean;
  /** Handed the capture as the upload wants it, after the haptic. */
  onCapture: (file: InvoiceFile) => Promise<void> | void;
  /** `takePictureAsync` rejected. The frame stays; the screen says what happened. */
  onCaptureFailed?: (caught: unknown) => void;
  /** Drawn beside the capture control — the library secondary. */
  beside?: ReactNode;
  /** Drawn beneath the controls — the model caveat, or the stood-down note. */
  foot?: ReactNode;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [asked, setAsked] = useState(false);
  const [ready, setReady] = useState(false);
  /** `null` is "not asked yet", which is not the same as "none found". */
  const [lenses, setLenses] = useState<string[] | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  /*
    Ask on mount, once, and only while armed — after consent, never beside
    the consent sheet, so the person answers one question at a time. A refusal
    that can still change (`canAskAgain`) is asked again on the next mount;
    a permanent one is not, and goes to Settings instead.
  */
  useEffect(() => {
    if (!live || asked || !permission) return;
    if (permission.granted || !permission.canAskAgain) return;
    setAsked(true);
    void requestPermission();
  }, [live, asked, permission, requestPermission]);

  const onReady = useCallback(async () => {
    if (Platform.OS === 'ios') {
      const found = await camera.current?.getAvailableLensesAsync();
      // `undefined` is the view being gone, not a device with no lens.
      if (found !== undefined) setLenses(found);
    }
    setReady(true);
  }, []);

  const state: CameraState = !live
    ? 'held'
    : mountError !== null
      ? 'failed'
      : permission === null
        ? 'unknown'
        : !permission.granted
          ? permission.canAskAgain
            ? 'asking'
            : 'off'
          : lenses !== null && lenses.length === 0
            ? 'none'
            : capturing
              ? 'capturing'
              : ready
                ? 'ready'
                : 'starting';

  const capture = useCallback(async () => {
    const view = camera.current;
    if (state !== 'ready' || !view) return;
    setCapturing(true);
    /*
      Once, here, and not awaited. A second call anywhere on this path is the
      defect `InvoiceScanScreen.test.tsx` counts for; a missing engine (the old
      dev client, a simulator) rejects and is ignored.
    */
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      const picture = await view.takePictureAsync({ quality: INVOICE_QUALITY });
      await onCapture(invoiceFileFromCapture(picture));
    } catch (caught) {
      onCaptureFailed?.(caught);
    } finally {
      setCapturing(false);
    }
  }, [state, onCapture, onCaptureFailed]);

  const warning = state === 'off' || state === 'failed';
  const showCamera = live && permission?.granted === true && mountError === null;

  return (
    <View style={styles.root}>
      <View style={styles.frame}>
        {showCamera ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            mute
            animateShutter={false}
            onCameraReady={() => void onReady()}
            onMountError={({ message }) => setMountError(message)}
          />
        ) : null}
        {/*
          Four L-shaped hairlines, `BRACKET_LEG` a side, inset by the page
          gutter so the framed area is the page's column. Drawn as borders,
          not as an SVG that needs a measured box: a bracket has no frame of
          its own to wait for.
        */}
        <View style={styles.brackets} pointerEvents="none" testID="viewfinder-brackets">
          <View style={[styles.bracket, styles.topLeft]} />
          <View style={[styles.bracket, styles.topRight]} />
          <View style={[styles.bracket, styles.bottomLeft]} />
          <View style={[styles.bracket, styles.bottomRight]} />
        </View>
      </View>

      {/*
        The readout: the act on the left, the camera's word on the right, in
        the spec row's grammar — a label, a right-aligned mono value, a
        hairline above. `accessibilityLabel` joins the two so the reader hears
        one sentence, and the state word carries its own so a change is a
        change of one element.
      */}
      <View style={styles.readout} accessibilityRole="text" accessibilityLabel={
        READOUT[state] ? `Photograph the invoice. Camera: ${READOUT[state]}` : 'Photograph the invoice'
      }>
        <Text style={styles.readoutLabel} numberOfLines={1}>
          Photograph the invoice
        </Text>
        {READOUT[state] ? (
          <View style={styles.state}>
            {warning ? (
              /*
                `△` (U+25B3) in sodium — B7's "hairline triangle beside a
                genuine warning", as `BandRow` draws it. Hidden from the
                reader because the word beside it says what it marks.
              */
              <Text style={styles.mark} accessibilityElementsHidden>
                △
              </Text>
            ) : null}
            <Text
              style={[styles.readoutState, warning && styles.readoutWarning]}
              testID="viewfinder-readout"
            >
              {READOUT[state]}
            </Text>
          </View>
        ) : null}
      </View>

      {state === 'off' ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Camera access is off for Tappet. Turn it on in Settings, or choose a photo from your
            library.
          </Text>
          <Button
            label="Open Settings"
            variant="ghost"
            size="small"
            onPress={() => void Linking.openSettings()}
            style={styles.onMargin}
          />
        </View>
      ) : null}
      {state === 'none' ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            This device has no camera. Choose a photo from your library instead.
          </Text>
        </View>
      ) : null}
      {state === 'failed' ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>{mountError}</Text>
        </View>
      ) : null}

      {/*
        The tab bar stands down on this screen (`TabBar.tsx`), so the home
        indicator is the foot's neighbour and the foot owes it the inset the
        bar used to pay. `Math.max` so a device without one keeps the rhythm.
      */}
      <View style={[styles.foot, { paddingBottom: Math.max(insets?.bottom ?? 0, space.lg) }]}>
        {live ? (
          <View style={styles.controls}>
            {/*
              A control, not a sentence. Off-white, cut, `CONTROL_HEIGHT` — the
              same edge as the small control beside it — and busy in the wait
              instrument's form while the shutter runs, with the bare mark: the
              readout already says CAPTURING, and one screen says a thing once.
            */}
            <Button
              label="Capture"
              variant="primary"
              size="small"
              onPress={() => void capture()}
              disabled={state !== 'ready' && state !== 'capturing'}
              busy={state === 'capturing'}
              busyLabel=""
              style={styles.capture}
            />
            {beside}
          </View>
        ) : null}
        {foot}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.page },
  /*
    Edge to edge — the feed, like the plate, is full-bleed. `overflow: hidden`
    so the preview layer, which fills by aspect, is cut at the frame and not
    at the screen.
  */
  frame: { flex: 1, overflow: 'hidden', backgroundColor: surface.nav },
  brackets: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, margin: rhythm.page },
  bracket: {
    position: 'absolute',
    width: BRACKET_LEG,
    height: BRACKET_LEG,
    borderColor: brand.accent,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 },
  topRight: { top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 },

  readout: {
    minHeight: CONTROL_HEIGHT,
    paddingHorizontal: rhythm.page,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
  },
  /* The button label's size — the readout speaks at the primary's scale. */
  readoutLabel: { ...type.monoLabel, fontSize: 13, lineHeight: 18, color: text.primary, flexShrink: 1 },
  state: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  readoutState: { ...type.monoLabel, fontSize: 13, lineHeight: 18, color: text.secondary },
  /* B7: sodium, as a line and a triangle, on the two states that are warnings. */
  readoutWarning: { color: status.attention },
  mark: { ...type.monoLabel, fontSize: 13, lineHeight: 18, color: status.attention },

  note: { paddingHorizontal: rhythm.page, paddingTop: space.md, gap: space.xs },
  noteText: { ...type.body, fontSize: 15, lineHeight: 22, color: text.muted },
  onMargin: { alignSelf: 'flex-start', marginLeft: -space.md },

  foot: {
    paddingHorizontal: rhythm.page,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  capture: { flex: 1 },
});
