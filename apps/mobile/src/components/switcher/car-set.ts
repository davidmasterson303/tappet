import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../../api/client';
import { bandForReading, type HealthBandJudgement } from '@tappet/core/health-band';
import { describeNextService, displayServiceName, localToday } from '@tappet/core/garage-next-service';
import { openRecalls } from '@tappet/core/recalls';

/**
 * The owner's other cars, as a switcher needs them.
 *
 * ── What a switcher needs, and what it must not carry ───────────────────────
 *
 * One line per car: enough to choose between them, and no more. The garage
 * bay's mistake — the thing that made two tabs feel like one — was carrying
 * the *hub's* content at the hub's size: the plate, the stat strip, a 240pt
 * dial, the service line, the recall count. Every one of those is on the hub
 * a tap later, so the bay was the hub with things removed.
 *
 * A switcher's job is comparison, not description. So a row here is the car's
 * name, its band (not its number — the number is precision nobody compares
 * on), and **the one thing this car needs**, phrased as the shortest true
 * sentence. What a car needs is ranked, not listed: an open recall outranks a
 * service, a service outranks nothing at all, and "nothing outstanding" is a
 * sentence rather than a blank.
 *
 * ⚠ **Nothing here is computed twice.** The band comes from `bandForReading`
 * with the record count, so a thin file reads as a thin file in the switcher
 * exactly as it does on the dial; the recall count is `openRecalls`, so it is
 * the count the hub prints minus what the owner has marked; the service is
 * `describeNextService` in core's own words. A switcher that worded any of
 * these itself would be a fourth place for the same fact to disagree.
 */
export interface CarRow {
  id: string;
  /** "2003 Honda Accord", as every surface builds it. */
  name: string;
  /** The reading, or `null`. Never drawn as a zero. */
  score: number | null;
  /** Banded against the file, so a thin history says so here too. */
  band: HealthBandJudgement | null;
  /** The shortest true sentence about what this car needs, or `null` while unknown. */
  needs: string | null;
  /** True when that need is a genuine warning — the sodium rule's one job. */
  warning: boolean;
  photoUrl: string | null;
}

interface Row {
  id: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  current_mileage?: number | null;
  photo_url?: string | null;
  next_service_label?: string | null;
  next_service_at_miles?: number | null;
  next_service_due_on?: string | null;
  nhtsa_data?: { recalls?: unknown } | Array<{ recalls?: unknown }> | null;
  recall_actions?: Array<{ campaign_number?: unknown }> | null;
  vehicle_health_summary?: { health_score?: number | null } | Array<{ health_score?: number | null }> | null;
  records?: { count?: number | null } | null;
}

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

/**
 * What this car needs, in one line, most urgent first.
 *
 * ⚠ The ranking is the product's, not a sort: **an open safety campaign
 * outranks a service that is due**, because one is a defect somebody else
 * found and the other is an interval. Below both, "Nothing outstanding" —
 * which is a claim, and only made when the schedule *and* the recall lookup
 * have both answered. A car we know nothing about says nothing.
 */
function needOf(row: Row, open: number, service: ReturnType<typeof describeNextService>): {
  needs: string | null;
  warning: boolean;
} {
  if (open > 0) {
    return { needs: open === 1 ? '1 open recall' : `${open} open recalls`, warning: true };
  }

  if (service.kind === 'known') {
    const overdue = service.timing.startsWith('overdue');
    return { needs: `${displayServiceName(service.service)} · ${service.timing}`, warning: overdue };
  }

  return { needs: null, warning: false };
}

/** The rows, ordered as the API returns them — the owner's own order. */
export function carRows(vehicles: Row[]): CarRow[] {
  const today = localToday();

  return vehicles.map((row) => {
    const score = first(row.vehicle_health_summary)?.health_score;
    const records = typeof row.records?.count === 'number' ? row.records.count : null;
    const open = openRecalls(first(row.nhtsa_data)?.recalls, row.recall_actions).length;
    const service = describeNextService(
      {
        label: row.next_service_label ?? null,
        atMiles: row.next_service_at_miles ?? null,
        dueOn: row.next_service_due_on ?? null,
      },
      row.current_mileage ?? null,
      today
    );

    return {
      id: row.id,
      name: [row.year, row.make, row.model].filter(Boolean).join(' ') || 'This car',
      score: typeof score === 'number' ? score : null,
      band: typeof score === 'number' ? bandForReading(score, records) : null,
      photoUrl: row.photo_url ?? null,
      ...needOf(row, open, service),
    };
  });
}

/**
 * The last set this app read, held for the next page that asks.
 *
 * ── ⚠ Round 3 · the count arrived after the car it counts ───────────────────
 *
 * Switching cars rebuilds the page, so `useCarSet` started from empty and the
 * eyebrow — `CAR 03 OF 03`, and the chevron that says the name opens
 * something — appeared **after** the crossfade had finished. The critic saw
 * it in the frames: *"CAR 03 OF 03 with its chevron … pop in after 283ms,
 * [and] belong to that block, not to a later beat."*
 *
 * A module-level hold is the honest fix rather than a cache in the sense that
 * needs invalidating: the set was read seconds ago by the page you were just
 * on, it is the owner's own garage, and it cannot have changed between one
 * car's page and the next without this app doing it. The fetch still runs and
 * still replaces this; what it no longer does is decide whether the eyebrow
 * exists on the first frame.
 */
let lastSet: CarRow[] = [];

/**
 * The set, fetched on mount and seeded from the last read.
 *
 * ⚠ Quiet by design: a switcher that has never loaded draws **nothing**
 * rather than a spinner or a skeleton of itself. It sits at the top of a page
 * whose own content is already there, and a placeholder in that slot would be
 * a loading state on a screen that is not loading.
 */
export type CarSetStatus = 'loading' | 'ok' | 'error';

export function useCarSet(on: boolean): { cars: CarRow[]; status: CarSetStatus; reload: () => void } {
  const [cars, setCars] = useState<CarRow[]>(on ? lastSet : []);
  /*
    23 Sep: whether the set has been read on this mount. `cars` alone could
    not say — an empty hold and "read, and there are none" look identical —
    and `FirstCar` showed every returning owner "No cars yet" for the length
    of the first round trip on a cold start, and for good when it failed.
  */
  const [status, setStatus] = useState<CarSetStatus>('loading');

  const load = useCallback(async () => {
    if (!on) return;
    setStatus('loading');
    try {
      const body = await apiRequest<{ vehicles?: Row[] }>('/vehicles');
      const rows = carRows(Array.isArray(body.vehicles) ? body.vehicles : []);
      lastSet = rows;
      setCars(rows);
      setStatus('ok');
    } catch {
      setStatus('error');
      /*
        ⚠ The page it sits on is fine, and a switcher that could not load
        simply is not there — but it keeps what it was holding rather than
        emptying. A failed read is not "you have no other cars", and the
        eyebrow blinking out mid-page would say exactly that.
      */
    }
  }, [on]);

  useEffect(() => {
    void load();
  }, [load]);

  /* `on` is the caller's gate — no switcher, no request. */

  return { cars, status, reload: () => void load() };
}

/**
 * Drop a car from the held set the moment this app removes it.
 *
 * ── 23 Sep · the removed car opened itself again ─────────────────────────────
 *
 * Removal popped the Car tab to the removed car's own root, which refetched,
 * 404'd, and said "no longer here — it may have been removed from another
 * device" about the owner's own act. Backing out of that dropped the root to
 * `FirstCar`, which seeds from this hold — still carrying the removed car as
 * `cars[0]` — and opened it a second time. The fetch would have corrected the
 * hold a moment later, but `FirstCar` acts on the first frame, which is the
 * whole reason the hold exists. So the one writer that knows a car is gone
 * says so here, before it navigates.
 */
export function forgetCar(vehicleId: string): void {
  lastSet = lastSet.filter((car) => car.id !== vehicleId);
}
