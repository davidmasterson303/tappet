'use client';

import { useMemo } from 'react';
import { evaluateSchedule, type ScheduleEntry, type ServiceDue } from '@tappet/core/service-due';
import { historyLookups, type ServiceHistoryRow } from '@tappet/core/service-history';
import { SCHEDULE_BASIS_LABELS } from '@tappet/core/service-provenance';
import MaintenanceItemCard from '@/components/MaintenanceItemCard';

/**
 * What this car needs next, anchored to what it has actually had done.
 *
 * ── ⚠ 8 Sep · the Due segment was showing a schedule, not a due list ────────
 *
 * It rendered `maintenance_schedule` in stored order with an interval under
 * each name: "Every 5,000 mi", seven times, in the order the model happened to
 * write them. Nothing said when a service was last done, how far past it the
 * car is, or which to do first — and a Critical tire rotation sat last because
 * that is where it appeared in the array.
 *
 * ⚠ **The product already computed all of it.** `evaluateSchedule` in core has
 * anchored intervals against extracted invoice line items since it was written,
 * and both mobile screens plus the nightly sweep use it. The web tab that is
 * *named* for the answer was the one caller that did not — so the client with
 * the larger screen showed strictly less than the product knew, which is a
 * fair description of the whole IA problem this work started from.
 *
 * ── Ordering is a claim, so it is made deliberately ─────────────────────────
 *
 * Sorted by how overdue a thing is, not by priority alone. A Recommended item
 * 8,000 miles past its interval is a more useful thing to see than a Critical
 * one that is not due for another 4,000, and sorting on the badge alone would
 * bury the first under the second. Priority breaks ties, and `unknown` sinks —
 * a service with nothing to count from cannot be ranked against one that has.
 *
 * ⚠ **`unknown` is a real state and it is not "later".** A car with no record
 * of a brake fluid change has not had one recently; it has *no evidence*. §6 —
 * a missing figure is "we cannot say" — so those rows say that rather than
 * being sorted in among the ones with an answer.
 */

const STATUS_RANK: Record<ServiceDue['status'], number> = {
  overdue: 0,
  due: 1,
  soon: 2,
  later: 3,
  unknown: 4,
};

const PRIORITY_RANK: Record<string, number> = { Critical: 0, Recommended: 1, Optional: 2 };

/** The one line that says where this car stands against this interval. */
function anchorLine(due: ServiceDue): string | null {
  if (due.status === 'unknown') {
    return due.basedOnHistory
      ? null
      : 'No record of this service to count from.';
  }

  if (due.milesRemaining !== null) {
    const n = Math.abs(Math.round(due.milesRemaining)).toLocaleString();
    if (due.milesRemaining < 0) return `Overdue by about ${n} miles.`;
    return `About ${n} miles to go.`;
  }

  if (due.monthsRemaining !== null) {
    const n = Math.abs(Math.round(due.monthsRemaining));
    const unit = n === 1 ? 'month' : 'months';
    if (due.monthsRemaining < 0) return `Overdue by about ${n} ${unit}.`;
    return `About ${n} ${unit} to go.`;
  }

  return null;
}

export default function ServiceDueList({
  schedule,
  historyRows,
  currentMileage,
  vehicleId,
  savedItemNames,
  loading,
  onAddToHistory,
  onWishlistToggleComplete,
}: {
  schedule: ScheduleEntry[];
  historyRows: ServiceHistoryRow[];
  currentMileage: number | null;
  vehicleId: string;
  savedItemNames: Set<string>;
  loading: boolean;
  onAddToHistory: (itemName: string) => void;
  onWishlistToggleComplete: () => Promise<void>;
}) {
  const due = useMemo(() => {
    /*
      ⚠ Without an odometer nothing here is computable, and guessing one would
      make every line on this page a fabrication. The schedule still renders —
      it is real, and knowing a car wants its CVT fluid every 30,000 miles is
      worth something — but no row claims a position against it.
    */
    if (currentMileage === null || schedule.length === 0) return null;

    const lookups = historyLookups(historyRows);
    return evaluateSchedule({
      schedule,
      currentMileage,
      lastServiceMileage: lookups.lastServiceMileage,
      lastServiceDate: lookups.lastServiceDate,
    });
  }, [schedule, historyRows, currentMileage]);

  const ordered = useMemo(() => {
    if (due === null) return null;
    return [...due].sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (byStatus !== 0) return byStatus;

      // Within a status, the further past its interval, the higher it sits.
      const aOver = a.milesRemaining ?? 0;
      const bOver = b.milesRemaining ?? 0;
      if (aOver !== bOver) return aOver - bOver;

      return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
    });
  }, [due]);

  if (schedule.length === 0) {
    return <p className="text-sm text-white/60 py-8">No maintenance schedule for this vehicle yet.</p>;
  }

  const rows: Array<{ entry: ScheduleEntry; due: ServiceDue | null }> =
    ordered === null
      ? schedule.map((entry) => ({ entry, due: null }))
      : ordered.map((d) => ({
          entry: (schedule.find((s) => s.service === d.service) ?? {
            service: d.service,
            interval_miles: d.intervalMiles,
            interval_months: d.intervalMonths,
            description: d.description,
            priority: d.priority,
          }) as ScheduleEntry,
          due: d,
        }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">
        {SCHEDULE_BASIS_LABELS['generated-schedule']}
        {ordered === null ? ' · add your mileage to see what is due' : null}
      </p>

      {rows.map(({ entry, due: d }) => (
        <MaintenanceItemCard
          key={entry.service}
          item={{ ...entry, priority: entry.priority }}
          anchor={d ? anchorLine(d) : null}
          status={d?.status ?? null}
          vehicleId={vehicleId}
          isInWishlist={savedItemNames.has(entry.service)}
          onAddToHistory={onAddToHistory}
          onWishlistToggleComplete={onWishlistToggleComplete}
          loading={loading}
        />
      ))}
    </div>
  );
}
