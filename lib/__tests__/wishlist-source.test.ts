/**
 * A wishlist row's `source` is one of the three words the table accepts —
 * from core, at the route, and on every phone screen that adds.
 *
 * @jest-environment node
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * `wishlist_items.source` is `CHECK (source IN ('dossier','consultant',
 * 'manual'))`, verified live 13 Sep with a probe that came back `23514`. Two
 * of the phone's three ADDs sent words outside it (`'suggestions'`,
 * `'progression-ladder'`) and had never worked: the insert failed, the route
 * said "Failed to add item to wishlist", and nothing named the field. Three
 * guards, one per place the word can go wrong:
 *
 *   1. core's set is the table's set (pinned literally — the migration is the
 *      authority and a fourth word here without one is the bug in reverse);
 *   2. the route refuses an unknown word with a 400 that names the choices,
 *      before the insert, and lets each accepted word through;
 *   3. every `'/wishlist'` POST in the mobile app sends a literal from the set —
 *      a scan, because the screens cannot run in this environment and the
 *      failure is silent until somebody taps ADD on a phone.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: jest.fn(), getServerClient: jest.fn() }));
jest.mock('@/lib/api-auth', () => ({ authorizeVehicleAccess: jest.fn(), authorizeVehicleScopedRow: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  getClientIdentifier: jest.fn().mockReturnValue('test'),
  rateLimitResponse: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { POST } from '@/app/api/v1/wishlist/route';
import { isWishlistSource, WISHLIST_SOURCES } from '@tappet/core/wishlist-source';

const ROOT = join(__dirname, '..', '..');
const authorize = authorizeVehicleAccess as jest.Mock;

/** A client whose insert records what it was handed and answers a row. */
function client() {
  const inserts: Array<Record<string, unknown>> = [];
  return {
    inserts,
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
      insert: (values: Record<string, unknown>) => {
        inserts.push(values);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'w1', ...values }, error: null }) }) };
      },
    }),
  };
}

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/v1/wishlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ITEM = {
  vehicleId: '11111111-2222-3333-4444-555555555555',
  itemType: 'maintenance',
  itemName: 'Brake fluid flush',
  itemIdentifier: 'maintenance:brake_fluid_flush',
};

describe('the set', () => {
  it('is the table’s CHECK, word for word', () => {
    expect([...WISHLIST_SOURCES]).toEqual(['dossier', 'consultant', 'manual']);
    for (const word of WISHLIST_SOURCES) expect(isWishlistSource(word)).toBe(true);
  });

  it('refuses the two words that never worked, and shapes that are not words', () => {
    for (const bad of ['suggestions', 'progression-ladder', 'manual_entry', '', null, undefined, 1]) {
      expect(isWishlistSource(bad)).toBe(false);
    }
  });
});

describe('the route', () => {
  beforeEach(() => authorize.mockReset());

  it('refuses an unknown source with a 400 that names the choices, before touching the table', async () => {
    const fake = client();
    authorize.mockResolvedValue({ ok: true, isDemo: false, userId: 'u1', client: fake });

    const res = await POST(post({ ...ITEM, source: 'suggestions' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/dossier, consultant, manual/);
    expect(fake.inserts).toEqual([]);
  });

  it.each(WISHLIST_SOURCES)('lets %s through to the insert', async (source) => {
    const fake = client();
    authorize.mockResolvedValue({ ok: true, isDemo: false, userId: 'u1', client: fake });

    const res = await POST(post({ ...ITEM, source }));
    expect(res.status).toBe(201);
    expect(fake.inserts[0]?.source).toBe(source);
  });

  it('still defaults an absent source to manual', async () => {
    const fake = client();
    authorize.mockResolvedValue({ ok: true, isDemo: false, userId: 'u1', client: fake });

    const res = await POST(post(ITEM));
    expect(res.status).toBe(201);
    expect(fake.inserts[0]?.source).toBe('manual');
  });
});

/**
 * Every `body: { … source: '<word>' … }` inside an `apiRequest('/wishlist', {
 * method: 'POST'` on the phone. Comments blanked so prose about the old words
 * (the docblocks tell the story) is not read as a send.
 */
function stripComments(source: string): string {
  const blank = (m: string, lead: string) => lead + m.slice(lead.length).replace(/[^\n]/g, ' ');
  return source.replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s{(,;])\/\/[^\n]*/g, blank);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** The source literals sent by each `/wishlist` POST in a file, in order. */
export function wishlistPostSources(source: string): Array<string | null> {
  const text = stripComments(source);
  const posts = text.split(/apiRequest(?:<[^>]*>)?\(\s*'\/wishlist'/).slice(1);
  return posts
    .filter((chunk) => /method:\s*'POST'/.test(chunk.slice(0, 400)))
    .map((chunk) => {
      const body = chunk.slice(0, chunk.indexOf('});') + 1);
      const m = body.match(/\bsource:\s*'([^']*)'/);
      return m ? m[1] : null;
    });
}

describe('every phone add sends a word the table accepts', () => {
  const files = sourceFiles(join(ROOT, 'apps', 'mobile', 'src'));
  const sends = files.flatMap((file) =>
    wishlistPostSources(readFileSync(file, 'utf8')).map((source) => ({ file: file.slice(ROOT.length + 1), source }))
  );

  it('found the adds it exists to check', () => {
    // The catalogue, the Build ladder and the Due row — three screens, three sends.
    expect(sends.length).toBeGreaterThanOrEqual(3);
    expect(sends.map((s) => s.file)).toEqual(
      expect.arrayContaining([
        'apps/mobile/src/screens/WishlistAddScreen.tsx',
        'apps/mobile/src/screens/BuildScreen.tsx',
        'apps/mobile/src/screens/ServiceMilestoneScreen.tsx',
      ])
    );
  });

  it('can still see a send with a word outside the set', () => {
    const fixture = [
      "await apiRequest('/wishlist', {",
      "  method: 'POST',",
      '  body: {',
      '    vehicleId,',
      "    itemType: 'maintenance',",
      "    source: 'suggestions', // the old word",
      '  },',
      '});',
      "await apiRequest('/wishlist', { method: 'POST', body: { vehicleId, itemType: 'issue' } });",
      "await apiRequest('/wishlist', { method: 'DELETE', body: { itemId } });",
    ].join('\n');
    expect(wishlistPostSources(fixture)).toEqual(['suggestions', null]);
  });

  it('sends one of the three, by name, on every POST', () => {
    const offenders = sends.filter((s) => s.source === null || !isWishlistSource(s.source));
    expect(offenders).toEqual([]);
  });
});
