/**
 * Every path that sends an owner's data to Google waits for one honest answer.
 *
 * Audit 360, legal round 01 (1 Oct):
 *
 * - **LEGAL-1** — the health score sent mileage, the service log and invoice
 *   lines to Gemini at add-a-car (the phone's research runner, the web's
 *   `enrichVehicle`) and on the dashboard's first view, with no sheet in
 *   front of it. The phone half is held in `useResearchRunner.test.tsx` and
 *   `VehicleDetailScreen.test.tsx`; the web half is here, rendered.
 * - **LEGAL-2** — the web advisor's sheet said "No photographs and no
 *   documents are sent from here" above an attach control that sends them.
 * - **LEGAL-7** — sign-out left the web's answer in localStorage for the next
 *   account on the browser.
 * - And the one the review did not name: both clients keep **one** answer,
 *   so a yes to the advisor's narrow sheet opened the invoice scan with no
 *   sheet at all. Every sheet now says what one answer covers, and the key is
 *   versioned so an answer given under the old words is not reused.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import HealthSummary from '@/components/HealthSummary';
import { generateVehicleHealthSummary } from '@/app/actions';
import { signOutAndClearCache } from '@/lib/sign-out';
import { readWebAiConsent } from '@/lib/ai-consent-web';
import {
  ADVISOR_AI_CONSENT,
  AI_CONSENT_LEGACY_KEY,
  AI_CONSENT_SCOPE,
  AI_CONSENT_STORAGE_KEY,
  HEALTH_AI_CONSENT,
  INVOICE_AI_CONSENT,
  WEB_ADVISOR_AI_CONSENT,
} from '@tappet/core/ai-consent-copy';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}));
// See recall-row-does-not-contradict-itself.test.tsx: the action pulls an ESM SDK.
jest.mock('@/app/actions', () => ({
  generateVehicleHealthSummary: jest.fn(async () => ({ success: true })),
}));

const generate = generateVehicleHealthSummary as jest.Mock;
const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** Source without comments, so a scan cannot match prose about the rule. */
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => {
  generate.mockClear();
  window.localStorage.clear();
});

describe('the web health score (LEGAL-1)', () => {
  it('does not score a car on first view before anyone has said yes', async () => {
    render(<HealthSummary vehicleId="v-owner" healthSummary={null as never} />);
    await act(async () => {});
    expect(generate).not.toHaveBeenCalled();
  });

  it('the button asks first, "Not now" sends nothing, and the yes scores once', async () => {
    render(<HealthSummary vehicleId="v-owner" healthSummary={null as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Health Report/ }));
    await screen.findByText(HEALTH_AI_CONSENT.title);
    fireEvent.click(screen.getByRole('button', { name: HEALTH_AI_CONSENT.decline }));
    expect(generate).not.toHaveBeenCalled();
    expect(readWebAiConsent()).toBe('declined');

    fireEvent.click(screen.getByRole('button', { name: /Generate Health Report/ }));
    await screen.findByText(HEALTH_AI_CONSENT.title);
    fireEvent.click(screen.getByRole('button', { name: HEALTH_AI_CONSENT.accept }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(readWebAiConsent()).toBe('granted');
  });

  it('scores on first view once the answer is yes — the shape that shipped, still reachable', async () => {
    window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, 'granted');
    render(<HealthSummary vehicleId="v-owner" healthSummary={null as never} />);
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  });

  it('an answer under the old key is not this answer', async () => {
    window.localStorage.setItem(AI_CONSENT_LEGACY_KEY, 'granted');
    render(<HealthSummary vehicleId="v-owner" healthSummary={null as never} />);
    await act(async () => {});
    expect(generate).not.toHaveBeenCalled();
  });

  it('no server path scores a car behind the client’s back', () => {
    const actions = code(read('app/actions.ts'));
    const enrich = actions.slice(
      actions.indexOf('export async function enrichVehicle'),
      actions.indexOf('\nexport ', actions.indexOf('export async function enrichVehicle') + 10)
    );
    expect(enrich).toMatch(/generateVehicleDossier\(/);
    expect(enrich).not.toMatch(/generateVehicleHealthSummary\(/);

    // The two forced refreshes on the dashboard, each inside the answer.
    const insights = code(read('components/VehicleInsights.tsx'));
    const calls = insights.match(/generateVehicleHealthSummary\(/g) ?? [];
    const guarded = insights.match(/if \(readWebAiConsent\(\) === 'granted'\) \{\s*generateVehicleHealthSummary\(/g) ?? [];
    expect(calls.length).toBe(2);
    expect(guarded.length).toBe(calls.length);
  });

  it('can still detect an unguarded refresh', () => {
    const shipped = "        generateVehicleHealthSummary(vehicle.id, true).then(() => {";
    expect(shipped.match(/if \(readWebAiConsent\(\) === 'granted'\) \{\s*generateVehicleHealthSummary\(/g)).toBeNull();
    expect(shipped.match(/generateVehicleHealthSummary\(/g)).toHaveLength(1);
  });
});

describe('sign-out forgets the answer (LEGAL-7)', () => {
  it('the next account on this browser is asked, not answered for', async () => {
    window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, 'granted');
    window.localStorage.setItem(AI_CONSENT_LEGACY_KEY, 'granted');
    const client = { auth: { signOut: jest.fn(async () => ({ error: null })) } };
    const queryClient = { clear: jest.fn() };

    await signOutAndClearCache(client as never, queryClient as never);

    expect(window.localStorage.getItem(AI_CONSENT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AI_CONSENT_LEGACY_KEY)).toBeNull();
    expect(readWebAiConsent()).toBe('unknown');
  });

  it('even when the sign-out call fails', async () => {
    window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, 'granted');
    const client = { auth: { signOut: jest.fn(async () => { throw new Error('offline'); }) } };
    await signOutAndClearCache(client as never, { clear: jest.fn() } as never);
    expect(readWebAiConsent()).toBe('unknown');
  });
});

describe('every sheet tells the truth about what one answer covers (LEGAL-2)', () => {
  const sheets = [
    ['invoice', INVOICE_AI_CONSENT],
    ['advisor (phone)', ADVISOR_AI_CONSENT],
    ['advisor (web)', WEB_ADVISOR_AI_CONSENT],
    ['health score', HEALTH_AI_CONSENT],
  ] as const;

  it.each(sheets)('%s carries the scope, names Google, and promises no narrower consent than it takes', (_name, copy) => {
    expect(copy.points).toContain(AI_CONSENT_SCOPE);
    expect(copy.title + copy.body).toMatch(/Google/);
    expect(copy.points.join(' ')).not.toMatch(/No photographs and no documents/);
  });

  it('the scope names the photograph, which is the part a yes elsewhere would not expect', () => {
    expect(AI_CONSENT_SCOPE).toMatch(/health score/);
    expect(AI_CONSENT_SCOPE).toMatch(/advisor/);
    expect(AI_CONSENT_SCOPE).toMatch(/photograph/);
  });

  it('the web advisor says attachments go, and renders its own sheet', () => {
    expect(WEB_ADVISOR_AI_CONSENT.points.join(' ')).toMatch(/you attach goes too/);
    const chat = code(read('components/ConsultantChat.tsx'));
    expect(chat).toMatch(/WEB_ADVISOR_AI_CONSENT\.points\.map/);
    expect(chat).not.toMatch(/[^_]ADVISOR_AI_CONSENT\./);
    // And it does attach — which is why the sentence matters.
    expect(chat).toMatch(/attachedDocuments: uploadedDocs/);
  });

  it('no web surface keeps its own copy of the key', () => {
    for (const file of ['components/ConsultantChat.tsx', 'components/DocumentUploadDialog.tsx', 'components/HealthSummary.tsx']) {
      const body = code(read(file));
      expect([file, /localStorage/.test(body)]).toEqual([file, false]);
      expect([file, /readWebAiConsent\(\)/.test(body)]).toEqual([file, true]);
    }
  });

  it('can still detect the sentence that shipped', () => {
    const shipped = ['Your question and this car’s records go to Google.', 'No photographs and no documents are sent from here.'];
    expect(shipped.join(' ')).toMatch(/No photographs and no documents/);
    expect(shipped).not.toContain(AI_CONSENT_SCOPE);
  });
});
