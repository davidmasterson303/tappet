import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from '../Text';

import Icon from '../Icon';
import SectionHeader from '../SectionHeader';
import CutSurface from '../CutSurface';
import type { CarRow } from './car-set';
import { TABULAR, TARGET_MIN, border, brand, cut, space, status, surface, text, type } from '../../theme';

/**
 * Concept B · **THE NAME IS THE DOOR** — the set is a sheet the car's name opens.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * The car's name is already the largest thing on the page and already names
 * the thing the whole app is currently about. Give it the door's mark and it
 * becomes the switcher: no new element at rest, nothing spent on a control
 * for a set most owners do not have. Tesla's app is the same answer to the
 * same problem — its products have no list screen, only a dropdown beside the
 * name and a swipe between them.
 *
 * Open, the sheet is the **one thing the hub cannot be**: every car at once,
 * compared. A row is the name, the band word, and the single line saying what
 * that car needs — the comparison view the garage never was, because the
 * garage could only ever show one car at a time.
 *
 * ── Why a sheet and not a screen ────────────────────────────────────────────
 *
 * A screen is somewhere you go and come back from; this is a choice you make
 * and are done with. A sheet keeps the car underneath it — you can see what
 * you are leaving — and it costs no tab, no stack and no back control. It is
 * also the only one of the three concepts that can grow: ten cars scroll here
 * without a rail hiding one or a shelf running off the edge.
 *
 * ⚠ **One car never opens it.** The mark is not drawn, the name is not
 * pressable, and the sheet does not exist. A one-car owner sees the page they
 * had, which is the whole argument for the car-first structure.
 *
 * ⚠ **Keyed on each opening.** The sheet is mounted for the screen's life and
 * shown by `visible`, which is the shape that made the mark-done sheet carry
 * one item's shop to the next (CLAUDE.md §6): anything derived at mount is
 * derived once. Nothing here holds state — the rows are the caller's — and
 * the `key` on the list makes that structural rather than a thing to
 * remember.
 */
export default function CarSheet({
  cars,
  currentId,
  open,
  onClose,
  onSwitch,
  onAddCar,
  plateFoot,
  ceiling,
}: {
  cars: CarRow[];
  currentId: string;
  open: boolean;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onAddCar: () => void;
  /** The screen's height, so the plate's foot can be a ceiling in points. */
  ceiling: number;
  /**
   * Where the plate ends, in points from the top of the screen.
   *
   * ⚠ Round 1: the sheet's top edge **is** the plate's foot, always.
   *
   * Three geometries were tried against the device. At a share of the window
   * (70%) the edge fell across the health dial — a panel slicing an
   * instrument in half, which is what the critic measured. Sized to its
   * content it did the same thing at a different height, because three rows
   * and a head come to more than the distance to the dial. Pinned here it
   * cannot cut anything at any number of cars, and what stays visible behind
   * the scrim is exactly the photograph: you can see which car you are
   * switching *from*.
   *
   * The room that leaves under three cars is the **list's**, not void: the
   * rows scroll in it and `ADD A CAR` is pinned at the foot, so the sheet
   * has the shape it would have at ten cars. A sheet whose height changes
   * with its content would move its own dismissal target every time a car
   * was added.
   */
  plateFoot: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/*
        The scrim is the way out as well as the dim: a sheet whose only escape
        is a control is a sheet somebody gets stuck in. Named, because a
        tappable region with no label is invisible to a screen reader.
      */}
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />

      {/*
        B4: one 45° cut at zero radius, top-right — the corner every panel in
        this system turns, and the one the plate above it turns.

        ⚠ `CutSurface`, which paints the **shape** behind its children, rather
        than the corner-cover `MastheadPlate` uses. The first draft covered
        the corner in the page colour and the cut was invisible, because what
        is behind this sheet is not the page: it is the scrimmed photograph.
        `CutSurface`'s own docblock names that exactly — *"a cover lies the
        moment what is behind the surface is not the colour it was told"* —
        and the shape is the honest answer on an unknown ground.
      */}
      <CutSurface
        cut={['topRight']}
        size={cut.plate}
        fill={surface.page}
        stroke={border.panel}
        style={[styles.sheet, { top: plateFoot, paddingBottom: insets.bottom + space.md }]}
        key={open ? 'open' : 'shut'}
      >
        <View style={styles.head}>
          {/*
            ⚠ The count in the head's trailing slot, not a second head idiom.
            The critic asked for a mono `YOUR CARS · 03`; every section head
            in this app is the condensed `displayHead`, and a sheet with its
            own head face would be the §6.13 drift arriving again. The count
            is taken; the face is the system's.

            The head's own chevron is cut (the critic's §7): the scrim closes
            this, the hardware gesture closes this, and a second way to do
            what tapping anywhere already does is decoration.
          */}
          {/*
            ⚠ Round 3: no count here. It was the critic's own round-1 ask and
            its own round-2 cut — *"the `03` beside YOUR CARS — the last index
            already says it"* — and that is right: a table numbered 01…03 has
            already said how many it has, and saying it twice is the kind of
            thing that then has to agree.
          */}
          <SectionHeader title="Your cars" />
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
          {cars.map((car, index) => {
            const on = car.id === currentId;
            return (
              <Pressable
                key={car.id}
                onPress={on ? onClose : () => onSwitch(car.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  `${car.name}. ${car.band ? `${car.band.label}.` : 'No score yet.'}` +
                  `${car.needs ? ` ${car.needs}.` : ''}${on ? ' The car you are looking at.' : ' Switch to it.'}`
                }
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {/*
                  The lit rule, on the left of the row the way the tab bar's
                  sits over its tab: the one you are on is marked, not
                  highlighted — a filled row would be a selection control, and
                  this is a place you already are.
                */}
                <View style={[styles.mark, on && styles.markOn]} />

                {/* B6: a list of like rows carries the spec table's index. */}
                <Text style={styles.index} accessibilityElementsHidden>
                  {String(index + 1).padStart(2, '0')}
                </Text>

                <Text style={styles.name} numberOfLines={1}>
                  {car.name.toUpperCase()}
                </Text>

                {/*
                  ── ⚠ Round 3 · the reading is the comparison ───────────────

                  Three drafts of this column, and the argument moved twice.
                  It began as the band word alone, on the reasoning that
                  nobody picks a car on the difference between 62 and 65. The
                  critic then asked for the recall count beside it, and the
                  count went in as a second line. Round 2 cut the sodium mark
                  off that line and kept its words, defending them as the
                  comparison this sheet exists to make.

                  The critic's answer settles it, and it is right: *"the
                  score already folds the recalls in"* — recalls are one of
                  the three drivers the reading is computed from — so the
                  number **is** the comparison, in the app's own unit, and
                  the sub-line was asking a question the row could not
                  answer. One 56pt line per car, the numeral right-aligned as
                  B6's spec table asks.

                  ⚠ No reading is a sentence, never a dash. `advice-range.ts`
                  is the standing rule: a missing value is "we cannot say",
                  and an em dash in a column of numbers reads as a reading of
                  nothing.
                */}
                {car.score !== null && car.band ? (
                  <View style={styles.reading}>
                    <Text style={styles.score}>{car.score}</Text>
                    <Text style={styles.band} numberOfLines={1}>
                      {car.band.short.toUpperCase()}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.absent} numberOfLines={1}>
                    No score yet
                  </Text>
                )}
              </Pressable>
            );
          })}

          {/*
            ⚠ Round 2 · the row after 03, not a footer. Pinned at the sheet's
            foot it left 124pt of graphite between two hairlines — *"28% of
            the sheet is a void … that reads as rows still loading"*, and the
            critic is right that a hole inside a table is a defect where a
            margin under one is a margin. It is the table's last row now: the
            same hairline, no index (adding is not one of the cars), the `+`
            where the band word sits.
          */}
          <Pressable
            onPress={onAddCar}
            accessibilityRole="button"
            accessibilityLabel="Add a car"
            style={({ pressed }) => [styles.row, styles.addRow, pressed && styles.rowPressed]}
          >
            <View style={styles.mark} />
            <View style={[styles.index, styles.noIndex]} />
            <Text style={styles.add}>ADD A CAR</Text>
            <Icon name="plus" size={14} color={text.muted} />
          </Pressable>
        </ScrollView>
      </CutSurface>
    </Modal>
  );
}

/**
 * The name on the plate, wearing the door's mark.
 *
 * Rendered by the hub beside the car's name, and nothing at all on a
 * one-car account.
 */
export function CarSheetMark() {
  return <Icon name="chevron-down" size={22} color={text.primary} />;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: status.scrim },
  /*
    Square top corners and the page's own graphite: this is a floor arriving,
    not an iOS card. The leading hairline is the only edge it needs.
  */
  /*
    The surface is `CutSurface`'s shape; this places it and gives it its
    floor.

    ⚠ Round 2 resolved an apparent conflict between two of the critic's own
    notes, and the resolution is worth keeping: *"its edge slices the dial"*
    (round 0) against *"a void between two hairlines"* (round 1). Sized to
    its content the sheet stops halfway down an instrument; pinned to the
    plate's foot it used to leave a hole. The rule underneath both is the
    critic's own: **cover an instrument or clear it, never halve it**, and
    *"a margin under a table is a margin, a hole inside one is a defect"*.
    So the top is the plate's foot and `ADD A CAR` is the table's last row —
    the graphite below is the page's, outside the table, under no hairline.
  */
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  head: { paddingHorizontal: space.lg, paddingTop: space.lg },
  list: { flexGrow: 0 },
  listBody: { paddingHorizontal: space.lg },
  /* B6's spec row: one line, 56pt. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  rowPressed: { backgroundColor: surface.well },
  /* 2pt of cyan, the width of the tab bar's overline — the system's "you are here". */
  mark: { width: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  markOn: { backgroundColor: brand.accent },
  name: { ...type.displayLabel, fontSize: 15, lineHeight: 20, color: text.primary, flex: 1 },
  /* The reading: the numeral in ink, its band word beside it in the legend's. */
  reading: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  score: { ...type.mono, color: text.primary, ...TABULAR },
  absent: { ...type.monoLabel, color: text.muted },
  band: { ...type.monoLabel, color: text.muted, ...TABULAR },
  /* The spec table's index — mono, muted, fixed width so the names line up. */
  index: { ...type.monoLabel, color: text.muted, width: 22, ...TABULAR },
  noIndex: { width: 22 },
  addRow: { minHeight: TARGET_MIN },
  add: { ...type.monoLabel, color: text.muted, flex: 1 },
});
