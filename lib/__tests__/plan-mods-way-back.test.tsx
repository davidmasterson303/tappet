/**
 * The Plan tab keeps its way back to modifications, in both states.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * 11 Sep, David, on the live demo: hiding modifications left the MODS tab
 * selected over an empty panel, and coming back later there was no way to
 * show them again. Both had one cause: the on/off switch lived *inside*
 * `VehicleInsights section="mods"`, the section it hides. This page's cached
 * `showsMods` went stale (the tab stayed), and after a reload the section —
 * and the switch with it — no longer rendered ("not now" had become "never",
 * which `RegisterSwitch`'s docblock says must not happen).
 *
 * Now the page owns the switch. These cases pin the three behaviours a
 * screenshot cannot: the strip disappears the moment the surface is hidden
 * (no reload), the switch is still there afterwards, and the plan query's
 * cache is written so a remount agrees with the row. The last case is the
 * anti-vacuous one — a car that arrives hidden still gets the switch.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import PlanPage from '@/app/plan/[vehicleId]/page';

const setQueryData = jest.fn();
let planData: { vehicle: Record<string, unknown>; knowledge: null };

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: planData, isLoading: false, error: null }),
  useQueryClient: () => ({ setQueryData }),
}));
jest.mock('@/lib/supabase', () => ({ getClientSupabase: () => ({}) }));
jest.mock('@/hooks/useSignedUrl', () => ({ useVehicleImage: () => null }));
jest.mock('@/components/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/WishlistSection', () => ({
  WishlistSection: () => <div data-testid="needs">needs</div>,
}));
jest.mock('@/components/VehicleInsights', () => ({
  __esModule: true,
  default: ({ switchOwner }: { switchOwner?: string }) => (
    <div data-testid="mods" data-switch-owner={switchOwner}>mods</div>
  ),
}));
// The real switch calls a server action; here it is a button that reports
// the flip, which is the contract the page depends on.
jest.mock('@/components/RegisterSwitch', () => ({
  __esModule: true,
  default: ({ visible, onApply }: { visible: boolean; onApply: (v: boolean) => void }) => (
    <button type="button" onClick={() => onApply(!visible)}>
      {visible ? 'Hide modifications' : 'Show modifications'}
    </button>
  ),
}));

const car = (performance_mindedness: string) => ({
  vehicle: { id: 'v1', performance_mindedness },
  knowledge: null,
});

beforeEach(() => {
  setQueryData.mockClear();
});

describe('the Plan tab owns the modifications switch', () => {
  it('shows the strip and the switch when the car has modifications on', () => {
    planData = car('mild');
    render(<PlanPage params={{ vehicleId: 'v1' }} />);
    expect(screen.getByRole('tablist', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide modifications' })).toBeInTheDocument();
  });

  it('hiding removes the strip immediately, keeps the switch, and writes the cache', () => {
    planData = car('mild');
    render(<PlanPage params={{ vehicleId: 'v1' }} />);
    // Stand on Mods first — the case that used to leave an empty selected tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Mods' }));
    expect(screen.getByTestId('mods')).toHaveAttribute('data-switch-owner', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Hide modifications' }));

    expect(screen.queryByRole('tablist', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.getByTestId('needs')).toBeInTheDocument();
    expect(screen.queryByTestId('mods')).not.toBeInTheDocument();
    // The way back survives the hide.
    expect(screen.getByRole('button', { name: 'Show modifications' })).toBeInTheDocument();

    // And a remount will agree with the row without a refetch.
    expect(setQueryData).toHaveBeenCalledTimes(1);
    const [key, updater] = setQueryData.mock.calls[0];
    expect(key).toEqual(['plan', 'v1']);
    expect(updater(car('mild')).vehicle.performance_mindedness).toBe('stock');
    expect(updater(undefined)).toBeUndefined();
  });

  it('a car that arrives hidden still gets the switch — the anti-vacuous case', () => {
    planData = car('stock');
    render(<PlanPage params={{ vehicleId: 'v1' }} />);
    expect(screen.queryByRole('tablist', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.getByTestId('needs')).toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'Show modifications' });

    fireEvent.click(show);

    expect(screen.getByRole('tablist', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide modifications' })).toBeInTheDocument();
    const [, updater] = setQueryData.mock.calls[0];
    expect(updater(car('stock')).vehicle.performance_mindedness).toBe('mild');
  });
});
