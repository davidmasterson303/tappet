import type { DesignVariant } from '../../dev/fixtures';
import HubCluster from './HubCluster';
import HubTicket from './HubTicket';
import HubWorkOrder from './HubWorkOrder';
import type { HubModel } from './hub-model';

/**
 * The three concepts of the vehicle hub, selected by `designVariant()`.
 *
 * ── 13 Sep · a switch that exists to be deleted ─────────────────────────────
 *
 * David: *"spin up design agent who has no fear and loves breaking standard
 * design rules … have this agent create 3 new design concepts for this key
 * page"*, then *"have [the critic] pick the best of the 3 … then run the
 * existing critic loop on the new page."* The concepts are built as real
 * screens so the critic grades what the product draws, and this switch is how
 * one screen shows three of them without three copies of its data path. When
 * the critic has picked, the pick becomes `VehicleDetailScreen`'s own body and
 * this directory goes; the frames and the README under
 * `design-loop/mobile-ios/concepts/hub/` are the record.
 *
 * Never reachable in a release build: `designVariant()` is `null` outside the
 * fixtures' double gate, and `null` draws the screen as it ships.
 */
export default function HubConceptBody({ variant, model }: { variant: DesignVariant; model: HubModel }) {
  switch (variant) {
    case 'a':
      return <HubCluster model={model} />;
    case 'b':
      return <HubWorkOrder model={model} />;
    case 'c':
      return <HubTicket model={model} />;
  }
}
