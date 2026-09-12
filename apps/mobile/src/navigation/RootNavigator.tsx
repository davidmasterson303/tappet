import { Fragment, useCallback, useEffect, useState, type ReactElement } from 'react';
import { Linking } from 'react-native';
import {
  NavigationContainer,
  getFocusedRouteNameFromRoute,
  useNavigation,
  useNavigationContainerRef,
  type LinkingOptions,
  type NavigationState,
  type NavigatorScreenParams,
  type PartialState,
  type PathConfig,
  type PathConfigMap,
  type RouteProp,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import {
  configureNotificationHandler,
  initialNotificationUrl,
  subscribeToNotificationTaps,
} from '../notifications/push';
import { currentPushPermission, registerForPush } from '../notifications/register';
import { shouldRegisterSilently } from '@tappet/core/push-priming';

import { AdvisorScreen } from '../screens/AdvisorScreen';
import { HealthScreen } from '../screens/HealthScreen';
import { InvoiceScanScreen } from '../screens/InvoiceScanScreen';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';
import type { ServiceVisit } from '@tappet/core/service-record';
import { WishlistAddScreen } from '../screens/WishlistAddScreen';
import { pickInvoiceImage, pickVehiclePhoto } from '../media/pick-image';
import { GarageScreen } from '../screens/GarageScreen';
import { AddVehicleScreen } from '../screens/AddVehicleScreen';
import { VehicleDetailScreen } from '../screens/VehicleDetailScreen';
import { AccountScreen } from '../screens/AccountScreen';
import AccountControl from './AccountControl';
import BackControl from '../components/BackControl';
import ChooseACar from '../components/ChooseACar';
import { rememberVehicle } from './last-vehicle';
import TabBar from './TabBar';
import { PlanScreen, type PlanSegment } from '../screens/PlanScreen';
import { ServiceScreen, type ServiceSegment } from '../screens/ServiceScreen';
import { VehicleProfileScreen } from '../screens/VehicleProfileScreen';
import { surface, text, type } from '../theme';

/**
 * The signed-in navigation. Phase 3 task 3.5, pulled forward; rebuilt 11 Sep.
 *
 * ── Why this exists before the screens that need it ─────────────────────────
 *
 * The plan sizes navigation at 0.5 ed and puts it last, which reads as polish.
 * It is not: the garage rows were not tappable and there was nowhere to tap
 * *to*, so 3.2 has been half-built — a list with no detail — and 3.3 and 3.4
 * are a camera flow and a conversation thread, both of which need push and
 * back. Ad-hoc booleans were fine for one modal and are not a stack.
 *
 * The timing is the other half. `react-native-screens` and
 * `react-native-safe-area-context` are **native** modules, so they have to be
 * present when the app is compiled. Adding navigation after the first EAS
 * build would cost a second build out of a monthly allowance of fifteen.
 *
 * ── ⚠ 11 Sep · B8: four tab roots, each with its own stack ──────────────────
 *
 * Locked brief B8: *"Tab roots carry no back chevron"*, and the studio
 * paragraph: *"Four tab roots, none with a back chevron; the dossier stack
 * (Garage → Vehicle → Health/Service/Plan) lives in the first tab."*
 *
 * Until today this was **one** native stack with a hand-drawn bar over it, and
 * every tab press `reset` the whole stack — drift §6.6 recorded it as the one
 * checklist line that was a navigation rebuild rather than a styling change.
 * The tree is now:
 *
 *     NavigationContainer
 *     └─ Stack (root)            Tabs · Account
 *        └─ Tabs                 GarageTab · ServiceTab · PlanTab · AdvisorTab
 *           ├─ Stack (garage)    Garage → VehicleDetail → Health / Service / Plan / …
 *           ├─ Stack (service)   Service → InvoiceScan / InvoiceDetail
 *           ├─ Stack (plan)      Plan → WishlistAdd / Advisor
 *           └─ Stack (advisor)   Advisor
 *
 * Each tab owns its history — leave the car for Service and come back, and you
 * are still on the car — and a root cannot grow a chevron, because there is
 * nothing beneath it to point at. `backBehavior="none"` on the tabs is what
 * keeps that literal: with the default, `canGoBack()` on any tab but the first
 * answers *yes* (back would mean "first tab"), and `rootTitle` would put a
 * header on three roots pointing sideways at the garage.
 *
 * ⚠ **One `Stack` factory serves every native stack.** The five navigators
 * share `RootStackParamList`, so a screen can name any destination and React
 * Navigation resolves it upward — `Service` pushes in the dossier when the hub
 * asks and lives at its own root when the tab does. The cost is that the type
 * does not say which stack registers which screen; the linking config below
 * and `mobile-back-labels.test.ts` do.
 *
 * ── ⚠ The account is pushed *over* the tabs, and its way in is outside them ─
 *
 * `Account` is a route on the root stack: it covers the tab bar, carries a
 * native header whose back label names the tab it was opened from, and is
 * reached from `AccountControl` — still a sibling of the navigator, still
 * outside every screen, because App Store 5.1.1(v) and
 * `mobile-account-reachable.test.ts` both depend on no screen's early return
 * being able to take it away. See that file's docblock for the history.
 *
 * ── Why the screens do not import this file ─────────────────────────────────
 *
 * `GarageScreen` takes an `onOpenVehicle` callback rather than a `navigation`
 * prop, and `VehicleDetailScreen` takes `vehicleId` and `onBack`. So neither
 * knows react-navigation exists: they stay ordinary components that can be
 * rendered and reasoned about on their own, and swapping the navigator later
 * touches this file only. Today was that swap, and it touched this file, the
 * bar and the tests that read them.
 *
 * ── The token is not a route param, and that is not an oversight ────────────
 *
 * `apiRequest` fetches the live session per call, so no screen needs a token
 * passed to it. Navigation params are serialisable state — they show up in
 * devtools and in any persisted navigation state — which makes them the wrong
 * place for a credential even when it would be convenient. Only `vehicleId`
 * and a title travel, and neither is a secret.
 */

/**
 * The screens the tab stacks register between them.
 *
 * ⚠ Kept free of `Tabs` on purpose. `TabParamList` nests this list and
 * `RootStackParamList` nests `TabParamList`; a `Tabs` entry here would close
 * that loop and TypeScript refuses a param list that references itself
 * through `NavigatorScreenParams`. The root's own list adds it below.
 */
type DossierScreens = {
  Garage: undefined;
  /*
    8 Aug, mobile-first. There was no way to add a car on the phone — the garage
    empty state told people to go and use the web app. Deliberately not
    deep-linkable: a URL that opens a form which creates a row is a URL that can
    be put in front of someone who did not mean to.
  */
  AddVehicle: undefined;
  /*
    `title` is optional because a deep link cannot supply one — see `linking`
    below. It stays a param rather than being dropped: a tap from the garage
    already knows the car's name, and passing it means the header is correct
    during the fetch instead of appearing a second later. A link falls back.
  */
  VehicleDetail: { vehicleId: string; title?: string };
  /*
    3.4. The advisor answers about *one* car — `/api/v1/consultant` requires a
    `vehicleId` and authorizes against it — so there is no sensible advisor
    route without a vehicle already chosen.

    `title` travels for the same reason it does above: the header should name
    the car during the first request rather than after it. Neither param is a
    secret; the token still is not one, and still is not here.

    `ask` lets a link arrive with a question already in hand.

    Product, not scaffolding: the recall notification this app sends says "Tap
    to ask the advisor what it means", and until now tapping it opened an empty
    composer and left the person to retype the question the notification had
    just posed. A push that promises an answer should deliver the question.

    It also removes a real testing blocker — the advisor was the one flow that
    could not be exercised without a human typing, and synthetic keystrokes do
    not reach a React Native `TextInput`.

    ⚠ 11 Sep: the advisor is a tab root *and* a pushed screen. A question that
    arrives with the screen (`ask`) is asked once per mount, so a recall's "ask
    the advisor" pushes a fresh instance onto the stack it came from rather than
    switching to a tab whose thread may already be open and would swallow the
    question in silence. The bare "Ask the advisor" from the car's hub, with no
    question in hand, switches to the tab — that is the conversation.
  */
  Advisor: { vehicleId: string; title?: string; ask?: string };
  /*
    3.3. Linked from the vehicle detail screen since 5 Aug, once build
    `29b4d76f` put `expo-image-picker` in the binary. Held back until then on
    purpose: a visible "Scan an invoice" button that cannot open a camera is
    worse than no button, and the screen was reachable by deep link in the
    meantime so it could still be rendered and reviewed.
  */
  InvoiceScan: { vehicleId: string; title?: string };
  /*
    ── 30 Aug · the visit behind a line item ─────────────────────────────────

    Pushed from a row in `Service → History`: the whole visit, its other lines,
    and — when it came off a scan — the document itself.

    ⚠ Takes the visit rather than an id. The history screen already holds every
    line, so refetching would be a second request for data on the device and a
    chance for two screens to disagree about one invoice. The cost is stated
    where it lands: this route cannot be opened cold, so it is **not a
    deep-link target** and has no entry in `linking.screens` below.
  */
  InvoiceDetail: { visit: ServiceVisit; vehicleId: string; title?: string };
  /*
    ⚠ **R16: this route renders `HealthScreen`.** It is kept as a name because
    shipped notifications carry `tappet://vehicle/<id>/recalls`, and a link
    an installed build already sends has to keep resolving.

    What it no longer is, is a destination. Recalls drive the score, the garage
    bay banners the count and the hub banners the worst one — a top-level screen
    for two items already surfaced twice was a third path to the same content,
    and it put the cause a navigation away from the effect. `HealthScreen` shows
    them under the dial they move.
  */
  RecallDetail: { vehicleId: string; title?: string };
  /**
   * ── R15 · Plan — needs and mods, one destination ──────────────────────────
   *
   * Replaces `Wishlist` and `Build`, which were two hub rows answering one
   * question. `PlanScreen` carries the argument; the short version is that a
   * charge pipe is both a known failure and the first mod anyone fits, and two
   * lists made the owner file it before they could find it.
   */
  Plan: { vehicleId: string; title?: string; segment?: PlanSegment };
  /**
   * ── R14 · Service — what is due, and what has been done ───────────────────
   *
   * Replaces `ServiceMilestone` and `ServiceHistory`. The path stays
   * `vehicle/:vehicleId/service` because that is what shipped service-due
   * notifications carry.
   */
  Service: { vehicleId: string; title?: string; segment?: ServiceSegment };
  /*
    ── 23 Aug: two instruments became two destinations ──────────────────────

    Both were cards on `VehicleDetailScreen`, and between them they were most of
    why David's read of that screen was *"unclear, cluttered, uninspired and
    confusing"*. The design system's native vehicle spec is **"a hub, not
    tabs"**: the vehicle screen names a car and lists places to go, and every
    section is a real pushed route with the platform's own back gesture.
  */
  Health: { vehicleId: string; title?: string };
  /**
   * The account, a **route** since 23 Aug (R13) and a root-stack route since
   * 11 Sep.
   *
   * ⚠ It was a modal owned by `GarageScreen`, which made "account deletion is
   * one tap from the garage" a thing somebody had to remember to render on
   * every return path — `mobile-account-reachable.test.ts` exists because that
   * was got wrong once already. As a route reached from a control outside every
   * screen, App Store 5.1.1(v) is satisfied structurally rather than by
   * vigilance.
   */
  Account: undefined;
  /*
    The wishlist's catalogue — `native-wishlist.spec.html` puts Add in the nav
    bar, and a nav-bar `+` implies a destination rather than a sheet. The
    content earns one: a filter field, a scrolling list of everything the
    research found, and two controls per row do not belong stacked above the
    list they add to.

    ⚠ Not deep-linkable, for the same reason `AddVehicle` is not: a URL that
    opens a form which writes rows is a URL that can be put in front of someone
    who did not mean to open it.
  */
  WishlistAdd: { vehicleId: string; title?: string };
  /*
    The owner's four onboarding answers, editable. Not deep-linkable for the
    same reason `AddVehicle` is not: a URL that opens a form which writes rows
    is a URL that can be put in front of someone who did not mean to open it.
  */
  VehicleProfile: { vehicleId: string; title?: string };
};

/**
 * The four tabs. Each holds a native stack registered from `DossierScreens`;
 * the params are the nested `{ screen, params }` form a tab press or a deep link
 * hands down. `tab-target.ts` carries the order and the argument for it.
 */
export type TabParamList = {
  GarageTab: NavigatorScreenParams<DossierScreens> | undefined;
  ServiceTab: NavigatorScreenParams<DossierScreens> | undefined;
  PlanTab: NavigatorScreenParams<DossierScreens> | undefined;
  AdvisorTab: NavigatorScreenParams<DossierScreens> | undefined;
};

/**
 * Every name a native stack in this tree can be asked for.
 *
 * One list for the root stack and the four tab stacks, so a screen can name
 * any destination — `Tabs` included, which is how a dossier screen switches to
 * the Advisor tab — and React Navigation resolves it upward.
 */
export type RootStackParamList = DossierScreens & {
  /** The tab navigator, as the root stack's first route. */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

type StackNavigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Deep links into a specific car, and into its advisor.
 *
 * ── Why this exists, stated honestly ────────────────────────────────────────
 *
 * The immediate reason is verification. This project's most expensive recurring
 * failure is a screen that typechecks, bundles, passes every test and **has
 * never been rendered** — the 4 Aug handoff records three of those in one day,
 * and both of these screens were written before anything could open them. A
 * stack you can only reach by tapping is a stack that only gets exercised when
 * someone is holding the phone.
 *
 * With this, `xcrun simctl openurl booted "tappet://vehicle/<id>/advisor"`
 * opens the screen directly, so it can be looked at in the state that matters
 * without a session, a garage row and two taps standing in front of it.
 *
 * It is also ordinary product functionality rather than test scaffolding, which
 * is the reason it is wired here rather than hacked in behind `__DEV__`: the
 * scheme is already declared in `app.json`, push notifications and emailed
 * links both land on exactly these routes, and the alternative — a temporary
 * `initialRouteName` edited in and out whenever something needs looking at —
 * is throwaway work that leaves nothing behind.
 *
 * ── ⚠ 11 Sep · the config is a tree, because the navigators are ─────────────
 *
 * A path now names a tab as well as a screen: `vehicle/:vehicleId/service`
 * opens the Service *tab* at its root, not a Service pushed onto the garage,
 * so a notification lands where the bar would have taken you. The dossier's
 * pushed screens — a car, its health, its recalls, the scan — stay under the
 * Garage tab, which is the stack the brief gives them.
 *
 * ── ⚠ MOB-07 · a cold-start notification tap trapped the user ───────────────
 *
 * Without an `initialRouteName`, a link opened from a **cold start** produces a
 * stack with **exactly one route**: no back button, the edge-swipe gesture does
 * nothing, `goBack()` is a no-op. The only way out was force-quitting the app.
 * That is the flagship path — a recall notification says *"Tap to see what it
 * means"*, and this product delivered its first real ones on 16 Aug.
 *
 * Two of them now, one per level, and each does one job:
 *
 *   - `initialRouteName: 'Tabs'` on the root stack, so `tappet://account` opens
 *     over the tabs rather than as the only screen in the app.
 *   - `initialRouteName: 'Garage'` on the **garage stack's** config, so a link
 *     to a car or its recalls seeds the garage underneath, and the back button
 *     and the gesture both land somewhere that makes sense.
 *
 * ⚠ The second one has to be inside `GarageTab`. At the root it would name a
 * route the root stack does not have, type-check anyway, and seed nothing —
 * `mobile-push-routing.test.ts` pins it to the object that registers
 * `vehicle/:vehicleId`. The tab roots need none: a tab's root has the bar
 * under it, which is a way out.
 *
 * ── What is deliberately not linkable ───────────────────────────────────────
 *
 * The forms — `AddVehicle`, `WishlistAdd`, `VehicleProfile` — and the visit
 * behind a line, which cannot be opened cold. Each says why at its param.
 *
 * ── The dev client owns one path and it is not one of these ─────────────────
 *
 * `expo-dev-client` answers `tappet://expo-development-client/?url=…`, which
 * is how the simulator build is pointed at Metro. Nothing here claims that
 * path, and the two coexist because the prefix is shared but the host is not.
 *
 * ── A link cannot carry a title, and must not ───────────────────────────────
 *
 * `title` is a convenience the garage row supplies because it has already drawn
 * the car's name. A URL knows only the id, so every screen falls back rather
 * than rendering "undefined" in the header. Putting the name in the URL would
 * be worse than a fallback: it is the car's identity in a string anything can
 * log, and the server is going to send the real one back within the second.
 */
/**
 * The garage tab's links: the dossier — a car, and what hangs off it.
 *
 * ⚠ Typed on its own line, and there is a reason it is not inline. TypeScript
 * 6 cannot infer a nested navigator's param list through `NavigatorScreenParams`
 * (a conditional mapped type), so inside `PathConfigMap<TabParamList>` every
 * tab resolves to `PathConfig<{}>` — a shape with **no** legal `initialRouteName`
 * and no checked screen names. Declared against `DossierScreens` here, the
 * route names and the initial route are checked; the single cast where the
 * four are inserted below bridges only the inference gap.
 */
const garageLinks: PathConfig<DossierScreens> = {
  initialRouteName: 'Garage',
  screens: {
    Garage: 'garage',
    VehicleDetail: 'vehicle/:vehicleId',
    InvoiceScan: 'vehicle/:vehicleId/scan',
    /*
      ⚠ Kept, and it renders `HealthScreen` — see the route's own note.
      Installed builds send this path in recall notifications.
    */
    RecallDetail: 'vehicle/:vehicleId/recalls',
    Health: 'vehicle/:vehicleId/health',
  },
};

/* Kept: service-due notifications send this path. */
const serviceLinks: PathConfig<DossierScreens> = {
  screens: { Service: 'vehicle/:vehicleId/service' },
};

const planLinks: PathConfig<DossierScreens> = {
  screens: { Plan: 'vehicle/:vehicleId/plan' },
};

const advisorLinks: PathConfig<DossierScreens> = {
  screens: { Advisor: 'vehicle/:vehicleId/advisor' },
};

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tappet://'],
  config: {
    initialRouteName: 'Tabs',
    screens: {
      Tabs: {
        screens: {
          GarageTab: garageLinks,
          ServiceTab: serviceLinks,
          PlanTab: planLinks,
          AdvisorTab: advisorLinks,
        } as PathConfigMap<TabParamList>,
      },
      Account: 'account',
    },
  },

  /*
    ── Phase 5: a tapped notification is a deep link ──────────────────────────

    Both overrides exist so push routing reuses the table above rather than
    growing a second one. A route added to `screens` is reachable from a
    notification without anyone remembering a mapping — the same argument as
    the shared core modules, applied to navigation.

    `getInitialURL` covers the **cold start**, which is the journey that gets
    missed: an app opened *by* the tap has no `Linking` url, because it was not
    opened by a link. Omitting this is the classic push bug — alerts route
    perfectly while backgrounded and do nothing at all from cold.

    The link is checked first. If both are present the user arrived by link
    and that is the more recent intent.
  */
  async getInitialURL() {
    return (await Linking.getInitialURL()) ?? (await initialNotificationUrl());
  },

  subscribe(listener) {
    const link = Linking.addEventListener('url', ({ url }) => listener(url));
    const tap = subscribeToNotificationTaps(listener);

    return () => {
      link.remove();
      tap();
    };
  },
};

/*
  ── ⚠ 6 Sep · B1 and B8: the nav bar stopped being Apple's ──────────────────

  This was four lines that set colours and left every other decision to UIKit,
  which meant six of the app's seven screens opened on a **centred, system-sans
  title** — the single most repeated off-system element in the product, and the
  thing that made every screen after the garage read as a stock iOS app.

  B8: *"condensed large titles collapse to mono"*. B1: *"mono for every value,
  date, index, state and tab label"* — a nav title is the collapsed form of a
  screen's name, so it takes the mono the brief gives the collapsed state.

  ⚠ **`headerTitleAlign: 'left'` does nothing on iOS**, and this note used to
  claim the opposite. native-stack's own types say it: *"Not supported on iOS.
  It's always `center` on iOS and cannot be changed."* UIKit centres a nav
  title, so a pushed screen's mono title sits centred over a left-aligned
  screen — the seam the critique kept finding. The roots escape it by hiding
  the header and drawing their own title (`RootScreen`); a left-aligned title
  on a *pushed* screen would need a custom `headerLeft` carrying the title
  beside the back control, which is a bigger change than this option and is
  not made here. The option stays for the day the app has an Android build.

  ⚠ **The caps are in the `title` strings, not here.** `headerTitleStyle` is
  handed to a native `UILabel`, which honours `fontFamily`, `fontSize`,
  `fontWeight` and `color` and silently ignores `textTransform` — so writing the
  transform here would have produced sentence-case titles with no error and no
  symptom, which is the §6 shape exactly. Each `title` below is written in caps
  instead.
*/
/**
 * ── ⚠ 6 Sep · B8: a tab root's header, and why it is conditional ────────────
 *
 * B8 asks for *"a left-aligned 34pt condensed-grotesk caps title that collapses
 * on scroll into a mono caps nav title"* and for roots to carry no back chevron.
 *
 * **`headerShown` follows `canGoBack()`** because `Service` and `Plan` are each
 * a root (their tab opens on them) and a pushed screen (the car's hub pushes
 * them), so this cannot be a static choice. `canGoBack()` asks exactly the
 * right question: the pushed instance keeps its header and its back control,
 * the root instance gets the clean top edge the garage always had — and draws
 * its own title through `RootScreen`, which collapses it into the mono form.
 *
 * ⚠ **11 Sep: the header's title is no longer blanked.** It was, because the
 * screen drew the condensed name in its body and two names on one screen is a
 * regression the critique named. Now `ScreenTitle` and `RootScreen` draw
 * nothing when a header is present, so the pushed instance reads like every
 * other pushed screen — the mono nav title, in the header, with the back label
 * beside it — and the root instance owns its large title. One name each way.
 *
 * ⚠ **`title` stays set even when the header is hidden.** It is what the *next*
 * screen's back button reads; hiding a header does not remove that, it only
 * removes the value it would have used — which is how six screens once read
 * "‹ VehicleDetail".
 */
const rootTitle =
  (title: string) =>
  ({ navigation }: { navigation: { canGoBack: () => boolean } }) => ({
    title,
    headerShown: navigation.canGoBack(),
  });

const screenOptions = {
  headerStyle: { backgroundColor: surface.page },
  headerTintColor: text.primary,
  headerTitleAlign: 'left' as const,
  headerTitleStyle: {
    color: text.primary,
    fontFamily: type.monoNav.fontFamily,
    fontSize: type.monoNav.fontSize,
    letterSpacing: type.monoNav.letterSpacing,
  },
  /*
    ── ⚠ 6 Sep · B1: the back label speaks the same language as the title ─────

    `VehicleDetailScreen` draws its own back control — mono caps "‹ GARAGE" with
    a hairline chevron — while every native-stack push used the platform default:
    a heavy chevron and a sentence-case sans label. The critique found both in
    one stack and called it "two back affordances", which is what it was.

    `headerBackTitleStyle` put the label in the mono nav face, and the chevron
    stayed native, on the reasoning that a hairline chevron per screen was a
    bigger change than one line.

    ── ⚠ 12 Sep · B1 and B8: the chevron follows the label ────────────────────

    It was the bigger change, and it was still the gap: with the first frame
    of a screen pushed *from* the car in front of it, the critique read a thin
    "‹ GARAGE" on Vehicle and a heavy system chevron with "BMW M235i" in mixed
    case on Health — the native label cannot be capitalised, because the
    `UILabel` it becomes ignores `textTransform`. `headerLeft` replaces the
    native button (native-stack hides its own when one is given) with the
    component the vehicle screen already draws, so both screens read one
    control from one file. `label` is the previous screen's `title`, exactly
    what the native button would have shown; `BackControl` sets it in
    `monoNav`, whose uppercase is honoured by a JS `Text`.

    `headerBackTitleStyle` stays: it is what the interactive-pop gesture's
    in-flight label and any screen that opts back into `headerBackVisible`
    would draw, and it should still speak mono.
  */
  headerBackTitleStyle: {
    fontFamily: type.monoNav.fontFamily,
    fontSize: type.monoNav.fontSize,
    letterSpacing: type.monoNav.letterSpacing,
  },
  headerLeft: ({ canGoBack, label }: { canGoBack?: boolean; label?: string }) =>
    canGoBack ? <HeaderBack label={label ?? 'Back'} /> : null,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: surface.page },
} as const;

/**
 * The pushed screens' back control, bound to the stack it sits in.
 *
 * A component rather than an inline closure so `useNavigation` can find the
 * screen's own navigator: `headerLeft` renders inside the screen's navigation
 * context, and `goBack()` from there pops this stack — the tab's, or the root
 * stack's for Account — which is the same pop the native button performed.
 */
function HeaderBack({ label }: { label: string }) {
  const navigation = useNavigation();
  return <BackControl label={label} onPress={() => navigation.goBack()} />;
}

/**
 * The label a pushed screen's back button carries.
 *
 * ⚠ **A screen with `headerShown: false` and no `title` publishes its route
 * name.** native-stack takes the back label from the previous screen's `title`
 * and falls back to `route.name` when there is none — so hiding a header does
 * not remove that screen from the header of the next one, it only removes the
 * value it would have used. `VehicleDetail` hid its header on 23 Aug for the
 * hero pullback, and six screens pushed from it have read `‹ VehicleDetail`
 * ever since: a class name, in the product's voice, on the most-travelled back
 * button in the app.
 *
 * So `title` is still set below. It draws nothing — the header is off — and
 * does exactly one job, which is this label.
 *
 * ── Why the year comes off ──────────────────────────────────────────────────
 *
 * The title is `[year, make, model].join(' ')`, and "2015 BMW M235i" is past
 * what iOS will render in a back button: it silently collapses to "Back", which
 * is correct but says nothing. Dropping the leading year leaves "BMW M235i",
 * which fits and still names the car.
 *
 * Only a leading four-digit year is removed, and nothing else is guessed at.
 * Taking the last word instead would give "Cherokee" for a Grand Cherokee — the
 * kind of cleverness that is invisible until it is wrong on somebody's car.
 */
export function carBackTitle(title: string | undefined): string {
  const named = title?.trim();
  if (!named) return 'Vehicle';

  return named.replace(/^\d{4}\s+/, '') || named;
}

/**
 * What the back button on `Account` reads: the tab it was opened from.
 *
 * ⚠ The `Tabs` route is a screen like any other to the root stack, so without
 * a title its route name would be the label — `‹ Tabs`, which is
 * `‹ VehicleDetail` again. The focused tab is read off the route's nested
 * state; before the tabs have mounted there is none, and the first tab is the
 * honest answer because it is the one that will be there.
 */
const TAB_TITLES: Record<keyof TabParamList, string> = {
  GarageTab: 'GARAGE',
  ServiceTab: 'SERVICE',
  PlanTab: 'PLAN',
  AdvisorTab: 'ADVISOR',
};

export function tabsBackTitle(route: RouteProp<RootStackParamList, 'Tabs'>): string {
  const focused = getFocusedRouteNameFromRoute(route) as keyof TabParamList | undefined;
  return TAB_TITLES[focused ?? 'GarageTab'];
}

/**
 * Is the focused screen a tab's root?
 *
 * Read off the container's whole state rather than the current route's name,
 * because `Service` and `Plan` are roots *and* pushed screens: the name alone
 * cannot tell a root from the same screen three deep in the dossier. The
 * account control floats on roots only — a pushed screen has a header with its
 * own back control, and a floating word would land on top of it.
 *
 * Nested state is absent until a navigator mounts, and a tab that has not
 * mounted is at its root by definition.
 */
export function atTabRoot(
  state: NavigationState | PartialState<NavigationState> | undefined
): boolean {
  if (!state) return true;

  const root = state.routes[state.index ?? state.routes.length - 1];
  if (root?.name !== 'Tabs') return false;

  const tabs = root.state;
  if (!tabs) return true;

  const tab = tabs.routes[tabs.index ?? tabs.routes.length - 1];
  const stack = tab?.state;
  if (!stack) return true;

  return (stack.index ?? stack.routes.length - 1) === 0;
}

/** The car every dossier screen is about, as the params that name it. */
type Car = { vehicleId: string; title?: string };

/**
 * Switch to the Advisor tab, about a car.
 *
 * The bare "Ask the advisor" — no question in hand — is a change of subject
 * rather than a step in the dossier, so it goes to the tab where the
 * conversation lives. A question that travels with the screen (`ask`) does not
 * come through here; see the `Advisor` param's note.
 */
function openAdvisorTab(navigation: StackNavigation, car: Car) {
  navigation.navigate('Tabs', {
    screen: 'AdvisorTab',
    params: { screen: 'Advisor', params: car },
  });
}

/** Everything a stack needs to render its screens. */
type Session = {
  accessToken: string;
  email: string | null;
  onSignOut: () => void;
};

/**
 * ── The dossier stack: the garage tab ───────────────────────────────────────
 *
 * Garage → VehicleDetail → Health / Service / Plan / InvoiceScan / …, which is
 * the stack the brief describes and the one every deep link into a car seeds.
 */
function GarageStack({ accessToken, email, onSignOut }: Session) {
  return (
    <Stack.Navigator initialRouteName="Garage" screenOptions={screenOptions}>
      {/*
        `title` with the header off is the back label and nothing else — see
        `carBackTitle`. "Garage" is what the route is called anyway, so this
        changes no pixel; it is here so the label is a decision rather than a
        coincidence that survives the next rename.
      */}
      <Stack.Screen name="Garage" options={{ headerShown: false, title: 'Garage' }}>
        {({ navigation }) => (
          <GarageScreen
            accessToken={accessToken}
            email={email}
            onSignOut={onSignOut}
            onOpenVehicle={(vehicleId, title) =>
              navigation.navigate('VehicleDetail', { vehicleId, title })
            }
            /*
              R21. The bay's next-service row was the most actionable string
              on the home screen and led nowhere. It opens what is due.
            */
            onOpenService={(vehicleId, title) =>
              navigation.navigate('Service', { vehicleId, title, segment: 'due' })
            }
            onAddVehicle={() => navigation.navigate('AddVehicle')}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="AddVehicle" options={{ title: 'ADD A CAR' }}>
        {({ navigation }) => (
          <AddVehicleScreen
            onSignOut={onSignOut}
            /*
              `replace`, not `navigate`. Going back to a form that has already
              created the car would let someone add it twice, and the natural
              place to go from a new car is the car.
            */
            onAdded={(vehicleId, title) => navigation.replace('VehicleDetail', { vehicleId, title })}
          />
        )}
      </Stack.Screen>

      <Stack.Screen
        name="VehicleDetail"
        /*
          The title is passed from the row rather than read from the loaded
          vehicle, so the header is correct during the fetch instead of
          appearing a second later. The row already knows the car's name —
          it just drew it.

          A deep link has no name to pass, so it falls back rather than
          rendering "undefined" in the header.

          ⚠ `headerShown: false` as of 23 Aug. The hero pullback pins a
          photograph at 62% of the display and the screen draws its **own**
          nav — floating pills over the car at rest, resolving into a solid
          plate once the sheet reaches them at 300pt of scroll. A stack header
          above that would be a second bar over a hero designed to run under
          the status bar.

          `title` is the back label of every screen pushed from here, and
          nothing else — see `carBackTitle`. Without it these read
          `‹ VehicleDetail`.
        */
        options={({ route }) => ({
          headerShown: false,
          title: carBackTitle(route.params.title),
        })}
      >
        {({ route, navigation }) => (
          <VehicleDetailScreen
            title={route.params.title}
            vehicleId={route.params.vehicleId}
            onSignOut={onSignOut}
            /*
              ⚠ `popTo('Garage')`, not `navigate` — 11 Sep, and the difference is
              React Navigation 7's. `navigate` used to find the garage already on
              the stack; in v7 it **pushes** a second one unless told to pop, so
              the control that says "back to the garage" was quietly growing the
              stack behind it. `popTo` goes back to the garage this stack was
              seeded with, on the tap path and on the deep-link path alike.
            */
            onBack={() => navigation.popTo('Garage')}
            /*
              ⚠ The tab, not a push. There is no question in hand here — this is
              "let me talk about this car" — and the conversation lives on the
              Advisor tab. See the `Advisor` param's note for the other case.
            */
            onAskAdvisor={() =>
              openAdvisorTab(navigation, {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
              })
            }
            onScanInvoice={() =>
              navigation.navigate('InvoiceScan', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
              })
            }
            /*
              ⚠ **R16.** The banner opens `Health`, not a recalls screen. The
              recalls are a section of it, under the dial they drive — cause
              beside effect rather than one navigation apart.
            */
            onViewRecalls={() =>
              navigation.navigate('Health', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
              })
            }
            /* R15. One destination, opening on the segment the row named. */
            onOpenWishlist={() =>
              navigation.navigate('Plan', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
                segment: 'needs',
              })
            }
            /* R14. One destination, opening on the segment the row named. */
            onOpenHistory={() =>
              navigation.navigate('Service', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
                segment: 'history',
              })
            }
            onOpenHealth={() =>
              navigation.navigate('Health', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
              })
            }
            onOpenMilestone={() =>
              navigation.navigate('Service', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
                segment: 'due',
              })
            }
            onOpenProfile={() =>
              navigation.navigate('VehicleProfile', {
                vehicleId: route.params.vehicleId,
                title: route.params.title,
              })
            }
            // The same seam as the garage's. See `pick-image.ts`.
            pickPhoto={() => pickVehiclePhoto('library')}
          />
        )}
      </Stack.Screen>

      {/*
        ── ⚠ R16 · a deep-link alias, not a destination ────────────────────

        Nothing in the app navigates here. It exists because shipped builds
        send `tappet://vehicle/<id>/recalls` in recall notifications, and a
        link an installed app already emits has to keep resolving — so the
        path is kept and pointed at the screen the content moved to.

        It renders `HealthScreen`, which shows the recalls under the dial they
        drive. The title is `Health` for the same reason: a back button
        reading "Recalls" would name a screen that no longer exists.
      */}
      <Stack.Screen name="RecallDetail" options={{ title: 'HEALTH' }}>
        {({ route, navigation }) => (
          <HealthScreen
            vehicleId={route.params.vehicleId}
            title={route.params.title}
            onSignOut={onSignOut}
            onAskAdvisor={(vehicleId, ask) =>
              navigation.navigate('Advisor', { vehicleId, title: route.params.title, ask })
            }
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="Health" options={{ title: 'HEALTH' }}>
        {({ route, navigation }) => (
          <HealthScreen
            vehicleId={route.params.vehicleId}
            title={route.params.title}
            onSignOut={onSignOut}
            /* R16. The recalls section keeps its per-recall advisor thread. */
            onAskAdvisor={(vehicleId, ask) =>
              navigation.navigate('Advisor', { vehicleId, title: route.params.title, ask })
            }
          />
        )}
      </Stack.Screen>

      {/*
        ── R14 · Due and History, one destination ──────────────────────────

        Pushed from the car's hub. The same screen is the Service tab's root,
        in `ServiceStack` below, and `rootTitle` tells the two apart.
      */}
      {serviceScreen(onSignOut)}
      {planScreen(onSignOut)}
      {invoiceScreens(onSignOut)}
      {wishlistAddScreen(onSignOut)}

      <Stack.Screen name="VehicleProfile" options={{ title: 'WHAT YOU TOLD US' }}>
        {({ route, navigation }) => (
          <VehicleProfileScreen
            vehicleId={route.params.vehicleId}
            onSignOut={onSignOut}
            /*
              Back to the car, which refetches on focus — so a changed answer
              shows up where it matters. `goBack` rather than a navigate, so
              the stack does not grow a second copy of the screen behind.
            */
            onSaved={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>

      {/*
        Pushed from a recall's "ask the advisor", with the question in hand.
        A fresh instance, so the question is asked — see the param's note.
      */}
      {advisorScreen(onSignOut)}
    </Stack.Navigator>
  );
}

/** The Service tab: the record, and what it leads to. */
function ServiceStack({ onSignOut }: Session) {
  return (
    <Stack.Navigator initialRouteName="Service" screenOptions={screenOptions}>
      {serviceScreen(onSignOut)}
      {invoiceScreens(onSignOut)}
    </Stack.Navigator>
  );
}

/** The Plan tab: needs and mods, the catalogue, and a question about either. */
function PlanStack({ onSignOut }: Session) {
  return (
    <Stack.Navigator initialRouteName="Plan" screenOptions={screenOptions}>
      {planScreen(onSignOut)}
      {wishlistAddScreen(onSignOut)}
      {advisorScreen(onSignOut)}
    </Stack.Navigator>
  );
}

/** The Advisor tab: the conversation. */
function AdvisorStack({ onSignOut }: Session) {
  return (
    <Stack.Navigator initialRouteName="Advisor" screenOptions={screenOptions}>
      {advisorScreen(onSignOut)}
    </Stack.Navigator>
  );
}

/*
  ── The screens more than one stack registers ───────────────────────────────

  Each is a function returning the `Stack.Screen` element, so the two stacks
  that need it render the same wiring rather than two copies of it that would
  drift. React Navigation reads `Screen` elements out of a navigator's children,
  fragments included, so a function that returns one is a screen like any other.
*/

/**
 * A car tab's root, or the honest state when there is no car to be about.
 *
 * ⚠ `vehicleId` keys the screen. A tab press about a different car pops the
 * stack to this root and swaps the params in place (`tab-target.ts`); without
 * the key the mounted screen would keep its state — a thread, a record, an
 * odometer confirmation — under the new car's name.
 */
function withCar(
  route: { params?: { vehicleId?: string } | undefined },
  navigation: StackNavigation,
  title: string,
  render: (vehicleId: string) => ReactElement
) {
  const vehicleId = route.params?.vehicleId;

  if (!vehicleId) {
    return (
      <ChooseACar
        title={title}
        onOpenGarage={() => navigation.navigate('Tabs', { screen: 'GarageTab' })}
      />
    );
  }

  return <Fragment key={vehicleId}>{render(vehicleId)}</Fragment>;
}

function serviceScreen(onSignOut: () => void) {
  return (
    <Stack.Screen name="Service" options={rootTitle('SERVICE')}>
      {({ route, navigation }) =>
        withCar(route, navigation, 'Service', (vehicleId) => (
          <ServiceScreen
            vehicleId={vehicleId}
            initialSegment={route.params?.segment}
            /*
              Scanning starts here and returns here. `useRefetchOnFocus` on
              the history segment is what makes the new lines appear when it
              does — without it the screen would show the record it had when
              it mounted, which is MOB-05 on the one screen whose job is to
              reflect the write.
            */
            onScan={() =>
              navigation.navigate('InvoiceScan', { vehicleId, title: route.params?.title })
            }
            onOpenVisit={(visit) =>
              navigation.navigate('InvoiceDetail', { visit, vehicleId, title: route.params?.title })
            }
            onSignOut={onSignOut}
          />
        ))
      }
    </Stack.Screen>
  );
}

function planScreen(onSignOut: () => void) {
  return (
    <Stack.Screen
      name="Plan"
      /*
        ── R15 · Needs and Mods, one destination ────────────────────────

        `native-wishlist.spec.html` is specific about where Add lives: *"Add
        is in the nav bar, not a floating action button. A FAB covers the last
        row and belongs to a different design language."* The control exists
        in the screen's loading and error states too, so a person whose list
        failed to load can still add to it.

        ⚠ 7 Sep: `rootTitle`, like the other roots. `Plan` became a tab in
        this change, and it was still carrying a pushed screen's options — a
        sentence-case "Plan" in the nav bar and no condensed title of its
        own, which is the header treatment B8 replaced everywhere else.
      */
      options={rootTitle('PLAN')}
    >
      {({ route, navigation }) =>
        withCar(route, navigation, 'Plan', (vehicleId) => (
          <PlanScreen
            vehicleId={vehicleId}
            title={route.params?.title}
            /*
              ⚠ Decided here rather than inside `PlanScreen`, because the hub
              is what knows the owner's answer — `showsModifications` reads
              `performance_mindedness`, and the plan screen has no vehicle
              payload of its own. A deep link arrives without it, and the
              honest default for "we do not know yet" is to show the segment:
              hiding it would silently narrow the app on the strength of a
              field that was not asked for.
            */
            showsMods
            initialSegment={route.params?.segment}
            onSignOut={onSignOut}
            onAdd={() =>
              navigation.navigate('WishlistAdd', { vehicleId, title: route.params?.title })
            }
          />
        ))
      }
    </Stack.Screen>
  );
}

function advisorScreen(onSignOut: () => void) {
  return (
    <Stack.Screen
      name="Advisor"
      /*
        ⚠ **`Advisor`, and nothing else, as of 23 Aug (R52).** It was
        `Advisor · 2015 BMW M235i`: two pieces of information in a slot that
        fits one, and on a 16e the cost was not the title. iOS gives the
        title the space it needs and takes it from the **back button's
        label**, so a long car name turned this screen's back control into a
        bare chevron — the only unlabelled one in the app, and duly reported
        as a second back-button idiom.

        The car did not go away; it moved below the nav, where it can be as
        long as it is and where it says what the thread is *about*. See
        `AdvisorScreen`'s `vehicleTitle`.
      */
      options={rootTitle('ADVISOR')}
    >
      {({ route, navigation }) =>
        withCar(route, navigation, 'Advisor', (vehicleId) => (
          <AdvisorScreen
            vehicleId={vehicleId}
            vehicleTitle={route.params?.title}
            /*
              React Navigation maps a query string onto params, so
              `tappet://vehicle/<id>/advisor?ask=...` arrives here already
              decoded.
            */
            initialQuestion={route.params?.ask}
            onSignOut={onSignOut}
          />
        ))
      }
    </Stack.Screen>
  );
}

function invoiceScreens(onSignOut: () => void) {
  return (
    <>
      <Stack.Screen name="InvoiceScan" options={{ title: 'SCAN AN INVOICE' }}>
        {({ route }) => (
          <InvoiceScanScreen
            vehicleId={route.params.vehicleId}
            /*
              The seam. `pick-image.ts` is the only module that will
              import expo-image-picker, so this screen stays free of native
              imports and one file changes when the build lands.
            */
            pickImage={pickInvoiceImage}
            onSignOut={onSignOut}
          />
        )}
      </Stack.Screen>

      {/*
        `title` is declared, and that is not decoration: native-stack takes a
        back button's label from the *previous* screen's title and falls back
        to `route.name` when there is none, which is how six screens came to
        read "‹ VehicleDetail" on 23 Aug.
      */}
      <Stack.Screen name="InvoiceDetail" options={{ title: 'INVOICE' }}>
        {({ route }) => (
          <InvoiceDetailScreen visit={route.params.visit} vehicleId={route.params.vehicleId} />
        )}
      </Stack.Screen>
    </>
  );
}

function wishlistAddScreen(onSignOut: () => void) {
  return (
    <Stack.Screen name="WishlistAdd" options={{ title: 'WHAT THIS CAR NEEDS' }}>
      {({ route, navigation }) => (
        <WishlistAddScreen
          vehicleId={route.params.vehicleId}
          title={route.params.title}
          onSignOut={onSignOut}
          onAskAdvisor={(vehicleId, ask) =>
            navigation.navigate('Advisor', { vehicleId, title: route.params.title, ask })
          }
          /*
            The list behind this refetches on focus, so adding does not pop
            back: somebody working through a catalogue usually adds more
            than one thing, and bouncing them out after each is the version
            that makes them tap in five times.
          */
          onAdded={() => {}}
        />
      )}
    </Stack.Screen>
  );
}

/**
 * The four tabs, and the bar.
 *
 * `headerShown: false` because `bottom-tabs` draws a JS header of its own
 * otherwise — a second bar above every native one. `backBehavior="none"` is
 * argued in the file's docblock: it is what keeps a root's `canGoBack()` false.
 */
function Tabs(session: Session) {
  return (
    <Tab.Navigator
      backBehavior="none"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: surface.page } }}
      /*
        ── R13 · the bar ─────────────────────────────────────────────────────

        Rendered by the navigator, outside every screen, which is the whole
        structural claim `mobile-account-reachable.test.ts` makes. `TabBar`
        draws it and carries the argument for what it draws.
      */
      tabBar={(props) => <TabBar state={props.state} navigation={props.navigation} />}
    >
      <Tab.Screen name="GarageTab">{() => <GarageStack {...session} />}</Tab.Screen>
      <Tab.Screen name="ServiceTab">{() => <ServiceStack {...session} />}</Tab.Screen>
      <Tab.Screen name="PlanTab">{() => <PlanStack {...session} />}</Tab.Screen>
      <Tab.Screen name="AdvisorTab">{() => <AdvisorStack {...session} />}</Tab.Screen>
    </Tab.Navigator>
  );
}

export function RootNavigator({ accessToken, email, onSignOut }: Session) {
  /*
    The container ref, so the account control can navigate and the tree can
    be read. `useNavigationContainerRef` rather than a plain ref: it is the
    typed one and it is safe to call before the container is ready.
  */
  const navigation = useNavigationContainerRef<RootStackParamList>();
  const [atRoot, setAtRoot] = useState(true);

  /**
   * Where the tree is, and which car it is about.
   *
   * ⚠ **Both, in one place.** `rememberVehicle` used to be called only from the
   * garage's row, which meant a **deep link** — a recall notification, a
   * service-due alert, a `tappet://vehicle/<id>` URL — put somebody on a car
   * without the other tabs learning which one, so they opened about nothing.
   *
   * Reading it off the container covers every way a car can be reached, present
   * and future, because there is only one of them: the route being on screen.
   */
  const noteRoute = useCallback(() => {
    setAtRoot(atTabRoot(navigation.getRootState()));

    const params = navigation.getCurrentRoute()?.params as Partial<Car> | undefined;
    if (params?.vehicleId) rememberVehicle(params.vehicleId, params.title);
  }, [navigation]);

  /*
    Configured here rather than in `App.tsx` because this component only mounts
    once someone is signed in — and an alert about a recall is meaningless to a
    device with no garage. The permission prompt's *placement* is a product
    decision with a note against it in `notifications/push.ts`: iOS allows it
    once, so it deserves an explaining screen before submission.
  */
  useEffect(() => {
    configureNotificationHandler();

    /*
      ── C5: the system prompt is no longer raised from here ──────────────────

      This used to call `registerForPush()`, which asks iOS for permission as
      its first act. iOS shows that dialog **exactly once** and a "no" can only
      be undone in Settings — so the one irreversible ask was being spent on
      entry to the signed-in stack, before the person had seen what the product
      does. The most likely answer to a dialog you did not expect is no.

      Now: a device that **already** has permission still registers silently,
      because its token must be filed against the account and there is nothing
      to explain. Everyone else is offered `PushPrimer` first — see
      `GarageScreen`, which is where the vehicle count that gates it lives.

      `shouldRegisterSilently` and `shouldShowPushPrimer` are complementary by
      construction and there is a test asserting they can never both be true.
    */
    void (async () => {
      if (shouldRegisterSilently(await currentPushPermission())) {
        void registerForPush();
      }
    })();
  }, []);

  const session: Session = { accessToken, email, onSignOut };

  return (
    <NavigationContainer
      ref={navigation}
      linking={linking}
      /*
        ── R13 · where the account control may float ─────────────────────────

        Read off the container rather than held as state by anything that
        navigates, because the bar is not the only thing that does: a deep
        link, a notification tap and the back gesture all move the tree, and a
        control that only knew about presses would float over the wrong screen
        after any of them.
      */
      onStateChange={noteRoute}
      onReady={noteRoute}
    >
      <Stack.Navigator initialRouteName="Tabs" screenOptions={screenOptions}>
        <Stack.Screen
          name="Tabs"
          /*
            No header of its own — each tab's stack draws headers for its pushed
            screens, and a root has none. The title is the back label `Account`
            reads; see `tabsBackTitle`.
          */
          options={({ route }) => ({ headerShown: false, title: tabsBackTitle(route) })}
        >
          {() => <Tabs {...session} />}
        </Stack.Screen>

        {/*
          ── R13 · the account, as a destination ─────────────────────────────

          `visible` is deliberately not passed: `AccountScreen` renders as a
          screen when it is absent and as a modal when it is not, and this is
          the screen case. `onClose` goes with it — the stack header is the way
          back, and a "Done" beside it would be a second answer to one question.

          ⚠ 11 Sep: on the root stack, over the tabs. The bar disappears under
          it, which is right for the app's own settings — nothing on the bar is
          about the account — and it means the screen is one stack push from
          any root rather than a route four navigators would each have to
          register.
        */}
        <Stack.Screen name="Account" options={rootTitle('ACCOUNT')}>
          {() => (
            <AccountScreen
              email={email}
              accessToken={accessToken}
              onSignOut={onSignOut}
              /*
                Deletion clears the session, which unmounts this whole navigator
                — so there is nothing here to navigate back to and nothing to
                show a confirmation on. `App.tsx`'s gate takes over.
              */
              onDeleted={() => onSignOut()}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>

      {/*
        ⚠ A sibling of the navigator — the *root* navigator — and outside every
        screen, because App Store 5.1.1(v) and `mobile-account-reachable.test.ts`
        both depend on no screen being able to swallow it. See `AccountControl`.

        Shown on roots only: a pushed screen has a header with its own back
        control, and a floating word would sit on top of it. `atTabRoot` reads
        the whole tree to decide, because a name alone cannot.
      */}
      <AccountControl
        visible={atRoot}
        /*
          ⚠ `navigate`, and it lands on the root stack. The account is somewhere
          you go and come back from; pushed there, it gets a header and a back
          control from `rootTitle`'s `canGoBack` branch, and the gesture works.
        */
        onPress={() => navigation.navigate('Account')}
      />
    </NavigationContainer>
  );
}
