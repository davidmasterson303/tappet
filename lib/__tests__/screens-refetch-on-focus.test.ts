/**
 * A write behind a screen is visible when you come back to it.
 *
 * @jest-environment node
 *
 * ── ⚠ MOB-09 ───────────────────────────────────────────────────────────────
 *
 * Nothing in the app refetched on focus. Every screen loaded once on mount and
 * kept whatever it had, so **every write was invisible on the screen behind
 * it**: adding to the wishlist, marking a recall repaired, confirming an
 * odometer, scanning an invoice — each succeeded and then returned to a screen
 * that said it had not.
 *
 * `RootNavigator`'s own comment described a behaviour the app did not have:
 * *"the list behind this refetches on focus, so adding does not pop back."*
 *
 * ── Why a source scan ───────────────────────────────────────────────────────
 *
 * The behaviour needs a real navigator and a real focus event, and these
 * screens are deliberately mounted directly in their own suites — the
 * prop-injection seam exists so they can be. What regressed is structural: a
 * screen that loads on mount and does not subscribe to focus. That is on disk.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * Screens whose content can be changed from somewhere else in the app.
 *
 * ⚠ Not every screen: `SignInScreen`, `PaywallScreen` and `AddVehicleScreen`
 * have nothing behind them to go stale, and subscribing them to focus would be
 * a request per navigation for no reason. This list is the set where a **write
 * elsewhere changes what is rendered here**.
 */
const MUST_REFETCH = [
  // 20 Sep: the garage is the tab root, and a car added on the phone was
  // missing from it until the app was killed — ADD CAR replaces itself with
  // the detail screen and the list never re-read. The one screen MOB-09 left out.
  'GarageScreen',
  'VehicleDetailScreen',
  // 20 Sep: ADDED was a local set, so a service marked done elsewhere still
  // read ADDED here. Now derived from the plan on every load, and refetched.
  'ServiceMilestoneScreen',
  'WishlistScreen',
  'ServiceHistoryScreen',
  'RecallDetailScreen',
  'HealthScreen',
  'BuildScreen',
  // 20 Sep: the tire set — three forms write behind it and each goes back on save.
  'TiresScreen',
];

describe('screens whose data can change while they are backgrounded', () => {
  it.each(MUST_REFETCH)('%s refetches when it comes back into view', (screen) => {
    const source = readFileSync(join(SCREENS, `${screen}.tsx`), 'utf8');

    expect(source).toMatch(/useRefetchOnFocus\(/);
  });

  it('each one still loads on mount, so the hook is an addition not a swap', () => {
    /*
      The anti-vacuous half. A screen that dropped its mount effect and relied
      on focus alone would pass the check above and would render empty on a cold
      open — the focus listener is added *after* the first focus has already
      happened.
    */
    for (const screen of MUST_REFETCH) {
      const source = readFileSync(join(SCREENS, `${screen}.tsx`), 'utf8');

      expect([screen, /useEffect\(\(\) => \{\s*void load\(\);/.test(source)]).toEqual([
        screen,
        true,
      ]);
    }
  });

  it.each(MUST_REFETCH)('%s honours the quiet mode — no loading state on a focus refetch', (screen) => {
    /*
      ── ⚠ 20 Sep · a spinner on every back-navigation ─────────────────────

      `reload()` with no arguments was the *opening* load on every screen in
      the list: the content vanished behind the wait dial for a request the
      screen did not need to show — "OPENING THE GARAGE" for ~0.7 s on a
      10 Hz burst, and the same on six other screens since MOB-09. The rule
      lives in the hook (`reload(false, true)`, asserted above); this holds
      each loader to honouring it, from the loader's own body: a `quiet`
      parameter that nothing consults would pass a signature check and
      still flash.
    */
    const source = strip(readFileSync(join(SCREENS, `${screen}.tsx`), 'utf8'));
    const start = source.indexOf('const load = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const loader = source.slice(start, start + 2500);
    expect(loader).toMatch(/quiet = false/);
    const gate = loader.search(/if \(quiet(?: \|\| lean)?\)|if \(!quiet/);
    const loading = loader.search(/(kind|status): 'loading'/);
    expect([screen, gate > -1]).toEqual([screen, true]);
    expect([screen, loading > -1 && gate < loading]).toEqual([screen, true]);
  });

  it('can still detect the loader that shipped, so the quiet check is not vacuous', () => {
    const shipped = strip(`
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setState({ kind: 'loading' });
      try { await apiRequest('/x'); } catch (e) { setState({ kind: 'error' }); }
    },
    []
  );`);
    const loader = shipped.slice(shipped.indexOf('const load = useCallback('));
    expect(loader).not.toMatch(/quiet = false/);
    expect(loader.search(/if \(quiet(?: \|\| lean)?\)|if \(!quiet/)).toBe(-1);
  });

  it('the hook does not crash a screen rendered outside a navigator', () => {
    /*
      ⚠ `useFocusEffect` calls `useNavigation`, which **throws** outside a
      navigator. Every screen suite here mounts its screen directly — that is
      what the prop-injection seam is for — so the obvious implementation would
      have meant wrapping twenty-six suites in a `NavigationContainer` to test a
      refetch none of them are about.

      Reading `NavigationContext` returns `undefined` instead, and the
      subscription is simply not made.
    */
    const hook = readFileSync(
      join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'navigation', 'useRefetchOnFocus.ts'),
      'utf8'
    );

    expect(hook).toMatch(/useContext\(NavigationContext\)/);
    expect(hook).toMatch(/if \(!enabled \|\| !navigation\) return;/);

    /*
      ⚠ Asserted against the **code**, not the whole file: the docblock above
      names `useFocusEffect` twice while explaining why it is not used, and a
      naive `not.toMatch` over the source is satisfied by its own documentation
      — which is `.tap-target-44` matching a comment six hundred lines above the
      rule.
    */
    const code = hook
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
      .join('\n');

    expect(code).not.toMatch(/useFocusEffect/);
  });

  it('the hook calls the loader with no arguments, not with the focus event', () => {
    /*
      ⚠ Every caller's `load` is `load(isRefresh = false)`. A listener receives
      the focus event, so `addListener('focus', reload)` runs every return to a
      tab as a pull-to-refresh — and a refresh that begins and ends in one
      frame leaves iOS's refresh control inset behind with no spinner in it, a
      60pt void under the rail that appeared on the second visit only. Found
      11 Sep from the screenshots, four rounds after it shipped.
    */
    const hook = readFileSync(
      join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'navigation', 'useRefetchOnFocus.ts'),
      'utf8'
    );
    const code = hook
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
      .join('\n');

    // Since 20 Sep the arrow passes the loader's *quiet* mode — see the case
    // below — but the point here holds: never the event, never a pull.
    expect(code).toMatch(/addListener\('focus', \(\) => reload\(false, true\)\)/);
    expect(code).not.toMatch(/addListener\('focus', reload\)/);
    expect(code).not.toMatch(/reload\(true/);

    /* The anti-vacuous half: the pattern that is banned really is a pattern this reader sees. */
    expect("navigation.addListener('focus', reload)").toMatch(/addListener\('focus', reload\)/);
  });
});
