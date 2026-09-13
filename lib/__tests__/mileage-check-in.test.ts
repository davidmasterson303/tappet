/**
 * The odometer is asked for monthly, with a number worked out.
 *
 * David, 13 Sep: "we don't need to ask to confirm mileage every login. not
 * more than monthly. but we should calculate assumed new mileage each month we
 * ask." `mileageCheckIn` is the rule both clients read; these pin its two
 * halves and the one precision rule — an estimate reads as one.
 */
import { mileageCheckIn } from '@tappet/core/mileage-tracking';

const NOW = new Date('2026-09-13T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('mileageCheckIn', () => {
  it('asks when no reading has ever been confirmed, and offers the stored one', () => {
    expect(mileageCheckIn({ current_mileage: 66_000, avg_miles_per_month: 500, last_mileage_update_date: null }, NOW)).toEqual({
      ask: true,
      assumed: 66_000,
      projected: false,
      monthsSince: null,
    });
  });

  it('does not ask inside a month of the last confirmation', () => {
    const r = mileageCheckIn({ current_mileage: 66_000, avg_miles_per_month: 500, last_mileage_update_date: daysAgo(10) }, NOW);
    expect(r.ask).toBe(false);
    expect(r.assumed).toBe(66_000);
    expect(r.monthsSince).toBe(0);
  });

  it('asks after a month, with the reading projected from the owner’s miles a month', () => {
    // 45 days ≈ 1.48 months × 500 = 739 → 66,739 → 66,700: an estimate that reads as one.
    const r = mileageCheckIn({ current_mileage: 66_000, avg_miles_per_month: 500, last_mileage_update_date: daysAgo(45) }, NOW);
    expect(r.ask).toBe(true);
    expect(r.assumed).toBe(66_700);
    expect(r.projected).toBe(true);
    expect(r.monthsSince).toBe(1);
  });

  it('asks after a month without projecting when the miles a month are unknown or zero', () => {
    const unknown = mileageCheckIn({ current_mileage: 66_000, avg_miles_per_month: null, last_mileage_update_date: daysAgo(45) }, NOW);
    expect(unknown).toMatchObject({ ask: true, assumed: 66_000, projected: false });
    const stored = mileageCheckIn({ current_mileage: 66_000, avg_miles_per_month: 0, last_mileage_update_date: daysAgo(400) }, NOW);
    expect(stored).toMatchObject({ ask: true, assumed: 66_000, projected: false, monthsSince: 13 });
  });

  it('never offers a figure more precise than a hundred, and never one below the stored reading', () => {
    const r = mileageCheckIn({ current_mileage: 66_049, avg_miles_per_month: 20, last_mileage_update_date: daysAgo(31) }, NOW);
    // 20 miles in a month rounds to the stored reading: nothing to project.
    expect(r.assumed % 100).toBe(0);
    expect(r.assumed).toBeGreaterThanOrEqual(66_000);
    expect(r.projected).toBe(r.assumed !== 66_049);
    const big = mileageCheckIn({ current_mileage: 66_049, avg_miles_per_month: 1_200, last_mileage_update_date: daysAgo(61) }, NOW);
    expect(big.assumed % 100).toBe(0);
    expect(big.assumed).toBeGreaterThan(66_049);
    // A small month that rounds down must not offer a reading below the stored one.
    const small = mileageCheckIn({ current_mileage: 66_140, avg_miles_per_month: 5, last_mileage_update_date: daysAgo(31) }, NOW);
    expect(small.assumed).toBe(66_140);
    expect(small.projected).toBe(false);
  });

  it('treats a reading the client does not have as never confirmed', () => {
    // Before the route served `last_mileage_update_date`, the field was simply
    // absent — and an absent date must ask, not silently stop asking.
    expect(mileageCheckIn({ current_mileage: 66_000 }, NOW).ask).toBe(true);
    expect(mileageCheckIn({ current_mileage: 66_000, last_mileage_update_date: 'not a date' }, NOW).ask).toBe(true);
  });
});
