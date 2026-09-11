'use client';

import { SCHEDULE_BASIS_LABELS } from '@tappet/core/service-provenance';
import MaintenanceItemCard from '@/components/MaintenanceItemCard';
import type { MaintenanceScheduleItem } from '@tappet/core/types';

/*
  ⚠ This said `{ item: string }` and the rows have no `item`. The declaration
  was the reason nothing caught the card beneath it rendering blanks — an
  invented shape, asserted by an index signature that accepted anything.
*/
type MaintenanceItem = MaintenanceScheduleItem & { priority?: string };

interface MaintenanceTabProps {
  schedule: MaintenanceItem[];
  vehicleId: string;
  savedItemNames: Set<string>;
  loading: boolean;
  onAddToHistory: (itemName: string) => void;
  onWishlistToggleComplete: () => Promise<void>;
}

export default function MaintenanceTab({
  schedule,
  vehicleId,
  savedItemNames,
  loading,
  onAddToHistory,
  onWishlistToggleComplete,
}: MaintenanceTabProps) {
  if (schedule.length === 0) {
    return <p className="text-sm text-white/60 text-center py-8">No maintenance schedule available.</p>;
  }

  return (
    <div className="space-y-3">
      {/*
        ── ⚠ UX-16 / D11 · provenance the phone had and the web did not ──────

        `ServiceMilestoneScreen` has rendered
        `SCHEDULE_BASIS_LABELS['generated-schedule']` under its schedule since
        the provenance module was written. This tab renders the same
        `maintenance_schedule` array, from the same column, and said nothing —
        so the identical list of intervals read as manufacturer fact on the web
        and as an AI-generated typical schedule on the phone.

        That is this codebase's most repeated defect, and the fix is to read the
        same constant rather than to write a second sentence. The wording is
        deliberately "typical" rather than "manufacturer-recommended": we do not
        hold a manufacturer document, we hold a model's account of one, and
        `service-provenance.ts` carries that argument.
      */}
      <p className="text-xs text-white/50">{SCHEDULE_BASIS_LABELS['generated-schedule']}</p>

      {/*
        ⚠ `key` and `isInWishlist` both read `item.item` until 8 Sep, a field
        these rows do not have. So every card in the list keyed on `undefined`
        — one key for the whole list — and `savedItemNames.has(undefined)` was
        false for every row, which meant an item already on the wishlist still
        offered "Add to Wishlist". Both are `service`, which is what the row
        actually carries and what the phone has always read.
      */}
      {schedule.map((item) => (
        <MaintenanceItemCard
          key={item.service}
          item={item}
          vehicleId={vehicleId}
          isInWishlist={savedItemNames.has(item.service)}
          onAddToHistory={onAddToHistory}
          onWishlistToggleComplete={onWishlistToggleComplete}
          loading={loading}
        />
      ))}
    </div>
  );
}
