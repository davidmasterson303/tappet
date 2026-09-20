import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Button from './Button';
import Working from './Working';
import { researchStages } from './working-stages';
import type { ResearchRunner } from './useResearchRunner';
import { space } from '../theme';

/**
 * The research log — the wait instrument with the car's own facts landing
 * in it.
 *
 * ── David's brief, 20 Sep ───────────────────────────────────────────────────
 *
 * "I don't really want loading spinners anywhere. I want more engaging
 * loading states, with animations and text describing what's happening in
 * the background." This is that, for the longest wait in the product, built
 * on the instrument the phone already has (`Working`): the dial's pip
 * swings — it does not fill — above a ledger whose rows are the steps, and
 * since today each row carries the step's answer once it exists. Earlier
 * lines stay; the ledger reads as a receipt of work done. Nothing is
 * replaced, nothing scrolls away.
 *
 * ── Why it can be believed ──────────────────────────────────────────────────
 *
 * `@tappet/core/research-milestones` assembles every row from rows the API
 * returned. A spinner claims nothing, so nobody notices when nothing is
 * happening behind it; a line that says "24 on file" cannot exist without
 * the row that says 24. The runner (`useResearchRunner`) only asks — the
 * interval polls, the rows answer — so a stalled pipeline is a stalled log.
 *
 * ── The margin ──────────────────────────────────────────────────────────────
 *
 * The ledger's footer is the designed slot for "anything else true about
 * the wait", and the marginalia is exactly that or nothing: NHTSA's own
 * record for the model, or the plate's generation. Never a model at request
 * time; the brief is explicit that a fabricated fact here would sit inches
 * from a safety recall.
 *
 * ── Failure ─────────────────────────────────────────────────────────────────
 *
 * Every path ends in a result or a stated failure: a failed row, a refused
 * score, NHTSA silent, or the runner's own deadline. The failed line is the
 * step that did not come back, in the warning ink, and the retry is the
 * only control — one decision, in the right place.
 *
 * ── Screen readers ──────────────────────────────────────────────────────────
 *
 * `Working` is a polite live region for the line above the ledger, and each
 * row speaks its state and its answer. Completions are announced as they
 * land — the answer, not the animation — because a VoiceOver user cannot
 * watch a row change. Reduced motion stops the pip and changes nothing
 * else: the information is the text.
 */
export default function ResearchLog({ runner, style }: { runner: ResearchRunner; style?: object }) {
  const announced = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const milestone of runner.milestones) {
      if (!milestone.answer) continue;
      const key = `${milestone.key}:${milestone.state}`;
      if (announced.current.has(key)) continue;
      announced.current.add(key);
      AccessibilityInfo.announceForAccessibility(`${milestone.label}. ${milestone.answer}`);
    }
  }, [runner.milestones]);

  return (
    <View style={[styles.block, style]} testID="research-log">
      <Working
        line={runner.line}
        stages={researchStages(runner.milestones)}
        frozen={runner.settled}
        rule={false}
      >
        {runner.marginalia ?? undefined}
      </Working>
      {runner.settled && runner.failed ? (
        <Button label="Retry the research" variant="outline" size="small" onPress={runner.retry} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  retry: { alignSelf: 'flex-start' },
});
