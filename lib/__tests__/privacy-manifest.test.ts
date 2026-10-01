/**
 * The privacy manifest has to keep describing the app that ships.
 *
 * @jest-environment node
 *
 * Phase 6, E4. Apple cross-checks `NSPrivacyCollectedDataTypes` against the App
 * Store Connect answers, and a mismatch between them is a rejection that
 * arrives *after* a build has been spent — which on this project means one of
 * fifteen monthly cloud builds.
 *
 * ── Why a declaration needs a guard at all ──────────────────────────────────
 *
 * A privacy manifest is a **claim about behaviour written in configuration**,
 * which is the shape this repo keeps getting wrong: nothing executes it, no
 * typechecker reads it, and it stays green while the code beneath it moves. The
 * specific decay is one direction — a feature adds a data type and nobody
 * remembers the manifest — so the assertions below are anchored to code and
 * schema, not to the manifest's own contents.
 *
 * ── What this cannot do ─────────────────────────────────────────────────────
 *
 * It cannot prove the list is *complete*. Proving that would mean deriving
 * Apple's taxonomy from the source, which is a judgement call per column —
 * whether a user-typed ZIP is Coarse Location, whether a VIN is an identifier.
 * Those calls are recorded in `APP_STORE_PRIVACY_ANSWERS_2026-08-12.md` with
 * their reasoning. What this pins is the handful that are unambiguous and the
 * two that would be actively false.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const appJson = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/app.json'), 'utf8'));
const manifest = appJson.expo?.ios?.privacyManifests;

/** The declared data types, without the long Apple prefix. */
const declared: string[] = (manifest?.NSPrivacyCollectedDataTypes ?? []).map((entry: any) =>
  String(entry.NSPrivacyCollectedDataType).replace('NSPrivacyCollectedDataType', '')
);

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('the iOS privacy manifest', () => {
  it('exists at all', () => {
    // Expo emits PrivacyInfo.xcprivacy from this block. Without it the app
    // ships no app-level manifest, and only its dependencies' ones.
    expect(manifest).toBeDefined();
    expect(declared.length).toBeGreaterThan(0);
  });

  it('declares no tracking, and no tracking domains', () => {
    /*
      Both must be true together. `NSPrivacyTracking: false` alongside a
      non-empty `NSPrivacyTrackingDomains` is a contradiction Apple rejects on,
      and it is the shape that appears when an analytics SDK is added later and
      only half the manifest is updated.
    */
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  });

  it('has no tracking or analytics SDK that would contradict that', () => {
    /*
      The claim above is only as good as the dependency list under it. This is
      what makes `NSPrivacyTracking: false` an assertion rather than an
      aspiration — the history records that this app has no analytics product at
      all, only a structured logger, and that is load-bearing for the label.
    */
    const deps = JSON.stringify([
      JSON.parse(source('apps/mobile/package.json')).dependencies ?? {},
      JSON.parse(source('package.json')).dependencies ?? {},
    ]);

    for (const sdk of [
      'posthog',
      'plausible',
      'mixpanel',
      'amplitude',
      'segment',
      'sentry',
      'bugsnag',
      'appsflyer',
      'react-native-idfa',
      'expo-tracking-transparency',
    ]) {
      expect(deps).not.toContain(sdk);
    }
  });

  it('declares photos, because the app asks for the photo library and the camera', () => {
    // Anchored to the permission strings rather than to the manifest: if those
    // usage descriptions exist, the data type must be declared.
    const ios = appJson.expo.ios.infoPlist;
    expect(ios.NSPhotoLibraryUsageDescription).toBeTruthy();
    expect(ios.NSCameraUsageDescription).toBeTruthy();
    expect(declared).toContain('PhotosorVideos');
  });

  it('declares a device id, because one is minted and sent to the server', () => {
    /*
      `apps/mobile/src/notifications/register.ts` mints a per-install UUID,
      keeps it in the Keychain and files it against the account in
      `device_push_tokens`. It is not a hardware identifier and it dies with
      the app — but it leaves the device attached to a user id, which is what
      the declaration is about.
    */
    expect(source('apps/mobile/src/notifications/register.ts')).toContain('deviceId');
    expect(declared).toContain('DeviceID');
  });

  describe('declares coarse location exactly when the iOS binary collects one', () => {
    /*
      ⚠ Audit 360, LEGAL-8 (1 Oct). This was anchored to `app/actions.ts` —
      `savePreferredZipCode`, a **web** server action — so it held the iOS
      manifest to a ZIP field that is not in the binary. The phone has no ZIP
      field, no location permission and no location module; the manifest
      declared Coarse Location for an app with no location feature.

      The manifest describes the binary, so the anchor is the binary's source.
      If the phone ever asks for a ZIP, a postal code or the device's position,
      the declaration comes back — this fails until it does. (The App Store
      label is App Store Connect's, and David's call: see held-for-david.md.)
    */
    const LOCATION = /\bzip(_?code)?\b|zipCode|postal|expo-location|getCurrentPositionAsync|requestForegroundPermissionsAsync/i;

    function walk(dir: string): string[] {
      return readdirSync(join(ROOT, dir)).flatMap((name) => {
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) return name === '__tests__' ? [] : walk(rel);
        return /\.(ts|tsx)$/.test(name) ? [rel] : [];
      });
    }
    const files = walk('apps/mobile/src');
    const deps = JSON.stringify(JSON.parse(source('apps/mobile/package.json')).dependencies ?? {});
    const collecting = files.filter((f) => LOCATION.test(source(f)));

    it('read the phone at all', () => {
      expect(files.length).toBeGreaterThan(50);
      expect(files).toContain('apps/mobile/src/screens/AccountScreen.tsx');
    });

    it('can still detect a location field', () => {
      expect(LOCATION.test("const [zip, setZip] = useState('');")).toBe(true);
      expect(LOCATION.test("import * as Location from 'expo-location';")).toBe(true);
      expect(LOCATION.test('body: { preferred_zip_code: zip }')).toBe(true);
    });

    it('matches the declaration to the source', () => {
      const collects = collecting.length > 0 || deps.includes('expo-location');
      expect({ collects, declared: declared.includes('CoarseLocation'), files: collecting }).toEqual({
        collects,
        declared: collects,
        files: collecting,
      });
      // And today the phone collects none.
      expect(collects).toBe(false);
    });
  });

  describe('declares crash data, linked, because a signed-in report carries the account id', () => {
    /*
      Audit 360, the legal agent's call (1 Oct). Since SEC-7 the phone's crash
      report is logged with the account id when it carries a sign-in, so it is
      Crash Data, Linked, App Functionality — and the manifest declared it
      nowhere. Anchored to the code that sends it and the line that links it:
      if the report stops leaving the phone, or stops carrying the id, this
      fails and the declaration is revisited.
    */
    const client = source('apps/mobile/src/api/client-errors.ts');
    const route = source('app/api/v1/client-errors/route.ts');
    const LINKS = /const reporter = caller\.ok \? caller\.userId : 'anonymous';/;

    it('found the sender and the route', () => {
      expect(client).toMatch(/apiRequest\('\/client-errors'/);
      expect(route).toMatch(/reporter,/);
    });

    it('declares it, linked, for app functionality', () => {
      expect(LINKS.test(route)).toBe(true);
      const entry = manifest.NSPrivacyCollectedDataTypes.find(
        (e: any) => e.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeCrashData'
      );
      expect(entry).toEqual({
        NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      });
    });

    it('can still tell an anonymous report from a linked one (anti-vacuous)', () => {
      expect(LINKS.test("const reporter = 'anonymous';")).toBe(false);
    });

    it('the sender’s docblock says linked, never "anonymous on purpose" (LEGAL-18)', () => {
      // The docblock is this repo's documentation; a stale one is how a label
      // gets declared Not Linked from a reading of the sender.
      const doc = readFileSync(join(ROOT, 'apps/mobile/src/api/client-errors.ts'), 'utf8');
      const says = (text: string) => !/Anonymous on purpose/i.test(text) && /Crash\s+\*?\s*Data \*\*Linked\*\*/.test(text.replace(/\n\s*\*\s*/g, ' '));
      expect(says(doc)).toBe(true);
      expect(says('posts what it caught. Anonymous on purpose — a crash on the sign-in screen is still a crash')).toBe(false);
    });
  });

  it('declares user content, because conversations and invoices are stored', () => {
    expect(declared).toContain('OtherUserContent');
  });

  it('declares an email address, because accounts are email and password', () => {
    expect(declared).toContain('EmailAddress');
  });

  it('marks every declared type as linked to the user', () => {
    /*
      True by construction here and worth pinning: every table in this schema
      that holds user data carries `user_id`, or reaches it through
      `vehicle_id`. There is no anonymous bucket in the *app* — the anonymous
      front door is a web surface and does not ship in the binary.
    */
    for (const entry of manifest.NSPrivacyCollectedDataTypes) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
    }
  });

  it('declares purchase history, because the paywall sells a subscription', () => {
    /*
      ── 23 Sep · the detector never saw the store ────────────────────────────

      This case was written before E8 as "does not yet claim purchase history"
      and told the reader to flip it when IAP landed. IAP landed on 18 Aug
      (`0f88fef`) as **`expo-iap`** — a name the detector's regex
      (`react-native-iap|expo-in-app-purchases|revenuecat|StoreKit`) did not
      match — so the case stayed green for five weeks while the paywall
      shipped and the manifest said nothing about purchases. CLAUDE.md §5.

      The detector now names the dependency that is actually installed, and
      the assertion is the one the old comment promised.
    */
    const deps = JSON.stringify(JSON.parse(source('apps/mobile/package.json')).dependencies ?? {});
    const hasIAP = /expo-iap|react-native-iap|expo-in-app-purchases|revenuecat|StoreKit/i.test(deps);

    expect(hasIAP).toBe(true);
    expect(declared).toContain('PurchaseHistory');
  });

  it('can still tell an installed store from a missing one', () => {
    // Anti-vacuous: the old regex against the real dependencies found nothing.
    const deps = JSON.stringify(JSON.parse(source('apps/mobile/package.json')).dependencies ?? {});
    expect(/react-native-iap|expo-in-app-purchases|revenuecat|StoreKit/i.test(deps)).toBe(false);
    expect(/expo-iap/.test(deps)).toBe(true);
  });
});
