import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Text from './Text';

import { border, brand, rhythm, space, status, text, type } from '../theme';

/**
 * The pages of a scan so far — 27 Sep, the multi-page invoice.
 *
 * ── The pattern, and the one it was chosen over ─────────────────────────────
 *
 * Every document scanner people already use — the iOS document camera in
 * Notes and Files, Adobe Scan, Microsoft Lens, Genius Scan — keeps the camera
 * live after a page and collects the pages in a strip with a count, ending
 * on a Save or Done. The other shape, a question after every page ("another
 * page?"), was drawn beside it on the design canvas and not built: it puts a
 * decision between every photograph when the answer is almost always "yes,
 * the next one" or "no, that was it", and it covers the frame the next page
 * would be lined up in. The question is still asked — once, as a sentence
 * under the readout after the first page, where it costs no tap.
 *
 * ── What a thumbnail says, and why only that ────────────────────────────────
 *
 * Its index, in mono (B1), at the 12pt type floor — the smallest the product
 * sets anything. Beneath it, a 2pt rule while its upload is out —
 * cyan, B7's "refresh ramp" job, and full width because the upload reports
 * no fraction and a partial bar would be one this code invented. Nothing once
 * the page is stored: a sent page is the ordinary case and reads as
 * unremarkable, as good news does everywhere on this platform. A page whose
 * upload failed carries B7's sodium triangle beside its index. Every mark is
 * a state the screen observed; nothing here runs on a timer.
 *
 * The newest page (or the one being retaken) has an off-white edge — the
 * place the next photograph lands.
 */
export type PageState = 'sending' | 'sent' | 'failed';

export interface StripPage {
  key: string;
  uri: string;
  state: PageState;
}

export default function PageStrip({
  pages,
  current,
  onOpen,
  onAddFromLibrary,
  limit,
}: {
  pages: StripPage[];
  /** The page the next capture lands on or replaces. */
  current: string | null;
  onOpen: (key: string) => void;
  /** Omitted when the scan is full. */
  onAddFromLibrary?: () => void;
  limit: number;
}) {
  const count = `${pages.length} of ${limit}`;
  return (
    <View style={styles.root} testID="page-strip">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroller}
      >
        {pages.map((page, index) => {
          const number = String(index + 1).padStart(2, '0');
          const state =
            page.state === 'sending' ? 'sending' : page.state === 'failed' ? 'did not send' : 'sent';
          return (
            <Pressable
              key={page.key}
              onPress={() => onOpen(page.key)}
              accessibilityRole="button"
              accessibilityLabel={`Page ${index + 1}, ${state}. Open to retake or remove.`}
              testID={`page-thumb-${index + 1}`}
              hitSlop={4}
              style={styles.page}
            >
              <View style={[styles.thumb, page.key === current && styles.thumbCurrent]}>
                <Image source={{ uri: page.uri }} style={styles.image} resizeMode="cover" />
              </View>
              <View style={[styles.rule, page.state === 'sending' && styles.ruleSending]} />
              <View style={styles.indexRow}>
                {page.state === 'failed' ? (
                  <Text style={styles.warning} accessibilityElementsHidden>
                    △
                  </Text>
                ) : null}
                <Text style={[styles.index, page.key === current && styles.indexCurrent]}>{number}</Text>
              </View>
            </Pressable>
          );
        })}
        {onAddFromLibrary ? (
          <Pressable
            onPress={onAddFromLibrary}
            accessibilityRole="button"
            accessibilityLabel="Add pages from your photos"
            testID="page-strip-library"
            hitSlop={4}
            style={[styles.page, styles.addPage]}
          >
            <View style={[styles.thumb, styles.add, styles.addPage]}>
              <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                <Path d="M8 2v12M2 8h12" stroke={text.primary} strokeWidth={1.2} />
              </Svg>
            </View>
            <View style={styles.rule} />
            <Text style={styles.index}>Photos</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <Text style={styles.count} accessibilityLabel={`${pages.length} of ${limit} pages`}>
        {count}
      </Text>
    </View>
  );
}

const THUMB_W = 40;
const THUMB_H = 52;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: rhythm.page,
    paddingRight: rhythm.page,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  scroller: { flex: 1 },
  row: { gap: space.md, alignItems: 'flex-start' },
  /* 44pt wide with its slop, the tap target floor. */
  page: { width: THUMB_W + 4, gap: 5 },
  thumb: {
    width: THUMB_W + 4,
    height: THUMB_H,
    borderWidth: 1,
    borderColor: border.field,
    overflow: 'hidden',
  },
  thumbCurrent: { borderColor: text.primary },
  image: { width: '100%', height: '100%' },
  add: { alignItems: 'center', justifyContent: 'center' },
  /* Wide enough for PHOTOS on one line in the mono caps — at a thumbnail's 44 it broke after the O. */
  addPage: { width: 60 },
  rule: { height: 2 },
  ruleSending: { backgroundColor: brand.accent },
  indexRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  index: { ...type.monoLabel, fontSize: 12, lineHeight: 16, color: text.secondary },
  indexCurrent: { color: text.primary },
  warning: { ...type.monoLabel, fontSize: 12, lineHeight: 16, color: status.attention },
  count: { ...type.monoLabel, fontSize: 12, lineHeight: 16, color: text.muted, paddingTop: 2 },
});
