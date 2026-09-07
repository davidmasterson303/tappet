import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import Card from '../components/Card';
import ClusterGauge from '../components/ClusterGauge';
import DialChip from '../components/DialChip';
import EmptyState from '../components/EmptyState';
import Field from '../components/Field';
import HealthDrivers from '../components/HealthDrivers';
import ScreenTitle from '../components/ScreenTitle';
import Segmented from '../components/Segmented';
import StatStrip from '../components/StatStrip';

import { space, surface, text, type } from '../theme';
import type { HealthDriver } from '@tappet/core/health-drivers';

/**
 * Every piece of the design system on one scrollable sheet, with no server.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * The mobile design loop grades screenshots. For most of a day it could not,
 * because the simulator's auth path to Supabase was wedged and the app would not
 * get past sign-in — and the conclusion drawn from that was "the loop is
 * blocked", which was wrong.
 *
 * **The brief's lines are properties of the components, not of the data.** Type,
 * the 45° cut, the hairline band, the dial's geometry, where sodium is allowed
 * to appear — none of those need a session to be true or false. What needed the
 * session was the *screens*, and the screens are a thin arrangement of these.
 *
 * The web client has had `system-specimen` for exactly this reason, and it is in
 * this loop's own benchmark set. This is that, for the phone.
 *
 * ── What it is not ──────────────────────────────────────────────────────────
 *
 * ⚠ **Not a substitute for grading the real screens.** A specimen shows whether
 * a component obeys the system; it cannot show whether a screen composes them
 * into a hierarchy worth reading, which is most of what the critique is for.
 * Grade screens when the app runs; grade this when it will not, and say which
 * one the score refers to.
 *
 * ── Reaching it ─────────────────────────────────────────────────────────────
 *
 * `EXPO_PUBLIC_DESIGN_SPECIMEN=1` in `apps/mobile/.env`, then restart Metro so
 * the value is inlined. Off in every other build, and `__DEV__`-gated besides,
 * so it cannot ship.
 */
const DRIVERS: HealthDriver[] = [
  {
    key: 'maintenance',
    label: 'Maintenance',
    score: 100,
    detail: '1 service with no record to count from. Nothing overdue among the 7 we can check.',
  },
  {
    key: 'recalls',
    label: 'Recalls',
    score: 35,
    detail: '2 recalls on record.',
  },
  {
    key: 'mileage-load',
    label: 'Mileage load',
    score: null,
    detail: 'No odometer reading yet, so there is nothing to judge the load against.',
  },
];

const STATS = [
  { label: 'Mileage', value: '66,000 mi' },
  { label: 'Trim', value: 'xDrive' },
  { label: 'Use', value: 'Daily Driver' },
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.eyebrow}>{title}</Text>
      {children}
    </View>
  );
}

export default function DesignSpecimen() {
  const [segment, setSegment] = useState<'due' | 'history'>('history');
  const [field, setField] = useState('');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.body}>
      <ScreenTitle>Specimen</ScreenTitle>

      <Block title="B2 · stat strip">
        <StatStrip stats={STATS} />
      </Block>

      <Block title="B3 · the dial">
        <View style={styles.centre}>
          <ClusterGauge score={70} />
        </View>
      </Block>

      <Block title="B4 · chip">
        <View style={styles.row}>
          <DialChip score={70} />
        </View>
      </Block>

      <Block title="B4 · buttons — primary, outline, ghost, delete, disabled">
        <View style={styles.stack}>
          <Button label="Scan invoice" onPress={() => {}} />
          <Button label="Change photo" variant="outline" onPress={() => {}} />
          <Button label="Not now" variant="ghost" onPress={() => {}} />
          <Button label="Delete my account" variant="delete" onPress={() => {}} />
          <Button label="Scan invoice" onPress={() => {}} disabled />
        </View>
      </Block>

      <Block title="B4 · field">
        <Field label="Mileage" hint="optional" value={field} onChangeText={setField} placeholder="66,000" />
      </Block>

      <Block title="B7 · segment rail">
        <Segmented
          options={[
            { value: 'due', label: 'Due' },
            { value: 'history', label: 'History' },
          ]}
          value={segment}
          onChange={setSegment}
          accessibilityLabel="Which services to show"
        />
      </Block>

      <Block title="B6 · spec table">
        <HealthDrivers drivers={DRIVERS} />
      </Block>

      <Block title="B7 · alerts — critical, attention, confirm">
        <View style={styles.stack}>
          <AlertBanner
            tone="critical"
            headline="Do not drive this car"
            body="The manufacturer has issued a do-not-drive notice for this recall."
          />
          <AlertBanner tone="attention" headline="2 open recalls" body="Both are free to have fixed." />
          <AlertBanner tone="confirm" headline="Invoice recorded" />
        </View>
      </Block>

      <Block title="B5 · band">
        <Card title="Next service" footnote="Based on 5 recorded services">
          <Text style={styles.plain}>Engine Oil &amp; Filter Change, in 4,000 mi</Text>
        </Card>
      </Block>

      {/*
        ⚠ Outside `Block`'s gutter. `EmptyState` brings its own `space.lg`, and
        nesting it in a padded block double-inset it — which read on the sheet as
        "the only element not sitting on the margin" and was the specimen's fault,
        not the component's.
      */}
      <Text style={[styles.eyebrow, styles.bareEyebrow]}>Empty state</Text>
      <EmptyState
          headline="No services yet"
          body="Scan an invoice and it will appear here, with the parts and the price."
          actionLabel="Scan invoice"
        onAction={() => {}}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: surface.page },
  body: { paddingBottom: space.h1 },
  block: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  /* Mono caps, so the sheet's own labels cannot be mistaken for product copy. */
  eyebrow: { ...type.monoLabel, color: text.muted, textTransform: 'uppercase' },
  stack: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  centre: { alignItems: 'center' },
  bareEyebrow: { paddingHorizontal: space.lg, paddingTop: space.lg },
  plain: { ...type.body, color: text.secondary },
});
