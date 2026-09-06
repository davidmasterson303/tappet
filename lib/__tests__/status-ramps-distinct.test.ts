/**
 * The status family's warning axis and the health ramp are never the same colour.
 *
 * @jest-environment node
 *
 * ⚠ **5 Sep: this was "never the same colour", full stop, and it had to narrow.**
 * The two-hue collapse made good news off-white ink on both clients, so
 * `--confirm` and `--ring-good` are now deliberately one value and this guard
 * fired on a correct change. It was narrowed to the warning axis rather than
 * relaxed: every historic collision below is still caught, and the single
 * permitted equality is argued and asserted at `CONFIRM_MAY_MATCH`. The reason
 * the rule exists is a claim about severity, and severity is what it still
 * protects.
 *
 * ── The rule, and Design's reason for it ────────────────────────────────────
 *
 * `tokens.json` carries `$rules.semanticsAreNotShared`, and until 23 Aug 2026
 * this repository violated it while carrying a docblock claiming it did not.
 * `status.attention` was `#E0A468` — **the health ramp's `warn` hex** — and
 * `status.critical` was `#E08882`, its `bad`. The comment above them said they
 * "happen to share hues with two bands"; they did not share hues, they were the
 * same value.
 *
 * Design's ruling, in their words: the two families are meant to **rhyme
 * without matching**, because *a gauge reading and a status chip are different
 * claims, and sharing a colour makes a 61 look like something you can dismiss.*
 *
 * The garage bay had exactly that on screen — a dial reading in warn amber,
 * with a recall chip beside it in the same amber the dial uses for Critical.
 *
 * ── Why a test rather than a note ───────────────────────────────────────────
 *
 * Because a note is what failed. The rule was written down in the token file,
 * and the docblock sitting directly above the offending values asserted
 * compliance with it — so every reader who checked stopped there. The system's
 * own adherence spec makes this argument: *"a rule a build enforces is a rule;
 * a rule a person has to remember is a preference with good intentions."*
 *
 * ⚠ This does **not** check any value against the design system export. It
 * cannot: the export is a zip in someone's Downloads, and the copy this repo
 * was last shown stamped `$meta.version` 6.0.0 while Design had shipped 8.1.0.
 * What it checks is the *invariant* — an equality that is wrong whatever the
 * two ramps currently hold — which is the half that stays true across exports.
 */

import { getHealthBandJudgement, healthBandHex } from '@wellkept/core/health-band';
import { status } from '../../apps/mobile/src/theme';

/**
 * Every hex the health ramp can paint, sampled through the public API.
 *
 * ⚠ The band table itself is private, and reading it through `healthBandHex` is
 * the better route anyway: it is the function every client actually calls, so a
 * change to how a band stores its colour moves this check with it instead of
 * leaving it comparing against a shape nothing renders.
 *
 * One score per band, the same four `contrast.test.tsx` uses. `name` comes back
 * on the judgement, so a fifth band added later shows up as an unnamed entry
 * rather than being silently skipped — see the count assertion below.
 */
const RAMP_SAMPLES = [92, 74, 55, 28];

function healthRampHexes(): Map<string, string> {
  const byName = new Map<string, string>();
  for (const score of RAMP_SAMPLES) {
    const band = getHealthBandJudgement(score);
    byName.set(band.name, healthBandHex(band).toUpperCase());
  }
  return byName;
}

/**
 * The status tokens that are *ink or edge* on the **warning axis**.
 *
 * ⚠ `confirm` used to be on this list and came off on 5 Sep. See
 * `CONFIRM_MAY_MATCH` below — the carve-out is narrow and reasoned, and the
 * historic collisions this file was written for are all still on this list.
 */
const WARNING_INKS = [
  'attention',
  'danger',
  'dangerText',
  'dangerPressed',
  'criticalBorder',
  'attentionBorder',
  'dangerBorder',
] as const;

/**
 * The one permitted equality, and why it is not the defect this file catches.
 *
 * ── What changed ────────────────────────────────────────────────────────────
 *
 * The two-hue collapse made **good news off-white ink rather than a hue**, and
 * it applied that to both families at once: web ships `--confirm: #EDE7DF` and
 * `--ring-good: #EDE7DF` as the same value, on purpose. When the mobile theme
 * was ported on 5 Sep, `status.confirm` left green and this guard fired.
 *
 * ── Why the rule does not reach here ────────────────────────────────────────
 *
 * Design's reason for the rule is a claim about **severity**: *a gauge reading
 * and a status chip are different claims, and sharing a colour makes a 61 look
 * like something you can dismiss.* The damage is that a warning stops reading
 * as a warning — a recall chip wearing the amber the dial spends on Critical.
 *
 * `confirm` and the `good` band make the **same** claim: nothing here needs
 * you. There is no severity to blur, and giving "resolved" its own hue is what
 * the collapse removed — it would put a third colour back on a two-hue system
 * to distinguish two shades of *fine*.
 *
 * ── What is still forbidden ─────────────────────────────────────────────────
 *
 * Only `good`. `confirm` matching `warn` or `bad` is a genuine collision — a
 * success chip in the colour of a fault — and is still caught below, with its
 * own case proving it.
 */
const CONFIRM_MAY_MATCH = 'good' as const;

describe('the status family and the health ramp', () => {
  const ramp = healthRampHexes();

  it('has both sets to compare', () => {
    /*
      Anti-vacuous, and this one has teeth: `healthBandHex` builds its hex from
      an `rgb` string, so a change to that field's shape would silently produce
      an empty map and every assertion below would pass against nothing.
    */
    expect(ramp.size).toBeGreaterThanOrEqual(4);
    expect(WARNING_INKS.length).toBeGreaterThan(4);
    for (const hex of Array.from(ramp.values())) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('shares no value between them', () => {
    const rampValues = new Set(Array.from(ramp.values(), (h) => h.toUpperCase()));

    const collisions = WARNING_INKS.filter((token) => {
      const value = status[token];
      return typeof value === 'string' && rampValues.has(value.toUpperCase());
    }).map((token) => {
      const value = status[token] as string;
      const band = Array.from(ramp.entries()).find(
        ([, hex]) => hex.toUpperCase() === value.toUpperCase()
      );
      return `status.${token} (${value}) is the health ramp's "${band?.[0]}"`;
    });

    expect(collisions).toEqual([]);
  });

  it('can still detect a collision, so the case above is not vacuous', () => {
    /*
      The check itself, run against a token deliberately set to a band hex. §5
      of this repo's rules: every scanner carries a case proving it can still
      fail, because three guards here have shipped green while checking nothing.
    */
    const rampValues = new Set(Array.from(ramp.values(), (h) => h.toUpperCase()));
    const planted = healthBandHex(getHealthBandJudgement(45)); // `warn` — the historic collision

    expect(rampValues.has(planted.toUpperCase())).toBe(true);
  });

  it('lets confirm share only the "good" band, never a fault', () => {
    /*
      The carve-out, asserted from both sides so it cannot quietly widen into
      "confirm is exempt". See CONFIRM_MAY_MATCH for the reasoning.
    */
    const ramp2 = healthRampHexes();
    const good = ramp2.get(CONFIRM_MAY_MATCH);
    const faults = Array.from(ramp2.entries())
      .filter(([name]) => name !== CONFIRM_MAY_MATCH)
      .map(([, hex]) => hex.toUpperCase());

    expect(good).toBeDefined();
    // Permitted, and currently the case on both clients.
    expect(status.confirm.toUpperCase()).toBe(good);
    // Still forbidden: a success chip wearing a fault's colour.
    expect(faults).not.toContain(status.confirm.toUpperCase());
    expect(faults.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the danger family on one hue', () => {
    /*
      The same shape as the attention case below, added 5 Sep when the danger
      family left red for sodium. Its wash was `rgba(248,113,113,…)` following a
      `#F87171` ink; both moved together, and this is what keeps them together.
    */
    const ink = status.dangerText.replace('#', '');
    const channels = [0, 2, 4].map((i) => parseInt(ink.slice(i, i + 2), 16)).join(',');

    expect(status.dangerWash).toContain(channels);
    expect(status.dangerWashBorder).toContain(channels);
  });

  it('keeps the attention family on one hue', () => {
    /*
      ⚠ Three ambers lived in this family until 23 Aug: the ink was `#E0A468`,
      the wash and its border were `rgba(251,191,36,…)` — amber-400 — and the
      solid banner pair is `#4A3308` / `#854D0E`. A chip therefore drew orange
      type on a yellow tint.

      The wash now follows the ink. The **solid pair is deliberately exempt**:
      those are this app's own measured values, the contrast scan already
      measures white on them, and that override is documented at the token.
    */
    const ink = status.attention.replace('#', '');
    const channels = [0, 2, 4].map((i) => parseInt(ink.slice(i, i + 2), 16)).join(',');

    expect(status.attentionWash).toContain(channels);
    expect(status.attentionWashBorder).toContain(channels);
  });
});
