import type { HealthBandJudgement } from '@tappet/core/health-band';
import type { NextServiceLine } from '@tappet/core/garage-next-service';

/**
 * What the vehicle hub knows, handed to a concept of the hub as one object.
 *
 * ── 13 Sep · three concepts, one data path ──────────────────────────────────
 *
 * `VehicleDetailScreen` loads the car, derives the reading, the verdict, the
 * next service and the counts, and draws them. The three concepts David asked
 * for redraw the *sheet* — the part under the plate — and nothing else, so
 * they take what the screen already worked out rather than working it out
 * again. Every value here is the screen's own, computed once; a concept that
 * derived its own "overdue" would be a second opinion about the car.
 *
 * ⚠ Every nullable field means "we cannot say", never zero or empty. The
 * screen's `HubCounts` docblock carries the rule; it holds here unchanged: a
 * concept renders nothing for a `null` count, and never a `0`.
 */
export interface HubModel {
  name: string;
  /** The reading, or `null` when nothing has assessed the car. */
  score: number | null;
  band: HealthBandJudgement | null;
  /** `healthVerdict`'s prose — never the stored summary when it is stale. */
  verdictText: string | null;
  /** What the reading was worked out from, for a provenance line. */
  provenance: string[];
  /** The sweep's next service, worded by core. */
  nextService: NextServiceLine;
  /** The service row's timing — `nextService.timing`, or `UNKNOWN_TIMING`. */
  serviceDue: string;
  historyCount: string | null;
  wishlistCount: string | null;
  openRecallCount: number;
  /** The worst open recall as one sentence, or `null` when none is named. */
  worstRecall: string | null;
  /** The owner's usage answer, humanised, or `null`. */
  usage: string | null;
  on: {
    health: () => void;
    recalls: () => void;
    milestone: () => void;
    history: () => void;
    wishlist: () => void;
    scan: () => void;
    advisor: () => void;
    profile: () => void;
  };
}
