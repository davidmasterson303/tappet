import { useCallback, useEffect, useState } from 'react';
import { useRefetchOnFocus } from '../navigation/useRefetchOnFocus';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import ClusterGauge from '../components/ClusterGauge';
import { BAY_DIAL } from '../components/GarageBay';
import HealthDrivers from '../components/HealthDrivers';
import HealthHistory, { type HealthReading } from '../components/HealthHistory';
import Plinth from '../components/Plinth';
import ProvenanceRow from '../components/ProvenanceRow';
import SectionHeader from '../components/SectionHeader';
import { RecallDetailScreen } from './RecallDetailScreen';
import Working from '../components/Working';
import { apiRequest, ApiRequestError } from '../api/client';
import type { HealthDriver } from '@tappet/core/health-drivers';
import { adviceDisclosure } from '@tappet/core/advice-disclosure';
import { getHealthBandJudgement } from '@tappet/core/health-band';
import { healthVerdict } from '@tappet/core/health-claims';
import { newestFiledAt, openRecalls } from './verdict-inputs';
import { space, text, type } from '../theme';

/**
 * The score, and everything behind it.
 *
 * ── Why this is a screen and not three cards on the vehicle hub ─────────────
 *
 * `VehicleDetailScreen` carried the dial, the summary, the three drivers and
 * the history chart, plus a build dial, a ladder and five detail rows. David's
 * note on 23 Aug: *"really, the whole information architecture is unclear,
 * cluttered, uninspired and confusing."*
 *
 * The design system agrees and says why —
 * `specs/native-vehicle-detail.spec.html` is **"a hub, not tabs"**: the vehicle
 * screen names a car and lists places to go, and *"every section is a real
 * pushed route with a real back gesture … on a phone a stack is the better
 * shape, because each destination gets the full screen and the platform's own
 * back."*
 *
 * So the reading stays on the hub — one dial, one word, one sentence — and the
 * *account of it* lives here, where there is room for the drivers to have their
 * explanations and the chart to be a chart.
 *
 * ── ⚠ The hero dial, and this is the screen that earns it ───────────────────
 *
 * The board's rule is *"one dial per screen"* and puts the 184pt hero on the
 * garage bay. The vehicle hub therefore takes the 104pt card dial — a second
 * hero on it would be a second screen claiming the same instrument. Here there
 * is exactly one dial and it is the subject, so it is drawn at hero size.
 *
 * ── The drivers do not add up to the score, and are not presented as if ─────
 *
 * `health_score` comes from the model; the three drivers are computed from the
 * schedule, the recall list and mileage against age. They explain the subject
 * without summing to it, which is why they sit **below** the summary rather
 * than beside the dial — three numbers next to a total invite arithmetic that
 * does not hold.
 */

interface HealthSummary {
  health_score?: number | null;
  summary?: string | null;
  /** When the reading was taken — `healthVerdict` cannot refuse a stale sentence without it. */
  last_generated?: string | null;
}

interface HealthResponse {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    vehicle_health_summary?: HealthSummary | HealthSummary[] | null;
    /* Both embedded shapes, for the reason the vehicle screen sets out. */
    nhtsa_data?: { recalls?: unknown[] | null } | { recalls?: unknown[] | null }[] | null;
    recall_actions?: Array<{ campaign_number?: string | null }> | null;
  };
  /*
    ⚠ Both are **top level**, and both are snake_case — `health_drivers` and
    `health_history`, not `drivers` and `history`. They sit outside `vehicle`
    because they are computed rather than stored, which `load-vehicle`'s own
    docblock argues keeps a derived value from reading as a column. Getting
    either name wrong here is silent: the arrays are optional, so the screen
    renders a score with no account of it and nothing reports a thing.
  */
  health_drivers?: HealthDriver[];
  health_history?: HealthReading[];
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'gone' }
  | {
      kind: 'loaded';
      name: string;
      /** `null` is "we cannot say", and it is never drawn as a zero. */
      score: number | null;
      /**
       * What may be said about the score, from `healthVerdict` — the stored
       * sentence only while it postdates the records on file, a statement of
       * staleness otherwise, and the inputs the reading was worked out from.
       */
      verdict: ReturnType<typeof healthVerdict>;
      drivers: HealthDriver[];
      history: HealthReading[];
    };

export function HealthScreen({
  vehicleId,
  title,
  onSignOut,
  onAskAdvisor,
}: {
  vehicleId: string;
  title?: string;
  onSignOut: () => void;
  /** Threaded through to the recalls section — see `R16` below. */
  onAskAdvisor: (vehicleId: string, question: string) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setState({ kind: 'loading' });

      try {
        /*
          ── 12 Sep · two requests, so the verdict has its inputs ──────────────

          This screen printed `vehicle_health_summary.summary` verbatim, where
          the vehicle screen one tap up runs it through `healthVerdict` — so on
          a car whose records postdate the reading, the hub said "taken before
          your 5 service records were filed" and this screen printed the
          sentence those records had superseded. The critic's round-28 Cut
          list caught the contradiction (drift §6.13).

          The verdict needs the service count and the newest filing date,
          which live on `/load-maintenance-data`; `allSettled` keeps that
          request subordinate, as the vehicle screen does: a slow history
          costs the verdict its staleness check — `null` inputs leave the
          sentence alone — and nothing else.
        */
        const [vehicleResult, servicesResult] = await Promise.allSettled([
          apiRequest<HealthResponse>(`/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`),
          apiRequest<{ maintenanceLineItems?: Array<{ created_at?: string | null }> }>(
            `/load-maintenance-data?vehicleId=${encodeURIComponent(vehicleId)}`
          ),
        ]);
        if (vehicleResult.status === 'rejected') throw vehicleResult.reason;
        const data = vehicleResult.value;

        const health = first(data.vehicle?.vehicle_health_summary);
        const filedItems =
          servicesResult.status === 'fulfilled' &&
          Array.isArray(servicesResult.value.maintenanceLineItems)
            ? servicesResult.value.maintenanceLineItems
            : null;

        const verdict = healthVerdict({
          summary: health?.summary,
          generatedAt: health?.last_generated,
          serviceCount: filedItems === null ? null : filedItems.length,
          newestFiledAt: filedItems === null ? null : newestFiledAt(filedItems),
          openRecalls: openRecalls(first(data.vehicle?.nhtsa_data)?.recalls, data.vehicle?.recall_actions)
            .length,
        });

        setState({
          kind: 'loaded',
          name:
            [data.vehicle?.year, data.vehicle?.make, data.vehicle?.model]
              .filter(Boolean)
              .join(' ') ||
            title ||
            'this car',
          score: typeof health?.health_score === 'number' ? health.health_score : null,
          verdict,
          drivers: Array.isArray(data.health_drivers) ? data.health_drivers : [],
          history: Array.isArray(data.health_history) ? data.health_history : [],
        });
      } catch (error) {
        /*
          ── ⚠ MOB-08 · a server 401 is not "you are signed out" ─────────────

          This forced a sign-out on **any** 401 and then `return`ed without
          setting a state — which is only safe if `onSignOut()` unmounts the
          screen, and it does not when the network call was the thing that
          failed. Result: offline with an expired token, this screen shows
          skeletons **forever** — no error, no retry, nothing to pull.

          `isLocallySignedOut` is the distinction the client already goes to
          trouble to make, with a docblock recording that a real tester hit this
          three times out of three on 5 Aug — and exactly **one** screen
          consumed it. A `device` 401 is genuinely signed out; a `server` 401
          may be a token the server would accept a second later, and destroying
          a working session over one response is how a spurious failure becomes
          a forced re-login.

          Falls through to the error state either way, so there is always
          something on screen and something to press.
        */
        if (error instanceof ApiRequestError && error.isLocallySignedOut) {
          onSignOut();
          return;
        }
        if (error instanceof ApiRequestError && error.status === 404) {
          setState({ kind: 'gone' });
          return;
        }
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not load this score',
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

  /*
    ── ⚠ MOB-09 · a write behind this screen used to be invisible ─────────────

    Nothing in this app refetched on focus. Every screen loaded once on mount
    and kept whatever it had — so adding to the wishlist, marking a recall
    repaired, confirming an odometer or scanning an invoice all succeeded and
    then returned to a screen that said they had not.

    `useRefetchOnFocus` carries the full argument, including why this runs on
    the first focus too rather than being clever about skipping it.
  */
  useRefetchOnFocus(load);

  if (state.kind === 'loading') {
    /* 12 Sep: the delayed full instrument — see `Working` for the rule. */
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Opening the score" />
      </ScrollView>
    );
  }

  if (state.kind === 'gone') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>This vehicle is no longer here</Text>
        <Text style={styles.errorBody}>It may have been removed from another device.</Text>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Could not load this score</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Button label="Try again" variant="outline" onPress={() => void load()} />
      </View>
    );
  }

  const band = state.score === null ? null : getHealthBandJudgement(state.score);

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={text.muted}
        />
      }
    >
      <Card>
        {state.score !== null && band ? (
          <>
            {/*
              ── ⚠ 6 Sep · B5: the dial stands on the page, not on a plinth ────

              `Plinth` wrapped this dial and its docblock argued the case well:
              *"A 196pt dial dropped straight onto a card is a picture of a dial.
              The plinth is what makes it an object in the room."*

              That argument was made when the dial sat on a **card** — a filled,
              bordered, rounded surface that the plinth had to stand out from.
              B5 turned the card into a hairline band, so the plinth became the
              only box on the screen, and a lone box around an instrument is the
              nesting the line forbids: the critique found "the Health dial sits
              in an enclosed hairline box beneath a band rule".

              The dial does not need lifting off a surface that is no longer
              there. `Plinth` is left in the tree with its guards intact — it is
              a considered component and this was its only call site, so
              deleting it would throw away the reasoning along with the usage.
            */}
            {/*
              ── 12 Sep · B3: the same dial as the garage, at the same size ──

              This drew `HERO_SIZE` (184) while the garage draws `BAY_DIAL`
              (240, the web dial at the web's own size — `GarageBay` carries
              the measurement). The critic's round-29 gap 1 measured the
              difference from the frames: a dial at three quarters of the
              garage's, on the one screen that exists to explain the score.
              One dial, one size; the garage's constant, not a second copy.
            */}
            <ClusterGauge score={state.score} size={BAY_DIAL} />
            {/*
              `verdict.text`, never the stored summary — the same rule as the
              vehicle screen, which this screen used to break one tap away
              from it. The provenance line names what the reading was worked
              out from, so a contradiction is visible while somebody is
              looking rather than only to whoever compares the two screens.
            */}
            {state.verdict.text ? <Text style={styles.summary}>{state.verdict.text}</Text> : null}
            <ProvenanceRow kinds={state.verdict.inputs} />
          </>
        ) : (
          /*
            No score is not a zero and not an empty dial. A dial drawn at 0
            asserts a reading; this says there is none — the same rule the
            garage bay follows, and `advice-range.ts` carries why the product
            says "we cannot say" rather than guessing a default.
          */
          <Text style={styles.summary}>
            No score yet. We work one out once we have looked this car over — that happens a
            few seconds after it is added, and again as work is recorded.
          </Text>
        )}
      </Card>

      {state.drivers.length > 0 && (
        <Card>
          <SectionHeader title="What is driving it" />
          <HealthDrivers drivers={state.drivers} />
        </Card>
      )}

      {/*
        ── ⚠ R16 · recalls live here, under the score they drive ─────────────

        `Recalls` was a top-level destination for content already surfaced twice
        — the garage bay banners the count, and the vehicle hub banners the
        worst one — which made it a third path to the same two items.

        More to the point, recalls **are** one of the things driving the number
        above. A separate screen put the cause a navigation away from the
        effect, on the one screen whose entire job is explaining the effect.

        ⚠ It keeps its own component and its own fetch rather than being folded
        into this screen's payload. `RecallDetailScreen` owns the marking flow,
        the severity banners and the NHTSA-not-checked state, all of which are
        genuinely its own problem; what changed is where it is *reached from*.
        The hub's red banner deep-links to this section rather than to a route.
      */}
      <View
        /*
          The anchor the hub's banner scrolls to. Named rather than measured:
          a deep link to "the recalls part of Health" has to survive the drivers
          card above it changing height.
        */
        nativeID="health-recalls"
      >
        <RecallDetailScreen
          embedded
          vehicleId={vehicleId}
          title={title}
          onAskAdvisor={onAskAdvisor}
          onSignOut={onSignOut}
        />
      </View>

      {/*
        ⚠ Nothing at all below two readings, rather than an empty panel under a
        heading. `HealthHistory` declines to draw a one-point chart — correctly,
        because a one-point chart is a dot — and a `Card` around it would still
        render the title, which reads as a load that failed.

        That is the state this account is in today: one recorded reading for the
        real car, so this appears once the sweep has run twice.
      */}
      {state.history.length >= 2 && (
        <Card>
          <SectionHeader title="Over time" />
          <HealthHistory history={state.history} />
        </Card>
      )}

      {/*
        ── ⚠ UX-16 / D11 · this footnote was a second copy, and it omitted the AI ─

        It read: *"The score is an assessment from what we know about {name} —
        its schedule, its recorded work and its mileage for its age. It is not
        an inspection."*

        Two problems, and the second is the one that made it a finding. It was a
        hand-written paraphrase of the health disclosure, so the phone and the
        web said different things about the same number — the drift
        `advice-disclosure.ts` exists to prevent and that
        `advice-says-it-is-generated.test.ts` explicitly asserts against for the
        consultant. And it never said a **model** wrote the reading, which is
        the whole of UX-16: "an assessment from what we know" describes a
        process without naming the thing doing it.

        The inputs it listed are not lost. `HealthDrivers` sits directly above
        and names all three with a sentence each, computed rather than
        paraphrased — which is a better answer to "what is this made of" than a
        line of prose restating it from memory.
      */}
      <Text style={styles.footnote}>{adviceDisclosure('health')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.h2 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.h1,
    gap: space.sm,
  },
  errorTitle: { ...type.title, color: text.primary },
  errorBody: { ...type.body, color: text.muted, textAlign: 'center' },
  summary: { ...type.body, color: text.secondary },
  footnote: { ...type.value, color: text.muted },
});
