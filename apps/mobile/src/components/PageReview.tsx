import { useContext } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Text from './Text';
import Button from './Button';

import { CONTROL_HEIGHT, border, rhythm, space, status, surface, text, type } from '../theme';
import type { PageState } from './PageStrip';

/**
 * One page of a scan, looked at on its own — retake it, remove it, or send it
 * again when its upload failed (27 Sep).
 *
 * The strip's thumbnails are 40pt wide, which is enough to find a page and not
 * enough to see that its bottom third is out of focus; this is where that is
 * checked, and where the two things you can do about it live. Opened by a tap
 * and never by the scan itself — a review after every photograph is the
 * question-per-page pattern the strip was chosen over.
 *
 * ⚠ Mounted only while a page is open, keyed on it by the screen — the rule
 * `phone-sheets-are-keyed-per-opening` records. A sheet mounted for the
 * screen's lifetime would show the last page it was opened on.
 */
export default function PageReview({
  uri,
  number,
  total,
  state,
  onClose,
  onRetake,
  onRemove,
  onResend,
}: {
  uri: string;
  /** 1-based. */
  number: number;
  total: number;
  state: PageState;
  onClose: () => void;
  onRetake: () => void;
  onRemove: () => void;
  onResend: () => void;
}) {
  const insets = useContext(SafeAreaInsetsContext);
  const index = String(number).padStart(2, '0');
  const word = state === 'sending' ? 'Sending' : state === 'failed' ? 'Did not send' : 'Sent';

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets?.top ?? 0 }]}>
        <View style={styles.nav}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Back to the pages"
            hitSlop={12}
            style={styles.navSide}
          >
            <Text style={styles.navText}>‹ Pages</Text>
          </Pressable>
          <Text style={styles.navText} accessibilityRole="header">{`Page ${index} of ${String(total).padStart(2, '0')}`}</Text>
          <View style={styles.navSide} />
        </View>

        <View style={styles.page}>
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={`Photograph of page ${number}`}
          />
        </View>

        <View style={styles.readout}>
          <Text style={styles.readoutLabel}>{`Page ${index}`}</Text>
          <View style={styles.state}>
            {state === 'failed' ? (
              <Text style={styles.warning} accessibilityElementsHidden>
                △
              </Text>
            ) : null}
            <Text style={[styles.readoutState, state === 'failed' && styles.warning]}>{word}</Text>
          </View>
        </View>

        <View style={[styles.foot, { paddingBottom: Math.max(insets?.bottom ?? 0, space.lg) }]}>
          {state === 'failed' ? (
            <Button label="Send again" variant="primary" size="small" onPress={onResend} />
          ) : null}
          <View style={styles.controls}>
            <Button label="Retake" variant="outline" size="small" onPress={onRetake} style={styles.grow} />
            <Button label="Remove page" variant="delete" size="small" onPress={onRemove} style={styles.grow} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.nav },
  nav: {
    height: 44,
    paddingHorizontal: rhythm.page,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navSide: { width: 80 },
  navText: { ...type.monoNav, color: text.primary },
  /*
    Edge to edge, on the sheet's own surface (round 54): inset by a gutter, the
    photograph — which carries its own desk around the paper — read as a panel
    inside the sheet, a nested card under B5. `contain`, never `cover`: this is
    where a blurred corner or a cut-off total is checked, so none of it is cropped.
  */
  page: { flex: 1, paddingVertical: space.md },
  image: { flex: 1 },
  readout: {
    minHeight: CONTROL_HEIGHT,
    paddingHorizontal: rhythm.page,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
    backgroundColor: surface.page,
  },
  readoutLabel: { ...type.monoLabel, fontSize: 13, lineHeight: 18, color: text.primary },
  state: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  readoutState: { ...type.monoLabel, fontSize: 13, lineHeight: 18, color: text.secondary },
  warning: { ...type.monoLabel, fontSize: 13, lineHeight: 18, color: status.attention },
  foot: {
    paddingHorizontal: rhythm.page,
    paddingTop: space.lg,
    gap: space.md,
    backgroundColor: surface.page,
  },
  controls: { flexDirection: 'row', gap: space.md },
  grow: { flex: 1 },
});
