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
 * The set, fetched once per mount.
 *
 * ⚠ Quiet by design: a switcher that has not loaded draws **nothing** rather
 * than a spinner or a skeleton of itself. It sits at the top of a page whose
 * own content is already there, and a placeholder in that slot would be a
 * loading state on a screen that is not loading.
 */
export function useCarSet(on: boolean): { cars: CarRow[]; reload: () => void } {
  const [cars, setCars] = useState<CarRow[]>([]);

  const load = useCallback(async () => {
    if (!on) return;
    try {
      const body = await apiRequest<{ vehicles?: Row[] }>('/vehicles');
      setCars(carRows(Array.isArray(body.vehicles) ? body.vehicles : []));
    } catch {
      /* The page it sits on is fine; a switcher that could not load simply is not there. */
      setCars([]);
    }
  }, [on]);

  useEffect(() => {
    void load();
  }, [load]);

  /* `on` is the caller's gate — no switcher, no request. */

  return { cars, reload: () => void load() };
}
