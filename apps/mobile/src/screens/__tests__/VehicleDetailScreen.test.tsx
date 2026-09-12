import { act, render, userEvent, waitFor } from '@testing-library/react-native';

import { VehicleDetailScreen } from '../VehicleDetailScreen';
import { REFERENCE, SHORTEST, withSafeArea } from '../../test-support/safe-area';
import {
  HERO_NAV_FADE_START,
  HERO_TITLE_FADE_SPAN,
  detailHeroHeight,
  heroBands,
  heroTitleClearsNavTitle,
} from '../../theme/hero-motion';
import * as RN from 'react-native';
import { StyleSheet } from 'react-native';

/**
 * Every rendered host node of a kind, with its props.
 *
 * The same walker `instruments.test.tsx` uses, and for the same reason: there
 * is no accessible-name route to an SVG gradient or an `Image`, nor should
 * there be — neither is an interface element.
 */
function hostNodes(root: unknown, kind: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const host = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
    if (host.type === kind && host.props) found.push(host.props);
    for (const child of host.children ?? []) walk(child);
  };
  walk((root as { toJSON?: () => unknown })?.toJSON?.() ?? root);
  return found;
}

/** Every matched node's rendered `fontSize`, flattened the way RN merges. */
function readoutSizes(nodes: Array<{ props: Record<string, unknown> }>): number[] {
  return nodes.map((node) => {
    const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as { fontSize?: number };
    return flat.fontSize ?? 0;
  });
}
import { apiRequest, ApiRequestError } from '../../api/client';
import { getHealthBandJudgement } from '@tappet/core/health-band';

/**
 * The dossier.
 *
 * The screen a car opens into, and the hub every other mobile surface is
 * reached from — advisor, invoice scan, recalls, wishlist. Four callbacks means
 * four ways to strand somebody, and none of them were covered.
 *
 * ── Two things worth pinning beyond "it renders" ────────────────────────────
 *
 * **The health band comes from `@tappet/core/health-band`**, which both
 * clients read. A band spelled locally would let the phone call a car "Fair"
 * while the web calls the same score "Needs attention" — the exact divergence
 * the shared package exists to prevent. The test asserts against the real
 * judgement function rather than a string.
 *
 * **401 does not sign you out here, and that is deliberate.** Every other
 * screen calls `onSignOut` on a 401. This one shows "Your session ended" with a
 * "Sign in again" button, because it is reachable from a deep link and silently
 * bouncing somebody to a login screen loses the thing they tapped. The
 * asymmetry is easy to "fix" by mistake, so it is pinned.
 *
 * `userEvent` throughout, never `fireEvent` — see `AddVehicleScreen.test.tsx`.
 */

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

/**
 * `vehicle_health_summary` and `nhtsa_data` are Supabase embeds, so each can
 * arrive as an object or an array — which is why the screen has `first()`.
 * `asArray` exercises the other shape.
 */
function respond(over: Record<string, unknown> = {}, { asArray = false } = {}) {
  const health = { health_score: 61, summary: 'Fair.' };
  /*
    ⚠ Real NHTSA field names. The fixture was `[{ id: 1 }, { id: 2 }]`, which
    `normaliseRecall` drops for having neither a component nor a summary — it
    stood in for a shape NHTSA cannot return, and it only ever passed because
    the banner counted the raw array rather than what the recall screen draws.
  */
  const nhtsa = {
    recalls: [
      { NHTSACampaignNumber: '23V-441', Component: 'FUEL SYSTEM', Summary: 'Pump may fail.' },
      { NHTSACampaignNumber: '21V-100', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' },
    ],
  };

  request.mockResolvedValue({
    vehicle: {
      id: 'v1',
      year: 2018,
      make: 'Honda',
      model: 'Accord',
      current_mileage: 94_800,
      vehicle_health_summary: asArray ? [health] : health,
      nhtsa_data: asArray ? [nhtsa] : nhtsa,
      ...over,
    },
  } as never);
}

/**
 * ⚠ Every mount goes under a real `SafeAreaProvider` with chosen metrics.
 *
 * The hero's whole layering argument is arithmetic on `insets.top` and the
 * window height. See `test-support/safe-area.tsx` for why the provider is used
 * for real rather than the hook being mocked.
 */
/**
 * ⚠ The metrics drive **both** the safe area and the window.
 *
 * `useWindowDimensions` reads RN's `Dimensions`, not the safe-area provider, so
 * supplying `frame` alone leaves the screen laying out against jest's default
 * 750×1334 — which is above `HERO_COMPACT_BELOW`, so every "compact branch"
 * assertion would silently exercise the regular one. That is exactly the shape
 * of vacuous test §5 warns about, and it happened here on the first draft.
 */
async function mount(
  metrics = REFERENCE,
  extra: Partial<Parameters<typeof VehicleDetailScreen>[0]> = {},
) {
  /*
    `Dimensions.get('window')`, not the `useWindowDimensions` export: RN's hook
    seeds its state from `Dimensions.get` on first render, and the module's own
    export is not spy-able through the `react-native` index under this preset.
  */
  jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
    width: metrics.frame.width,
    height: metrics.frame.height,
    scale: 3,
    fontScale: 1,
  });

  const props = {
    vehicleId: 'v1',
    onBack: jest.fn(),
    onSignOut: jest.fn(),
    onAskAdvisor: jest.fn(),
    onScanInvoice: jest.fn(),
    onViewRecalls: jest.fn(),
    onOpenWishlist: jest.fn(),
    onOpenHistory: jest.fn(),
    onOpenHealth: jest.fn(),
    onOpenMilestone: jest.fn(),
    onOpenProfile: jest.fn(),
    ...extra,
  };
  return { props, view: await render(withSafeArea(<VehicleDetailScreen {...props} />, metrics)) };
}

beforeEach(() => request.mockReset());
// The window spy is per-mount; restoring it stops one case's size leaking on.
afterEach(() => jest.restoreAllMocks());

describe('the dossier', () => {
  it('draws the car', async () => {
    respond();
    const { view } = await mount();

    expect(await view.findAllByText(/2018 Honda Accord/)).toBeTruthy();
  });

  it('reads embeds that arrive as arrays', async () => {
    /*
      A Supabase to-many embed is an array, to-one is an object, and which you
      get depends on the query. Handling one shape only would show a car with no
      health and no recalls — silently, with no error.
    */
    respond({}, { asArray: true });
    const { view } = await mount();

    expect(await view.findAllByText(/2018 Honda Accord/)).toBeTruthy();
    expect(view.getByLabelText(/View 2 open recalls/)).toBeTruthy();
  });
});

describe('the health band', () => {
  it('uses core’s judgement rather than one spelled here', async () => {
    /*
      `health-band` is read by both clients. A locally-spelled band would let
      the phone say "Fair" where the web says "Needs attention" for the same
      score — which is the divergence the shared package exists to stop.
    */
    respond();
    const { view } = await mount();

    const expected = getHealthBandJudgement(61);
    await view.findAllByText(/2018 Honda Accord/);

    expect(view.getAllByText(new RegExp(expected.label, 'i')).length).toBeGreaterThan(0);
  });

  it('says nothing about health when there is no score', async () => {
    // Absent is normal — a car added minutes ago has no summary yet. Inventing
    // a band for it would be a claim about a car nothing has assessed.
    respond({ vehicle_health_summary: null });
    const { view } = await mount();

    await view.findAllByText(/2018 Honda Accord/);
    expect(view.queryByText(new RegExp(getHealthBandJudgement(61).label, 'i'))).toBeNull();
  });
});

describe('recalls', () => {
  it('pluralises the label correctly', async () => {
    // Read aloud by a screen reader, so "1 open recalls" is a real defect
    // rather than a typo.
    respond({ nhtsa_data: { recalls: [{ NHTSACampaignNumber: '23V-441', Component: 'FUEL SYSTEM' }] } });
    const { view } = await mount();

    /*
      The label now carries the worst recall after a full stop, so the anchor
      is the sentence's end or that stop — either way "1 open recalls" fails.
    */
    expect(await view.findByLabelText(/^View 1 open recall(\.|$)/)).toBeTruthy();
  });

  it('opens the recall screen when tapped', async () => {
    const user = userEvent.setup();
    respond();
    const { props, view } = await mount();

    await view.findAllByText(/2018 Honda Accord/);
    await user.press(view.getByLabelText(/View 2 open recalls/));

    expect(props.onViewRecalls).toHaveBeenCalledTimes(1);
  });
});

describe('the ways out', () => {
  it('reaches the plan', async () => {
    /*
      ⚠ **R15, 23 Aug.** The row reads "Plan" now — needs and mods are one
      destination, opened on the segment the row named. The callback keeps its
      name because it still opens the same list; only the place it opens *in*
      changed.
    */
    const user = userEvent.setup();
    respond();
    const { props, view } = await mount();

    await view.findAllByText(/2018 Honda Accord/);
    await user.press(view.getByText('Plan'));

    expect(props.onOpenWishlist).toHaveBeenCalledTimes(1);
  });

  it('reaches service on one row, not two', async () => {
    // R14. `Service due` and `Service history` were siblings answering one
    // question; `Service` opens on `Due` and `History` on the other segment.
    const user = userEvent.setup();
    respond();
    const { props, view } = await mount();

    await view.findAllByText(/2018 Honda Accord/);

    await user.press(view.getByText('Service'));
    expect(props.onOpenMilestone).toHaveBeenCalledTimes(1);

    await user.press(view.getByText('History'));
    expect(props.onOpenHistory).toHaveBeenCalledTimes(1);

    // And nothing on the hub still offers the two old destinations by name.
    expect(view.queryByText('Service due')).toBeNull();
    expect(view.queryByText('Wishlist')).toBeNull();
    expect(view.queryByText('Build')).toBeNull();
  });
});

describe('when the vehicle is gone', () => {
  it('treats a 404 as a state, not a crash', async () => {
    /*
      Reachable from a stale notification or a deep link to a deleted car. An
      error screen saying "something went wrong" would send someone looking for
      a fault that does not exist.
    */
    request.mockRejectedValue(new ApiRequestError({ status: 404, message: 'Not found' }));
    const { view } = await mount();

    expect(await view.findByText('This vehicle is no longer here')).toBeTruthy();
  });

  it('offers the way back to the garage', async () => {
    const user = userEvent.setup();
    request.mockRejectedValue(new ApiRequestError({ status: 404, message: 'Not found' }));
    const { props, view } = await mount();

    await view.findByText('This vehicle is no longer here');
    await user.press(view.getByText('Back to garage'));

    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});

describe('when the session ended', () => {
  it('does not sign out on its own', async () => {
    /*
      The deliberate asymmetry. Every other screen calls `onSignOut` from the
      401 handler; this one is reachable from a deep link, and bouncing someone
      silently to a login screen loses whatever they tapped to get here.
    */
    request.mockRejectedValue(new ApiRequestError({ status: 401, message: 'Unauthorized' }));
    const { props, view } = await mount();

    expect(await view.findByText('Your session ended')).toBeTruthy();
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('signs out when the person asks it to', async () => {
    // The pair. Without it, "does not sign out" is satisfied by a screen where
    // signing out is impossible.
    const user = userEvent.setup();
    request.mockRejectedValue(new ApiRequestError({ status: 401, message: 'Unauthorized' }));
    const { props, view } = await mount();

    await view.findByText('Your session ended');
    await user.press(view.getByText('Sign in again'));

    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('when it simply failed', () => {
  it('offers a retry rather than a sign-out', async () => {
    // A 500 is not a session problem, and the two must not share a button.
    request.mockRejectedValue(new ApiRequestError({ status: 500, message: 'Upstream failed' }));
    const { props, view } = await mount();

    expect(await view.findByText('Could not load this vehicle')).toBeTruthy();
    expect(view.getByText('Try again')).toBeTruthy();
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('actually retries', async () => {
    const user = userEvent.setup();
    request.mockRejectedValue(new ApiRequestError({ status: 500, message: 'Upstream failed' }));
    const { view } = await mount();

    await view.findByText('Could not load this vehicle');
    const before = request.mock.calls.length;

    await user.press(view.getByText('Try again'));

    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('what this screen leads to stays reachable', () => {
  /**
   * Every string the screen rendered, in the order it rendered them.
   *
   * Order is the assertion here — nothing else can express "below the fold".
   * A screen can contain a control and still have buried it, which is exactly
   * what happened on 15 Aug and is why this exists.
   */
  const textInOrder = (view: { toJSON: () => unknown }): string[] => {
    const out: string[] = [];

    const walk = (node: unknown) => {
      if (typeof node === 'string') {
        out.push(node);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const host = node as { children?: unknown[] };
      for (const child of host.children ?? []) walk(child);
    };

    walk(view.toJSON());
    return out;
  };

  it('puts the advisor and the wishlist above the second instruments', async () => {
    /*
      ⚠ The regression David found in the simulator, in one assertion.

      Step 4 stacked the photo hero, a 184pt dial, the drivers, the score
      history and the build dial above the destinations — so "Ask the advisor",
      the verb this screen exists to lead to, and the wishlist with it, sat
      below roughly two screens of instruments. His words were "I can't see add
      wishlist any more" and "ask crewchief is buried too low", and both were
      the same defect.

      The board's own order is the fix and it was there all along: screen 02 is
      the car and what to do about it; **screen 03 is "vehicle detail,
      scrolled"** and is where "the two instruments web has and mobile does
      not" live. Reference is what you scroll to.
    */
    respond();
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    const order = textInOrder(view);
    /*
      Case-insensitive: `SectionHeader` upper-cases its title, so a section is
      "HEALTH" in the tree and "Health" in the source. Matching exactly found
      the dial's readout and missed the heading.
    */
    const at = (needle: string) =>
      order.findIndex((line) => line.toLowerCase().includes(needle.toLowerCase()));

    /*
      ⚠ Rewritten 23 Aug with the hub, and again with the IA merge. The claim is
      the same one — the verb this screen exists to lead to must not sit under a
      stack of instruments — but the landmarks changed twice: the instruments
      left this screen, and then five hub rows became three (R14, R15). `Plan`
      is where `Wishlist` and `Build` went.
    */
    expect(at('This car')).toBeGreaterThan(-1);
    expect(at('Ask the advisor')).toBeGreaterThan(-1);

    // The reading, then the places to go, then the one thing to do, then the
    // answers the owner gave when they added the car.
    expect(at('Fair')).toBeLessThan(at('This car'));
    expect(at('This car')).toBeLessThan(at('Plan'));
    expect(at('Plan')).toBeLessThan(at('Ask the advisor'));
    expect(at('Ask the advisor')).toBeLessThan(at('What you told us'));
  });

  it('shows the score once, and never over the car', async () => {
    /*
      ⚠ Rewritten 23 Aug when the hero dial was removed. It used to assert the
      dial's readout size — 20 at hero/132, 36 at card/104 — which is now a
      component that does not exist.

      What replaced the claim: the score appears **twice**, and neither is on
      the photograph. The nav chip persists as chrome; the health card's own
      reading is the subject of the paragraph under it. Three copies existed for
      part of a day and the dial was the one that went, because it covered the
      car.

      ⚠ Rewritten again 6 Sep, and the same sentence explains why: the count has
      now gone from two to **one**. The design critique measured the remaining
      duplication three rounds running — the chip's 16pt reading sitting ~300pt
      above the card's 30pt one — and a score printed twice at two sizes asks
      which is the reading.

      The durable half of this guard is "**never over the car**", which is the
      invariant the dial's removal established. The count was a snapshot of the
      day it was written, and it is the half that keeps changing.
    */
    respond();
    const { view } = await mount(REFERENCE);

    await view.findAllByText(/2018 Honda Accord/);

    const readouts = await view.findAllByText('61');
    expect(readouts).toHaveLength(1);
    // The card's own 30. No chip, and no instrument readout over the photograph.
    expect(readoutSizes(readouts)).toEqual([30]);
  });

  it('sizes the hero title down on the shortest display', async () => {
    /*
      The compact branch outlived the dial it was written for. A two-line 36pt
      name is too much for a 414pt hero whether or not there is an instrument
      beside it, so the threshold still sizes the title — 36 above it, 28 below.
    */
    respond();

    const tall = await mount(REFERENCE);
    const tallTitle = (await tall.view.findAllByText(/2018 Honda Accord/))[0];
    expect(readoutSizes([tallTitle])).toEqual([36]);

    const short = await mount(SHORTEST);
    const shortTitle = (await short.view.findAllByText(/2018 Honda Accord/))[0];
    expect(readoutSizes([shortTitle])).toEqual([28]);
  });
});

describe('the first load is the wait instrument', () => {
  it('says what it is opening rather than showing a dot in an empty field', async () => {
    /*
      This is the densest screen in the app and the one a recall notification
      opens, so it is the most likely to be met cold. It showed a centred
      `ActivityIndicator` until 16 Aug, then two card skeletons until 12 Sep,
      when every page load became the delayed full instrument (`Working`) — a
      mono line saying what is happening, announced once as one thing.

      ⚠ Held at opacity 0: the instrument waits 350ms before it paints so a
      fetch that answers sooner never shows a dial. The query has to be told
      to look through that, which is the same fact as the delay.
    */
    request.mockImplementation(() => new Promise(() => {}));

    const { view } = await mount();

    const wait = view.getByLabelText('Opening this car', { includeHiddenElements: true });
    expect(wait.props.accessibilityRole).toBe('progressbar');
    expect(view.queryByText(/2018 Honda Accord/)).toBeNull();
  });
});

/**
 * ── The hero pullback's geometry ────────────────────────────────────────────
 *
 * §5 of `design_handoff_v8/HERO_PULLBACK_PROMPT.md`. Most of these are
 * assertions on pure functions rather than on a rendered tree, and deliberately
 * so: the failures they guard against are **arithmetic**, they only appear
 * mid-scroll at one device size, and a render test would have to catch the
 * screen in flight to see them. `hero-motion.ts` exists so they can be checked
 * standing still.
 */
describe('the hero pullback', () => {
  /*
    ⚠ Three cases were deleted here on 23 Aug, and what they were is worth
    recording: the layering invariant (the dial docking clear of the sheet
    edge), its anti-vacuous pair, and the rest-state clearance between the
    plinth and the title. All three guarded the travelling health dial, and all
    three were the hardest-won assertions in this file — the invariant caught
    the bug the design itself had twice.

    The dial was removed because it covered the car. **There is nothing left to
    collide**, so keeping those tests would leave three guards that can never
    fail — which is worse than none, because they read as coverage. The rule
    they enforced now lives in the design's history, not in an assertion about
    a component that does not exist.
  */
  it('clamps the hero height at both ends', () => {
    // 62% of a 6.7" display is a generous hero; 62% of a 4.7" is not enough.
    expect(detailHeroHeight(667)).toBe(414);
    expect(detailHeroHeight(932)).toBe(560);

    // Anti-vacuous: the clamp is not returning a bound for everything.
    expect(detailHeroHeight(800)).toBe(496);
  });

  it('takes the compact branch only below the threshold', () => {
    /*
      ⚠ In practice only the 4.7″ display takes it — the mini (812pt → 503)
      clears by 3pt. Worth a test because that margin is what makes the clamp
      dangerous to edit.

      The branch survives the dial's removal because it still sizes the title:
      a two-line 36pt name is too much for a 414pt hero whether or not there is
      an instrument beside it.
    */
    expect(heroBands(detailHeroHeight(667)).compact).toBe(true);
    expect(heroBands(detailHeroHeight(812)).compact).toBe(false);
    expect(detailHeroHeight(812)).toBe(503);
  });

  it('finishes the hero title before the nav title starts', () => {
    // Two legible copies of one car's name on one screen is the failure the
    // stagger avoids. Held as a relationship so either number can move.
    expect(heroTitleClearsNavTitle()).toBe(true);
    expect(HERO_TITLE_FADE_SPAN).toBeLessThan(HERO_NAV_FADE_START);
  });

  it('renders the house plate and no photograph when there is no photo', async () => {
    respond({ photo_url: null });
    const { view } = await mount();

    await view.findAllByText(/2018 Honda Accord/);
    /*
      ⚠ Re-pointed 11 Sep. This asserted no `Image` and a radial gradient: the
      empty hero was a lit-room fill. B2 gives it the night plate now — an
      `Image`, but a bundled one — so the claim is split into its two halves:
      nothing is fetched (no `uri`), and the designed empty state is present.
      A garage carries unphotographed vehicles for weeks; it is a state, not a
      gap.
    */
    const sources = hostNodes(view.root, 'Image').map(
      (props) => props.source as { uri?: string; testUri?: string } | undefined
    );
    expect(sources.filter((source) => source?.uri)).toHaveLength(0);
    expect(sources.filter((source) => String(source?.testUri ?? '').includes('night-plate'))).toHaveLength(1);
  });

  it('gives the nav title the slack and reserves the chip its slot', async () => {
    /*
      Centred across the full width, "2019 Mercedes-AMG C63 S" runs under both
      the chip and the control beside it. The title is the only thing keeping
      the car from being anonymous once the hero is covered, so it takes the
      slack and truncates rather than sharing space with chrome.
    */
    respond({ make: 'Mercedes-AMG', model: 'C63 S', year: 2019 });
    const { view } = await mount();

    const titles = await view.findAllByText(/2019 Mercedes-AMG C63 S/);
    const nav = titles
      .map((node) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>)
      .find((flat) => flat.flex === 1);

    expect(nav).toBeDefined();
    expect(titles.some((node) => node.props.numberOfLines === 1)).toBe(true);
  });
});

/**
 * ── The health verdict may not outrank the records beside it ────────────────
 *
 * 23 Aug, on the real M235i: the card read "a complete lack of documented
 * maintenance … impossible to assess its current condition" while the service
 * history one tap away listed five services and $1,461.
 *
 * Both were honest. The summary row was generated on 30 Jul, the invoice was
 * filed on 6 Aug, and nothing on this read path recomputes it — so the screen
 * was handed an out-of-date sentence and presented it as a current one.
 *
 * `healthVerdict` owns the rule; this is the screen actually applying it, with
 * the live row's own values. The prose and the count arrive on **different
 * requests**, so the mock is per-URL rather than one body for all three: the
 * contradiction only exists where those two meet.
 */
describe('the health verdict, against what the screen is holding', () => {
  const STALE_SUMMARY =
    "Based on your provided service history, the vehicle's health is highly uncertain due to a complete lack of documented maintenance.";

  /** Three requests go out together; each gets the body it would really get. */
  function respondWith({
    summary,
    lastGenerated,
    filedAt,
  }: {
    summary: string;
    lastGenerated: string | null;
    filedAt: string | null;
  }) {
    request.mockImplementation((path: string) => {
      if (path.startsWith('/load-maintenance-data')) {
        return Promise.resolve({
          maintenanceLineItems:
            filedAt === null ? [] : Array.from({ length: 5 }, () => ({ created_at: filedAt })),
        }) as never;
      }

      if (path.startsWith('/wishlist')) return Promise.resolve({ wishlistItems: [] }) as never;

      return Promise.resolve({
        vehicle: {
          id: 'v1',
          year: 2015,
          make: 'BMW',
          model: 'M235i',
          current_mileage: 66_000,
          vehicle_health_summary: {
            health_score: 70,
            summary,
            last_generated: lastGenerated,
          },
          nhtsa_data: {
            recalls: [
              {
                NHTSACampaignNumber: '25V871000',
                Component: 'AIR BAGS',
                Summary: 'Inflator may rupture.',
              },
              {
                NHTSACampaignNumber: '23V-441',
                Component: 'FUEL SYSTEM',
                Summary: 'Pump may fail.',
              },
            ],
          },
        },
      }) as never;
    });
  }

  it('does not show a sentence written before the records it contradicts', async () => {
    respondWith({
      summary: STALE_SUMMARY,
      lastGenerated: '2026-07-30T01:05:47.583+00:00',
      filedAt: '2026-08-06T02:43:11.903661+00:00',
    });

    const { view } = await mount();
    await view.findAllByText(/2015 BMW M235i/);

    // The sentence itself is gone, not captioned. Both halves are asserted:
    // a card that simply stopped rendering anything would pass the first.
    expect(view.queryByText(/complete lack of documented maintenance/)).toBeNull();
    await view.findByText(/taken before your 5 service records were filed/i);
  });

  it('names what the reading was worked out from', async () => {
    respondWith({
      summary: 'Solid history, nothing overdue.',
      lastGenerated: '2026-08-20T00:00:00+00:00',
      filedAt: '2026-08-06T02:43:11.903661+00:00',
    });

    const { view } = await mount();
    await view.findByText('Solid history, nothing overdue.');

    // The provenance line is what makes a contradiction visible on the screen
    // rather than only to somebody who opens the history and compares.
    await view.findByText(/Based on 5 recorded services · 2 open recalls/);
  });

  it('leaves a current reading alone', async () => {
    /*
      The anti-vacuous half. A screen that suppressed every summary would pass
      the first case here and be worse than the defect — so a reading that
      postdates its records has to survive intact.
    */
    respondWith({
      summary: STALE_SUMMARY,
      lastGenerated: '2026-08-20T00:00:00+00:00',
      filedAt: '2026-08-06T02:43:11.903661+00:00',
    });

    const { view } = await mount();
    await view.findByText(new RegExp('complete lack of documented maintenance'));
  });
});

/**
 * ── R10 / R24 / R25: the chrome that persists ───────────────────────────────
 *
 * The nav pills and the score chip are on screen for the whole of this screen's
 * scroll, which makes them the app's most-used controls and the ones where a
 * missing hit area or a missing name costs the most.
 */
describe('the hero’s nav, as controls', () => {
  it('keeps a named door to the health detail', async () => {
    respond();
    const { view } = await mount();

    /*
      R10's claim, re-pointed 6 Sep. It was written for the nav chip — which was
      `pointerEvents="none"` chrome announcing "Health score 61 out of 100 —
      Fair" and offering nothing to do about it — and the claim was that a
      reading and a *door* to a reading are different things.

      The chip is gone (it printed the score a second time), so the claim now
      rests on the hub row, which is the remaining route. What must not happen is
      that health becomes unreachable from this screen, which is exactly what
      deleting the chip could have caused without this.
    */
    const row = await view.findByText('What is driving this score');
    expect(row).toBeTruthy();
  });

  it('opens the health detail from that door', async () => {
    respond();
    const { props, view } = await mount();

    await userEvent.press(await view.findByText('What is driving this score'));
    expect(props.onOpenHealth).toHaveBeenCalled();
  });

  it('grows the nav target to 44pt without redrawing it', async () => {
    /*
      R25. The pills are drawn at 36 because that is what reads as a pill over a
      photograph rather than as a bar. `hitSlop` is React Native's
      `.tap-target-44`: the drawing is unchanged and the target grows around it.

      Asserted as slop rather than as a measured box — RNTL lays nothing out, so
      a height assertion here would be reading back the style it was given. What
      is checkable is that the compensation is present on both, which is the
      thing that goes missing.
    */
    respond();
    const { view } = await mount();

    /*
      ⚠ One target, not two, since 6 Sep — the score chip was cut. The claim is
      unchanged and still worth holding: the control is drawn at the size that
      reads over a photograph, and the target is grown around it rather than the
      drawing being inflated.
    */
    for (const label of ['Back to the garage']) {
      const slop = (await view.findByLabelText(label)).props.hitSlop as Record<string, number>;

      expect(slop).toBeDefined();
      // 36 drawn + 4 top + 4 bottom clears 44; anything less does not.
      expect(slop.top + slop.bottom).toBeGreaterThanOrEqual(8);
    }
  });
});

/**
 * ── Taking the photograph back off the car ──────────────────────────────────
 *
 * David, 11 Sep: *"i can't delete the image i uploaded on the app, so i can't
 * revert to seeing the new default images for my car."* The screen could add
 * a photograph and never remove one. What is pinned here is the shape of the
 * way out — one control, a sheet, one confirm — and the two promises the
 * removal makes: the plate is shown at once, and a failure puts the picture
 * back rather than leaving the car blank with an apology.
 *
 * The sheet and the confirm are UIKit's own surfaces, so they are driven the
 * way `WishlistScreen.test.tsx` drives its confirm: out of the spied call's
 * own argument list, which is the only way past a native dialog in a test.
 */
describe('taking the photograph back off the car', () => {
  const PHOTO = 'https://signed.test/car.jpg';

  let sheet: jest.SpyInstance;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    sheet = jest.spyOn(RN.ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    alert = jest.spyOn(RN.Alert, 'alert').mockImplementation(() => {});
  });

  /** The `Image` nodes drawing the owner's photograph — one, or none. */
  const photographs = (view: { root: unknown }) =>
    hostNodes(view.root, 'Image').filter(
      (props) => (props.source as { uri?: string } | undefined)?.uri === PHOTO,
    );

  const requests = (predicate: (path: string, init?: { method?: string }) => boolean) =>
    request.mock.calls.filter(([path, init]) => predicate(String(path), init as { method?: string }));
  const deletes = () => requests((_, init) => init?.method === 'DELETE');
  const loads = () => requests((path) => path.startsWith('/load-vehicle'));

  /**
   * The vehicle with a photograph, and whatever the DELETE should do.
   *
   * Per-URL, because the removal and the reload are different requests and
   * the test has to see them separately: a mock that answered everything with
   * one body could not tell "refetched after success" from "never asked".
   */
  function respondWithPhoto(onDelete: () => Promise<unknown>) {
    request.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return onDelete() as never;
      if (path.startsWith('/load-maintenance-data')) return Promise.resolve({ maintenanceLineItems: [] }) as never;
      if (path.startsWith('/wishlist')) return Promise.resolve({ wishlistItems: [] }) as never;
      return Promise.resolve({
        vehicle: {
          id: 'v1',
          year: 2018,
          make: 'Honda',
          model: 'Accord',
          photo_url: PHOTO,
          vehicle_health_summary: { health_score: 61, summary: 'Fair.' },
        },
      }) as never;
    });
  }

  /** Pick an option out of the sheet the screen opened. */
  async function chooseFromSheet(label: string) {
    const [options, callback] = sheet.mock.calls[0] as [
      { options: string[] },
      (index: number) => void,
    ];
    const index = options.options.indexOf(label);
    expect(index).toBeGreaterThan(-1);
    await act(async () => callback(index));
  }

  /** Press the destructive button in the confirm the screen raised. */
  async function confirmRemoval() {
    const buttons = alert.mock.calls[0][2] as Array<{ text?: string; onPress?: () => void }>;
    const remove = buttons.find((button) => button.text === 'Remove');
    expect(remove).toBeDefined();
    // `act`, because the optimistic write lands synchronously in the press.
    await act(async () => remove!.onPress?.());
  }

  it('offers Remove beside Change from the one control, and sends nothing for it', async () => {
    /*
      One control over the photograph, not two — the docblock on
      `onPhotoControl` carries why. The sheet is where the second verb lives,
      as it does inside the web's own photo dialog.
    */
    const user = userEvent.setup();
    respondWithPhoto(() => Promise.resolve({ success: true }));
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    await user.press(view.getByLabelText('Change photo'));

    expect(sheet).toHaveBeenCalledTimes(1);
    const [options] = sheet.mock.calls[0] as [
      { options: string[]; destructiveButtonIndex: number; cancelButtonIndex: number },
    ];
    expect(options.options).toEqual(['Change photo', 'Remove photo', 'Cancel']);
    expect(options.options[options.destructiveButtonIndex]).toBe('Remove photo');
    expect(options.options[options.cancelButtonIndex]).toBe('Cancel');

    // Opening the sheet is not a decision.
    expect(deletes()).toHaveLength(0);
    expect(photographs(view)).toHaveLength(1);
  });

  it('asks once, in words that say what the car will show, before it removes', async () => {
    const user = userEvent.setup();
    respondWithPhoto(() => Promise.resolve({ success: true }));
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    await user.press(view.getByLabelText('Change photo'));
    await chooseFromSheet('Remove photo');

    // Not "are you sure?" — what the owner gets: the plate, not a blank.
    expect(alert).toHaveBeenCalledWith(
      'Remove this photo?',
      'The car will stand on its plate.',
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2] as Array<{ text?: string; style?: string }>;
    expect(buttons.map((button) => button.text)).toEqual(['Keep', 'Remove']);
    expect(buttons.find((button) => button.text === 'Remove')?.style).toBe('destructive');

    // Choosing Remove in the sheet is still not a decision.
    expect(deletes()).toHaveLength(0);
    expect(photographs(view)).toHaveLength(1);
  });

  it('shows the plate at once, then asks the API what stands on the car', async () => {
    /*
      Optimistic: the owner asked to see the plate, so it appears before the
      round trip — the DELETE is held open here so that order is observable.
      Then a reload, because what now stands on the car is the API's decision
      (stock image, generation plate, house plate) and not this screen's guess.
    */
    const user = userEvent.setup();
    let finishDelete: (value: unknown) => void = () => {};
    respondWithPhoto(() => new Promise((resolve) => { finishDelete = resolve; }));
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    const loadsBefore = loads().length;

    await user.press(view.getByLabelText('Change photo'));
    await chooseFromSheet('Remove photo');
    await confirmRemoval();

    await waitFor(() => expect(deletes()).toHaveLength(1));
    // The photograph is gone and the house plate stands, while the request is still open.
    await waitFor(() => expect(photographs(view)).toHaveLength(0));
    const plates = hostNodes(view.root, 'Image').filter((props) =>
      String((props.source as { testUri?: string } | undefined)?.testUri ?? '').includes('night-plate'),
    );
    expect(plates).toHaveLength(1);
    expect(loads()).toHaveLength(loadsBefore);

    finishDelete({ success: true });

    await waitFor(() => expect(loads().length).toBeGreaterThan(loadsBefore));
  });

  it('puts the photograph back and says so when the removal fails', async () => {
    /*
      The revert. A car left blank with an apology would be the app claiming
      the photo is gone when the server says it is not — the row is still
      intact server-side on a failed delete, so the honest screen shows it.
    */
    const user = userEvent.setup();
    respondWithPhoto(() =>
      Promise.reject(new ApiRequestError({ status: 500, message: 'Failed to remove photo' })),
    );
    const { props, view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    const loadsBefore = loads().length;

    await user.press(view.getByLabelText('Change photo'));
    await chooseFromSheet('Remove photo');
    await confirmRemoval();

    await view.findByText('That photo was not removed');
    view.getByText('Failed to remove photo');
    expect(photographs(view)).toHaveLength(1);
    // Nothing to refetch — the server did not change anything.
    expect(loads()).toHaveLength(loadsBefore);
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('goes straight to the picker when there is no photograph to remove', async () => {
    // One action means no sheet. "Add photo" has always been a direct door.
    const user = userEvent.setup();
    respond({ photo_url: null });
    const pickPhoto = jest.fn().mockResolvedValue(null);
    const { view } = await mount(REFERENCE, { pickPhoto });
    await view.findAllByText(/2018 Honda Accord/);

    await user.press(view.getByLabelText('Add photo'));

    expect(pickPhoto).toHaveBeenCalledTimes(1);
    expect(sheet).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});
