import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Animated, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import {
  TIRE_COPY,
  formatDateMono,
  formatMiles,
  rotationRows,
  staggeredConsequences,
  tireAxis,
  tireReading,
  tireStats,
  tireSubline,
  type TireRotation,
  type TireSet,
} from '@tappet/core/tires';

import { apiRequest, ApiRequestError } from '../api/client';
import { fetchTireRecords, removeTireRotation } from '../api/tires';
import BackControl from '../components/BackControl';
import BandRow from '../components/BandRow';
import Button from '../components/Button';
import StatStrip from '../components/StatStrip';
import StripOdometer from '../components/StripOdometer';
import SwipeToRemove from '../components/SwipeToRemove';
import TirePlate, { PLATE_HEIGHT } from '../components/TirePlate';
import TireRow from '../components/TireRow';
import Working from '../components/Working';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import { TABULAR, border, rhythm, space, surface, text, type } from '../theme';
import { isOwnerPhoto } from './VehicleDetailScreen';

/**
 * The tire set — the fourth leaf under the car, beside Health · Service · Plan.
 *
 * ── What it is, in one sentence ─────────────────────────────────────────────
 *
 * A tire set becomes an object on the vehicle, the owner tells us its rotation
 * interval, and we tell them when they are outside it. v1.1; the design is
 * `design-loop/tires/v11-set.html` and `v11-staggered.html`, graded 8/10 at
 * round 4, and `packages/core/src/tires.ts` derives every figure on it. This
 * file composes; it computes nothing.
 *
 * ⚠ **Not a warranty-claim product.** Nothing on this screen says a warranty
 * will pay, and the one sentence that names the warranty at all is in the
 * push, not here (`notifications.ts`). On screen the same three facts are the
 * mono column — the numeral, `YOUR INTERVAL`, `PAST n MI` — because B1 forbids
 * Inter prose with interpolated values on a screen.
 *
 * ── What the screen is, top to bottom ───────────────────────────────────────
 *
 *   plate 268pt      the vehicle's, under the status bar, one 8pt cut
 *   stat strip       INSTALLED · ON THIS SET · BOUGHT AT — only the cells with
 *                    a value, and no strip at all when none has one
 *   title block      the car (displayLabel), the tire line (display), the
 *                    brand and a size only when one size is true (mono)
 *   the sizes        staggered only: FRONT and REAR at numeral scale, because
 *                    then the sizes are the subject
 *   the instrument   `StripOdometer` — miles since, the axis, the one sodium
 *                    run and its caption. Only when there is something to count
 *   consequences     staggered only: FRONT TO REAR · NOT POSSIBLE and REAR
 *                    MILEAGE WARRANTY · OFTEN HALVED / CHECK YOUR CARD
 *   ROTATIONS        the record — 01 the most recent — with, above it, the
 *                    ROTATION INTERVAL · NOT ENTERED row when there is none
 *   the control      ADD A ROTATION; or ENTER THE INTERVAL, answering the row
 *   what you entered the door to editing the set, as the hub's WHAT YOU TOLD US
 *
 * Two rules the graded round adopted govern which of these appear: **a label
 * appears only when it has a consequence** (no `SQUARE SET`, no strip of
 * dashes, no `NO ROTATIONS ON RECORD` under a row that already says there is
 * no interval), and **the same goes for a control** — the primary is the act
 * the screen's state calls for.
 *
 * ── The one thing that is not in the reference, and why ─────────────────────
 *
 * The reference's two frames each show one control. A real set with no
 * interval still needs its rotations logged, so that state offers both: the
 * primary answers the row above it (`ENTER THE INTERVAL`) and the secondary,
 * in the hairline form, is `ADD A ROTATION`. The hub's two switches are the
 * precedent — one fill, one hairline, side by side at the sheet's foot.
 *
 * The control is `Button` — off-white fill, graphite mono caps, the system's
 * one cut — where the reference drew a graphite well with four cuts. The
 * brief's B4 list is why `quiet` was deleted from `Button` (a graphite fill
 * is indistinguishable from a field), and the design system is the authority
 * over a loop frame. Logged here rather than in the drift file because the
 * reference was never the system.
 *
 * ── Sodium ──────────────────────────────────────────────────────────────────
 *
 * Exactly one mark, and only the instrument draws it. Nothing else here is
 * `status.attention`; `danger` and its washes appear nowhere on this screen at
 * rest — the swipe-to-remove's revealed REMOVE is the system's own destructive
 * confirm, reached by a deliberate gesture, which is the one place B7 allows
 * hue on type. Cyan appears only in the tab bar under this stack.
 *
 * ── The header is the plate's ───────────────────────────────────────────────
 *
 * `headerShown: false`, like the car's hub: the plate runs under the status
 * bar and the way back floats over it — `BackControl`, the one back control
 * both the hub and every pushed screen draw — on a graphite nav plate that
 * fades in as the plate scrolls under it, so the label is never printed over
 * the photograph once type is moving beneath it. Opacity, on the native
 * driver; nothing here animates a layout property.
 */

interface VehicleResponse {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    current_mileage?: number | null;
    photo_url?: string | null;
    photo_kind?: 'owner' | 'catalog' | 'plate' | null;
  };
}

interface Loaded {
  kind: 'loaded';
  name: string;
  odometer: number | null;
  photo: string | null;
  graded: boolean;
  set: TireSet | null;
  rotations: TireRotation[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; unavailable: boolean }
  | { kind: 'gone' }
  | Loaded;

/** The nav bar's height on iOS — `RootScreen.NAV_BAND`, restated so this file imports no root. */
const NAV_BAND = 44;

export function TiresScreen({
  vehicleId,
  title,
  onSignOut,
  onBack,
  onAddSet,
  onEditSet,
  onEnterInterval,
  onAddRotation,
}: {
  vehicleId: string;
  /** The car's name, for the way back and while the vehicle loads. */
  title?: string;
  onSignOut: () => void;
  onBack: () => void;
  onAddSet: () => void;
  onEditSet: (set: TireSet) => void;
  onEnterInterval: (set: TireSet) => void;
  onAddRotation: (set: TireSet, rotations: TireRotation[], odometer: number | null) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const insets = useContext(SafeAreaInsetsContext);
  const top = insets?.top ?? 0;
  const scrollY = useRef(new Animated.Value(0)).current;

  const load = useCallback(
    async (isRefresh = false, quiet = false) => {
      /* Quiet on a focus refetch — the rows changing is the whole feedback (20 Sep). */
      if (quiet) {
        // Keep what is on screen.
      } else if (isRefresh) setRefreshing(true);
      else setState({ kind: 'loading' });

      try {
        /*
          Two requests, `allSettled`: the car (its name, its odometer, its
          plate) from the route every other leaf reads, and the set from its
          own. The set's request is the one that may answer 503 until the
          migrations are applied; the car's is not allowed to hide behind it.
        */
        const [vehicleResult, tiresResult] = await Promise.allSettled([
          apiRequest<VehicleResponse>(`/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`),
          fetchTireRecords(vehicleId),
        ]);
        if (vehicleResult.status === 'rejected') throw vehicleResult.reason;
        if (tiresResult.status === 'rejected') throw tiresResult.reason;

        const vehicle = vehicleResult.value.vehicle ?? {};
        setState({
          kind: 'loaded',
          name: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || title || 'this car',
          odometer:
            typeof vehicle.current_mileage === 'number' && vehicle.current_mileage > 0 ? vehicle.current_mileage : null,
          photo: vehicle.photo_url ?? null,
          graded: isOwnerPhoto(vehicle),
          set: tiresResult.value.set,
          rotations: tiresResult.value.rotations,
        });
      } catch (error) {
        if (error instanceof ApiRequestError && error.isLocallySignedOut) {
          onSignOut();
          return;
        }
        if (quiet) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          setState({ kind: 'gone' });
          return;
        }
        /*
          `tires-unavailable` is the route saying the tables are not applied
          yet. Named on screen rather than folded into "could not load": an
          owner who reads "try again" will, and it will not help.
        */
        const unavailable = error instanceof ApiRequestError && error.code === 'tires-unavailable';
        setState({
          kind: 'error',
          unavailable,
          message: error instanceof Error ? error.message : 'Could not load the tire record',
        });
      } finally {
        setRefreshing(false);
      }
    },
    [vehicleId, title, onSignOut]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnFocus(load);

  const remove = (rotation: TireRotation) => {
    Alert.alert(
      'Remove this rotation?',
      `${formatDateMono(rotation.rotatedOn)} at ${formatMiles(rotation.odometer)}. It comes off the record and the axis; there is no undo.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeTireRotation(rotation.id);
                await load(false, true);
              } catch (error) {
                Alert.alert('Not removed', error instanceof Error ? error.message : 'Try again.');
              }
            })();
          },
        },
      ]
    );
  };

  /*
    The nav plate arrives as the plate leaves: fully in by the time the
    plate's foot passes the bar, so no line of type scrolls under a label on
    a photograph. Native driver — opacity only.
  */
  const navOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, PLATE_HEIGHT - top - NAV_BAND - 32), Math.max(1, PLATE_HEIGHT - top - NAV_BAND)],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const backLabel = state.kind === 'loaded' ? state.name : (title ?? 'Back');

  const nav = (
    <>
      <Animated.View
        style={[styles.navPlate, { height: top + NAV_BAND, opacity: navOpacity }]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={[styles.navRow, { top }]} pointerEvents="box-none">
        <BackControl label={backLabel} onPress={onBack} accessibilityLabel={`Back to ${backLabel}`} />
      </View>
    </>
  );

  if (state.kind === 'loading') {
    /* The delayed full instrument — see `Working` for the rule. */
    return (
      <View style={styles.screen}>
        <Animated.ScrollView contentContainerStyle={styles.centre} contentInsetAdjustmentBehavior="never">
          <Working delay line="Opening the tire record" />
        </Animated.ScrollView>
        {nav}
      </View>
    );
  }

  if (state.kind === 'gone') {
    return (
      <View style={styles.screen}>
        <View style={styles.centre}>
          <Text style={styles.errorTitle}>This vehicle is no longer here</Text>
          <Text style={styles.errorBody}>It may have been removed from another device.</Text>
        </View>
        {nav}
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.centre}>
          <Text style={styles.errorTitle}>
            {state.unavailable ? 'Tire records are not switched on yet' : 'Could not load the tire record'}
          </Text>
          <Text style={styles.errorBody}>
            {state.unavailable ? 'Nothing is wrong with this car. The record opens once it is.' : state.message}
          </Text>
          {state.unavailable ? null : <Button label="Try again" variant="outline" onPress={() => void load()} />}
        </View>
        {nav}
      </View>
    );
  }

  const { set, rotations, odometer } = state;
  const reading = set ? tireReading(set, rotations, odometer) : null;
  const axis = set && reading ? tireAxis(set, reading, odometer) : null;
  const stats = set && reading ? tireStats(set, reading) : [];
  const consequences = set ? staggeredConsequences(set) : [];
  const rows = rotationRows(rotations);
  const hasInterval = Boolean(reading?.interval);

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.body}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={text.primary}
            progressViewOffset={top + NAV_BAND}
          />
        }
      >
        <TirePlate photo={state.photo} graded={state.graded} />

        {stats.length > 0 ? <StatStrip stats={stats} /> : <View style={styles.plateRule} />}

        <View style={styles.sheet}>
          <Text style={styles.overline}>{state.name}</Text>

          {set ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {set.line}
              </Text>
              <Text style={styles.subline}>{tireSubline(set)}</Text>

              {reading?.staggered ? (
                /*
                  Staggered: the two sizes ARE the subject, so they take the
                  numeral scale here and the sub-line carries the brand alone.
                  The boolean is printed once, as data — never as a word.
                */
                <View style={styles.sizes} accessible accessibilityLabel={`Front ${set.sizeFront}, rear ${set.sizeRear}`}>
                  <View style={styles.size}>
                    <Text style={styles.sizeValue}>{set.sizeFront}</Text>
                    <Text style={styles.sizeCaption}>{TIRE_COPY.front}</Text>
                  </View>
                  <View style={styles.size}>
                    <Text style={styles.sizeValue}>{set.sizeRear}</Text>
                    <Text style={styles.sizeCaption}>{TIRE_COPY.rear}</Text>
                  </View>
                </View>
              ) : null}

              {reading && reading.since !== null ? (
                <View style={styles.instrument}>
                  <StripOdometer reading={reading} axis={axis} />
                </View>
              ) : null}

              {consequences.length > 0 ? (
                <View style={styles.consequences}>
                  {consequences.map((row, i) => (
                    <TireRow
                      key={row.index}
                      index={row.index}
                      label={row.label}
                      sub={row.sub}
                      value={row.value}
                      last={i === consequences.length - 1}
                      testID={`consequence-${row.index}`}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.sectionHead}>
                <Text style={styles.section} accessibilityRole="header">
                  {TIRE_COPY.rotations}
                </Text>
              </View>
              <View style={styles.table}>
                {!hasInterval ? (
                  /*
                    The absence is stated once, here, where the control that
                    answers it sits — and never as a dash in the instrument's
                    caption or a `NO ROTATIONS` row beneath it.
                  */
                  <TireRow
                    label={TIRE_COPY.rotationInterval}
                    sub={TIRE_COPY.willNotGuess}
                    value={TIRE_COPY.notEntered}
                    last={rows.length === 0}
                    testID="interval-not-entered"
                  />
                ) : null}
                {rows.map((row, i) => (
                  <SwipeToRemove
                    key={row.rotation.id}
                    accessibilityLabel={`Remove the rotation of ${formatDateMono(row.rotation.rotatedOn)}`}
                    onRemove={() => remove(row.rotation)}
                  >
                    <TireRow
                      index={row.index}
                      label={formatDateMono(row.rotation.rotatedOn)}
                      labelStyle="mono"
                      value={formatMiles(row.rotation.odometer)}
                      provenance={row.rotation.provenance}
                      last={i === rows.length - 1}
                      testID={`rotation-${row.index}`}
                    />
                  </SwipeToRemove>
                ))}
              </View>

              <View style={styles.controls}>
                {hasInterval ? (
                  <Button
                    label={TIRE_COPY.addRotation}
                    size="small"
                    onPress={() => onAddRotation(set, rotations, odometer)}
                    style={styles.control}
                  />
                ) : (
                  <>
                    <Button
                      label={TIRE_COPY.enterInterval}
                      size="small"
                      onPress={() => onEnterInterval(set)}
                      style={styles.control}
                    />
                    <Button
                      label={TIRE_COPY.addRotation}
                      variant="outline"
                      size="small"
                      onPress={() => onAddRotation(set, rotations, odometer)}
                      style={styles.control}
                    />
                  </>
                )}
              </View>

              <View style={styles.entered}>
                <BandRow label="What you entered" onPress={() => onEditSet(set)} last />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {TIRE_COPY.tires}
              </Text>
              <Text style={styles.subline}>NO SET ON RECORD</Text>
              <View style={styles.controls}>
                <Button label="Add a tire set" size="small" onPress={onAddSet} style={styles.control} />
              </View>
            </>
          )}
        </View>
      </Animated.ScrollView>
      {nav}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { paddingBottom: rhythm.tail },
  centre: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: space.xxl, gap: space.md },
  errorTitle: { ...type.displaySection, color: text.primary, textAlign: 'center' },
  errorBody: { ...type.body, color: text.muted, textAlign: 'center' },
  /* The plate's bottom hairline, full-bleed — the strip's top rule when there is a strip. */
  plateRule: { height: StyleSheet.hairlineWidth, backgroundColor: border.panel },
  sheet: { paddingHorizontal: rhythm.page, paddingTop: space.md },
  overline: { ...type.displayLabel, color: text.primary },
  title: { ...type.display, color: text.primary, marginTop: 2 },
  subline: { ...type.mono, ...TABULAR, color: text.muted, marginTop: space.xs },
  sizes: { marginTop: space.xs },
  size: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, height: 48 },
  sizeValue: { ...type.numeralPlate, ...TABULAR, color: text.primary },
  sizeCaption: { ...type.monoLabel, color: text.muted },
  instrument: { marginTop: space.xs },
  /* `xxl` — the one deliberate break on the screen, between the instrument and the records. */
  sectionHead: { marginTop: space.xxl, paddingBottom: space.xs },
  section: { ...type.displaySection, color: text.primary },
  table: {},
  /* The staggered consequences follow the sizes after the feature's one break, `xxl`. */
  consequences: { marginTop: space.xxl },
  /* 5pt of clearance from the last rule to the control — the feature's number on both screens (B5). */
  controls: { flexDirection: 'row', gap: space.sm, marginTop: 5 },
  control: { flexShrink: 1 },
  entered: { marginTop: space.xxl },
  navPlate: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: surface.nav },
  navRow: { position: 'absolute', left: space.sm, right: space.sm, height: NAV_BAND, justifyContent: 'center' },
});
