import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from '../Text';

import Icon from '../Icon';
import SectionHeader from '../SectionHeader';
import CutSurface from '../CutSurface';
import type { CarRow } from './car-set';
import { TABULAR, TARGET_MIN, border, brand, cut, space, status, surface, text, type } from '../../theme';

/**
 * The set, as a sheet inside the car — concept B, **THE NAME IS THE DOOR**.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * The set is not a place. It is a control on the car you are looking at, so
 * it costs no tab and nothing at all on the one-car account most owners have.
 * Tesla's app is the same answer to the same problem — its products have no
 * list screen, only a dropdown beside the name and a swipe between them.
 *
 * ⚠ The concept is named for the handle it shipped with — a mark on the car's
 * name — and the handle moved on 23 Sep, to a labelled control in the nav
 * row's trailing corner (`CarSwitch`). The name was not obvious enough:
 * David, *"the carrot/chevron is perhaps not obvious for all users."* What
 * the name settled — that the door is **inside the car** rather than a tab of
 * its own — is untouched, and is why the name is kept.
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
 * ⚠ **One car never opens it.** The control is not drawn and the sheet does
 * not mount. A one-car owner sees the page they had, which is the whole
 * argument for the car-first structure.
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
      {/*
        ⚠ `border.field` on the stroke, for the reason the plate's own cut
        takes it: at `border.panel` this corner measured a 6-point luminance
        step against the scrimmed photograph behind it, and three critics
        reading the frames all reported the sheet as square. The shape was
        always there. Being there is not the standard — B4 is about a corner
        an owner can see.
      */}
      <CutSurface
        cut={['topRight']}
        size={cut.plate}
        fill={surface.page}
        stroke={border.field}
        style={[
          styles.sheet,
          { maxHeight: Math.max(0, ceiling - plateFoot), paddingBottom: insets.bottom + space.md },
        ]}
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
                {/*
                  ⚠ Round 3 · the numeral is a **column**, not the left half
                  of a pair. Right-aligning the two together put "88 GOOD" a
                  word's width right of "65 THIN HISTORY", because the band
                  word varies and the unit it was aligned on was the pair —
                  so the one thing the eye compares did not line up. The band
                  word flexes to the numeral's left; the numeral is flush
                  right in a fixed column on tabular figures, which is B6's
                  spec table.
                */}
                {car.score !== null && car.band ? (
                  <View style={styles.reading}>
                    <Text style={styles.band} numberOfLines={1}>
                      {car.band.short.toUpperCase()}
                    </Text>
                    <Text style={styles.score}>{car.score}</Text>
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

/*
  ── ⚠ 23 Sep · `CarSheetMark` is deleted, and `CarSwitch` is what opens this ──

  The mark was a 22pt `chevron-down` beside the car's name — concept B's
  "the name is the door", which the loop took to 9/10. David, from the
  device: *"the carrot/chevron is perhaps not obvious for all users."* The
  door is a labelled control in the nav row's trailing corner now
  (`CarSwitch`), and the name went back to opening the car.

  The concept survives the change. "The name is the door" was the answer to
  *where does the set live* — inside the car rather than in a tab of its
  own — and that is still the structure. Only the handle moved.
*/

const styles = StyleSheet.create({
  scrim: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: status.scrim },
  /*
    Square top corners and the page's own graphite: this is a floor arriving,
    not an iOS card. The leading hairline is the only edge it needs.
  */
  /*
    The surface is `CutSurface`'s shape; this places it and gives it its
    floor.

    ⚠ Three rounds argued about this edge, and the settled shape is the
    third: *"its edge slices the dial"* (round 0) → pinned to the plate's
    foot; *"a void between two hairlines"* (round 1) → `ADD A CAR` became
    the table's last row rather than a footer; *"the sheet's empty lower
    half … size it to its rows and give the plate back the space"* (round
    3) → the plate's foot is a **ceiling** and the height is the content's.

    The three are consistent once the hole is gone: a sheet that ends under
    its own last row cannot halve an instrument, because with three cars it
    stops well below the dial and with ten it stops at the photograph.
    Which was always the rule underneath — cover an instrument or clear it,
    never halve it.
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
  /* The reading: the band word in the legend's ink, then the numeral's own column. */
  reading: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  score: { ...type.mono, color: text.primary, ...TABULAR, width: 26, textAlign: 'right' },
  absent: { ...type.monoLabel, color: text.muted },
  band: { ...type.monoLabel, color: text.muted, ...TABULAR },
  /* The spec table's index — mono, muted, fixed width so the names line up. */
  index: { ...type.monoLabel, color: text.muted, width: 22, ...TABULAR },
  noIndex: { width: 22 },
  addRow: { minHeight: TARGET_MIN },
  add: { ...type.monoLabel, color: text.muted, flex: 1 },
});
