import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Heart, Loader as Loader2 } from 'lucide-react';
import { useWishlist } from '@/hooks/useWishlist';
/**
 * What this card needs from a schedule row.
 *
 * ⚠ Structural rather than `MaintenanceScheduleItem`, because core holds two
 * types for these rows and they disagree: `MaintenanceScheduleItem` requires
 * `interval_miles: number`, while `ScheduleEntry` — the one `evaluateSchedule`
 * consumes — makes it optional and nullable. `ScheduleEntry` is the honest one:
 * `vehicle-utils.ts` records that a brake fluid flush genuinely has no mileage
 * interval, and the stored rows carry `interval_months: null` routinely.
 *
 * Reconciling the two core types is worth doing and is not this change; a card
 * that accepts what both produce is, and it stops the stricter one forcing a
 * cast at the call site.
 */
export interface ScheduleRow {
  service: string;
  interval_miles?: number | null;
  interval_months?: number | null;
  description?: string;
  priority?: string;
}

/**
 * "Every 5,000 mi or 6 months", from whichever halves are present.
 *
 * ⚠ Returns null rather than a placeholder when neither is. A brake fluid flush
 * is genuinely time-only and an oil change genuinely mileage-only, so a missing
 * half is normal — but *both* missing means the row carries no interval, and
 * "Every 0 mi" or a bare "Interval:" is a reading the data does not support.
 * §6: a missing figure is "we cannot say", never a number.
 */
function intervalLabel(item: ScheduleRow): string | null {
  const miles = typeof item.interval_miles === 'number' && item.interval_miles > 0
    ? `${item.interval_miles.toLocaleString()} mi`
    : null;
  const months = typeof item.interval_months === 'number' && item.interval_months > 0
    ? `${item.interval_months} months`
    : null;

  if (miles && months) return `Every ${miles} or ${months}`;
  if (miles) return `Every ${miles}`;
  if (months) return `Every ${months}`;
  return null;
}

/**
 * One row of the maintenance schedule.
 *
 * ── ⚠ 8 Sep · this card read fields that have never existed ─────────────────
 *
 * It rendered `item.item` as the name and `item.interval` after the word
 * "Interval:". The rows it is given have neither. The shape stored in
 * `vehicle_knowledge_base.maintenance_schedule` — and typed in core as
 * `MaintenanceScheduleItem` — is:
 *
 *     { service, priority, description, interval_miles, interval_months }
 *
 * So every card rendered a blank name and the bare word "Interval:", and
 * `priority` was the only field that landed, which is why the badges looked
 * right and nothing else did.
 *
 * ⚠ **Two of the defects were not cosmetic.** `useWishlist` was constructed
 * with `itemName: undefined`, and `onAddToHistory(item.item)` passed
 * `undefined` — so both buttons on every row of the schedule were inert, or
 * writing a nameless record. The phone has always read `service.service`
 * correctly (`ServiceMilestoneScreen`), so this was web-only and silent.
 *
 * ⚠ **It survived because it was buried.** This card sat inside a tab, inside
 * a card named "The Dossier", inside a collapsed section at the foot of the
 * dashboard — three clicks from anywhere. It was found within a minute of the
 * IA work putting the schedule on its own tab, by looking at the page. Nothing
 * else could have found it: there is no type on the prop, so `tsc` had nothing
 * to check, and no test rendered this card.
 */
interface MaintenanceItemCardProps {
  item: ScheduleRow;
  /**
   * Where this car stands against the interval — "Overdue by about 15,000
   * miles". Null when nothing can be computed, which is a real state: no
   * odometer, or no record of this service to count from.
   */
  anchor?: string | null;
  /** Drives the emphasis. Null when the row could not be evaluated. */
  status?: 'overdue' | 'due' | 'soon' | 'later' | 'unknown' | null;
  /**
   * Where the anchor came from — "From your service records". Null when there
   * was nothing to count from, in which case `anchor` already says so and a
   * second line about absent evidence would be the same sentence twice.
   */
  basis?: string | null;
  vehicleId: string;
  isInWishlist: boolean;
  onAddToHistory: (itemName: string) => void;
  onWishlistToggleComplete?: () => Promise<void>;
  loading?: boolean;
}

export default function MaintenanceItemCard({
  item,
  anchor = null,
  status = null,
  basis = null,
  vehicleId,
  isInWishlist,
  onAddToHistory,
  onWishlistToggleComplete,
  loading = false,
}: MaintenanceItemCardProps) {
  const { isSaved, isLoading: wishlistLoading, toggleWishlist } = useWishlist({
    vehicleId,
    itemName: item.service,
    itemType: 'maintenance',
    initialIsSaved: isInWishlist,
    onToggleComplete: onWishlistToggleComplete,
  });

  const getPriorityBadgeClass = (priority: string | undefined) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-600 text-white border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]';
      case 'High':
        return 'bg-transparent text-orange-300 border-orange-400/55';
      case 'Routine':
        return 'bg-transparent text-info/75 border-info-border';
      default:
        return 'bg-transparent text-slate-300 border-slate-400/40';
    }
  };

  return (
    <div className="p-4 border rounded-lg transition-all bg-slate-900/30 border-slate-700/50 hover:border-cyan-400/30 hover:bg-slate-900/50">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-white">{item.service}</h4>
          {/*
            ⚠ The anchor first, the interval second. "Overdue by about 15,000
            miles" is the answer this page exists to give; "Every 30,000 mi" is
            the rule it was computed from. They were the other way round — in
            fact the anchor was absent entirely — until 8 Sep.
          */}
          {anchor ? (
            <p
              className={`text-sm mt-1 ${
                status === 'overdue' || status === 'due' ? 'text-orange-300' : 'text-white/70'
              }`}
            >
              {anchor}
            </p>
          ) : null}
          {/* Absent when the row carries no interval at all — see `intervalLabel`. */}
          {intervalLabel(item) ? (
            <p className="text-sm text-white/55 mt-1">{intervalLabel(item)}</p>
          ) : null}
          {basis ? <p className="text-xs text-white/50 mt-1">{basis}</p> : null}
          {item.description ? (
            <p className="text-sm text-white/55 mt-1.5 leading-normal">{item.description}</p>
          ) : null}
        </div>
        {/*
          Absent on rows that carry no priority. An empty badge is a shape with
          nothing in it, which reads as a loading state rather than an absence.
        */}
        {item.priority ? (
          <Badge variant="outline" className={getPriorityBadgeClass(item.priority)}>
            {item.priority}
          </Badge>
        ) : null}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs bg-info-wash text-info border-info-border hover:bg-cyan-500/20"
          onClick={() => onAddToHistory(item.service)}
          disabled={loading}
        >
          <Clock className="h-3 w-3 mr-1" />
          Add to History
        </Button>
        <Button
          size="sm"
          variant={isSaved ? 'outline' : 'default'}
          className={
            isSaved
              ? 'h-7 text-xs border-red-400/50 text-red-300 hover:border-red-400 hover:bg-red-500/10'
              : 'h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90'
          }
          onClick={toggleWishlist}
          disabled={wishlistLoading || loading}
        >
          {wishlistLoading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {isSaved ? 'Removing' : 'Adding'}
            </>
          ) : (
            <>
              <Heart className={`h-3 w-3 mr-1 ${isSaved ? 'fill-current' : ''}`} />
              {isSaved ? 'Remove from Needs' : 'Add to Needs'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
