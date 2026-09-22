/**
 * Every screen an owner dwells on opens on a frame.
 *
 * ── Why a coverage guard and not a look ─────────────────────────────────────
 *
 * On 11 Sep David looked at the phone and said *"the tabs with images look
 * dramatically better right now … let's add images."* `MastheadPlate` shipped
 * that day, and its own note recorded the rule it was made under — the film is
 * *"carried by imagery and colour grade while the interface itself stays
 * flat"*, so *"a root with no imagery has nothing carrying it."*
 *
 * It was scoped to three tab roots. Eleven days later the same observation
 * came back about the whole app, and the audit said why: **imagery reached 6
 * screens of 29**, so most of the product was running the flat half of the
 * direction with nothing on top of it. The fix is `PlateBand` and the screens
 * listed below.
 *
 * That fix rots silently. A screen refactored into a new container keeps
 * rendering, keeps passing its own suite, and loses its frame — and the only
 * symptom is that the app goes grey again over a few months, one screen at a
 * time, which is precisely how it got here. So the coverage is asserted
 * rather than remembered.
 *
 * ⚠ **This is a source scan, and §5 applies to it hardest.** A walker that
 * silently finds nothing reports a perfect app forever. Both halves are here:
 * every file is asserted to have been read, and the anti-vacuous case proves
 * a missing band is still detectable.
 *
 * ── What is deliberately *not* listed ───────────────────────────────────────
 *
 * Screens that already carry imagery by another route, and must not get a
 * second frame:
 *
 *   - `GarageScreen`, `VehicleDetailScreen`, `TiresScreen` — a car photograph
 *     or the house plate, through `GarageBay`, `HeroBed` and `TirePlate`.
 *   - `ServiceScreen`, `PlanScreen`, `AdvisorScreen` — `RootScreen`'s
 *     masthead band.
 *   - `ServiceHistoryScreen`, `ServiceMilestoneScreen`, `BuildScreen`,
 *     `WishlistScreen` — ⚠ these render **inside** the Service and Plan
 *     roots as segments, not as destinations of their own, so the root's
 *     masthead is already above them. The first audit counted them as
 *     plateless because it counted *files*; they are not, and giving them a
 *     band would put two frames on one screen.
 *   - `RecallDetailScreen` — ⚠ not a destination at all. See the note on it
 *     in `ALREADY_CARRIED`; the route of that name renders `HealthScreen`.
 *
 * And the ones excluded on their own terms, written down here because an
 * undocumented exception is how a list stops meaning anything:
 *
 *   - `InvoiceScanScreen` — a live camera viewfinder fills the screen, so the
 *     imagery is the subject rather than a frame around it.
 *   - `WishlistAddScreen` — ⚠ its filter is pinned *outside* the scroller, so
 *     a band there is never scroll content: it would hold 132pt, 15% of the
 *     display, permanently on the app's longest list. A band was shipped here
 *     for one commit and reverted when that was measured. The screen's own
 *     docblock carries the full argument and the second clause it produced —
 *     a screen whose scroller is not its first child cannot host a band.
 *   - `RemoveVehicleScreen`, `AddVehicleScreen`, `ScanVinScreen`,
 *     `TypeVinScreen`, `DescribeCarScreen`, `OwnerAnswersScreen`,
 *     `TireSetFormScreen`, `TireIntervalScreen`, `TireRotationScreen` —
 *     short forms and confirmations, where a 132pt frame is most of the
 *     screen and the screen is one question.
 *   - `PaywallScreen`, `SignInScreen`, `MarkDoneSheet` — modal and
 *     pre-auth surfaces, outside the stacks the frame rule is written for.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');

/**
 * The screens that must open on a frame, and which frame.
 *
 * The frame follows the **stack**, not the subject: a screen in the garage's
 * stack is about one car and takes the house plate; an invoice is the
 * workshop apron. `PlateBand` carries the rule.
 */
const CARRIES_A_BAND: ReadonlyArray<{ file: string; frame: string }> = [
  { file: 'AccountScreen.tsx', frame: 'house' },
  { file: 'HealthScreen.tsx', frame: 'house' },
  { file: 'VehicleProfileScreen.tsx', frame: 'house' },
  { file: 'InvoiceDetailScreen.tsx', frame: 'service' },
];

/** Screens whose imagery arrives another way — a band here would be a second frame. */
const ALREADY_CARRIED = [
  'GarageScreen.tsx',
  'VehicleDetailScreen.tsx',
  'TiresScreen.tsx',
  'ServiceScreen.tsx',
  'PlanScreen.tsx',
  'AdvisorScreen.tsx',
  'ServiceHistoryScreen.tsx',
  'ServiceMilestoneScreen.tsx',
  'BuildScreen.tsx',
  'WishlistScreen.tsx',
  /*
    ⚠ `RecallDetailScreen` is here, and the first draft of this file had it in
    `CARRIES_A_BAND` instead. That was wrong twice over.

    `RootNavigator` gives the `RecallDetail` **route** a `HealthScreen`, and
    the only production call site of `RecallDetailScreen` is `HealthScreen`,
    always with `embedded`. So it is never a destination, and Health's band is
    the one an owner sees.

    The bookkeeping error is the instructive half: this suite listed the file
    as contributing coverage *and* asserted, thirty lines down, that its band
    never renders. A guard that documents its own vacuity is §5's exact
    failure, and it passed green while doing it. It took an independent
    critic pass to notice, which is the argument for having one.
  */
  'RecallDetailScreen.tsx',
];

/**
 * Screens excluded on their own terms, which must therefore draw **no** band.
 *
 * ⚠ This list exists because removing a screen from `CARRIES_A_BAND` silently
 * stops checking it. `WishlistAddScreen` spent one commit with a band and had
 * it reverted on a measurement; with the entry simply deleted, nothing would
 * have failed if a band came back — and the argument against it lives in a
 * docblock, which is prose, and prose is what this repo keeps finding stale.
 *
 * The reason for each is in the header and at the call site. Enforcing the
 * list is what makes those reasons load-bearing rather than decorative.
 */
const DELIBERATELY_BANDLESS = [
  'WishlistAddScreen.tsx',
  'InvoiceScanScreen.tsx',
  'RemoveVehicleScreen.tsx',
  'AddVehicleScreen.tsx',
  'ScanVinScreen.tsx',
  'TypeVinScreen.tsx',
  'DescribeCarScreen.tsx',
  'OwnerAnswersScreen.tsx',
  'TireSetFormScreen.tsx',
  'TireIntervalScreen.tsx',
  'TireRotationScreen.tsx',
  'PaywallScreen.tsx',
  'SignInScreen.tsx',
  'MarkDoneSheet.tsx',
];

function read(file: string): string {
  const source = readFileSync(join(SCREENS, file), 'utf8');
  /* §5: a walker that returns nothing reports a clean app forever. */
  expect(source.length).toBeGreaterThan(200);
  return source;
}

/**
 * Comments out, newlines kept.
 *
 * ⚠ Not optional, and the first draft of this file did without it. §5's second
 * example is a scan anchored to `.tap-target-44` that matched the string in a
 * **comment 600 lines above the rule** and passed for it. Every screen here
 * carries long docblocks that quote the elements they draw — `PlateBand` is
 * named in four of them — so a raw scan would report a band on a screen whose
 * only mention of one is an explanation of why it has none.
 *
 * Blanking rather than deleting keeps every line number, so a failure still
 * points at the right place in the real file.
 */
function code(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

/** `<PlateBand frame="x"` — with the frame captured, so a swap is visible. */
const BAND = /<PlateBand\s+frame="([a-z]+)"/g;

function bands(source: string): string[] {
  return Array.from(code(source).matchAll(BAND), (m) => m[1]);
}

describe('the carrier reaches the screens an owner dwells on', () => {
  it.each(CARRIES_A_BAND)('$file opens on the $frame frame', ({ file, frame }) => {
    const source = read(file);
    const found = bands(source);

    expect(found).toContain(frame);

    /* One frame per screen. Two is the mid-page restart `RecallDetail` guards. */
    expect(found).toHaveLength(1);

    /*
      ⚠ Imported, not just mentioned. The string could survive in a comment
      long after the element went — which is the `.tap-target-44` failure in
      §5, where a scan matched a comment 600 lines from the rule it checked.
    */
    expect(code(source)).toMatch(/^import PlateBand from '\.\.\/components\/PlateBand';$/m);
  });

  it.each(ALREADY_CARRIED)('%s carries its imagery another way and takes no band', (file) => {
    expect(bands(read(file))).toHaveLength(0);
  });

  it.each(DELIBERATELY_BANDLESS)('%s is excluded on its own terms and stays bandless', (file) => {
    expect(bands(read(file))).toHaveLength(0);
  });

  /*
    Every screen is accounted for, one way or another. Without this, adding a
    screen to the app adds it to no list and the suite keeps passing — the
    exact shape of a scan that silently stops covering what it was written
    for. A new screen must be classified deliberately, even if the answer is
    "no band".
  */
  it('classifies every screen in the app', () => {
    const all = readdirSync(SCREENS).filter((f) => /Screen\.tsx$|Sheet\.tsx$/.test(f));
    expect(all.length).toBeGreaterThan(20);

    const classified = new Set([
      ...CARRIES_A_BAND.map((row) => row.file),
      ...ALREADY_CARRIED,
      ...DELIBERATELY_BANDLESS,
    ]);

    expect(all.filter((f) => !classified.has(f))).toEqual([]);
  });

  /*
    ⚠ The anti-vacuous case. Everything above is a regex over source, so the
    one failure that matters is the regex silently matching nothing forever.
    This proves it still discriminates: a screen with the band removed fails,
    and one that only mentions it in a comment fails too.
  */
  it('can still detect a screen that lost its band', () => {
    const real = read('HealthScreen.tsx');
    expect(bands(real)).toHaveLength(1);

    const stripped = real.replace(BAND, '<View data-was="');
    expect(bands(stripped)).toHaveLength(0);

    /* The §5 case itself: the element named in prose, drawn nowhere. */
    const onlyInAComment = real.replace(BAND, '<View x="') + '\n/* was <PlateBand frame="house" /> */\n';
    expect(bands(onlyInAComment)).toHaveLength(0);
  });

  /*
    ⚠ The band must not set a `marginBottom`, and this is the only thing
    standing between that and a "tidy-up".

    It had one — `marginBottom: top`, put there to restore the air its
    negative top margin cancels. Flex `gap` is additive with margin in Yoga,
    so on the four screens that host a band the air below came out at
    `top + gap`: 44, 28, 28 and 32 against 16–20 intended. Wrong on first
    paint, and four different values in a system whose whole point is that
    screens agree. Every suite and both typechecks passed over it.

    Held as a source scan because there is no renderer here that resolves
    Yoga's gap arithmetic — the web runner cannot load React Native at all.
    The assertion is deliberately narrow: the component may set `marginTop`
    (it must) and `marginHorizontal` (it must), and nothing on the bottom.
  */
  it('the band adds no bottom margin, so the container gap owns the space below', () => {
    const band = readFileSync(
      join(SCREENS, '..', 'components', 'PlateBand.tsx'),
      'utf8'
    );
    expect(band.length).toBeGreaterThan(200);

    const source = code(band);

    /* The real property. */
    expect(source).not.toMatch(/marginBottom/);

    /*
      §5: prove the scan can still fail. A copy with the margin put back must
      trip it, or this case is measuring the absence of a string it would
      never have found anyway.
    */
    const regressed = source.replace('{ marginTop: -top }', '{ marginTop: -top, marginBottom: top }');
    expect(regressed).not.toEqual(source);
    expect(regressed).toMatch(/marginBottom/);

    /* And the margins it does need are still there. */
    expect(source).toMatch(/marginTop: -top/);
    expect(source).toMatch(/marginHorizontal: -rhythm\.page/);
  });

  /*
    ⚠ The replacement for a case that asserted the wrong thing. It used to
    hold that `RecallDetailScreen` guards its band on `embedded` — which
    passed, while the branch it guarded was unreachable in production. The
    real property is simpler and is what `ALREADY_CARRIED` now covers: this
    screen draws no band, because Health draws it.

    Kept as its own case rather than left to the list, because the route
    indirection is the thing a future reader will get wrong again: the
    `RecallDetail` route does not render `RecallDetailScreen`.
  */
  it('recall detail is never a destination, so it draws no band of its own', () => {
    const nav = readFileSync(join(SCREENS, '..', 'navigation', 'RootNavigator.tsx'), 'utf8');
    expect(nav.length).toBeGreaterThan(200);

    /*
      The route exists and hands its screen to Health, not to the detail.

      ⚠ Lazily matched to the first closing tag, with no length cap. The first
      draft capped the window at 400 characters; the block is 449, so the
      regex found nothing and the case failed on its own first run. A cap here
      buys nothing — the lazy quantifier already stops at this route's own
      close tag — and it is exactly the kind of number that would later look
      like a deliberate bound.
    */
    const route = /<Stack\.Screen name="RecallDetail"[\s\S]*?<\/Stack\.Screen>/.exec(code(nav));
    expect(route).not.toBeNull();
    expect(route![0]).toContain('<HealthScreen');
    expect(route![0]).not.toContain('<RecallDetailScreen');

    /* And Health, its only caller, always embeds it. */
    const health = code(read('HealthScreen.tsx'));
    const call = /<RecallDetailScreen[\s\S]*?\/>/.exec(health);
    expect(call).not.toBeNull();
    expect(call![0]).toContain('embedded');
  });
});
