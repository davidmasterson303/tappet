/**
 * The `/dev` surfaces render the product's own views — not copies of them.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * `/garage`, `/settings` and `/onboard` sit behind the middleware, so the
 * design-critic loop's anonymous capture 307s to `/login` and the three pages
 * went unjudged through two locked briefs. On 11 Sep the one dev credential
 * the repo knew of turned out not to authenticate, and minting a session is
 * not an agent's to do. The phone hit the same wall twice and its
 * `dev/fixtures.ts` records the lesson: the screens need data, not a session.
 *
 * So each page was split into a data wrapper and a view, and `/dev/garage`,
 * `/dev/settings`, `/dev/onboard` render the views without a session. That
 * only works if the dev route and the real route render **the same
 * component**. A dev surface that drifted — a copied JSX tree, a second
 * component with the same name — would be graded and fixed while the product
 * kept shipping the old screen, which is the exact silent failure the whole
 * exercise exists to avoid. The first block pins the identity in source.
 *
 * The second block renders the views in their states. Both are anti-vacuous:
 * every state asserts something the other states do not show.
 */
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GarageView } from '@/app/garage/GarageView';
import { SettingsView } from '@/app/settings/SettingsView';
import type { GarageVehicle } from '@/hooks/useVehicles';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/garage',
  useSearchParams: () => new URLSearchParams(),
}));

// Leaves that reach for the network or browser APIs the view is not about.
jest.mock('@/components/VehicleCard', () => ({
  VehicleCard: ({ vehicle }: { vehicle: { year: number; make: string; model: string } }) => (
    <article data-testid="vehicle-card">{`${vehicle.year} ${vehicle.make} ${vehicle.model}`}</article>
  ),
}));
jest.mock('@/components/AccountMenu', () => ({
  AccountMenu: () => <button type="button">Account</button>,
}));
jest.mock('@/components/FeaturesDrawer', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/RevealOnScroll', () => ({
  RevealOnScroll: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/DeleteAccountDialog', () => ({
  DeleteAccountDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">delete</div> : null),
}));
jest.mock('@/hooks/use-scroll-reveal', () => ({
  useScrollReveal: () => ({ current: null }),
  revealDelay: () => ({}),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), message: jest.fn() } }));

const read = (rel: string) => {
  const file = path.join(process.cwd(), rel);
  const text = fs.readFileSync(file, 'utf8');
  expect(text.length).toBeGreaterThan(0);
  return text;
};

describe('the dev surfaces render the same component as the real routes', () => {
  it('garage: the page and the dev route both render GarageView from app/garage/GarageView', () => {
    expect(read('app/garage/page.tsx')).toMatch(/import \{ GarageView \} from '\.\/GarageView'/);
    expect(read('app/garage/page.tsx')).toMatch(/<GarageView\b/);
    expect(read('app/dev/garage/DevGarage.tsx')).toMatch(
      /import \{ GarageView \} from '@\/app\/garage\/GarageView'/,
    );
    expect(read('app/dev/garage/DevGarage.tsx')).toMatch(/<GarageView\b/);
  });

  it('settings: the page and the dev route both render SettingsView from app/settings/SettingsView', () => {
    expect(read('app/settings/page.tsx')).toMatch(/from '\.\/SettingsView'/);
    expect(read('app/settings/page.tsx')).toMatch(/<SettingsView\b/);
    expect(read('app/dev/settings/DevSettings.tsx')).toMatch(
      /from '@\/app\/settings\/SettingsView'/,
    );
    expect(read('app/dev/settings/DevSettings.tsx')).toMatch(/<SettingsView\b/);
  });

  it('onboard: the page and the dev route both render OnboardVinForm from app/onboard', () => {
    expect(read('app/onboard/page.tsx')).toMatch(/import OnboardVinForm from '\.\/OnboardVinForm'/);
    expect(read('app/dev/onboard/page.tsx')).toMatch(
      /import OnboardVinForm from '@\/app\/onboard\/OnboardVinForm'/,
    );
    expect(read('app/dev/onboard/page.tsx')).toMatch(/<OnboardVinForm\s*\/>/);
  });

  it('the dev routes sit under the layout that returns notFound() in production (SEC-10)', () => {
    const layout = read('app/dev/layout.tsx');
    expect(layout).toMatch(/process\.env\.NODE_ENV === 'production'\) notFound\(\)/);
    for (const route of ['app/dev/garage/page.tsx', 'app/dev/settings/page.tsx', 'app/dev/onboard/page.tsx']) {
      expect(fs.existsSync(path.join(process.cwd(), route))).toBe(true);
    }
  });

  it('the settings dev surface writes nothing: neither real server action is imported', () => {
    const dev = read('app/dev/settings/DevSettings.tsx');
    expect(dev).not.toMatch(/account-actions/);
    // Anti-vacuous: the real page does import them, so the scan can tell the two apart.
    expect(read('app/settings/page.tsx')).toMatch(/from '@\/app\/account-actions'/);
  });
});

const car = (over: Partial<GarageVehicle>): GarageVehicle => ({
  id: 'v',
  year: 2018,
  make: 'Honda',
  model: 'Accord',
  trim: null,
  color: null,
  current_mileage: 94_800,
  image_url: null,
  custom_image_url: null,
  performance_mindedness: null,
  ownership_objective: null,
  created_at: '2026-01-01T00:00:00Z',
  vehicle_status: 'daily_driver',
  avg_miles_per_month: 1_600,
  focal_point_x: null,
  focal_point_y: null,
  nhtsa_data: null,
  vehicle_health_summary: null,
  ...over,
});

/*
  Re-pointed 11 Sep when the garage joined the settled design system. The copy
  these read moved: "Managing N vehicles" became the fleet strip (a mono count
  under IN THE GARAGE), and "Your Garage is Empty" became the ghost slot's
  "No vehicles yet". The shape of the block is unchanged — every state still
  asserts something the other states do not show.
*/
describe('GarageView renders each of its states', () => {
  it('lists every vehicle it is handed, and says how many', () => {
    render(
      <GarageView
        vehicles={[
          car({ id: 'a' }),
          car({ id: 'b', year: 2020, make: 'Subaru', model: 'WRX' }),
        ]}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getAllByTestId('vehicle-card')).toHaveLength(2);
    expect(screen.getByText('2020 Subaru WRX')).toBeInTheDocument();
    // The count lives in the strip now, as a number under its label.
    expect(screen.getByText(/in the garage/i).nextElementSibling).toHaveTextContent('2');
    expect(screen.queryByTestId('ghost-vehicle-slot')).not.toBeInTheDocument();
    expect(screen.queryByText(/no vehicles yet/i)).not.toBeInTheDocument();
  });

  it('shows the empty state for no vehicles', () => {
    render(<GarageView vehicles={[]} loading={false} error={null} />);
    expect(screen.getByText(/no vehicles yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('ghost-vehicle-slot')).toBeInTheDocument();
    expect(screen.queryAllByTestId('vehicle-card')).toHaveLength(0);
    // The strip refuses to average or count recalls over nothing — §10.
    expect(screen.getByText(/in the garage/i).nextElementSibling).toHaveTextContent('0');
    expect(screen.getAllByText('not known')).toHaveLength(2);
  });

  it('shows the error, and not the empty state, when the query failed', () => {
    render(<GarageView vehicles={[]} loading={false} error="boom" />);
    expect(screen.getByText(/error loading vehicles/i)).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.queryByText(/no vehicles yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/in the garage/i)).not.toBeInTheDocument();
  });

  it('says it is loading rather than claiming an empty garage while the session lands', () => {
    render(<GarageView vehicles={[]} loading error={null} />);
    expect(screen.getByText(/loading your vehicles/i)).toBeInTheDocument();
    expect(screen.queryByText(/no vehicles yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/in the garage/i)).not.toBeInTheDocument();
  });
});

describe('SettingsView renders the profile it is handed and writes through the actions it is given', () => {
  it('shows the four groups and the initial values', () => {
    render(
      <SettingsView
        initial={{ displayName: 'Ada', distanceUnit: 'km', vehicleCount: 3, hasLiveSubscription: false }}
        actions={{
          updateProfile: async () => ({ success: true }),
          exportAccountData: async () => ({ success: false, error: 'no' }),
        }}
      />,
    );
    for (const heading of ['Profile', 'Preferences', 'Your data', 'Delete account']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByDisplayValue('Ada')).toBeInTheDocument();
    // The segmented control shows the unit and reads the word — "KM, kilometres".
    expect(screen.getByRole('radio', { name: /kilometres/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /miles/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('saves through the injected action with the current values, so the dev surface can be inert', async () => {
    const updateProfile = jest.fn(async () => ({ success: true }));
    const user = userEvent.setup();
    render(
      <SettingsView
        initial={{ displayName: 'Ada', distanceUnit: 'mi', vehicleCount: 0, hasLiveSubscription: false }}
        actions={{ updateProfile, exportAccountData: async () => ({ success: false }) }}
      />,
    );
    // Save is disabled until something changed — B7 — so the write must
    // follow a change, and a click on a disabled Save must not reach it.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /kilometres/i }));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(updateProfile).toHaveBeenCalledWith({ display_name: 'Ada', distance_unit: 'km' });
  });
});
