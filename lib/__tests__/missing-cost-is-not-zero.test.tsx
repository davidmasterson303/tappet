/**
 * A cost nobody recorded is "—", never `$0.00`, and is stored as `null`
 * (audit 360, TL-27; CLAUDE.md §6).
 *
 * @jest-environment jsdom
 *
 * The mark-done route keeps `null` and the sums skip it; the web's detail
 * sheet rendered `(item.cost_labor || 0).toFixed(2)` — "Labor $0.00", a claim
 * the work was free — and `addMaintenanceHistory` wrote `cost || 0` into a
 * pair of columns that default to 0. Rendered here; the write is executed
 * in `missing-cost-stored-null.test.ts` (node: the actions module loads
 * jimp, which jsdom cannot parse).
 */

import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => undefined }));

import MaintenanceItemDetailsDialog from '@/components/MaintenanceItemDetailsDialog';
import { formatRecordedCost, sumRecordedCosts } from '@tappet/core/formatting-utils';

const base = { id: 'i1', description: 'Brake pads', date_completed: '2026-09-01', is_combined: true };

function sheetText(item: Record<string, unknown>) {
  render(<MaintenanceItemDetailsDialog open onOpenChange={() => {}} item={{ ...base, ...item } as never} />);
  return document.body.textContent ?? '';
}

describe('the detail sheet (TL-27)', () => {
  it('shows a combined line with no labor recorded as —, not $0.00', () => {
    const text = sheetText({ cost_parts: 84.5 });
    expect(text).not.toContain('$0.00');
    expect(text).toMatch(/Labor—/);
    expect(text).toMatch(/Parts\$84\.50/);
    expect(text).toMatch(/Total\$84\.50/);
  });

  it('shows no figure at all when nothing was recorded', () => {
    const text = sheetText({});
    expect(text).not.toContain('$');
    expect(screen.getByText('Labor')).toBeTruthy();
  });

  it('anti-vacuous: recorded costs still render as money', () => {
    const text = sheetText({ cost_labor: 120, cost_parts: 80, total_cost: 200 });
    expect(text).toMatch(/Labor\$120\.00/);
    expect(text).toMatch(/Total\$200\.00/);
  });
});

describe('the cost helpers', () => {
  it('keep a typed 0 and refuse to invent one', () => {
    expect(formatRecordedCost(0)).toBe('$0.00');
    expect(formatRecordedCost(undefined)).toBe('—');
    expect(formatRecordedCost(Number.NaN)).toBe('—');
    expect(sumRecordedCosts(undefined, null)).toBeNull();
    expect(sumRecordedCosts(undefined, 40)).toBe(40);
  });
});
