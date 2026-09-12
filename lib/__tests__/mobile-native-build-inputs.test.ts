/**
 * What has to be true *before* a cloud build is spent.
 *
 * @jest-environment node
 *
 * The Expo client is compiled on EAS because this Mac cannot build it, and the
 * free plan allows **15 iOS builds a month**. Ordinary JavaScript changes cost
 * none — the development build loads them from Metro. A **native module** costs
 * one, because native code has to be compiled in before it can run at all.
 *
 * That makes two mistakes expensive in a way nothing else in this repo is:
 *
 *   1. **Adding native modules one at a time.** Two modules added in two
 *      commits are two builds. Camera (Phase 4) and push notifications
 *      (Phase 5) were deliberately installed together on 5 Aug for this reason.
 *   2. **Shipping a native module without its iOS usage description.** iOS
 *      terminates the app the moment a permission is requested without one, and
 *      App Store review rejects the binary. Neither is visible until the build
 *      exists — so the check would otherwise arrive one build too late.
 *
 * The second is the one this file mostly exists for. It is the same shape as
 * the `eas.json` defect recorded in `apps/mobile/EAS_CONFIG_NOTES.md`: a config
 * committed without ever being executed, whose error surfaced on first use.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE = join(__dirname, '..', '..', 'apps', 'mobile');

const appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;
const packageJson = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));

/**
 * Native modules present in the build, and the iOS usage description each one
 * makes mandatory.
 *
 * **Adding an entry here means the next build must be spent before that module
 * works.** Batch it with anything else pending rather than building twice.
 */
const NATIVE_MODULES: Record<string, { infoPlistKeys: string[]; phase: string }> = {
  'expo-image-picker': {
    // Both, because the picker can reach the camera or the library and iOS
    // requires a description for whichever is touched first.
    infoPlistKeys: ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription'],
    phase: 'Phase 3.3 / 4 — photograph an invoice',
  },
  'expo-notifications': {
    // Remote push needs no Info.plist string; the entitlement is provisioning,
    // which EAS manages. Listed with none rather than omitted, so the module is
    // still covered by the batching assertion below.
    infoPlistKeys: [],
    phase: 'Phase 5 — recall and service-due alerts',
  },
};

describe('native modules are declared', () => {
  it.each(Object.keys(NATIVE_MODULES))('%s is a dependency', (module) => {
    expect(packageJson.dependencies).toHaveProperty(module);
  });

  it('installs every pending native module in one build, not several', () => {
    /*
      The batching rule, made checkable. Each of these costs a build if it
      arrives alone; together they cost one. If a module is added here in a
      later commit while the others are already compiled in, that commit is
      spending a second build — which may be the right call, but it should be a
      decision rather than a surprise.
    */
    const declared = Object.keys(NATIVE_MODULES);
    const installed = declared.filter((m) => packageJson.dependencies?.[m]);

    expect(installed).toEqual(declared);
  });
});

describe('iOS usage descriptions exist before the build is spent', () => {
  const infoPlist = appJson.ios?.infoPlist ?? {};

  const required = Object.entries(NATIVE_MODULES).flatMap(([module, { infoPlistKeys }]) =>
    infoPlistKeys.map((key) => [module, key] as const)
  );

  it.each(required)('%s requires %s', (_module, key) => {
    /*
      Set on `ios.infoPlist` explicitly rather than left to the config plugin.
      The plugin does declare them, but `expo config --type prebuild` does not
      show them — the mod runs later — so they could not be verified without
      generating an `ios/` directory, and generating one would switch EAS from
      a managed build to a bare one. Declaring them here makes the value
      readable now, which is the whole point: a permission string that cannot
      be checked until the build exists is checked one build too late.
    */
    expect(typeof infoPlist[key]).toBe('string');
    expect((infoPlist[key] as string).length).toBeGreaterThan(20);
  });

  it('explains what the app does with the permission, not that it wants one', () => {
    /*
      App Store review rejects strings that restate the permission ("needs
      camera access"). Each has to name the thing the person gets.

      ⚠ The app's name is read from `app.json` rather than written here. It was
      the literal `crewchief` until 30 Aug, and the rename to Tappet would
      have left this line matching a string that no longer exists anywhere —
      green forever, checking nothing, on the exact assertion that exists to
      stop a rejection. Deriving it means the next rename cannot do that.
    */
    const restatesPermission = new RegExp(
      `^${appJson.name.toLowerCase()} (needs|requires) (the )?(camera|photo)`
    );
    for (const [, key] of required) {
      const text = infoPlist[key] as string;
      expect(text).toMatch(/invoice/i);
      expect(text.toLowerCase()).not.toMatch(restatesPermission);
    }
  });

  it('describes every use of the photo library, not only one of them', () => {
    /*
      ── ⚠ MOB-01, and this guard was part of the defect ─────────────────────

      `NSPhotoLibraryUsageDescription` said only *"…so you can attach an invoice
      you have already photographed."* The library is also the **default source
      for vehicle photographs** — `pickVehiclePhoto('library')` is what the
      hero's "Add photo" opens, and the note beside it says library-rather-than-
      camera is deliberate because a car picture is almost always one already
      taken.

      So a reviewer adding a picture of a car was told the app wanted the
      library for invoices. Guideline 5.1.1 requires the string to be accurate
      about what the data is used for.

      ⚠ **And the check above ratcheted it in place.** `expect(text).toMatch(
      /invoice/i)` is satisfied by the wrong string and would have failed the
      right one had it dropped the word — a guard measuring the correct property
      for one of two uses. This case is the other half: the string must mention
      the car photograph too.
    */
    const text = infoPlist.NSPhotoLibraryUsageDescription as string;

    expect(text).toMatch(/car|vehicle|photo of your/i);
    expect(text).toMatch(/invoice/i);
  });
});

describe('a dark app must not launch through a white flash', () => {
  /*
    ── MOB-05 ────────────────────────────────────────────────────────────────

    No splash was configured at all, so Expo's default — white — was what a
    reviewer saw for the second before the first frame of a dark-only product.
    Not a rejection on its own; it is the **first thing they see**, and it reads
    as unfinished.

    ⚠ **The first version of this guard was green while the splash painted
    nothing.** It read a top-level `splash` key, which SDK 57's schema rejects
    ("should NOT have additional property 'splash'" — `df2ac25` removed it as a
    build hazard, `b943419` put it back two days later for the white flash) and
    which nothing consumes: since SDK 52 the splash is the `expo-splash-screen`
    config plugin, and that package was not installed. So the key satisfied
    this suite, failed `expo-doctor`, and configured no splash. CLAUDE.md §5.

    The plugin is what draws the launch screen, so the plugin entry is what is
    read here — and the package has to be a dependency, because a plugin
    named in `app.json` for a package that is not installed fails prebuild on
    the one build we get.
  */
  const splashPlugin = (appJson.plugins as unknown[]).find(
    (entry): entry is [string, Record<string, unknown>] =>
      Array.isArray(entry) && entry[0] === 'expo-splash-screen'
  );
  const splash = splashPlugin?.[1] as { image?: string; backgroundColor?: string } | undefined;

  it('configures a splash on the product surface, through the plugin that draws it', () => {
    expect(splash).toBeDefined();
    expect(splash!.image).toBeTruthy();

    expect(packageJson.dependencies['expo-splash-screen']).toBeTruthy();
  });

  it('does not also carry the top-level key the schema rejects', () => {
    // Two configurations of one screen drift; and the old key costs the build.
    expect(appJson.splash).toBeUndefined();
  });

  it('paints it the page colour, not white', () => {
    /*
      ⚠ `surface.page` from `apps/mobile/src/theme/index.ts`. Read as a literal
      here rather than imported, because this suite runs under the node
      environment and the theme module pulls in the font layer — but the value
      is asserted against the theme file's text so the two cannot drift.
    */
    expect(splash!.backgroundColor!.toUpperCase()).toBe('#100F0D');

    const theme = readFileSync(
      join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'theme', 'index.ts'),
      'utf8'
    );
    expect(theme).toMatch(/page: '#100F0D'/);
  });
});
