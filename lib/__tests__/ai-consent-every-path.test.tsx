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
import { QuoteRequestDialogV2 } from '@/components/QuoteRequestDialogV2';
import { generateQuoteRequestV2, generateVehicleHealthSummary } from '@/app/actions';
import { signOutAndClearCache } from '@/lib/sign-out';
import { readWebAiConsent } from '@/lib/ai-consent-web';
import {
  ADVISOR_AI_CONSENT,
  AI_CONSENT_LEGACY_KEY,
  AI_CONSENT_SCOPE,
  AI_CONSENT_STORAGE_KEY,
  HEALTH_AI_CONSENT,
  INVOICE_AI_CONSENT,
  QUOTE_AI_CONSENT,
  WEB_ADVISOR_AI_CONSENT,
} from '@tappet/core/ai-consent-copy';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}));
// See recall-row-does-not-contradict-itself.test.tsx: the action pulls an ESM SDK.
jest.mock('@/app/actions', () => ({
  generateVehicleHealthSummary: jest.fn(async () => ({ success: true })),
  generateQuoteRequestV2: jest.fn(async () => ({ success: false, error: 'stub' })),
}));

const generate = generateVehicleHealthSummary as jest.Mock;
const quote = generateQuoteRequestV2 as jest.Mock;
const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** Source without comments, so a scan cannot match prose about the rule. */
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => {
  generate.mockClear();
  quote.mockClear();
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
    ['quote request (web)', QUOTE_AI_CONSENT],
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
    // Round 02 (LEGAL-11, 12): the two paths that read no answer, now named.
    expect(AI_CONSENT_SCOPE).toMatch(/performance figures/);
    expect(AI_CONSENT_SCOPE).toMatch(/quote requests/);
  });

  it('no sheet says the rest of Tappet works the same, when the same "Not now" stops the other AI', () => {
    for (const [, copy] of sheets) {
      expect(copy.declineNote).not.toMatch(/Everything else/);
      expect(copy.declineNote).toMatch(/Everything in Tappet that is not AI works the same/);
    }
    // Anti-vacuous: the sentence that shipped on the health sheet.
    expect('Everything else about this car works the same without it').toMatch(/Everything else/);
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

/**
 * ── Round 02 (1 Oct) ────────────────────────────────────────────────────────
 *
 * - **LEGAL-12** — the website's quote request sent the work, the mileage,
 *   the ZIP and the owner's note to Google from Needs, where no sheet had been.
 * - **LEGAL-11** — the performance figures sent every service line on the car
 *   on the car page's first view. The server half (the route refuses without
 *   the answer, mark-done no longer recomputes) is in
 *   `performance-stats.test.ts`; the browser half is here.
 */
describe('the quote request waits for a yes (LEGAL-12)', () => {
  async function toGenerate() {
    render(
      <QuoteRequestDialogV2
        open
        onOpenChange={() => {}}
        vehicleId="v-owner"
        wishlistItems={[{ id: 'w1', description: 'Front brake pads', category: 'repair' }]}
        preselectedItemIds={['w1']}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /Next/ }));
    fireEvent.change(await screen.findByLabelText(/ZIP code/), { target: { value: '80202' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
  }

  it('asks before the ZIP goes; "Not now" sends nothing; the yes sends once', async () => {
    await toGenerate();
    await screen.findByText(QUOTE_AI_CONSENT.title);
    expect(quote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: QUOTE_AI_CONSENT.decline }));
    expect(quote).not.toHaveBeenCalled();
    expect(readWebAiConsent()).toBe('declined');

    fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
    await screen.findByText(QUOTE_AI_CONSENT.title);
    fireEvent.click(screen.getByRole('button', { name: QUOTE_AI_CONSENT.accept }));
    await waitFor(() => expect(quote).toHaveBeenCalledTimes(1));
    expect(quote.mock.calls[0][2]).toBe('80202');
    expect(readWebAiConsent()).toBe('granted');
  });

  it('goes straight through on a yes already given — so the sheet above is not vacuous', async () => {
    window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, 'granted');
    await toGenerate();
    await waitFor(() => expect(quote).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(QUOTE_AI_CONSENT.title)).toBeNull();
  });
});

describe('the performance figures wait for a yes on the website (LEGAL-11)', () => {
  const CALLERS = ['app/vehicle-info/[vehicleId]/page.tsx', 'components/VehicleInsights.tsx', 'components/DocumentUploadDialog.tsx'];
  const FETCH = /fetch\('\/api\/v1\/performance-stats'[\s\S]*?body: JSON\.stringify\(\{([^}]*)\}\)/g;

  it('every fetch of the figures names the answer to the route', () => {
    let found = 0;
    for (const file of CALLERS) {
      for (const m of Array.from(code(read(file)).matchAll(FETCH))) {
        found += 1;
        expect([file, /aiConsent/.test(m[1])]).toEqual([file, true]);
      }
    }
    // Found sources: one per file, and nothing else in the web calls the route.
    expect(found).toBe(3);
  });

  it('the car page and the dashboard read the answer before they fetch', () => {
    const page = code(read('app/vehicle-info/[vehicleId]/page.tsx'));
    const body = page.slice(page.indexOf('const fetchPerformanceStats'), page.indexOf("fetch('/api/v1/performance-stats'"));
    expect(body).toMatch(/if \(readWebAiConsent\(\) !== 'granted'\) return;/);
    const insights = code(read('components/VehicleInsights.tsx'));
    const trigger = insights.slice(insights.indexOf('const triggerPerfStatsRecalc'), insights.indexOf("fetch('/api/v1/performance-stats'"));
    expect(trigger).toMatch(/if \(readWebAiConsent\(\) !== 'granted'\) return;/);
  });

  it('can still detect the fetch that shipped', () => {
    const shipped = "fetch('/api/v1/performance-stats', {\n method: 'POST',\n body: JSON.stringify({ vehicleId: params.vehicleId, forceRefresh }),\n });";
    const m = Array.from(shipped.matchAll(FETCH));
    expect(m).toHaveLength(1);
    expect(/aiConsent/.test(m[0][1])).toBe(false);
  });
});
