import DevSettings from './DevSettings';

/**
 * `/dev/settings` — account settings, renderable without a session.
 *
 * Same reason and same gate as `/dev/garage`: the design-critic loop cannot
 * sign in, `app/dev/layout.tsx` keeps this out of production, and the view is
 * the product's own `SettingsView` so what is graded is what ships.
 */
export default function DevSettingsPage() {
  return <DevSettings />;
}
