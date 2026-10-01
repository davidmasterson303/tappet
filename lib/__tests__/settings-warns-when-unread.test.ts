/**
 * @jest-environment node
 *
 * Audit 360, LEGAL-15 (1 Oct) — the web half.
 *
 * `/settings` turned a failed profile read into `hasLiveSubscription: false`,
 * so the delete dialog dropped its billing warning exactly when the page could
 * not say. The server's rule (and now the phone's) is the opposite: when the
 * standing cannot be read, warn. The notice is a sentence, never a block.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { settingsInitialFrom } from '@/app/settings/initial';

const page = readFileSync(join(__dirname, '..', '..', 'app/settings/page.tsx'), 'utf8');

describe('the settings page warns when it cannot read the subscription', () => {
  it('warns on a failed profile read', () => {
    const initial = settingsInitialFrom({
      success: false,
      profile: null,
      vehicleCount: 0,
    });
    expect(initial.hasLiveSubscription).toBe(true);
    // COPY-20: assumed, not read — the dialog words it conditionally.
    expect(initial.subscriptionCertain).toBe(false);
  });

  it('warns when the read threw', () => {
    expect(settingsInitialFrom(null).hasLiveSubscription).toBe(true);
    expect(settingsInitialFrom(null).subscriptionCertain).toBe(false);
  });

  it('warns, conditionally, when the server could not read the entitlement (COPY-20)', () => {
    const initial = settingsInitialFrom({
      success: true,
      profile: { display_name: 'Sam', distance_unit: 'mi' },
      vehicleCount: 1,
      hasLiveSubscription: true,
      subscriptionCertain: false,
    });
    expect(initial.hasLiveSubscription).toBe(true);
    expect(initial.subscriptionCertain).toBe(false);
  });

  it('passes a real "no subscription" through (anti-vacuous)', () => {
    const initial = settingsInitialFrom({
      success: true,
      profile: { display_name: 'Sam', distance_unit: 'km' },
      vehicleCount: 2,
      hasLiveSubscription: false,
    });
    expect(initial).toEqual({
      displayName: 'Sam',
      distanceUnit: 'km',
      vehicleCount: 2,
      hasLiveSubscription: false,
      subscriptionCertain: true,
    });
  });

  it('is what the page uses, and the page catches a thrown read', () => {
    expect(page).toContain('settingsInitialFrom(');
    expect(page).toMatch(/getProfile\(\)\.catch\(/);
    // The old shape, which failed toward silence.
    expect(page).not.toMatch(/hasLiveSubscription \?\? false : false/);
  });
});
