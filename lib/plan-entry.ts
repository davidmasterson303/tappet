/**
 * The Plan tab's entry contract: which segment opens, and whether the Needs
 * card opens its "Add to Needs" dialog on arrival.
 *
 * ── ⚠ Why a URL, and why this file ──────────────────────────────────────────
 *
 * 11 Sep, David, on the live demo: *"clicking add service record takes me to
 * advisor tab. it should take me to needs subtab on plan tab with add to needs
 * modal open."* The by-hand path to a service record in this product is
 * Needs → Mark as Complete — completing a need is what files the record with
 * its date, shop and cost — so the Service tab's one creation action lands on
 * that path, with the dialog already open. (Invoices still go through the
 * advisor; the empty state's copy says so and keeps its own button.)
 *
 * Two pages have to agree on the spelling of that hand-off, and a string
 * that lives in one place cannot drift. `planHref` is what the Service tab
 * pushes; `readPlanEntry` is what the Plan tab reads. `plan-entry.test.ts`
 * pins that they round-trip.
 *
 * ⚠ Unknown values fall back to `needs` and *not* open, never to a guess —
 * a mistyped segment must not open Mods on someone, and a stray `add` value
 * must not pop a dialog. CLAUDE.md §6.
 */

export type PlanSegment = 'needs' | 'mods';

export interface PlanEntry {
  segment: PlanSegment;
  /** Open the Needs card's "Add to Needs" dialog on arrival. */
  openAdd: boolean;
}

const SEGMENTS: readonly PlanSegment[] = ['needs', 'mods'];

/** Minimal shape of `URLSearchParams` / Next's `ReadonlyURLSearchParams`. */
interface SearchLike {
  get(name: string): string | null;
}

export function readPlanEntry(search: SearchLike | null | undefined): PlanEntry {
  const rawSegment = search?.get('segment');
  const segment = SEGMENTS.find((s) => s === rawSegment) ?? 'needs';
  // `add=1` only, and only on Needs — the dialog belongs to that card.
  const openAdd = segment === 'needs' && search?.get('add') === '1';
  return { segment, openAdd };
}

export function planHref(vehicleId: string, entry: Partial<PlanEntry> = {}): string {
  const params = new URLSearchParams();
  if (entry.segment && entry.segment !== 'needs') params.set('segment', entry.segment);
  if (entry.openAdd) {
    params.set('segment', 'needs');
    params.set('add', '1');
  }
  const query = params.toString();
  return `/plan/${vehicleId}${query ? `?${query}` : ''}`;
}
