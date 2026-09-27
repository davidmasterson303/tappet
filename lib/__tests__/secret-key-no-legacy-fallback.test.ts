/**
 * The server key is `SUPABASE_SECRET_KEY`, and a missing one is loud.
 *
 * @jest-environment node
 *
 * 24 Sep, verified against production over REST: the legacy service_role JWT
 * answers `401 Invalid API key` on every call, because Supabase has disabled
 * that key format on this project. `lib/supabase.ts` and `lib/plates.ts`
 * nevertheless fell back to `SUPABASE_SERVICE_ROLE_KEY` when the secret key was
 * missing — so the fallback could never help, and the one time it fired (a new
 * Netlify context, a CI job, an old `.env` restored) it turned a config mistake
 * into what looked like a database outage. CLAUDE.md §6: prefer the loud
 * failure.
 *
 * Two halves:
 *
 * - behaviour: with only the legacy key set, both server clients throw an
 *   error naming `SUPABASE_SECRET_KEY`; with the secret key set, they build.
 *   The passing twin is what makes the throw mean something — a client that
 *   threw on everything could not pass.
 * - source: nothing in the repo reads `SUPABASE_SERVICE_ROLE_KEY`, including
 *   the scripts that parse `.env` themselves (which `env-parity.test.ts`
 *   cannot see, because it only matches `process.env.`). The detector must
 *   still find a planted read, and must find the real secret-key reads, or
 *   the scan proves nothing (CLAUDE.md §5).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const LEGACY = 'SUPABASE_SERVICE_ROLE_KEY';
// A closed local port: anything that gets as far as the network fails at
// once, rather than waiting out a DNS lookup.
const URL = 'http://127.0.0.1:9';

const SAVED = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', LEGACY]) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
}

afterEach(() => {
  process.env = { ...SAVED };
});

/** `lib/supabase.ts` reads the URL at module load, so load it after setting env. */
function loadSupabase(): typeof import('../supabase') {
  let mod: typeof import('../supabase') | undefined;
  jest.isolateModules(() => {
    mod = require('../supabase');
  });
  return mod!;
}

function loadPlates(): typeof import('../plates') {
  let mod: typeof import('../plates') | undefined;
  jest.isolateModules(() => {
    mod = require('../plates');
  });
  return mod!;
}

describe('lib/supabase.ts getServiceRoleClient', () => {
  it('throws naming SUPABASE_SECRET_KEY when only the legacy key is set', () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL, [LEGACY]: 'eyJlegacy.jwt.value' });
    const { getServiceRoleClient } = loadSupabase();
    expect(() => getServiceRoleClient()).toThrow(/SUPABASE_SECRET_KEY is not set/);
  });

  it('throws naming SUPABASE_SECRET_KEY when neither key is set', () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL });
    const { getServiceRoleClient } = loadSupabase();
    expect(() => getServiceRoleClient()).toThrow(/SUPABASE_SECRET_KEY is not set/);
  });

  it('builds a client when the secret key is set (the passing twin)', () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL, SUPABASE_SECRET_KEY: 'sb_secret_test' });
    const { getServiceRoleClient } = loadSupabase();
    expect(() => getServiceRoleClient()).not.toThrow();
  });

  it('names the URL, not the key, when the URL is what is missing', () => {
    setEnv({ SUPABASE_SECRET_KEY: 'sb_secret_test' });
    const { getServiceRoleClient } = loadSupabase();
    expect(() => getServiceRoleClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
  });
});

describe('lib/plates.ts service client', () => {
  // claimPlate builds the service client before anything else when no client
  // is injected, so it is the shortest route to the private constructor.
  it('throws naming SUPABASE_SECRET_KEY when only the legacy key is set', async () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL, [LEGACY]: 'eyJlegacy.jwt.value' });
    const { claimPlate } = loadPlates();
    await expect(claimPlate('any-key')).rejects.toThrow(/SUPABASE_SECRET_KEY is not set/);
  });

  it('gets past the key check when the secret key is set (the passing twin)', async () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL, SUPABASE_SECRET_KEY: 'sb_secret_test' });
    // PostgREST answering "no such row". A rejected fetch would do, but
    // postgrest-js retries those with backoff and the test would take seconds.
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    const { claimPlate } = loadPlates();
    // Reaching the network with the secret key is the proof it was accepted.
    await expect(claimPlate('any-key')).resolves.toEqual({ claimed: false, reason: 'missing' });
    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_test');
    fetchSpy.mockRestore();
  });
});

// ── Source scan ─────────────────────────────────────────────────────────────

const SCAN_DIRS = ['app', 'lib', 'packages', 'scripts', 'components', 'netlify', join('apps', 'mobile')];
const SCAN_FILES = ['middleware.ts', 'next.config.js'];

/**
 * A read of `name`, in any of the shapes this repo uses: `process.env.X`, a
 * parsed-`.env` object's `env.X` or `env['X']`, or `read('X')`. Mentions in
 * prose — a docblock warning *not* to use the key — are not reads.
 */
function readsOf(name: string): RegExp {
  return new RegExp(`(?:\\benv\\.${name}\\b|\\benv\\[\\s*['"\`]${name}['"\`]|\\bread\\(\\s*['"\`]${name}['"\`])`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|mjs|js|cjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function sources(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    try {
      walk(join(ROOT, d), files);
    } catch {
      // A missing directory is not a failure; the sources-found check below
      // is what catches a walker that finds nothing.
    }
  }
  for (const f of SCAN_FILES) {
    try {
      statSync(join(ROOT, f));
      files.push(join(ROOT, f));
    } catch {}
  }
  return files;
}

function filesReading(name: string): string[] {
  const re = readsOf(name);
  return sources()
    .filter((f) => re.test(readFileSync(f, 'utf8')))
    .map((f) => f.replace(ROOT + '/', ''));
}

describe('nothing reads SUPABASE_SERVICE_ROLE_KEY', () => {
  it('found sources to scan', () => {
    expect(sources().length).toBeGreaterThan(100);
  });

  it('the detector can still detect a read, in every shape', () => {
    const re = readsOf(LEGACY);
    expect(re.test(`const k = process.env.${LEGACY};`)).toBe(true);
    expect(re.test(`const k = env.${LEGACY};`)).toBe(true);
    expect(re.test(`const k = env['${LEGACY}'];`)).toBe(true);
    expect(re.test(`key: read('${LEGACY}')`)).toBe(true);
    // …and does not mistake prose for a read.
    expect(re.test(` * ⚠ \`SUPABASE_SECRET_KEY\`, not \`${LEGACY}\`.`)).toBe(false);
  });

  it('the detector finds the real secret-key reads', () => {
    const readers = filesReading('SUPABASE_SECRET_KEY');
    expect(readers).toEqual(expect.arrayContaining(['lib/supabase.ts', 'lib/plates.ts']));
  });

  it('finds no reader of the legacy key', () => {
    expect(filesReading(LEGACY)).toEqual([]);
  });
});
