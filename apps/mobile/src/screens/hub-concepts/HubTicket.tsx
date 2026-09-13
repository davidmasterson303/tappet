import { Pressable, StyleSheet, Text, View } from 'react-native';

import Button from '../../components/Button';
import CutSurface from '../../components/CutSurface';
import Icon from '../../components/Icon';
import ProvenanceRow from '../../components/ProvenanceRow';
import { SPEC_ROW, TABULAR, border, cut, space, status, surface, text, type } from '../../theme';
import IndexRail from './IndexRail';
import type { HubModel } from './hub-model';

/**
 * Concept C · TICKET — the score and the next act are one object.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * The reading is not a grade in a card with a row of links under it. It is
 * the top of a chain — *reading → cause → act* — and the chain is drawn as
 * one object: a slab cut from the page's own material, one 45° cut at its
 * corner, the way the plate above it is cut. At its head the numeral at the
 * brief's 88, the band word and the verdict; welded to it by a hairline, the
 * acts the reading leads to — the service that is due, the recalls that are
 * open — each a row you can press; and at its foot, its counterfoil, the one
 * filled verb: ask the advisor *about this*. Nothing on the ticket is a
 * place; everything on it is either the reading or what to do about it.
 *
 * The places — history, plan, the scan, what you told us — are an index
 * under the ticket, in the chrome's voice, because they are not what this
 * screen is about; they are where you go from it.
 *
 * What it breaks, knowingly: hero-then-ledger (there is no ledger), the
 * row-list-of-links, the primary standing alone at the foot of the page. It
 * also spends the ladder's `raised` step on a slab, which B5 does not do for
 * content — the argument is that this is a control, not a container: every
 * zone of it presses, and the cut is the geometry the system gives a control.
 */
export default function HubTicket({ model }: { model: HubModel }) {
  const { score, band, verdictText, provenance, nextService, serviceDue, on } = model;
  const overdue = nextService.kind === 'known' && /^(overdue|due now)/.test(nextService.timing);
  const noun = model.openRecallCount === 1 ? 'recall' : 'recalls';

  return (
    <View style={styles.page}>
      <CutSurface fill={surface.raised} cut={['bottomRight']} size={cut.control} style={styles.ticket}>
        <Pressable
          onPress={on.health}
          accessibilityRole="button"
          accessibilityLabel={
            score !== null && band
              ? `Health score ${score} out of 100 — ${band.label}. Opens what is driving it.`
              : 'Health, no score yet. Opens what is driving it.'
          }
          style={({ pressed }) => [styles.reading, pressed && styles.pressed]}
        >
          {score !== null && band ? (
            <View style={styles.head}>
              <Text style={[styles.numeral, WARNING_INK(band)]}>{score}</Text>
              <View style={styles.words}>
                <Text style={[styles.bandWord, WARNING_INK(band)]}>{band.label}</Text>
                {verdictText ? <Text style={styles.verdict}>{verdictText}</Text> : null}
                <ProvenanceRow kinds={provenance} />
              </View>
            </View>
          ) : (
            <Text style={styles.absent}>No score yet</Text>
          )}
          <View style={styles.door}>
            <Text style={styles.doorLabel}>What is driving this score</Text>
            <Icon name="chevron-right" size={16} color={text.secondary} />
          </View>
        </Pressable>

        <Pressable
          onPress={on.milestone}
          accessibilityRole="button"
          accessibilityLabel={`Next service, ${
            nextService.kind === 'known' ? `${nextService.service}, ${nextService.timing}` : serviceDue
          }. Opens what is due.`}
          style={({ pressed }) => [styles.act, pressed && styles.pressed]}
        >
          <Text style={[styles.mark, !overdue && styles.markQuiet]} accessibilityElementsHidden>
            {overdue ? '△' : ''}
          </Text>
          <View style={styles.actBody}>
            <Text style={styles.actEyebrow}>Next service</Text>
            <Text style={styles.actLabel} numberOfLines={2}>
              {nextService.kind === 'known' ? nextService.service : serviceDue}
            </Text>
          </View>
          {nextService.kind === 'known' ? <Text style={styles.actValue}>{nextService.timing}</Text> : null}
          <Icon name="chevron-right" size={18} color={text.secondary} />
        </Pressable>

        {model.openRecallCount > 0 ? (
          <Pressable
            onPress={on.recalls}
            accessibilityRole="button"
            accessibilityLabel={`View ${model.openRecallCount} open ${noun}${model.worstRecall ? `. ${model.worstRecall}` : ''}`}
            style={({ pressed }) => [styles.act, pressed && styles.pressed]}
          >
            <Text style={styles.mark} accessibilityElementsHidden>
              △
            </Text>
            <View style={styles.actBody}>
              <Text style={styles.actEyebrow}>Open {noun}</Text>
              {/* The worst recall is a sentence, so it is set as one — never in the head's caps. */}
              <Text style={styles.actProse} numberOfLines={2}>
                {model.worstRecall ?? 'Free to fix at a franchised dealer, whatever the age.'}
              </Text>
            </View>
            <Text style={styles.actValue}>{model.openRecallCount}</Text>
            <Icon name="chevron-right" size={18} color={text.secondary} />
          </Pressable>
        ) : null}

        <View style={styles.counterfoil}>
          <Button label="Ask the advisor" onPress={on.advisor} style={styles.advisor} />
        </View>
      </CutSurface>

      <IndexRail
        rows={[
          [
            { label: 'History', value: model.historyCount, onPress: on.history },
            { label: 'Plan', value: model.wishlistCount, onPress: on.wishlist },
            { label: 'Scan invoice', onPress: on.scan },
          ],
          [{ label: 'How you use it', value: model.usage, onPress: on.profile }],
        ]}
      />
    </View>
  );
}

/** The ink a reading takes: off-white unless the ramp calls it a warning. */
const WARNING_INK = (band: { name: string }) => ({
  color: band.name === 'warn' || band.name === 'bad' ? status.attention : text.primary,
});

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xl },
  ticket: { overflow: 'hidden' },
  reading: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  /* A fill swap under the finger — one step up the ladder from the slab. */
  pressed: { backgroundColor: surface.well },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  /* B3's numeral, at the brief's size. `TABULAR` so a reading never reflows. */
  numeral: { ...type.numeral, color: text.primary, ...TABULAR },
  words: { flex: 1, gap: space.xs, paddingTop: space.sm },
  bandWord: { ...type.monoNav, color: text.primary },
  verdict: { ...type.body, fontSize: 14, lineHeight: 20, color: text.secondary },
  absent: { ...type.mono, color: text.muted },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: SPEC_ROW - space.lg,
    paddingBottom: space.md,
  },
  doorLabel: { ...type.monoNav, color: text.secondary },
  act: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: SPEC_ROW,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.field,
  },
  mark: { ...type.monoLabel, color: status.attention, width: 14, textAlign: 'center' },
  markQuiet: { width: 0 },
  actBody: { flex: 1, gap: 2 },
  actEyebrow: { ...type.monoLabel, color: text.muted },
  actLabel: { ...type.displaySection, fontSize: 15, lineHeight: 20, color: text.primary },
  actProse: { ...type.body, fontSize: 14, lineHeight: 20, color: text.secondary },
  actValue: { ...type.mono, color: text.primary, textAlign: 'right', ...TABULAR, maxWidth: 120 },
  counterfoil: { padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border.field },
  advisor: { alignSelf: 'stretch' },
});
