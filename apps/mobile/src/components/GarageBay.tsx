import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import StatStrip, { type Stat } from './StatStrip';
import { getHealthBandJudgement } from '@tappet/core/health-band';

import BayRoom, { bayHeroHeight } from './BayRoom';
import ClusterGauge from './ClusterGauge';
import PlateStatusLine from './PlateStatusLine';
import type { PlateStatus } from '@tappet/core/plates';
import {
  UNKNOWN_TIMING,
  describeNextService,
} from '@tappet/core/garage-next-service';
import { SPEC_ROW, TABULAR, border, space, status, surface, text, type } from '../theme';
import { useReducedMotion } from '../motion/reduced-motion';
import { interFace } from '../theme/fonts';

/**
 * One car, in one bay.
 *
 * ── Why the garage is a bay and not a list ──────────────────────────────────
 *
 * The board's own line: *"Home. One car in a lit room, swiped between. Door
 * lifts, bay lights come up, needle sweeps."* A list of cards is a database
 * browser; a bay is a place you keep a car. The difference is the whole reason
 * the hero dial exists — a 184pt instrument has nowhere to live in a list row,
 * which is why this and the plinth were deferred out of step 3 rather than
 * built around a placeholder and then built again.
 *
 * ── The size the board actually uses — and the size the brief does ──────────
 *
 * ⚠ **164, not `HERO_SIZE`**, was the board's figure: the instruments card
 * specifies the hero at 184pt and the bay screen passed 164, *"what fits a bay
 * with a room, an identity lockup and a service row above the fold"*.
 *
 * ⚠ **240 since 11 Sep.** Locked brief B3: *"the dial is the web dial … 88pt
 * grotesk numeral"*, and two rounds of the critique measured the 164 dial's
 * 56pt reading against that. The web dial on a phone-width viewport spans
 * ~62% of the width — about 240pt — so 240 is the web dial at the web's own
 * size, and `ClusterGauge`'s `HERO_NUMERAL` puts 88 on it. What made 164 fit
 * no longer applies: the service row and the recall are a table *under* the
 * dial now, not rows between the plate and it, and the pool of light is gone
 * (see the instrument below). On the 16 Pro the second reading row still ends
 * above the tab bar; on a 4.7″ display the dial is whole above the fold and
 * the rows scroll, which is the order the brief puts them in.
 */
const BAY_DIAL = 240;

/** Door lift, then lights, then the needle. The order is the sentence. */
const DOOR_MS = 460;

/*
  ⚠ The shutter's travel is no longer a constant, because the room's height is
  no longer one — `bayHeroHeight` reads the window. It is resolved once per
  render and used for both, in that order: a shutter that travels 112 over a
  room of 240 leaves a visible band of door at the top for the rest of the
  session, and that is exactly the bug a second literal would reintroduce.
*/

export interface BayVehicle {
  id: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  photo_url?: string | null;
  /**
   * Whether the car's generation plate is still being drawn — `/vehicles`
   * carries it beside `photo_url` since 12 Sep, `null` when there is nothing
   * to say. See `PlateStatusLine`.
   */
  plate_status?: PlateStatus | null;
  current_mileage?: number | null;
  vehicle_status?: string | null;
  /**
   * The three stored next-service columns, when the sweep has written them.
   *
   * ⚠ **This docblock was wrong until 23 Aug, and the way it was wrong is the
   * reason §1 exists.** It said the migration was "written and **not applied**,
   * verified against the live database" — true when written, and false by the
   * time anyone read it. The columns are applied and carry data.
   *
   * What was actually missing was the **route's column list**: neither
   * `GARAGE_COLUMNS` nor `VEHICLE_COLUMNS` selected them, so the payload never
   * carried an answer and every car in the product rendered the unknown branch.
   * A note naming the wrong blocker is worse than no note — it sends the next
   * reader to write a migration that already ran.
   *
   * Still optional, and the unknown branch still matters: the sweep has not
   * written a row for every car, and "we have not worked it out" is a real
   * answer that must not render as "nothing is due".
   */
  next_service_label?: string | null;
  next_service_at_miles?: number | null;
  next_service_due_on?: string | null;
}

export default function GarageBay({
  vehicle,
  score,
  index,
  total,
  stats,
  active = true,
  onOpen,
  uploading,
  recallCount = 0,
  footer,
  onOpenService,
  today,
}: {
  vehicle: BayVehicle;
  /**
   * Today, as `YYYY-MM-DD`.
   *
   * Injected rather than read from a clock in here, for the reason the rest of
   * this codebase does it: a component with its own clock cannot be tested at
   * the date that matters — and "overdue since" versus "due now" turns on
   * exactly one day.
   */
  today: string;
  /** Health score, or null when the car has none. Null is not zero. */
  score?: number | null;
  /** Zero-based position, for the batten. */
  index: number;
  total: number;
  /**
   * The stat strip's cells, assembled by the caller.
   *
   * ⚠ Was a pre-joined `subtitle` string. B2 asks for a mono eyebrow over each
   * value in hairline-separated cells, which a joined string cannot express —
   * by the time it arrived here the labels were gone and the separators were
   * punctuation. See `StatStrip`.
   */
  stats?: Stat[];
  /**
   * Whether this is the bay on screen.
   *
   * The intro and the needle sweep run for the focused bay only. Three bays
   * igniting at once in a paged list — two of them off-screen — is three
   * animations nobody sees and one that arrives already finished.
   */
  active?: boolean;
  /** Opens the car. The room and its lockup are the target — not the dial. */
  onOpen?: () => void;
  uploading?: boolean;
  /**
   * Open recalls still standing against this car — the ones the recall screen
   * would draw and the owner has not marked repaired. Zero draws no row.
   *
   * ── ⚠ 11 Sep · a count, not a node, and under the dial rather than over it ─
   *
   * This was `alert?: ReactNode`, and the screen handed it a sodium-outlined
   * chip placed **above** the instrument — R19's finding, 23 Aug: *"an open
   * airbag recall outranks a fair score"*, so the alert came first and the
   * dial became the resting state of a car with nothing wrong.
   *
   * The locked brief's garage runs *"the mono stat strip … then the dial"*,
   * and two rounds of the critique read the chip as the one card left on the
   * screen and the rows between strip and dial as the brief's order broken
   * (critique 23, gap 1; critique 24, gap 1). So the dial follows the strip and
   * the recall is the first thing after it — a full-width hairline row in the
   * spec-table voice, sodium triangle beside a genuine warning (B7), the count
   * in the numeral column (B6) — not the 22pt chip under a 110pt dial that
   * R19 was written against. What R19 argued for survives: the recall is not
   * small, not decorative, and not below the fold; what it argued *with* — a
   * position above the instrument — gives way to the brief.
   */
  recallCount?: number;
  /** Anything else the screen hangs under the dial. */
  footer?: React.ReactNode;
  /** Opens `Service → Due` for this car — R21. Omitted means the row is a readout. */
  onOpenService?: () => void;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const door = useRef(new Animated.Value(0)).current;

  /*
    The hero's height, and the shutter's travel, from one call.

    ⚠ Read from `useWindowDimensions` rather than a constant because the room
    is now tall enough to push the dial off a short phone — see `bayHeroHeight`
    for the arithmetic. It is deliberately *not* held in state or memoised: the
    hook already re-renders on rotation, and a cached height is how a bay ends
    up with a door that no longer matches its room.
  */
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = bayHeroHeight(windowHeight);

  /*
    ── The door ───────────────────────────────────────────────────────────────

    A shutter over the room that lifts out of the top.

    `translateY`, not `scaleY`. React Native scales about an element's **centre**,
    so a `scaleY` from 1 to 0 closes like an iris — which reads as the room being
    switched off rather than a door going up. And not a height animation either:
    that relayouts every frame and drags the identity lockup and the dial with
    it. Translating a full-size overlay up by its own height is the only one of
    the three that is actually a door.

    ⚠ Reduced motion does not shorten this — it removes it. A door that lifts
    quickly is still a door lifting, and the preference is about motion rather
    than duration. The end state is the same either way: `open` true, shutter
    gone, dial swept.
  */
  useEffect(() => {
    if (!active) {
      door.setValue(0);
      setOpen(false);
      return;
    }

    if (reduced) {
      door.setValue(1);
      setOpen(true);
      return;
    }

    const lift = Animated.timing(door, {
      toValue: 1,
      duration: DOOR_MS,
      easing: Easing.out(Easing.cubic),
      /*
        `scaleY` is transform-only, so this one genuinely can run on the native
        driver — unlike the dials, whose values drive SVG attributes. The
        callback still sets `open` on the JS side, which is what releases the
        needle.
      */
      useNativeDriver: true,
    });

    lift.start(() => setOpen(true));

    return () => {
      lift.stop();
      // Lands open whether or not it finished. A half-lifted door left behind
      // by a swipe is the one state this must never rest in.
      setOpen(true);
    };
  }, [active, reduced, door]);

  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const band = typeof score === 'number' ? getHealthBandJudgement(score) : null;

  const nextService = describeNextService(
    {
      label: vehicle.next_service_label ?? null,
      atMiles: vehicle.next_service_at_miles ?? null,
      dueOn: vehicle.next_service_due_on ?? null,
    },
    vehicle.current_mileage ?? null,
    today
  );

  return (
    <View style={styles.bay}>
      {/*
        The batten. Bay number in the light's own colour, position on the right.

        ⚠ `bay.light` is `brand.accent` and this is one of the few places a
        string may wear it — it is signage, not body copy, and it sits on the
        page surface at full strength rather than over an unknown backdrop.
      */}
      <View style={styles.batten}>
        <Text style={styles.bayNumber}>BAY {String(index + 1).padStart(2, '0')}</Text>
        {/*
          ⚠ **R20.** Suppressed at one car. "1 of 1" is a pager for a list that
          cannot be paged — it takes up the batten's right half to tell somebody
          with one car that they have one car. Most garages in this product are
          one car, so this was the common render.
        */}
        {total > 1 ? (
          <Text style={styles.position}>
            {index + 1} of {total}
          </Text>
        ) : null}
      </View>

      {/*
        The room and the name are one target, and the dial is not part of it.

        A whole-bay Pressable would swallow the dial, which is an instrument to
        be read rather than a button. Tapping the car opens the car; that is the
        whole rule.

        ⚠ **R18, 23 Aug: there is no photo control here any more.** A solid
        "Change photo" pill sat on the photograph at the top right — visually the
        loudest control on the home screen, for the least frequent action anyone
        takes. On the garage the photograph is *scenery*; the affordance is
        "open this car". The control lives on the vehicle hero, where v8.2
        already ruled it is the hero's implied action.
      */}
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={onOpen ? `${name || 'Vehicle'}, open details` : undefined}
        style={styles.target}
      >
        <View style={styles.plate}>
          <BayRoom
            photo={vehicle.photo_url}
            make={vehicle.make}
            busy={uploading}
            height={heroHeight}
          />

          {/*
          The shutter. Painted in the nav surface — the darkest step — because a
          door is not part of the room's lighting and should read as something
          in front of it.
        */}
          {!open && (
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                StyleSheet.absoluteFill,
                styles.shutter,
                {
                  transform: [
                    {
                      translateY: door.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -heroHeight],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}

          {/*
            ── ⚠ 6 Sep · B2: the identity sits *on* the plate, not under it ────

            B2 puts "the model name in condensed caps over its lower third", and
            `VehicleDetailScreen` already did — the critique called that one
            correct and this one wrong in the same sentence: "Garage drops the
            name onto graphite beneath the plate."

            Two screens showing the same car with the same facts in two
            arrangements is the defect; whichever is right, they cannot disagree.
            Vehicle is the one the brief describes, so Garage moves to it.
          */}
          <View style={styles.identity}>
            {/*
              12 Sep: while the car's plate is being drawn, the night says so —
              the state voice over the name, on the fade's contrast floor.
              Never over a photograph: the route nulls the status under one,
              and this guards it again.
            */}
            {!vehicle.photo_url ? <PlateStatusLine status={vehicle.plate_status} /> : null}
            <Text style={styles.name} numberOfLines={1}>
              {name || 'Vehicle'}
            </Text>
            {stats ? <StatStrip stats={stats} /> : null}
          </View>
        </View>
      </Pressable>

      {/*
        ── ⚠ 11 Sep · the brief's order: strip, then the dial, then the readings ─

        Critique 24, gap 1: *"the brief runs strip → dial; on screen NEXT SERVICE
        and the recalls chip sit between them and ~140pt of empty graphite sits
        under FAIR."* Both rows lived above the instrument since 23 Aug (R19,
        R21). They are the two facts about the car the garage carries beyond
        its reading, and under the brief they are what the spec table is for:
        a mono label at the left, the value at the right, a hairline per row.
        The dial comes straight off the strip, as the studio paragraph writes
        it, and the two rows sit beneath it where the void was.
      */}
      <View style={styles.instrument}>
        {band && typeof score === 'number' ? (
          /*
            `active` is the door, not the bay. The needle waits for the room
            to be visible — a sweep that ran behind a closed shutter would be
            the animation this screen exists to stage, spent on nothing.

            ⚠ 11 Sep: no `BayLightPool` under it any more. The pool was a cyan
            radial at 14% hung from the dial's foot — "lit glass" on the board.
            Under B7 cyan is *"focus, active rule and refresh ramp"* and
            nothing else, and on every graded frame the pool was invisible
            anyway: 22pt of gap that read as air. The export stays for the
            board's record; the bay does not draw it.
          */
          <ClusterGauge score={score} size={BAY_DIAL} active={open} />
        ) : (
          /*
            No score is not a zero, and it is not an empty dial either. A dial
            drawn at 0 asserts a reading; this says there is none.
          */
          <Text style={styles.noScore}>No score yet</Text>
        )}
      </View>

      <View style={styles.readings}>
        {/*
          The next-service row.

          ⚠ **It renders in both states, and that is the design rather than an
          oversight.** `docs/step4-api-gaps.md` §3 held this row for one sentence:
          "'No schedule yet' is not the same as 'nothing due', and the card must
          not imply the second." A row that disappears when the answer is unknown
          is the version that breaks that rule — a bay with no next-service line,
          sitting next to one that has it, reads as a car with nothing coming up.

          Keeping the label fixed is what makes the empty state safe to say. The
          subject of the sentence is settled before the value is read, so "No
          schedule yet" can only be heard as an answer to *that* question.
        */}
        {/*
          ── R21 · the row is a way in, not only a readout ─────────────────────

          "Engine Oil & Filter Change · in 4,000 mi" is the single most actionable
          string on the home screen, and it led nowhere — the only way to act on it
          was to open the car, scroll the hub and find `Service`. It opens
          `Service → Due` directly now.

          ⚠ Only when there is an answer. `No schedule yet` is a statement, not a
          destination, and a pressable row that leads to a screen saying the same
          thing is worse than an unpressable one.
        */}
        <Pressable
          onPress={nextService.kind === 'known' ? onOpenService : undefined}
          disabled={nextService.kind !== 'known' || !onOpenService}
          accessibilityRole={nextService.kind === 'known' && onOpenService ? 'button' : undefined}
          accessibilityLabel={
            nextService.kind === 'known' && onOpenService
              ? `Next service: ${nextService.service}, ${nextService.timing}. Opens what is due.`
              : undefined
          }
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowLabel}>NEXT SERVICE</Text>
          {nextService.kind === 'known' ? (
            /*
              ── R21 · the job and the timing are two facts, not one string ────

              It read `Engine Oil & Filter Change · in 4,000 mi` as a single run
              at one weight — the most actionable string on the home screen,
              rendered as a label-plus-run-on. The job is what you do; the timing
              is when. Splitting them lets the eye take the job at a glance and
              the number when it wants it, and it puts the figure on tabular
              digits (R11) so a stack of bays does not shimmer.
            */
            <View style={styles.rowValue}>
              <Text style={styles.nextServiceJob} numberOfLines={1}>
                {nextService.service}
              </Text>
              <Text style={styles.nextServiceTiming} numberOfLines={1}>
                {nextService.timing}
              </Text>
            </View>
          ) : (
            /*
              Muted, and phrased to match the "No score yet" beneath it. Two
              absences on one card that word themselves differently read as two
              different kinds of problem.
            */
            <Text style={styles.nextServiceUnknown} numberOfLines={1}>
              {UNKNOWN_TIMING}
            </Text>
          )}
        </Pressable>

        {recallCount > 0 ? (
          /*
            The recall row — the garage's version of the car's `RecallBand`, in
            the strip-and-readings voice this screen speaks rather than the
            section voice the car's screen does. Same triangle, same rule: the
            sodium is the line beside the warning, never a frame around it.
            It opens the car, where the band leads on to the campaigns.
          */
          <Pressable
            onPress={onOpen}
            disabled={!onOpen}
            accessibilityRole={onOpen ? 'button' : undefined}
            accessibilityLabel={
              onOpen
                ? `${recallCount} open recall${recallCount === 1 ? '' : 's'}. Opens the car.`
                : undefined
            }
            style={({ pressed }) => [styles.row, styles.rowLast, pressed && styles.rowPressed]}
          >
            <Text style={styles.mark} accessibilityElementsHidden>
              △
            </Text>
            <Text style={styles.rowLabel}>{recallCount === 1 ? 'OPEN RECALL' : 'OPEN RECALLS'}</Text>
            <Text style={styles.rowCount}>{recallCount}</Text>
          </Pressable>
        ) : null}
      </View>

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    ── The readings: a two-row spec table under the dial ─────────────────────

    A hairline above each row and one under the last, so the pair reads as
    one table rather than two bands; 56 from rule to rule, B6's figure. The
    label is the mono caps eyebrow and the value sits at the right edge, which
    is the row every record list on the phone uses.
  */
  /* The bay's own gap separates it from the dial; no air of its own. */
  readings: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: SPEC_ROW,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  rowLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  /* A fill swap on press. Never a group opacity — see `Button`. */
  rowPressed: { backgroundColor: surface.raised },
  /** 12/500 mono caps — the label role, and the floor. Never smaller. */
  rowLabel: { ...type.monoLabel, color: text.muted },
  /*
    Right-aligned and allowed to take the slack, so the label column stays put
    across a stack of bays. A value that started at a different x on every card
    would make the list read as unaligned rather than as a set.
  */
  rowValue: { flex: 1, alignItems: 'flex-end' },
  nextServiceJob: { ...type.ui, color: text.primary, textAlign: 'right' },
  /* R11. "in 4,000 mi" is a figure, and figures do not reflow between bays. */
  nextServiceTiming: { ...type.mono, color: text.muted, textAlign: 'right', ...TABULAR },
  /*
    ⚠ 6 Sep · B1: mono. "No schedule yet" is a **state**, and B1 gives states
    mono along with values and dates — the job name above it is a name and keeps
    the sans. The critique saw this one sitting in a slot whose every other
    occupant is mono and read it as a leak, which it was: the slot is right, and
    what belongs in it changes with the string.
  */
  nextServiceUnknown: { ...type.mono, color: text.muted, flex: 1, textAlign: 'right' },
  /*
    ⚠ `△` (U+25B3), outlined, in sodium — B7's "hairline triangle beside a
    genuine warning", the same mark `RecallBand` and the health drivers use.
  */
  mark: { ...type.monoLabel, color: status.attention, width: 16, textAlign: 'center' },
  /* B6: the count in the numeral column, mono and right-aligned. */
  rowCount: { ...type.mono, ...TABULAR, color: text.primary, flex: 1, textAlign: 'right' },
  /**
   * ⚠ **No horizontal padding, as of 23 Aug.**
   *
   * It used to inset the whole stack, which is what forced the room to be a
   * card floating in the page. The hero bleeds to both edges now, so the inset
   * moved down onto the rows that still want one — the batten, the lockup, the
   * next-service row — and each of them names it.
   *
   * That move also fixed a double inset nobody had noticed: `GarageScreen`'s
   * `bayFooter` carries `space.lg` of its own, so the recall chip was sitting
   * 32pt in while everything above it sat at 16. Visible in any screenshot with
   * a recall on it, and invisible in every one without.
   */
  bay: { gap: space.md },
  target: { gap: space.md },

  batten: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  /**
   * The bay number, lit.
   *
   * 0.18em tracking at 12/700 — the board's figures. Tracking is what makes a
   * short numeric label read as a fixture rather than as a heading.
   */
  bayNumber: {
    /*
      ⚠ This was a hand-rolled size/weight/tracking triple that existed nowhere
      in the scale — 12/16 at Inter 700 with 2.16 tracking. It is a mono index
      label under B1, and `type.monoLabel` is that token.
    */
    ...type.monoLabel,
    /*
      ⚠ 6 Sep · B7: off-white, not `bay.light`. `bay.light` aliases
      `brand.accent`, so the bay's index was drawn in the accent cyan — which
      makes cyan an *ink*. In this system cyan is a rule, a focus ring and the
      refresh ramp; the moment it labels something, "active" and "informational"
      stop being distinguishable and the tab bar's overline has nothing left to
      say. The bay number is a mono index like any other.
    */
    color: text.muted,
    ...TABULAR,
  },
  position: { ...type.label, fontFamily: interFace('500'), fontWeight: '500', letterSpacing: 0, color: text.muted, ...TABULAR },

  /*
    Square, since 23 Aug. It covers a room that runs to both edges of the
    screen, and a rounded shutter over a square room shows four lit corners
    through it for the length of the lift.
  */
  shutter: { backgroundColor: surface.nav },

  /**
   * The lockup, where the room lands.
   *
   * `marginTop` cancels exactly the gap `target` puts between the room and
   * this, so the name butts against the fade's last row instead of floating
   * below it. Flush, **not overlapping**: the fade reaches `surface.page` at
   * full opacity right at that edge, so the lockup reads as continuous with the
   * hero while every pixel behind it is the page. That is the difference
   * between this and a scrim, and `HERO_FADE` carries why it matters.
   */
  /*
    Absolute over the plate's lower third, so the name reads against the
    photograph rather than against the graphite below it. `bottom` rather than a
    fixed offset: the plate's height is derived from the window.
  */
  plate: { position: 'relative' },
  identity: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: space.md,
    gap: 3,
    paddingHorizontal: space.lg,
  },
  /**
   * The one editorial role on this screen.
   *
   * ⚠ Still the system sans — the Newsreader serif is not loaded in the native
   * app, and adding the asset is a native change. That decision got cheaper on
   * 15 Aug: the EAS budget was confirmed at 12 iOS builds left this month, so a
   * build for a font is affordable rather than a real trade.
   */
  /*
    ⚠ B1, 6 Sep: the serif came off the model name. It is a *name* — the thing
    the brief sets in condensed grotesk caps — and it was the most visible
    serif in the app, repeated once per bay.
  */
  name: { ...type.display, color: text.primary },
  /* B2: the stat strip under the name is mono, not a proportional sans. */
  subtitle: { ...type.mono, color: text.muted, ...TABULAR },

  instrument: { alignItems: 'center' },
  noScore: { ...type.body, color: text.muted, paddingVertical: space.xl },
});

export { BAY_DIAL };
