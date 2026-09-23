import { act, render, userEvent, waitFor, within } from '@testing-library/react-native';

import { VehicleDetailScreen } from '../VehicleDetailScreen';
import { REFERENCE, SHORTEST, withSafeArea } from '../../test-support/safe-area';
import {
  HERO_NAV_FADE_SPAN,
  HERO_NAV_FADE_START,
  HERO_PARALLAX_RATE,
  HERO_SHEET_OVERLAP,
  HERO_TITLE_FADE_SPAN,
  detailHeroHeight,
  heroBands,
  heroTitleClearsNavTitle,
  navFadeStartFor,
  sheetMinHeight,
} from '../../theme/hero-motion';
import * as RN from 'react-native';
import { StyleSheet, processColor } from 'react-native';
import { border, cut, space, surface, text, type } from '../../theme';
import { cornerCovers } from '../../components/CutSurface';

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

/** A rendered `Text`'s colour, flattened the way RN merges. */
function readoutColor(node: { props: Record<string, unknown> }): unknown {
  return ((StyleSheet.flatten(node.props.style as never) ?? {}) as { color?: unknown }).color;
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
    // 22 Sep: the name goes on to say the match is the model's, not this car's (§10).
    expect(await view.findByLabelText(/^View 1 open recall(\.|,)/)).toBeTruthy();
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

  it('reaches service on one reading, not two', async () => {
    /*
      R14. `Service due` and `Service history` were siblings answering one
      question; the NEXT SERVICE cell opens on `Due` and HISTORY on the other
      segment. 13 Sep: the cells are the binnacle's, and the reading *is* the
      door — pressing the value opens the screen it reads from.
    */
    const user = userEvent.setup();
    respond();
    const { props, view } = await mount();

    await view.findAllByText(/2018 Honda Accord/);

    await user.press(view.getByText('Next service'));
    expect(props.onOpenMilestone).toHaveBeenCalledTimes(1);

    await user.press(view.getByText('History'));
    expect(props.onOpenHistory).toHaveBeenCalledTimes(1);

    // And nothing on the hub still offers the two old destinations by name.
    expect(view.queryByText('Service due')).toBeNull();
    expect(view.queryByText('Wishlist')).toBeNull();
    expect(view.queryByText('Build')).toBeNull();
  });
});

/**
 * ── `null` is never `0` ─────────────────────────────────────────────────────
 *
 * `HubCounts` carries the rule and the binnacle has to keep it: a count the
 * screen could not read is nothing on the cell, and a zero it *did* read is a
 * zero in the legend's ink — an empty plan is not a warning, and a failed
 * request is not an empty plan. The two cases are held together because a
 * screen that printed "0" for both would pass either one alone.
 */
describe('the counts on the binnacle', () => {
  /** The vehicle, the records, and whatever the wishlist request should do. */
  function respondWithWishlist(wishlist: () => Promise<unknown>) {
    request.mockImplementation((path: string) => {
      if (path.startsWith('/wishlist')) return wishlist() as never;
      if (path.startsWith('/load-maintenance-data')) {
        return Promise.resolve({ maintenanceLineItems: [{ created_at: '2026-08-06T02:43:11Z' }] }) as never;
      }
      return Promise.resolve({
        vehicle: {
          id: 'v1',
          year: 2018,
          make: 'Honda',
          model: 'Accord',
          vehicle_health_summary: { health_score: 61 },
          nhtsa_data: {
            recalls: [
              { NHTSACampaignNumber: '23V-441', Component: 'FUEL SYSTEM', Summary: 'Pump may fail.' },
              { NHTSACampaignNumber: '21V-100', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' },
            ],
          },
        },
      }) as never;
    });
  }

  it('prints a zero it read, in the legend’s ink', async () => {
    respondWithWishlist(() => Promise.resolve({ wishlistItems: [] }));
    const { view } = await mount();

    /*
      Within the cells, since 21 Sep: the HEALTH cell's dial sweeps 0 → 100 →
      the reading on appear, so a "0" can be on the screen for a frame that is
      not a count at all. The claim is about the count cells.
    */
    /*
      22 Sep: a zero the screen read is a sentence in the legend's ink — the
      hub lenses' "zeros are dead ends" (UX U4, IA I5). "Nothing planned yet"
      reports the state (PLAN is a tab; its cell may not command); never a
      dimmed 0.
    */
    const plan = await view.findByLabelText('Plan, 0.');
    const empty = within(plan).getByText('Nothing planned yet');
    expect(readoutColor(empty)).toBe(text.muted);
    expect(within(plan).queryByText('0')).toBeNull();

    // The anti-vacuous half: a count that is not zero is set in the value's ink.
    const history = view.getByLabelText(/^History, 1 /);
    expect(readoutColor(within(history).getByText('1'))).toBe(text.primary);
    expect(within(history).getByText('record')).toBeTruthy();
    // And the recall count carries its word beneath: "2 / open" — one word for the block (IA I5, UX U5).
    const recalls = view.getByLabelText(/^View 2 open recalls/);
    expect(readoutColor(within(recalls).getByText('2'))).toBe(text.primary);
    expect(within(recalls).getByText('open')).toBeTruthy();
  });

  it('prints no recall count for a car NHTSA was never asked about, and a grey 0 for one it cleared', async () => {
    /*
      The route's rule, on the cell: an absent `recalls` is "never
      checked" and prints nothing; an empty array is "asked, none" and
      prints 0 in the legend's ink. The old page was silent for both; the
      binnacle once printed 0 for both. Held together so a cell that printed
      0 for every car would fail on the first half.
    */
    respond({ nhtsa_data: null, vehicle_health_summary: null });
    const never = await mount();
    await never.view.findAllByText(/2018 Honda Accord/);
    const unchecked = never.view.getByLabelText('Recalls, not checked yet. Opens the account of the score.');
    expect(within(unchecked).queryByText(/^\d+$/)).toBeNull();

    respond({ nhtsa_data: { recalls: [] }, vehicle_health_summary: null });
    const clean = await mount();
    await clean.view.findAllByText(/2018 Honda Accord/);
    const cleared = clean.view.getByLabelText('View 0 open recalls');
    // Cleared: a sentence in the legend's ink, never a dimmed 0 (22 Sep).
    expect(readoutColor(within(cleared).getByText('None open'))).toBe(text.muted);
  });

  it('prints nothing for a count it could not read', async () => {
    respondWithWishlist(() => Promise.reject(new ApiRequestError({ status: 500, message: 'Timed out' })));
    const { view } = await mount();

    const plan = await view.findByLabelText('Plan.');
    // Nothing in the cell — not a 0, not a dash. (Within the cell since 21 Sep:
    // the HEALTH dial's sweep passes through 0 on appear.)
    expect(within(plan).queryByText(/^\d+$/)).toBeNull();
    expect(within(plan).queryByText('Nothing planned yet')).toBeNull();
    expect(within(view.getByLabelText(/^History, 1 /)).getByText('1')).toBeTruthy();
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
      ⚠ Rewritten 23 Aug with the hub, again with the IA merge, and again on
      13 Sep when the hub became a binnacle. The claim is the same one — the
      verb this screen exists to lead to must not sit under a stack of
      instruments — but the landmarks keep moving: the instruments left this
      screen, five hub rows became three (R14, R15), and then the rows became
      cells of one panel with the acts as switches at its foot. THIS CAR is
      gone with the list it named.
    */
    /*
      ⚠ And again on 22 Sep, when the hub's three lenses reshaped the sheet:
      the act is the prime slot over the plate (SCAN INVOICE, always), ASK
      THE ADVISOR is gone (the ADVISOR tab is beneath), and the panel reads
      verdict → next service → the counts → tires → the answers.
    */
    expect(at('Next service')).toBeGreaterThan(-1);
    expect(at('Ask the advisor')).toBe(-1);
    expect(at('Review recalls')).toBe(-1);
    expect(at('Scan invoice')).toBeGreaterThan(-1);

    /*
      The reading, then what it needs, then the places to go — then **the
      act**, then the door to the answers. The act's position is an
      assertion now rather than a presence check: it left the nav layer for
      the sheet on 22 Sep (David), and the one thing a refactor must not be
      able to do quietly is slide it inside the section it sits above.
    */
    expect(at('Fair')).toBeLessThan(at('Next service'));
    expect(at('Next service')).toBeLessThan(at('Plan'));
    expect(at('Plan')).toBeLessThan(at('Tires'));
    expect(at('Tires')).toBeLessThan(at('Scan invoice'));
    expect(at('Scan invoice')).toBeLessThan(at('What you told us'));
  });

  it('keeps the record act in the slot whatever the recalls say (22 Sep, round 2)', async () => {
    /*
      Round 2 had REVIEW RECALLS take the slot while any campaign was
      unreviewed — two lenses read it as a second entrance to the RECALLS
      cell that evicts the act the page exists for, on a 2003 Accord
      forever. The △ cell is the recall prompt; the slot is the scan.
    */
    const user = userEvent.setup();
    respond();
    const { props, view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    expect(view.queryByText(/Review recalls/)).toBeNull();
    await user.press(view.getByLabelText(/^Scan an invoice/));
    expect(props.onScanInvoice).toHaveBeenCalledTimes(1);
    expect(props.onViewRecalls).not.toHaveBeenCalled();
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
    /*
      21 Sep: the reading is the card dial's numeral, inside its arc (B3), so
      the sweep is held (reduced motion) to read the landed value. It was the
      plate's numeral size bare (13 Sep), the card's 30 before that. No chip,
      and no instrument over the photograph: the one reading on the screen is
      in the sheet, under the car.
    */
    jest.spyOn(RN.AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    respond();
    const { view } = await mount(REFERENCE);

    await view.findAllByText(/2018 Honda Accord/);

    const readouts = await view.findAllByText('61');
    expect(readouts).toHaveLength(1);
    expect(readoutSizes(readouts)).toEqual([Math.round(120 * (60 / 172))]);
    // And it sits inside an arc: the cell draws the gauge's track.
    expect(hostNodes(view.toJSON(), 'RNSVGPath').length).toBeGreaterThan(0);
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

  it('lets the nav title arrive once the sheet has covered the name, inside the stagger', () => {
    /*
      13 Sep. The nav title used to arrive at a constant offset chosen for a
      long ledger; on the binnacle's short sheet every unneeded point of
      travel is empty sheet. So it arrives when the sheet has covered the
      identity block — the geometry `navFadeStartFor` carries — and never
      before the hero name has finished fading, never after the constant.
    */
    const { titleAnchor } = heroBands(detailHeroHeight(REFERENCE.frame.height));
    const covered = navFadeStartFor({ titleAnchor, identityHeight: 120 });

    // The reference block: after the hero name is gone, before the constant.
    expect(covered).toBeGreaterThanOrEqual(HERO_TITLE_FADE_SPAN);
    expect(covered).toBeLessThan(HERO_NAV_FADE_START);
    // And it is the covering, not a guess: the sheet's top meets the block's
    // drifting top exactly there.
    const sheetTop = -HERO_SHEET_OVERLAP - covered; // relative to the hero's foot
    const blockTop = -(titleAnchor + 120) - HERO_PARALLAX_RATE * covered;
    expect(Math.abs(sheetTop - blockTop)).toBeLessThan(1);

    // The two bounds, so a block can neither outrun the stagger nor delay the constant.
    expect(navFadeStartFor({ titleAnchor, identityHeight: 0 })).toBe(HERO_TITLE_FADE_SPAN);
    expect(navFadeStartFor({ titleAnchor, identityHeight: 600 })).toBe(HERO_NAV_FADE_START);
    // An earlier start lowers the floor by exactly that much, until the other
    // thing the floor waits for — the sheet passing under the nav — asks for more.
    const heroH = detailHeroHeight(REFERENCE.frame.height);
    expect(sheetMinHeight(791, heroH, { navFadeStart: covered })).toBe(
      sheetMinHeight(791, heroH) - (HERO_NAV_FADE_START - covered),
    );
    const navHeight = REFERENCE.insets.top + 44;
    const underTheNav = 791 - navHeight;
    expect(sheetMinHeight(791, heroH, { navFadeStart: covered, navHeight })).toBe(
      Math.max(sheetMinHeight(791, heroH, { navFadeStart: covered }), underTheNav),
    );
  });

  it('gives the sheet the room for the nav title to arrive, whatever it carries', async () => {
    /*
      13 Sep. The binnacle is half a display tall, and a sheet the height of
      its content stops the scroll ~160pt in — past the hero name's fade,
      short of the nav name's arrival — so the car had no name at the end of
      the scroll. The floor is derived from the motion constants rather than
      chosen: at the height it gives, the scroll can reach the end of the nav
      fade exactly, and moving a span moves the floor with it.
    */
    const heroH = detailHeroHeight(REFERENCE.frame.height);
    const travelAtFloor =
      heroH - HERO_SHEET_OVERLAP + sheetMinHeight(REFERENCE.frame.height, heroH) - REFERENCE.frame.height;
    expect(travelAtFloor).toBe(HERO_NAV_FADE_START + HERO_NAV_FADE_SPAN);

    respond();
    const { view } = await mount(REFERENCE);
    await view.findAllByText(/2018 Honda Accord/);

    /*
      And the sheet actually carries it: the one `View` with the sheet's
      shadow. No layout event fires under this renderer, so the screen is on
      its stand-ins — the window for the viewport, the constant for the nav
      fade's start — and the nav's own height, which it knows from the insets.
    */
    const sheet = hostNodes(view.root, 'View').find(
      (props) => (StyleSheet.flatten(props.style as never) as { shadowRadius?: number })?.shadowRadius === 22,
    );
    expect(sheet).toBeDefined();
    expect((StyleSheet.flatten(sheet!.style as never) as { minHeight?: number }).minHeight).toBe(
      sheetMinHeight(REFERENCE.frame.height, heroH, { navHeight: REFERENCE.insets.top + 44 }),
    );
  });

  it('cuts the plate where it meets the sheet, with the plate\'s leg', async () => {
    /*
      13 Sep · B2. The plate's top-right corner is under the status bar on
      this screen, so its one visible corner is the sheet's leading edge,
      and the cut is painted there: `cut.plate` of page colour over the
      plate's corner, the garage plate's and the masthead's construction.
      Read off the rendered path so a cover that grew a leg, or lost its
      ground, fails here rather than in a frame.
    */
    respond();
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    const [expected] = cornerCovers(cut.plate, cut.plate, cut.plate, ['bottomRight']);
    const covers = hostNodes(view.root, 'RNSVGPath').filter((props) => props.d === expected);
    expect(covers).toHaveLength(1);
    // Page colour, so it reads as the plate's corner removed and not as a mark on it.
    const fill = covers[0].fill as { payload?: unknown } | undefined;
    expect(fill && typeof fill === 'object' && 'payload' in fill ? fill.payload : fill).toBe(processColor(surface.page));
    // The hairline stops where the bevel begins.
    const edge = hostNodes(view.root, 'View').find(
      (props) => (StyleSheet.flatten(props.style as never) as { backgroundColor?: string })?.backgroundColor === border.panel
        && (StyleSheet.flatten(props.style as never) as { height?: number })?.height === StyleSheet.hairlineWidth,
    );
    expect(edge).toBeDefined();
    expect((StyleSheet.flatten(edge!.style as never) as { marginRight?: number }).marginRight).toBe(cut.plate);

    /*
      21 Sep · and the rule turns up the bevel. Three rounds graded the plate
      "no cut a user can see": 8pt of page graphite into a near-black corner
      of a photograph is a shape nobody finds, and the rule stopping short
      read as a broken line. The hairline runs the hypotenuse — (0, cut) to
      (cut, 0), the cover's own edge — in the panel's ink, so the geometry
      registers as line whatever the photograph does.
    */
    const bevel = hostNodes(view.root, 'RNSVGLine').find(
      (props) => Number(props.x1) === 0 && Number(props.y1) === cut.plate && Number(props.x2) === cut.plate && Number(props.y2) === 0,
    );
    expect(bevel).toBeDefined();
    const stroke = bevel!.stroke as { payload?: unknown } | undefined;
    expect(stroke && typeof stroke === 'object' && 'payload' in stroke ? stroke.payload : stroke).toBe(processColor(border.panel));
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
  // The 23 Aug sentence, less the preamble the prompt used to mandate (21 Sep).
  const STALE_SUMMARY =
    "With no service records on file, the vehicle's health is highly uncertain — a complete lack of documented maintenance.";

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
    // 13 Sep: the cell prints core's short form of the same claim — the
    // four-line sentence was the critic's most repeated cut on the hub.
    await view.findByText(/Read before 5 service records were filed/i);
    expect(view.queryByText(/taken before your 5 service records/i)).toBeNull();
  });

  it('names what the reading was worked out from', async () => {
    respondWith({
      summary: 'Solid history, nothing overdue.',
      lastGenerated: '2026-08-20T00:00:00+00:00',
      filedAt: '2026-08-06T02:43:11.903661+00:00',
    });

    const { view } = await mount();
    await view.findByText('Solid history, nothing overdue.');

    /*
      What makes a contradiction visible on the screen rather than only to
      somebody who opens the history and compares. Until round 48 (21 Sep)
      that was a "Based on 5 recorded services · 2 open recalls" line; the
      counts row says the same two numbers directly above it, so the line is
      the Health screen's now and the cells carry the facts here.
    */
    /*
      22 Sep, round 3 of the lenses: the basis line told the two numbers a
      third time — the HISTORY and RECALLS cells are directly beneath it —
      and it is the Health screen's now, where provenance is the point. What
      the hub keeps: the two cells, and the door.
    */
    expect(view.queryByText(/Based on 5 recorded services/)).toBeNull();
    await view.findByLabelText(/^History, 5 recorded services\./);
    await view.findByLabelText(/^View 2 open recalls/);
    view.getByRole('button', { name: /^Health score 70/ });
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

  it('carries the cause beside the verdict: a current reading\'s lead, whole, in the HEALTH cell (22 Sep)', async () => {
    /*
      21 Sep moved the sentence out of the cell (six lines in a three-fifths
      cell beside a void); 22 Sep's three lenses put it back beside the dial
      in a cell that is the whole row — "'55 ATTENTION' names no cause"
      (UX U2), "make it HEALTH's caption, same door" (IA I1). The lead ends
      where a sentence ends; `Health` prints all of it.
    */
    const FPACE =
      'The vehicle has a very sparse documented service history, showing only a single recent oil change recorded at 69,573 miles. ' +
      'Given the mileage, key factory-recommended maintenance and inspections for common platform issues are overdue for verification.';
    respondWith({ summary: FPACE, lastGenerated: '2026-09-20T00:00:00+00:00', filedAt: '2026-08-06T02:43:11.903661+00:00' });

    const { view } = await mount();
    const lead = await view.findByText(/very sparse documented service history/);

    // Whole sentences: the first, entire, and not the second.
    expect(lead.props.children).toMatch(/69,573 miles\.$/);
    expect(view.queryByText(/Given the mileage/)).toBeNull();

    // Inside the HEALTH cell, which is its door: an ancestor is that cell.
    const cell = view.getByRole('button', { name: /^Health score 70/ });
    let node: { parent: unknown } | null = lead;
    let inCell = false;
    while (node) {
      if (node === cell) inCell = true;
      node = node.parent as typeof node;
    }
    expect(inCell).toBe(true);
    // And the door says it: the spoken name carries the sentence.
    expect(cell.props.accessibilityLabel).toMatch(/very sparse documented service history/);
  });
});

/**
 * ── Tires is a reading of the panel (21 Sep) ─────────────────────────────────
 *
 * 20 Sep put the fourth leaf under the switches as a `BandRow` — alone, in
 * an idiom nothing near it shared, and the loudest thing on the lower sheet.
 * It is the panel's third row now: a full-width cell that reads the miles
 * since the set was rotated or fitted, says "No set yet" in the absent ink
 * where HEALTH says "No score yet", draws the sodium mark only past the
 * owner's interval, and opens the set.
 */
describe('the tires cell', () => {
  const SET = {
    id: 'set-1',
    vehicle_id: 'v1',
    brand: 'Michelin',
    line: 'Pilot Sport 4S',
    size_front: '245/35R19',
    size_rear: '245/35R19',
    installed_on: '2025-03-12',
    install_odometer: 54_232,
    purchase_place: 'Discount Tire',
    rotation_interval_miles: 6_000,
    interval_source: 'owner',
    treadwear_miles_entered: 45_000,
    provenance: 'invoice',
  };

  function serveTires(body: unknown) {
    request.mockImplementation((path: string) => {
      if (path.startsWith('/tires')) return Promise.resolve(body) as never;
      if (path.startsWith('/wishlist')) return Promise.resolve({ wishlistItems: [] }) as never;
      if (path.startsWith('/load-maintenance-data')) return Promise.resolve({ maintenanceLineItems: [] }) as never;
      return Promise.resolve({
        vehicle: { id: 'v1', year: 2018, make: 'Honda', model: 'Accord', current_mileage: 66_000, vehicle_health_summary: null, nhtsa_data: null },
      }) as never;
    });
  }

  it('reads the miles since the last rotation, in the panel, and opens the set', async () => {
    const user = userEvent.setup();
    serveTires({ set: SET, rotations: [{ id: 'r1', set_id: 'set-1', rotated_on: '2025-11-09', odometer: 60_500, provenance: 'typed' }] });
    const onOpenTires = jest.fn();
    const { view } = await mount(REFERENCE, { onOpenTires });

    // 22 Sep: a countdown, as NEXT SERVICE counts (value V5) — the owner's 6,000 mi interval, 5,500 since.
    const cell = await view.findByLabelText(/^Tires, rotation in 500 mi\. Opens the set\.$/);
    await view.findByText('rotation in 500 mi');
    // A reading of the panel: inside the readings summary, not a row below the switches.
    const panel = view.getByLabelText('Readings');
    let node: { parent: unknown } | null = cell;
    let inPanel = false;
    while (node) {
      if (node === panel) inPanel = true;
      node = node.parent as typeof node;
    }
    expect(inPanel).toBe(true);

    await user.press(cell);
    expect(onOpenTires).toHaveBeenCalledTimes(1);
  });

  it('marks a set past its interval, and only then', async () => {
    serveTires({ set: SET, rotations: [{ id: 'r1', set_id: 'set-1', rotated_on: '2025-06-28', odometer: 59_000, provenance: 'typed' }] });
    const { view } = await mount();
    await view.findByLabelText(/^Tires, rotation overdue by 1,000 mi\./);
    // The mark is drawn beside the legend (the cell's own `warning`), hidden from the reader
    // because the spoken label already says it. No recalls served, so it is the only one.
    expect(view.getAllByText('△', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('draws no mark for a set inside its interval', async () => {
    serveTires({ set: SET, rotations: [{ id: 'r1', set_id: 'set-1', rotated_on: '2025-11-09', odometer: 60_500, provenance: 'typed' }] });
    const { view } = await mount();
    await view.findByLabelText(/^Tires, rotation in 500 mi\. Opens the set\.$/);
    expect(view.queryAllByText('△', { includeHiddenElements: true })).toHaveLength(0);
  });

  it('says there is no set yet, in the absent ink, and never a 0', async () => {
    serveTires({ set: null, rotations: [] });
    const { view } = await mount();
    await view.findByLabelText(/^Tires\. No set on record — add one to count down to each rotation\. Opens the set\.$/);
    const absent = await view.findByText('Add a tire set to count down to each rotation');
    expect(readoutColor(absent)).toBe(text.muted);
    expect(view.queryByText(/^0 mi/)).toBeNull();
  });

  it('draws nothing for a set it cannot count to', async () => {
    // An install with no odometer and no rotation: no "miles since" exists.
    serveTires({ set: { ...SET, install_odometer: null }, rotations: [] });
    const { view } = await mount();
    await view.findByLabelText(/^Tires\. Opens the set\.$/);
    expect(view.queryByText(/Add a tire set/)).toBeNull();
    expect(view.queryByText(/mi since|rotation in/)).toBeNull();
  });

  it('counts up where no interval was entered — the miles since, never a guessed countdown', async () => {
    serveTires({
      set: { ...SET, rotation_interval_miles: null, interval_source: null },
      rotations: [{ id: 'r1', set_id: 'set-1', rotated_on: '2025-11-09', odometer: 60_500, provenance: 'typed' }],
    });
    const { view } = await mount();
    await view.findByLabelText(/^Tires, 5,500 mi since last rotation\. Opens the set\.$/);
    await view.findByText('5,500 mi since last rotation');
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

      13 Sep: the row is gone too — the reading *is* the door now. The HEALTH
      cell of the binnacle carries the score, the band, the verdict, and says
      in its own name that it opens the account of the score. The claim holds
      on the spoken name because that is what a reader who cannot see the
      chevron is told; a cell that stopped announcing where it goes would fail
      here before anyone noticed it on a device.
    */
    const door = await view.findByLabelText(/Health score 61 out of 100 — Fair\..*Opens what is driving it\./);
    expect(door.props.accessibilityRole).toBe('button');
  });

  it('opens the health detail from that door', async () => {
    respond();
    const { props, view } = await mount();

    await userEvent.press(await view.findByLabelText(/Opens what is driving it/));
    expect(props.onOpenHealth).toHaveBeenCalled();
  });

  it('draws no back control on the car root, and the collapsed title takes the row\'s start (21 Sep)', async () => {
    /*
      B8: a tab root carries no back chevron. "‹ GARAGE" was right while this
      screen was pushed over the garage; since the Car tab it is a root, and
      round 47's critic read CAR lit in the bar and "‹ GARAGE" over it as two
      doors to one room. The GARAGE tab is the way back.
    */
    respond();
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    expect(view.queryByLabelText('Back to the garage')).toBeNull();
    const titles = await view.findAllByText(/2018 Honda Accord/);
    const nav = titles
      .map((node) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>)
      .find((flat) => flat.flex === 1);
    expect(nav?.textAlign).toBe('left');
  });

  it('floats nothing on the plate — the act is in the sheet (22 Sep, David)', async () => {
    /*
      The act was a pinned pill on the nav row over the photograph, and the
      photo control before it. David: *"i really don't like the scan invoice
      button placement, on the plate on car tab. remove from there, put new
      button above 'what you told us' section."*

      What this pins is the **absence**: nothing on this screen is absolutely
      positioned over the hero any more. Asserted by walking up from the act
      to its ancestors and finding no `position: 'absolute'` with a `right`
      — the shape the pill had — rather than by the button's own style,
      which a re-pinned button would keep.
    */
    respond({ nhtsa_data: { recalls: [] } });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    let node: { parent: unknown; props: Record<string, unknown> } | null = view.getByLabelText(/^Scan an invoice/);
    let pinned = false;
    while (node) {
      const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as { position?: unknown; right?: unknown };
      if (flat.position === 'absolute' && flat.right !== undefined) pinned = true;
      node = node.parent as typeof node;
    }
    expect(pinned).toBe(false);

    // And nothing else in the nav at rest: the photograph's acts are THIS CAR's.
    expect(view.queryByLabelText('Add photo')).toBeNull();
  });

  it('carries one filled primary, and it is the act', async () => {
    /*
      `Button`'s rule — "one filled primary per screen; two means neither is
      one". The error and gone states each carry an `outline` and replace
      this screen rather than sharing it, so the loaded hub must hold
      exactly one filled button.
    */
    respond();
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    /*
      `Button` paints its fill on a `CutSurface` behind the label, so the
      variant is not readable from the Pressable. The **label's ink** is:
      only `primaryLabel` is the page colour, because it is the only variant
      whose ground is off-white. Counting that is counting filled primaries.
    */
    const inkedPage = (node: { props: Record<string, unknown> }) =>
      ((StyleSheet.flatten(node.props.style as never) ?? {}) as { color?: unknown }).color === surface.page;
    const filled = view
      .getAllByRole('button', { includeHiddenElements: true })
      .filter((button) => within(button).queryAllByText(/.+/).some(inkedPage));

    expect(filled).toHaveLength(1);
    expect(within(filled[0]).getByText('Scan invoice')).toBeTruthy();

    /*
      Anti-vacuous: a filter that matched nothing would report "one primary"
      on a screen with none. The error state carries an `outline`, whose ink
      is `text.primary` — so the same reader must find **zero** there, not
      fail to read.
    */
    request.mockRejectedValue(new ApiRequestError({ status: 500, message: 'Network is down' }));
    const failed = await mount();
    await failed.view.findByText('Could not load this vehicle');
    expect(
      failed.view
        .getAllByRole('button', { includeHiddenElements: true })
        .filter((button) => within(button).queryAllByText(/.+/).some(inkedPage))
    ).toHaveLength(0);
    expect(failed.view.getByText('Try again')).toBeTruthy();
  });
});

/**
 * ── The photograph, on the hub ──────────────────────────────────────────────
 *
 * Add, change and remove lived here until 22 Sep — the control in the nav
 * row over the plate, the sheet, the optimistic plate and its revert. The
 * hub's three lenses cut the control from the plate twice, and the acts are
 * THIS CAR's now (`VehicleProfileScreen.test.tsx` holds them). What the hub
 * still owes: the owner's photograph under the house grade, the plate
 * without one, and no photo control of its own.
 */
describe('the photograph, on the hub', () => {
  const PHOTO = 'https://signed.test/car.jpg';

  function hasHouseGrade(tree: unknown): boolean {
    let found = false;
    const walk = (node: unknown) => {
      if (found || !node || typeof node !== 'object') return;
      const host = node as { props?: { style?: unknown }; children?: unknown[] };
      const style = host.props?.style;
      const styles = Array.isArray(style) ? style.flat(Infinity) : [style];
      if (styles.some((s) => s && typeof s === 'object' && 'mixBlendMode' in (s as object))) found = true;
      for (const child of host.children ?? []) walk(child);
    };
    walk(tree);
    return found;
  }

  it('reads a plate as the app’s picture, not the owner’s: no grade — 13 Sep', async () => {
    /*
      Since the plates went live a car nobody photographed arrives with
      `photo_url` set to its plate. Read as the owner's, the plate was graded
      a second time (the hub loop, drift §6.18). The route sends
      `photo_kind`; a plate keeps the plain image.
    */
    respond({ photo_url: PHOTO, photo_kind: 'plate' });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    expect(hasHouseGrade(view.toJSON())).toBe(false);
  });

  it('draws the owner’s photograph as they shot it — no grade, kind named or not (David, 22 Sep)', async () => {
    /*
      Until 22 Sep the owner's picture took the house grade (lifted blacks,
      split tone, a highlight pull, grain — every one a blend-mode layer). A
      daylight snapshot of David's own car read as grey mud under it, and he
      ruled: *"let owners add their images if they prefer to our plate."*
      The photograph is theirs; the plate is the film.
    */
    respond({ photo_url: PHOTO, photo_kind: 'owner' });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    expect(hasHouseGrade(view.toJSON())).toBe(false);

    respond({ photo_url: PHOTO });
    const older = await mount();
    await older.view.findAllByText(/2018 Honda Accord/);
    expect(hasHouseGrade(older.view.toJSON())).toBe(false);

    // The walker can still see a blend layer, so the two negatives above mean something.
    expect(hasHouseGrade({ props: { style: [{ mixBlendMode: 'multiply' }] }, children: [] })).toBe(true);
  });

  it('carries no photo control — the plate opens THIS CAR, where the photograph is changed (22 Sep)', async () => {
    respond({ photo_url: PHOTO, photo_kind: 'owner' });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    expect(view.queryByLabelText('Change photo')).toBeNull();
    expect(view.queryByLabelText('Add photo')).toBeNull();
    // The plate's own mark says where the press lands.
    expect(view.getByText('This car', { includeHiddenElements: true })).toBeTruthy();
    view.getByLabelText(/Opens the car's details: mileage, your answers, the photo, removal/);
  });
});

describe('the research log (20 Sep)', () => {
  /*
    The first car ever saved from the phone sat at "No score yet" because
    nothing a phone could reach started its research. This screen now does,
    and narrates it from the rows — `useResearchRunner.test.tsx` holds the
    runner; these hold the screen's part: the log is there for a pending
    car, the trigger is posted once, and a researched car never sees it.
  */
  function respondResearch(status: 'pending' | 'completed') {
    request.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/load-vehicle')) {
        return {
          vehicle: {
            id: 'v1',
            year: 2003,
            make: 'Honda',
            model: 'Accord',
            current_mileage: 170_000,
            vehicle_health_summary: status === 'completed' ? { health_score: 61, summary: 'Fair.' } : null,
            nhtsa_data: status === 'completed' ? { recalls: [], lookup_status: 'matched' } : null,
          },
          plate: { generation: '7th-generation', year_from: 2003, year_to: 2007 },
          knowledge: { research_status: status, known_issues: status === 'completed' ? [1] : undefined },
        } as never;
      }
      if (path === '/research') return { state: 'researching' } as never;
      return {} as never;
    });
  }

  it('opens the log on a pending car, posts the trigger once, and prints the plate line at once', async () => {
    respondResearch('pending');
    const { view } = await mount();
    await waitFor(() => expect(view.queryByTestId('research-log')).not.toBeNull());
    await waitFor(() => expect(request.mock.calls.filter(([p]) => p === '/research')).toHaveLength(1));
    expect(request.mock.calls.find(([p]) => p === '/research')?.[1]).toMatchObject({ method: 'POST', body: { vehicleId: 'v1' } });
    // The one line that can be true the moment the screen opens.
    view.getByText('→ 7th generation, 2003–2007.');
    view.getByLabelText('Asking NHTSA about open campaigns — in progress');
    // And the cells beneath are honest about not having the rows yet.
    view.getByText('No score yet');
  });

  it('never shows the log, and never posts, for a car already researched', async () => {
    respondResearch('completed');
    const { view } = await mount();
    await waitFor(() => view.getByText('61'));
    expect(view.queryByTestId('research-log')).toBeNull();
    expect(request.mock.calls.filter(([p]) => p === '/research')).toHaveLength(0);
    expect(request.mock.calls.filter(([p]) => p === '/health')).toHaveLength(0);
  });
});

describe('removing the car (20 Sep; behind the details since 22 Sep)', () => {
  it('does not end on a destructive act — the removal is the details screen\'s foot', async () => {
    /*
      The hub's three lenses agreed (UX U8, IA I7, value V8): "once per car,
      not daily; behind the edit door." The plate opens the car's details;
      `VehicleProfileScreen.test.tsx` holds the button there.
    */
    respond();
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    expect(view.queryByText('Remove this car')).toBeNull();
    expect(request.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE')).toBe(false);
  });
});

describe('the research poll is one request (20 Sep)', () => {
  it('a quiet reload asks for the vehicle alone — three a poll was 72 a minute against a limiter of 60', async () => {
    request.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/load-vehicle')) {
        return {
          vehicle: { id: 'v1', year: 2009, make: 'Mazda', model: 'Mazda3', current_mileage: 95_000, vehicle_health_summary: null, nhtsa_data: null },
          plate: { generation: 'bk', year_from: 2003, year_to: 2009 },
          knowledge: { research_status: 'pending' },
        } as never;
      }
      if (path === '/research') return { state: 'researching' } as never;
      return {} as never;
    });
    const { view } = await mount();
    await waitFor(() => expect(view.queryByTestId('research-log')).not.toBeNull());
    // The mount's own three requests and the trigger are done; what follows is the poll.
    await waitFor(() => expect(request.mock.calls.some(([p]) => p === '/research')).toBe(true));
    const before = request.mock.calls.length;
    // One poll (2.5 s), on the real clock: only `/load-vehicle` may be asked.
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(before), { timeout: 6_000 });
    const polled = request.mock.calls.slice(before).map(([p]) => String(p).split('?')[0]);
    expect(polled.every((p) => p === '/load-vehicle')).toBe(true);
    expect(polled.some((p) => p === '/load-maintenance-data' || p === '/wishlist')).toBe(false);
  });
});

/**
 * ── The hub under three lenses — 22 Sep ─────────────────────────────────────
 *
 * David: *"i want critic to think about UI/UX of the page, the information
 * architecture, and the value of the functionality… Get this page to a 9."*
 * Three critics, one round each in BRIEF mode, and the briefs converged
 * (`design-loop/mobile-ios/hub-lenses/`). What they asked for that a test can
 * hold is here: the service by its name with the owner's months beside the
 * miles, every question as a row, the plate as the door to the car, the
 * odometer's as-of.
 */
describe('the hub under three lenses (22 Sep)', () => {
  it('names the service plainly and adds the owner\'s own months to the miles', async () => {
    /*
      "ENGINE OIL & FILTER CHANGE (ENTHUSIAST)" carried a schedule tier inside
      a job's name (UX U9, IA I6); "in 4,500 mi" said no when (value V2). The
      tier goes, "&" reads "and", and 500 a month makes 4,500 mi about nine
      months — the owner's figure, so the word is "about".
    */
    respond({
      next_service_label: 'Engine Oil & Filter Change (Enthusiast)',
      next_service_at_miles: 99_300,
      current_mileage: 94_800,
      avg_miles_per_month: 500,
    });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    await view.findByText('Engine Oil and Filter Change');
    expect(view.queryByText(/Enthusiast/i)).toBeNull();
    await view.findByText('in 4,500 mi · about 9 months');
  });

  it('keeps the miles alone where the owner never said how far they drive', async () => {
    respond({ next_service_label: 'Brake fluid', next_service_at_miles: 99_300, current_mileage: 94_800, avg_miles_per_month: null });
    const { view } = await mount();
    await view.findByText('in 4,500 mi');
    expect(view.queryByText(/about/)).toBeNull();
  });

  it('lists every question, the unanswered ones as prompts, and the objective by its lead phrase', async () => {
    /*
      The F-PACE showed one row and hid the two questions its reading depends
      on (UX U7, IA I3, value V7); the Accord's OWNERSHIP printed "Keep
      forever - Dail…" (UX U3, IA I4). Every row is a door to the question.
    */
    const user = userEvent.setup();
    respond({
      avg_miles_per_month: null,
      performance_mindedness: 'stock',
      ownership_objective: 'Keep forever - Daily commuter. Want to keep it reliable past 200,000 miles.',
    });
    const { props, view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    const miles = await view.findByLabelText('Miles a month: not answered yet. Dates your next service. Opens the question.');
    expect(within(miles).getByText('Tell us')).toBeTruthy();
    expect(readoutColor(within(miles).getByText('Tell us'))).toBe(text.muted);
    // What answering buys, under the question, while it is open.
    expect(within(miles).getByText('Dates your next service')).toBeTruthy();
    view.getByLabelText(/^Modifications: Keep it stock\./);
    const ownership = view.getByLabelText(/^Ownership: Keep forever - Daily commuter\. Want to keep it reliable/);
    expect(within(ownership).getByText('Keep forever')).toBeTruthy();
    expect(view.queryByText(/Dail…|Daily commuter/)).toBeNull();

    await user.press(miles);
    expect(props.onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('opens the car\'s details from the plate, and says the odometer\'s age on the strip', async () => {
    /*
      "No door to the car itself … the facts strip is the page's only non-door
      row" (IA I3, I7); "mileage is a fact, not a reading … nothing says when
      that was set" (value V1, UX U6). The door sits in the sheet's spacer
      over the identity block; the strip's MILEAGE eyebrow carries the age.
    */
    const user = userEvent.setup();
    const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();
    respond({ last_mileage_update_date: threeWeeksAgo });
    const { props, view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    await view.findByText('3 wk ago');
    await user.press(view.getByLabelText(/^2018 Honda Accord\. Opens the car's details/));
    expect(props.onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('says what holds the score back, as a reason, in the block\'s one word for recalls', async () => {
    /*
      Round 3 of the lenses: "24 recalls on record." beside 88 GOOD read as a
      fact with a full stop, not a reason, and the same 24 was told three
      ways on one screen. The cause is a sentence — "Held back by … — act." —
      and recalls are "open", in the hub's own count, for this model.
    */
    request.mockImplementation((path: string) => {
      // Eleven records: a history thick enough that the drivers, not the count, name the cause.
      if (path.startsWith('/load-maintenance-data')) return Promise.resolve({ maintenanceLineItems: Array.from({ length: 11 }, (_, i) => ({ id: i, created_at: '2026-08-01T00:00:00Z' })) }) as never;
      if (path.startsWith('/wishlist')) return Promise.resolve({ wishlistItems: [] }) as never;
      return Promise.resolve({
        vehicle: {
          id: 'v1', year: 2018, make: 'Honda', model: 'Accord', current_mileage: 94_800,
          vehicle_health_summary: { health_score: 88, summary: 'Excellent history.', last_generated: '2026-09-20T00:00:00Z' },
          nhtsa_data: { recalls: [
            { NHTSACampaignNumber: '23V-441', Component: 'FUEL SYSTEM', Summary: 'Pump may fail.' },
            { NHTSACampaignNumber: '21V-100', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' },
          ] },
          recall_actions: [{ campaign_number: '21V-100', action: 'repaired' }],
        },
        health_drivers: [
          { key: 'maintenance', label: 'Maintenance', score: 96, detail: 'Nothing overdue, across 8 tracked services.', nothingOutstanding: true },
          { key: 'recalls', label: 'Recalls', score: 70, detail: '2 recalls on record.', cause: '2 recalls for this model', act: 'review them' },
          { key: 'mileage-load', label: 'Mileage load', score: 90, detail: 'About 11,000 miles a year over 8 years, against a 12,000 average.' },
        ],
      }) as never;
    });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);

    // The hub's own count — one open, one marked — never the driver's "on record".
    await view.findByText('Held back by 1 open recall for this model.');
    expect(view.queryByText(/on record/)).toBeNull();
    // The model's prose is HEALTH's, one tap away: not on the hub beside a cause.
    expect(view.queryByText('Excellent history.')).toBeNull();
    // And the cell's word is the same word, with the match on the count.
    const recalls = view.getByLabelText(/^View 1 open recall/);
    expect(within(recalls).getByText('open')).toBeTruthy();
    expect(within(recalls).getByText('this model')).toBeTruthy();
  });

  it('names a thin history first, with the recalls beside it — the cause alone, no imperative (rounds 4–5)', async () => {
    /*
      The F-PACE: one record in 69,573 miles, four open recalls, 55. Three
      lenses read "4 open recalls" as an unconvincing sole reason; the
      history is the driver an owner can move, and both share the blame.
    */
    request.mockImplementation((path: string) => {
      if (path.startsWith('/load-maintenance-data')) return Promise.resolve({ maintenanceLineItems: [] }) as never;
      if (path.startsWith('/wishlist')) return Promise.resolve({ wishlistItems: [] }) as never;
      return Promise.resolve({
        vehicle: {
          id: 'v1', year: 2017, make: 'Jaguar', model: 'F-PACE', current_mileage: 69_573,
          vehicle_health_summary: { health_score: 55, summary: 'Sparse history.', last_generated: '2026-09-20T00:00:00Z' },
          nhtsa_data: { recalls: [
            { NHTSACampaignNumber: '23V-441', Component: 'FUEL SYSTEM', Summary: 'Pump may fail.' },
            { NHTSACampaignNumber: '21V-100', Component: 'AIR BAGS', Summary: 'Inflator may rupture.' },
          ] },
        },
        health_drivers: [
          { key: 'maintenance', label: 'Maintenance', score: 100, detail: '11 services with no record to count from. Nothing overdue among the 1 we can check.', nothingOutstanding: true, cause: '11 services with no record to count from', act: 'scan an invoice' },
          { key: 'recalls', label: 'Recalls', score: 40, detail: '2 recalls on record.', cause: '2 recalls for this model', act: 'review them' },
          { key: 'mileage-load', label: 'Mileage load', score: 85, detail: 'About 8,700 miles a year over 8 years, against a 12,000 average.' },
        ],
      }) as never;
    });
    const { view } = await mount();
    await view.findAllByText(/2017 Jaguar F-PACE/);
    // No maintenance rows served: the hub's own count is zero, and it leads.
    await view.findByText('Held back by no records on file and 2 open recalls for this model.');
  });

  it('names one record on file before the drivers can, on a mileage-driven schedule', async () => {
    /*
      A service with no record is counted from the next interval boundary,
      so the drivers read a one-record car as "nothing overdue" and name the
      recalls; the record count is the hub's own fact and leads under three.
    */
    request.mockImplementation((path: string) => {
      if (path.startsWith('/load-maintenance-data')) return Promise.resolve({ maintenanceLineItems: [{ id: 1, created_at: '2026-08-01T00:00:00Z' }] }) as never;
      if (path.startsWith('/wishlist')) return Promise.resolve({ wishlistItems: [] }) as never;
      return Promise.resolve({
        vehicle: {
          id: 'v1', year: 2017, make: 'Jaguar', model: 'F-PACE', current_mileage: 69_573,
          vehicle_health_summary: { health_score: 55, summary: 'Sparse history.', last_generated: '2026-09-20T00:00:00Z' },
          nhtsa_data: { recalls: [] },
        },
        health_drivers: [
          { key: 'maintenance', label: 'Maintenance', score: 100, detail: 'Nothing overdue, across 12 tracked services.', nothingOutstanding: true },
          { key: 'recalls', label: 'Recalls', score: 100, detail: 'No recalls on record.', nothingOutstanding: true },
        ],
      }) as never;
    });
    const { view } = await mount();
    await view.findAllByText(/2017 Jaguar F-PACE/);
    await view.findByText('Held back by one record on file.');
  });

  it('says nothing about the date where the owner never said how far they drive — the ask is under MILES A MONTH (22 Sep)', async () => {
    /*
      Rounds 5–6 printed "no date without your miles a month" under the
      timing. It was the thin car's third NEXT SERVICE line and it pushed the
      count row's legends under the tab bar at rest; David's ruling: an
      unknown date is nothing (§10), and the ask lives where the answer does.
    */
    respond({ next_service_label: 'Brake fluid', next_service_at_miles: 99_300, current_mileage: 94_800, avg_miles_per_month: null });
    const { view } = await mount();
    const cell = await view.findByLabelText(/^Next service, Brake fluid, in 4,500 mi\./);
    expect(within(cell).queryByText(/miles a month/)).toBeNull();
    expect(within(cell).getByText('in 4,500 mi')).toBeTruthy();
    // The question, one door, with what answering buys.
    view.getByLabelText('Miles a month: not answered yet. Dates your next service. Opens the question.');
  });

  it('prints USE as the ask, in the absent ink, while the owner has not said how they use the car (22 Sep)', async () => {
    /*
      The cell used to drop, which left the question nowhere on the page —
      USE lives on the strip so it is printed once, and the strip printed
      nothing (IA, round 6: "the only empty on the page that does not
      invite"). David: "Tell us".
    */
    // Every question answered but this one, so the page's only "Tell us" is the strip's.
    const answered = { avg_miles_per_month: 500, performance_mindedness: 'stock', ownership_objective: 'Keep forever' };
    respond({ ...answered, vehicle_status: null, trim: 'EX-L' });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    const ask = view.getByText('Tell us', { includeHiddenElements: true });
    expect(readoutColor(ask)).toBe(text.muted);
    expect(view.getByText('Use', { includeHiddenElements: true })).toBeTruthy();

    respond({ ...answered, vehicle_status: 'daily_driver', trim: 'EX-L' });
    const used = await mount();
    await used.view.findAllByText(/2018 Honda Accord/);
    expect(used.view.getByText('Daily Driver', { includeHiddenElements: true })).toBeTruthy();
    expect(used.view.queryByText('Tell us', { includeHiddenElements: true })).toBeNull();
  });

  it('carries no ordinals on WHAT YOU TOLD US — three questions are not a record list (22 Sep)', async () => {
    respond({ avg_miles_per_month: 500, performance_mindedness: 'stock', ownership_objective: 'Keep forever' });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    const miles = await view.findByLabelText(/^Miles a month: /);
    for (const row of [miles, view.getByLabelText(/^Modifications: /), view.getByLabelText(/^Ownership: /)]) {
      expect(within(row).queryByText(/^0[1-3]$/, { includeHiddenElements: true })).toBeNull();
    }
  });

  it('bands a reading on a thin file as a thin history, not as a verdict on the car (22 Sep)', async () => {
    /*
      The reviewer's F-PACE: one record in 69,573 miles, read at 55, and the
      dial said NEEDS ATTENTION in sodium — a verdict on the car where what
      the app has is almost nothing to judge from. David's ruling. The score
      is untouched; the word under it names the file.
    */
    const withRecords = (count: number) =>
      request.mockImplementation((path: string) => {
        if (path.startsWith('/load-maintenance-data')) {
          return Promise.resolve({
            maintenanceLineItems: Array.from({ length: count }, (_, i) => ({
              id: String(i),
              created_at: '2020-01-01T00:00:00Z',
            })),
          }) as never;
        }
        if (path.startsWith('/wishlist') || path.startsWith('/tires')) return Promise.resolve({}) as never;
        return Promise.resolve({
          vehicle: {
            id: 'v1',
            year: 2018,
            make: 'Honda',
            model: 'Accord',
            vehicle_health_summary: { health_score: 55, summary: 'Fair.', last_generated: '2026-09-01T00:00:00Z' },
          },
        }) as never;
      });

    withRecords(1);
    const { view } = await mount();
    const thin = await view.findByLabelText(/^Health score 55 out of 100 — Thin history\./);
    expect(within(thin).queryByText(/Attention/i)).toBeNull();

    // Three records and the same score bands normally, so the case above means something.
    withRecords(3);
    const judged = await mount();
    await judged.view.findByLabelText(/^Health score 55 out of 100 — Needs attention\./);
  });

  it('gives the odometer’s note the door’s mark once the reading is over a month old, and only then (22 Sep)', async () => {
    /*
      "in 4,500 mi" is counted from a reading, never from a guess; the value
      lens asked whether the countdown should age with the odometer. David's
      ruling: keep counting from the real reading, and past a month make its
      note the ask — the door's mark comes back on the stale line alone.
    */
    const sixWeeksAgo = new Date(Date.now() - 42 * 86_400_000).toISOString();
    respond({ last_mileage_update_date: sixWeeksAgo });
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    await view.findByText('6 wk ago');
    expect(view.getAllByTestId('stat-note-door', { includeHiddenElements: true })).toHaveLength(1);
    view.getByLabelText(/Opens the car's details: .* The odometer was set 6 wk ago; update it there\./);

    /*
      ⚠ The mark alone, never a word beside it: "5 wk ago · update" truncated
      to "5 WK AGO ·…" in a third of the strip, which says less than the age.
      The spoken door carries the ask in full.
    */
    expect(view.queryByText(/update/)).toBeNull();

    const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();
    respond({ last_mileage_update_date: threeWeeksAgo });
    const fresh = await mount();
    await fresh.view.findByText('3 wk ago');
    expect(fresh.view.queryByTestId('stat-note-door', { includeHiddenElements: true })).toBeNull();
    expect(fresh.view.queryByLabelText(/update it there/)).toBeNull();
  });

  it('carries no advisor button and no account word of its own', async () => {
    respond();
    const { view } = await mount();
    await view.findAllByText(/2018 Honda Accord/);
    expect(view.queryByText(/Ask the advisor/i)).toBeNull();
    expect(view.queryByText(/^Account$/i)).toBeNull();
  });
});
