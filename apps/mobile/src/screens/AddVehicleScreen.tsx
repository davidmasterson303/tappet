import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import BandRow from '../components/BandRow';
import { cornerCovers } from '../components/CutSurface';
import { PAGE_BODY, cut, rhythm, space, surface, text, type } from '../theme';

/**
 * Add a car — screen one of two: which car.
 *
 * ── 20 Sep · rebuilt around the VIN, and why the old argument inverted ──────
 *
 * Until today this screen was a form: a VIN field offered above year, make,
 * model, trim, the odometer, the modifications question and the oil-change
 * baseline, under a docblock whose rule was *"a first-run flow that demands
 * a VIN before showing anything is a first-run flow people abandon — and the
 * dossier the model generates does not need one."* Three things have changed
 * since that was written, each checked against the artefact rather than the
 * board before this file was touched:
 *
 *   1. **The VIN is stored, and unique.** `vehicles.vin` is nullable since
 *      `20260919160000` and `UNIQUE` (`vehicles_vin_key`; a duplicate walks to
 *      23505 before the FK). It was decoded and discarded until 19 Sep — and
 *      until then the phone's form saved no car at all. The number is the
 *      identity key now, not a typing aid.
 *   2. **The research runs off the strings.** `lib/research-job.ts` loads
 *      `year, make, model` and the recall match is the same three. A decode
 *      supplies NHTSA's spelling; free text supplies "bmw", "BMW" and
 *      "B.M.W." — one car to the owner, three to every join, which the 23 Aug
 *      catalogue treated for listed makes and could not for the rest. A VIN
 *      cannot be spelled three ways.
 *   3. **The wait is an asset.** The research log on the car's page narrates
 *      the dossier from rows the API returned. Against that, reading the
 *      number is the least work on the screen and the thing that makes the
 *      payoff good.
 *
 * So the car identifies itself. This screen is the doors and nothing else:
 *
 *   01  SCAN THE STICKER   — the viewfinder at the driver's door-jamb barcode
 *   02  TYPE IT            — seventeen characters, the web's hero treatment
 *
 * with PHOTOGRAPH A DOCUMENT between them once `/api/v1/vin-from-image` has
 * promoted (`CLAUDE.md` §8: a door that calls a route `web-live` does not
 * serve is a 404 on a path that works on `main`, so it lands with the route,
 * not before it). Each door narrates the decode on the wait instrument
 * (`DecodeLog`) and hands the identified car to `OwnerAnswersScreen` — the
 * odometer, the modifications question and the oil-change baseline, which
 * are the three things no decode can answer.
 *
 * ⛔ **No form field on this screen, in any state.** No year, make or model
 * field, no "enter manually" link. The described car — the old fields and
 * their suggestion panels, kept whole in `DescribeCarScreen` — is reached
 * only after a decode fails or from the typed door's "I don't have the VIN",
 * never from here. `AddVehicleScreen.test.tsx` asserts the absence, and
 * `first-run-doors.test.ts` scans this file for an input so the rule cannot
 * be re-crossed by a helpful edit.
 *
 * ── The plate ───────────────────────────────────────────────────────────────
 *
 * The web's own image for this act (`public/design/onboard-vin-plate`, the
 * stamped tag at the base of a windscreen at night, its characters texture
 * rather than text — `CREDITS.md` records the candidate rejected for
 * rendering a legible number). Full-bleed under the header with the plate's
 * cut, as B2 places every plate; **no type over it**, because a photograph
 * promises no contrast (`HeroBed`'s rule), so the doors sit on the graphite
 * beneath. Decorative, and hidden from assistive technology: the doors say
 * everything it shows.
 *
 * ── What the old docblock said that still holds ─────────────────────────────
 *
 * `userEvent`, awaited, for every interaction in this app's screen tests —
 * the un-awaited `fireEvent` that cost `contrast.test.tsx` a week is recorded
 * in `AddVehicleScreen.test.tsx`. The mods question is asked at creation
 * because `showsModifications` is the whole rule; it moved to the second
 * screen with the odometer. And the oil-change baseline names the work
 * rather than "the last service" for `onboarding-baseline.ts`'s reason.
 */

/** The plate's height — the garage band's, so the two nights read as one. */
const PLATE_HEIGHT = 168;

interface Props {
  onScan: () => void;
  onType: () => void;
}

export function AddVehicleScreen({ onScan, onType }: Props) {
  const [plateWidth, setPlateWidth] = useState(0);
  const onPlateLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== plateWidth) setPlateWidth(next);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <View
        style={styles.plate}
        onLayout={onPlateLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="vin-plate"
      >
        <Image
          source={require('../../assets/vin-plate.webp')}
          style={styles.plateImage}
          resizeMode="cover"
        />
        {plateWidth > 0 ? (
          <Svg width={plateWidth} height={PLATE_HEIGHT} style={StyleSheet.absoluteFill}>
            {cornerCovers(plateWidth, PLATE_HEIGHT, cut.plate, ['bottomRight']).map((d) => (
              <Path key={d} d={d} fill={surface.page} />
            ))}
          </Svg>
        ) : null}
      </View>

      <View style={styles.lede}>
        <Text style={styles.eyebrow}>Which car</Text>
        <Text style={styles.ledeText}>
          The number on the car says what it is — year, make, model and the exact build. Read it
          any of these ways.
        </Text>
      </View>

      {/*
        The doors are the spec table's bands (B6): index, condensed label, one
        line of body, chevron. Two today; the document door lands between
        them with its route, and the indices are computed so it slots in.
      */}
      <View>
        <BandRow
          index="01"
          label="Scan the sticker"
          detail="The barcode on the driver's door jamb. Point the camera at it."
          onPress={onScan}
        />
        <BandRow
          index="02"
          label="Type it"
          detail="Seventeen characters, from the door jamb, the windscreen or your insurance card."
          onPress={onType}
          last
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  /*
    No side gutter on the body: the plate and the bands are full-bleed, and
    each band pays its own `paddingHorizontal`. The lede takes the page
    gutter itself.
  */
  body: { paddingBottom: PAGE_BODY.paddingBottom, gap: space.xl },
  plate: { height: PLATE_HEIGHT, overflow: 'hidden', backgroundColor: surface.nav },
  plateImage: { width: '100%', height: '100%' },
  lede: { paddingHorizontal: rhythm.page, gap: space.sm },
  eyebrow: { ...type.monoLabel, color: text.secondary },
  ledeText: { ...type.body, color: text.secondary },
});
