# Runbook — the one device build (12 Sep 2026)

One EAS build, run interactively by David, that carries every native change
waiting on it. CLAUDE.md §9: builds are scarce (~15 a month) and JS is free
afterwards, so the rule is **one build, not three** — nothing here is worth a
build on its own, and together they are worth exactly one.

## What this build carries — verify before running, do not assume

| change | where it is | in a build yet? |
|---|---|---|
| bundle id `com.southmoordigital.tappet`, name Tappet, scheme `tappet://` | `apps/mobile/app.json` | no — every build so far was CrewChief |
| `apiBaseUrl` → `https://tappet.southmoordigital.com` | `app.json` → `extra` | no |
| B9 viewfinder + capture haptic — `expo-camera`, `expo-haptics` | `apps/mobile/package.json` | **only once B9 has merged to `main`** |
| the store adapter — `expo-iap` | `apps/mobile/package.json` | **only once the IAP adapter has merged** |
| `expo-notifications`, `expo-image-picker`, `expo-font` | already in the last builds | yes |

⚠ Run it **after** B9 and the adapter are on `main`, not before: a build
without them is a second build a fortnight later. Check with

```bash
git log --oneline -1 && grep -E '"expo-(camera|haptics|iap)"' apps/mobile/package.json
```

All three lines must print. If one is missing, the lane that owns it has not
landed; wait.

## Preconditions that are already true (checked 12 Sep)

- `EXPO_TOKEN` in `.env` authenticates as `masterson303` (owner of
  `masterson303apps`); `eas whoami` confirmed it today. The Expo half needs
  nothing from anyone.
- The iPhone's UDID (`00008140-0001796C2E9B001C`) is registered on the
  personal Apple team `P4873P8FQ9`. Device registration is per team, not per
  bundle id, so `eas device:create` is **not** needed again.
- The distribution certificate on that team is reusable; only the App ID and
  an ad-hoc provisioning profile for the new bundle id are new, and EAS
  creates both during the build.

## The one thing that needs David: Apple sign-in

The bundle id is new, so EAS must talk to Apple once. It asks in the terminal.

```bash
cd /Users/dm/Developer/crewchief/apps/mobile && npx eas-cli build --platform ios --profile device
```

⚠⚠ **When it asks which Apple team, choose `DAVID RYAN MASTERSON`
(`P4873P8FQ9`).** The employer team ("Exclusive Resorts LLC") is the default
and has been picked by mistake twice. Anything created on the wrong team is the employer's asset.

Say **yes** to "generate a new provisioning profile" and **reuse** the
existing distribution certificate when offered. A new certificate is not
needed — the profile is per bundle id, the certificate is per team.

Why `device` and not `preview`: `device` is a **development client**
(`developmentClient: true`), so the phone loads JS from Metro on 8081 exactly
as Expo Go does today, but with every native module above compiled in. Every
JS change after this build is free. `preview` is a release build with the
bundle baked in — each JS change would cost another build, and EAS Update is
not configured (`app.json` has no `updates` key).

Or, to take Apple sign-in out of every future build: create an App Store
Connect API key on the **personal** team (Users and Access → Integrations →
Team Keys; the `.p8` downloads once) and hand it to `npx eas-cli credentials`.
After that the build runs non-interactively and is Claude Code's.

## After it finishes (~15 min)

1. Install from the link/QR EAS prints; the phone must be the registered one.
2. Open the app — it is called **Tappet** now — and point it at Metro: the
   dev client shows the running servers; pick `exp://<mac-lan-ip>:8081`, the
   same Metro the phone uses through Expo Go.
3. Check what the build was for:
   - Service → Scan invoice opens the **viewfinder** (corner brackets, mono
     readout), not the system camera sheet; capture gives one haptic.
   - Settings → Tappet Plus opens the paywall and says, honestly, that
     products are **not yet available** until App Store Connect has them —
     it must not crash and must not show a price it did not get from Apple.
   - `tappet://` opens the app (Safari address bar).
4. Note the build id and date under the roadmap's "Open, and David's".

⚠ Expo Go keeps working for everything that is not a native module, and is
still the faster loop for pure JS. The dev client is for the three things
above and for App Review captures.

## What this does not do

- It does not submit anything to App Review (`production` profile,
  `eas submit`; not yet).
- It does not flip `PAID_FEATURES_ENFORCED` — that waits on App Store Connect
  products and a sandbox purchase that has been through Restore
  (`packages/core/src/paid-features.ts`).
- It does not flip a primary domain (CLAUDE.md §8): the build carries the new
  `apiBaseUrl`, and the primary flip comes only after installed apps have moved.
