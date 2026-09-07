import { StyleSheet, Text, View } from 'react-native';

import { TYPE_MIN, border, radius, space, status, surface, text, type } from '../theme';

export type ChipTone = 'neutral' | 'attention' | 'critical' | 'confirm';

/**
 * A small status word — Addressed, Due soon, Overdue, Estimated, Stock.
 *
 * ── The 12px floor, and the defect this primitive exists to end ─────────────
 *
 * The design system's own `patterns.css` ships `.chip` at **11px**, under the
 * type floor, and every chip on the board overrides it back to 12. That is an
 * export-side defect — there is no `patterns.css` in this repository and no
 * `.chip` in `globals.css` — but it is exactly the rule worth encoding here:
 * a floor that call sites have to remember is a floor that leaks.
 *
 * So the size is not a prop. `TYPE_MIN` is the smallest rendered text in the
 * product and a chip is the control most likely to argue for an exception.
 *
 * ── Provenance is never a chip ──────────────────────────────────────────────
 *
 * "Based on…" is a `ProvenanceRow`, not a chip, and specifically never a green
 * one — a confirm-toned badge beside a generated answer reads as *verified*,
 * which is a claim this product cannot make about a model's output. `confirm`
 * here is for a state the user reached (Addressed), not for a source.
 */
export default function Chip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  return (
    <View style={[styles.chip, styles[tone]]}>
      <Text style={[styles.label, styles[`${tone}Label` as const]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  /*
    Not overridable, deliberately. See the docblock — this is the one place the
    11px chip can be prevented rather than corrected.
  */
  label: { ...type.label, fontSize: TYPE_MIN, letterSpacing: 0.4 },

  /*
    ── ⚠ 6 Sep · B7: the hue is the border, the ink is off-white ──────────────

    Every tone carried a wash **and** a coloured label — so a recall chip printed
    "Fuel system" in sodium on a sodium tint, and the critique read it as the
    line's plain violation: *"'Fuel system' / 'Airbags' are sodium ink, not the
    hairline triangle beside off-white."*

    B7 is precise about this. Sodium is a *line* beside a warning, not the
    warning's ink and not a fill behind it; the one fill in the system is the
    do-not-drive banner, which is a named exception rather than a pattern to
    copy.

    So the wash goes, the border keeps the hue, and the label goes off-white —
    which also fixes a contrast problem nobody had measured: sodium ink on a
    sodium wash was the lowest-contrast text in the component.
  */
  neutral: { borderColor: border.panel },
  neutralLabel: { color: text.muted },

  attention: { borderColor: status.attentionBorder },
  attentionLabel: { color: text.primary },

  critical: { borderColor: status.criticalBorder },
  criticalLabel: { color: text.primary },

  confirm: { borderColor: border.panel },
  confirmLabel: { color: text.secondary },
});
