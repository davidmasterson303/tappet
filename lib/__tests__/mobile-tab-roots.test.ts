/**
 * Four tab roots, each with its own stack, and none of them can grow a chevron.
 *
 * @jest-environment node
 *
 * Locked iOS brief B8: *"Tab roots carry no back chevron"*. Until 11 Sep the
 * app had one native stack with a bar drawn over it, and every press `reset`
 * the stack to fake a root — drift §6.6 called it the one checklist line that
 * was a rebuild rather than a styling change. It is `@react-navigation/
 * bottom-tabs` now, and three things about that structure are easy to lose
 * without a symptom:
 *
 *   1. **`backBehavior="none"`.** With the default, `canGoBack()` answers *yes*
 *      on every tab but the first — back would mean "go to the first tab" —
 *      and `rootTitle`'s `headerShown: navigation.canGoBack()` would draw a
 *      header with a chevron on three roots, pointing sideways at the garage.
 *      Nothing errors. It reads as a design choice.
 *   2. **The order.** Garage, Service, Plan, Advisor is what the last graded
 *      round was judged against; the bar draws `state.routes` in the
 *      navigator's order, so a reorder here reorders the bar silently.
 *   3. **A stack per tab.** A tab whose component is a bare screen has no
 *      history and no `rootTitle` seam; pushing from it would fail loudly, but
 *      the tab would look fine until then.
 *
 * ── Why a source scan ───────────────────────────────────────────────────────
 *
 * Same reasoning as `mobile-account-reachable.test.ts`: no React Native
 * runtime on this side of the workspace, and what regressed is declarative —
 * a prop, an order, a component. A weaker check that runs beats a stronger one
 * that does not exist.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NAVIGATOR = join(
  __dirname,
  '..',
  '..',
  'apps',
  'mobile',
  'src',
  'navigation',
  'RootNavigator.tsx'
);

const ROOTS = ['GarageTab', 'ServiceTab', 'PlanTab', 'AdvisorTab'] as const;

/** The attribute blob of the first `<Tab.Navigator`, depth-counted to its `>`. */
function tabNavigatorAttributes(source: string): string {
  const at = source.indexOf('<Tab.Navigator');
  if (at === -1) return '';

  let depth = 0;
  for (let i = at; i < source.length; i += 1) {
    const character = source[i];
    if (character === '{' || character === '(') depth += 1;
    else if (character === '}' || character === ')') depth -= 1;
    else if (character === '>' && depth === 0) return source.slice(at, i);
  }

  return source.slice(at);
}

/** Every `<Tab.Screen name="…"` in the source, in order. */
function tabScreens(source: string): string[] {
  return Array.from(source.matchAll(/<Tab\.Screen name="([^"]+)"/g)).map((m) => m[1]);
}

/** Whether the tab navigator refuses to treat "back" as "first tab". */
function backIsNone(source: string): boolean {
  return /backBehavior="none"/.test(tabNavigatorAttributes(source));
}

const navigator = readFileSync(NAVIGATOR, 'utf8');

describe('B8 — the tab roots', () => {
  it('is a bottom-tab navigator, not a bar over one stack', () => {
    expect(navigator).toContain("from '@react-navigation/bottom-tabs'");
    expect(navigator).toContain('createBottomTabNavigator');
    expect(tabNavigatorAttributes(navigator).length).toBeGreaterThan(0);
  });

  it('registers the four roots, in the order the bar draws them', () => {
    expect(tabScreens(navigator)).toEqual([...ROOTS]);
  });

  it('never treats back as "first tab", so a root cannot grow a chevron', () => {
    expect(backIsNone(navigator)).toBe(true);
  });

  it('gives each tab its own stack', () => {
    /*
      Each root's stack names its own initial route. Asserted by initial route
      rather than by counting `<Stack.Navigator`, so a fifth stack somewhere
      else cannot stand in for a missing one here.
    */
    for (const root of ['Garage', 'Service', 'Plan', 'Advisor']) {
      expect(navigator).toContain(`<Stack.Navigator initialRouteName="${root}"`);
    }
  });

  it('lets a root and its pushed twin share one screen through rootTitle', () => {
    /*
      `Service`, `Plan` and `Advisor` are each a tab root and a pushed screen.
      `rootTitle` is the seam that tells them apart (`headerShown` follows
      `canGoBack()`); a literal `headerShown: false` on one of them would strip
      the pushed instance's back control, and a literal `true` would put a
      chevron-less header band on the root.
    */
    for (const root of ['SERVICE', 'PLAN', 'ADVISOR']) {
      expect(navigator).toContain(`options={rootTitle('${root}')}`);
    }
    expect(navigator).toMatch(/headerShown: navigation\.canGoBack\(\)/);
  });

  it('can still detect the default back behaviour', () => {
    /*
      Rule 5's other half: the detector against the two shapes that would
      quietly put a chevron on a root — the prop missing, and the prop set to
      the library default by name.
    */
    const missing = `<Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>`;
    const explicit = `<Tab.Navigator backBehavior="firstRoute" screenOptions={{ headerShown: false }}>`;

    expect(backIsNone(missing)).toBe(false);
    expect(backIsNone(explicit)).toBe(false);
    expect(backIsNone(`<Tab.Navigator backBehavior="none" tabBar={(p) => <TabBar {...p} />}>`)).toBe(
      true
    );
  });

  it('can still detect a reorder', () => {
    const swapped = `
      <Tab.Screen name="GarageTab">{() => <GarageStack />}</Tab.Screen>
      <Tab.Screen name="AdvisorTab">{() => <AdvisorStack />}</Tab.Screen>
      <Tab.Screen name="ServiceTab">{() => <ServiceStack />}</Tab.Screen>
      <Tab.Screen name="PlanTab">{() => <PlanStack />}</Tab.Screen>
    `;

    expect(tabScreens(swapped)).not.toEqual([...ROOTS]);
    expect(tabScreens(swapped)).toHaveLength(4);
  });
});

/**
 * ── B1 / B8 · one back control, on every screen that has one ────────────────
 *
 * 12 Sep. The vehicle screen has always drawn its own way back — a hairline
 * chevron and a `monoNav` label — because its header is hidden under the
 * hero. Every screen pushed *from* it used native-stack's default button:
 * UIKit's heavy chevron, and a label that `headerBackTitleStyle` could put in
 * the mono face but never in caps, because the native label ignores
 * `textTransform`. The first graded frame of a pushed screen read the seam at
 * once. `screenOptions.headerLeft` now renders `BackControl` on every pushed
 * screen, and the vehicle screen renders the same component, so the way back
 * is one file.
 *
 * Source scan, for the reason the block above gives: what regresses is a
 * property on an options object, and it regresses silently — native-stack
 * simply draws its own button again.
 */
const VEHICLE_SCREEN = join(
  __dirname,
  '..',
  '..',
  'apps',
  'mobile',
  'src',
  'screens',
  'VehicleDetailScreen.tsx'
);

/** The `screenOptions = { … } as const` block, brace-counted. */
function screenOptionsBlock(source: string): string {
  const at = source.indexOf('const screenOptions = {');
  if (at === -1) return '';
  let depth = 0;
  for (let i = source.indexOf('{', at); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return source.slice(at);
}

/** Whether every pushed screen's header renders the app's own back control. */
function pushedScreensDrawBackControl(source: string): boolean {
  const options = screenOptionsBlock(source);
  if (!/headerLeft:/.test(options)) return false;
  // The option hands off to a component; that component must render BackControl.
  const renderer = /headerLeft:[^]*?<(\w+)\b/.exec(options)?.[1];
  if (!renderer) return false;
  if (renderer === 'BackControl') return true;
  const start = source.indexOf(`function ${renderer}(`);
  if (start === -1) return false;
  const definition = source.slice(start);
  return /<BackControl\b/.test(definition.slice(0, definition.indexOf('\n}')));
}

describe('B1 / B8 — the way back is one control', () => {
  const vehicleScreen = readFileSync(VEHICLE_SCREEN, 'utf8');

  it('hands every pushed screen the app’s back control, not UIKit’s', () => {
    expect(pushedScreensDrawBackControl(navigator)).toBe(true);
    expect(navigator).toMatch(/import BackControl from '\.\.\/components\/BackControl'/);
  });

  it('draws the same control on the vehicle screen’s own nav', () => {
    // The screen with the hidden header is the one that started the seam; it
    // must not keep a private copy of the chevron and the label.
    expect(vehicleScreen).toMatch(/import BackControl from '\.\.\/components\/BackControl'/);
    expect(vehicleScreen).toMatch(/<BackControl\b[^>]*label="Garage"/);
    expect(vehicleScreen).not.toMatch(/<Icon name="chevron-left"/);
  });

  it('can still detect the native button coming back', () => {
    // Anti-vacuous: the two shapes that regress silently — the option gone,
    // and the option present but rendering something else.
    const without = navigator.replace(/\n\s*headerLeft:[^\n]*\n[^\n]*\n/, '\n');
    expect(without).not.toBe(navigator);
    expect(pushedScreensDrawBackControl(without)).toBe(false);

    const other = navigator.replace('<HeaderBack label=', '<Text>{');
    expect(other).not.toBe(navigator);
    expect(pushedScreensDrawBackControl(other)).toBe(false);
  });
});
