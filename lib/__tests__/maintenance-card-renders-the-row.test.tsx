/**
 * The maintenance schedule card, rendered against the shape the rows actually
 * have.
 *
 * ── The defect, found 8 Sep by looking at the page ──────────────────────────
 *
 * `MaintenanceItemCard` read `item.item` for the name and `item.interval` after
 * the word "Interval:". Neither field exists. The rows stored in
 * `vehicle_knowledge_base.maintenance_schedule`, and typed in core as
 * `MaintenanceScheduleItem`, are:
 *
 *     { service, priority, description, interval_miles, interval_months }
 *
 * Every card in the schedule therefore rendered a blank heading and the bare
 * word "Interval:" — seven of them on the demo Accord — and `priority` was the
 * only field that landed, which is why the badges looked correct.
 *
 * ⚠ **Three of the four defects were not cosmetic**, and none of them would
 * have been caught by reading the file:
 *
 *   - `useWishlist({ itemName: item.item })` was constructed with `undefined`.
 *   - `onAddToHistory(item.item)` passed `undefined`.
 *   - `key={item.item}` gave every row in the list the same `undefined` key.
 *   - `savedItemNames.has(item.item)` was false for every row, so an item
 *     already on the wishlist still offered "Add to Wishlist".
 *
 * ── ⚠ Why nothing caught it ────────────────────────────────────────────────
 *
 * The prop was typed `item: any`, and `MaintenanceTab` declared a local
 * `MaintenanceItem { item: string; [key: string]: unknown }` — an invented
 * shape with an index signature that accepted anything. So `tsc` had nothing to
 * check, and no test rendered this card. Typing the prop against core's real
 * `MaintenanceScheduleItem` found two further bugs immediately.
 *
 * And it survived for months because it was **buried**: three clicks deep,
 * inside a tab, inside a card called "The Dossier", inside a collapsed section
 * at the foot of the dashboard. It was found within a minute of that schedule
 * being given its own tab. The phone has always read `service.service`
 * correctly, so this was web-only and silent on the client with the larger
 * screen.
 */

import { render, screen } from '@testing-library/react';
import MaintenanceItemCard from '@/components/MaintenanceItemCard';
import type { MaintenanceScheduleItem } from '@tappet/core/types';

jest.mock('@/hooks/useWishlist', () => ({
  useWishlist: jest.fn((args: { itemName: string }) => ({
    isSaved: false,
    isLoading: false,
    toggleWishlist: jest.fn(),
    __itemName: args.itemName,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useWishlist } = require('@/hooks/useWishlist');

/** A real row, copied from the demo Accord's stored schedule. */
const OIL: MaintenanceScheduleItem & { priority?: string } = {
  service: 'Engine Oil (0W-20 Full Synthetic)',
  priority: 'Critical',
  description: 'Replaces engine oil and filter to lubricate the 1.5L turbo engine.',
  interval_miles: 5000,
};

function renderCard(item: MaintenanceScheduleItem & { priority?: string }) {
  render(
    <MaintenanceItemCard
      item={item}
      vehicleId="v1"
      isInWishlist={false}
      onAddToHistory={jest.fn()}
    />
  );
}

describe('the maintenance card renders the row it was given', () => {
  it('names the service', () => {
    renderCard(OIL);
    expect(screen.getByText('Engine Oil (0W-20 Full Synthetic)')).toBeInTheDocument();
  });

  it('states the interval from the fields that carry it', () => {
    renderCard(OIL);
    expect(screen.getByText(/every 5,000 mi/i)).toBeInTheDocument();
    // The bare word, with nothing after it, was the whole visible symptom.
    expect(screen.queryByText(/^interval:\s*$/i)).not.toBeInTheDocument();
  });

  it('hands the wishlist a real item name', () => {
    /*
      The expensive half. A blank heading is embarrassing; a wishlist toggle
      built on `undefined` writes or matches nothing, silently.
    */
    renderCard(OIL);
    expect(useWishlist).toHaveBeenCalledWith(
      expect.objectContaining({ itemName: 'Engine Oil (0W-20 Full Synthetic)' })
    );
  });

  it('combines both halves of the interval when a row has both', () => {
    renderCard({ ...OIL, interval_months: 6 });
    expect(screen.getByText(/every 5,000 mi or 6 months/i)).toBeInTheDocument();
  });

  it('states a time-only interval, which is a real shape', () => {
    // Brake fluid is genuinely months-only. A missing half is normal.
    renderCard({ service: 'Brake Fluid', interval_miles: 0, interval_months: 24 });
    expect(screen.getByText(/every 24 months/i)).toBeInTheDocument();
  });

  it('says nothing rather than "Every 0 mi" when the row carries no interval', () => {
    /*
      §6 — a missing figure is "we cannot say", never a reading. Both halves
      absent is the case the old code turned into a bare "Interval:".
    */
    renderCard({ service: 'Inspection', interval_miles: 0 });
    expect(screen.getByText('Inspection')).toBeInTheDocument();
    expect(screen.queryByText(/every/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 mi/)).not.toBeInTheDocument();
  });

  it('can still detect a card that renders nothing', () => {
    /*
      §5's anti-vacuous half. Every assertion above is a `getByText` on a
      string this test also supplies, which is exactly the shape that passes
      when the component renders a different row. So state the failure: a row
      whose name is absent must not match the name of the row before it.
    */
    renderCard({ service: 'Cabin Air Filter', interval_miles: 15000 });
    expect(screen.queryByText('Engine Oil (0W-20 Full Synthetic)')).not.toBeInTheDocument();
    expect(screen.getByText('Cabin Air Filter')).toBeInTheDocument();
  });
});
