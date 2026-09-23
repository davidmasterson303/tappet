import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Text from '../Text';

import Icon from '../Icon';
import NightPlate from '../NightPlate';
import { cornerCovers } from '../CutSurface';
import type { CarRow } from './car-set';
import { shortName } from './NameRail';
import { TABULAR, border, brand, cut, space, status, surface, text, type } from '../../theme';

/** One tile: wide enough for a plate's crop to read as a car, short enough that three fit. */
const TILE = { width: 104, height: 64 } as const;

/**
 * Concept C · **PLATE SHELF** — the set keeps its photography, in miniature.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * The garage's best property is not its structure, it is its **pictures**:
 * three generated night plates are the most convincing thing in the app, and
 * a switcher made of names throws all of that away. So the set becomes a
 * shelf of plates at the head of the sheet — a 104×64 tile per car, cut at
 * the corner the way every plate in this system is cut, the current one lit
 * by the cyan rule under it, a sodium dot on any car with something
 * outstanding. `+` is the last tile, on graphite.
 *
 * It is the only one of the three that lets an owner switch by **recognition**
 * rather than by reading: you know your own cars by looking at them, and a
 * silver estate and a green coupé are told apart faster than "'15 FORESTER"
 * and "'17 F-PACE".
 *
 * ── What it costs, said plainly ─────────────────────────────────────────────
 *
 * Two things. It is the **heaviest** of the three — a row of photographs
 * under a photograph, which is the one place this design language is at risk
 * of looking like a media app rather than an instrument. And a tile is not a
 * reading: it carries a dot, not a band, so it says *something* needs you
 * without saying what, and the owner has to switch to find out.
 *
 * ⚠ **One car draws nothing**, as with every concept here: a shelf of one is
 * a photograph of the photograph above it.
 */
export default function PlateShelf({
  cars,
  currentId,
  onSwitch,
  onAddCar,
}: {
  cars: CarRow[];
  currentId: string;
  onSwitch: (id: string) => void;
  onAddCar: () => void;
}) {
  if (cars.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shelf}
      accessibilityRole="tablist"
      accessibilityLabel="Your cars"
    >
      {cars.map((car) => {
        const on = car.id === currentId;
        return (
          <Pressable
            key={car.id}
            onPress={on ? undefined : () => onSwitch(car.id)}
            disabled={on}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              on
                ? `${car.name}, the car you are looking at`
                : `${car.name}${car.needs ? `, ${car.needs}` : ''}. Switch to it.`
            }
            style={styles.tile}
          >
            <View style={[styles.frame, on && styles.frameOn]}>
              {car.photoUrl ? (
                <Image source={{ uri: car.photoUrl }} style={styles.image} resizeMode="cover" />
              ) : (
                <NightPlate />
              )}
              {/*
                The cut, painted the way `MastheadPlate` and the garage plate
                paint theirs — the page colour laid back over the corner,
                above the image, so the tile is the same object as the plate
                it stands under.
              */}
              <Svg width={TILE.width} height={TILE.height} style={StyleSheet.absoluteFill}>
                {cornerCovers(TILE.width, TILE.height, cut.plate, ['bottomRight']).map((d) => (
                  <Path key={d} d={d} fill={surface.page} />
                ))}
              </Svg>
              {/*
                The mark, not a count: a tile is a picture of a car, and a
                number on it would be a reading at a size nothing else on the
                shelf is a reading at. What it says is "this one wants you",
                and the car it opens says what for.

                ⚠ The system's own `△` rather than a dot. The first draft used
                a 6pt round dot and `mobile-radius-scale.test.ts` refused it —
                correctly: B4 is *"every container corner is a 45° cut at zero
                radius"*, and a circle is the one shape this language does not
                have. The triangle is also the mark the rail, the cells and
                the health drivers already use for exactly this.
              */}
              {car.warning ? (
                <Text style={styles.mark} accessibilityElementsHidden>
                  △
                </Text>
              ) : null}
            </View>

            <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
              {shortName(car.name)}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onAddCar}
        accessibilityRole="button"
        accessibilityLabel="Add a car"
        style={styles.tile}
      >
        <View style={[styles.frame, styles.addFrame]}>
          <Icon name="plus" size={18} color={text.muted} />
        </View>
        <Text style={styles.name}>ADD</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  shelf: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  tile: { width: TILE.width, gap: space.xs },
  frame: {
    width: TILE.width,
    height: TILE.height,
    overflow: 'hidden',
    backgroundColor: surface.raised,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  /* The system's "you are here": 2pt of cyan under the tile, the tab bar's own overline. */
  frameOn: { borderBottomColor: brand.accent },
  image: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  addFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface.page,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border.field,
  },
  mark: { position: 'absolute', top: 2, left: space.xs, ...type.monoLabel, color: status.attention },
  name: { ...type.monoLabel, color: text.muted, ...TABULAR },
  nameOn: { color: text.primary },
});
