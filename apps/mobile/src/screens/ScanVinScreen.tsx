import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Text from '../components/Text';
import type { BarcodeScanningResult, BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';

import Button from '../components/Button';
import DecodeLog from '../components/DecodeLog';
import Viewfinder from '../components/Viewfinder';
import { useVinDecode, type Prefill } from '../onboarding/useVinDecode';
import type { CarIdentity } from '../onboarding/car-identity';
import { vinFromBarcode } from '@tappet/core/vehicle-catalog';
import { PAGE_BODY, rhythm, space, text, type } from '../theme';

/**
 * Door one: the viewfinder at the driver's door-jamb sticker.
 *
 * ── The read is the capture ─────────────────────────────────────────────────
 *
 * The certification label carries the VIN as a barcode, and `Viewfinder` in
 * barcode mode hands every symbol the camera resolves to `onRead`. Nothing is
 * photographed and nothing leaves the phone: the read happens in the camera
 * module (AVFoundation and ZXing, on the device), so there is no consent
 * sheet here and no `ai_usage_events` row — which is the proof this door is
 * free, and one of the seven ways the rebuild is known to have worked.
 *
 * `vinFromBarcode` is the whole judgement about what came back: the label's
 * sentinels and neighbours are stripped, a seventeen-character window whose
 * check digit agrees is preferred, and anything ambiguous is refused. A
 * refused read does not stop the camera — the note beneath the frame says it
 * was not a VIN, and the next symbol is tried. An accepted one fires the
 * capture haptic (B9), pauses delivery so a symbol held steady does not
 * decode itself fifty times, and hands the number to the log.
 *
 * ── Two ways out, both drawn ────────────────────────────────────────────────
 *
 * TYPE IT INSTEAD sits on the controls row where the scan's library button
 * does — the simulator has no camera at all, so a camera-only door could never
 * be walked on the machine this is developed on, and a real phone has a
 * sticker in a dark footwell. A failed decode offers the described car from
 * the log (`DecodeLog`), with the number that failed carried along.
 *
 * ── The first live read is recorded, not assumed ────────────────────────────
 *
 * Everything above is proven as far as a machine with no camera allows
 * (`Viewfinder.tsx` records how far). The first read on David's phone is the
 * test that matters; until it is written down here, this door has not been
 * seen to work.
 */

/**
 * The symbologies a VIN label uses. Code 39 on older certification labels,
 * Code 128 and Data Matrix on newer ones, PDF417 on some registration cards
 * and door labels. Not QR — a QR on a jamb is a dealer's, and refusing it
 * here is what keeps a marketing link from being read as a car.
 */
export const VIN_BARCODE_TYPES: BarcodeType[] = ['code39', 'code128', 'datamatrix', 'pdf417'];

export function ScanVinScreen({
  onIdentified,
  onType,
  onDescribe,
}: {
  onIdentified: (identity: CarIdentity) => void;
  onType: () => void;
  onDescribe: (carry: { vin?: string; prefill?: Prefill }) => void;
}) {
  const decode = useVinDecode('sticker');
  const [notVin, setNotVin] = useState<string | null>(null);

  const onRead = useCallback(
    (result: BarcodeScanningResult) => {
      const vin = vinFromBarcode(result.data ?? '');
      if (!vin) {
        setNotVin(
          "That barcode is not a VIN. The one you want is on the certification label inside the driver's door."
        );
        return;
      }
      setNotVin(null);
      // Once, at the read — the shutter's feel, as `Viewfinder`'s capture has it.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      decode.start(vin);
    },
    [decode]
  );

  if (decode.observation) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <DecodeLog
          decode={decode}
          retryLabel="Scan again"
          onRetry={decode.reset}
          onConfirm={onIdentified}
          onDescribe={() =>
            onDescribe({ vin: decode.observation?.vin ?? undefined, prefill: decode.prefill ?? undefined })
          }
        />
      </ScrollView>
    );
  }

  return (
    <Viewfinder
      live
      label="Scan the sticker"
      alternative="type the number"
      barcodes={{ types: VIN_BARCODE_TYPES, onRead }}
      paused={decode.observation !== null}
      beside={<Button label="Type it instead" variant="outline" size="small" onPress={onType} />}
      foot={
        <View style={styles.foot}>
          {notVin ? (
            <Text style={styles.notVin} accessibilityLiveRegion="polite">
              {notVin}
            </Text>
          ) : null}
          <Text style={styles.caveat}>
            The white certification label inside the driver's door. Move in until the barcode fills
            the brackets. The number is read on the phone — nothing is photographed or sent.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  body: { ...PAGE_BODY },
  foot: { gap: space.sm, paddingTop: space.xs },
  /* The refusal, in the body voice — it is a sentence about the sticker, not a warning about the car. */
  notVin: { ...type.body, fontSize: 15, lineHeight: 22, color: text.primary },
  /* The scan's caveat scale: muted, under the act. */
  caveat: { ...type.value, color: text.muted, paddingRight: rhythm.page },
});
