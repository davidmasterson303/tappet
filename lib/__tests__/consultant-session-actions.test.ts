/**
 * Renaming and deleting a conversation — the two writes the rail gained on
 * 11 Sep, and who is allowed to make them.
 *
 * @jest-environment node
 *
 * ── What is worth asserting ─────────────────────────────────────────────────
 *
 * Not that `update` calls `update`. Three things, each a decision somebody
 * could reverse without noticing what it cost:
 *
 *   - **The gate is the real one.** `lib/api-auth` is imported, not mocked:
 *     a conversation on a demo vehicle is refused *by the gate's own rule*
 *     ("Demo vehicles are read-only"), a stranger's conversation gets the
 *     same 404 as a missing one, and an owner gets through. Mocking the gate
 *     would prove the action calls a function; this proves what the function
 *     decides.
 *   - **The write touches exactly what the row owns.** A delete removes the
 *     row and the documents keyed to it, and leaves the neighbouring thread's
 *     documents alone. A rename changes `title` and nothing else — in
 *     particular not `updated_at`, which is the date the rail prints.
 *   - **A refusal is loud.** A write the database rejected comes back as
 *     `success: false` with words in it, never as a silent success.
 *
 * The Supabase layer is a small in-memory table so every assertion reads the
 * resulting *state*, the way `vin-belongs-to-somebody.test.ts` honours filters
 * rather than returning a fixed row. RLS itself is verified against the live
 * database, not here.
 */

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  createServerActionClient: jest.fn(),
  createBearerClient: jest.fn(),
  getServerClient: jest.fn(),
}));

jest.mock('@tappet/core/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { DEMO_VEHICLE_IDS } from '@tappet/core/demo';
import { getServiceRoleClient, createServerActionClient } from '@/lib/supabase';
import { NOT_FOUND_MESSAGE } from '@/lib/api-auth';
import { CONSULTANT_TITLE_MAX } from '@/lib/consultant-title';
import { renameConsultantSession, deleteConsultantSession } from '@/app/actions';

const serviceRole = getServiceRoleClient as jest.Mock;
const sessionClient = createServerActionClient as jest.Mock;

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const STRANGER = 'bbbbbbbb-0000-4000-8000-000000000002';
const OWNED_VEHICLE = 'd4e8b2a1-0000-4000-8000-000000000abc';
const DEMO_VEHICLE = DEMO_VEHICLE_IDS[0];

const OWNED_THREAD = '11111111-1111-4111-8111-111111111111';
const OTHER_THREAD = '22222222-2222-4222-8222-222222222222';
const DEMO_THREAD = 'e1000000-0000-4000-8000-000000000001';
const MISSING_THREAD = '99999999-9999-4999-8999-999999999999';

const ORIGINAL_UPDATED_AT = '2026-03-14T10:00:00.000Z';

type Row = Record<string, unknown>;

/**
 * A Supabase stand-in with real rows. `select`, `update` and `delete` honour
 * every `.eq()` they are given and act on the table, so a test can look at
 * what is left rather than at what was called.
 */
function makeDb(opts: { failOn?: { table: string; op: 'update' | 'delete' } } = {}) {
  const tables: Record<string, Row[]> = {
    vehicles: [{ id: OWNED_VEHICLE, user_id: OWNER }],
    consultant_conversations: [
      {
        id: OWNED_THREAD,
        vehicle_id: OWNED_VEHICLE,
        title: 'Brake judder at speed',
        updated_at: ORIGINAL_UPDATED_AT,
        message_history: [{ role: 'user', content: 'hi' }],
      },
      { id: OTHER_THREAD, vehicle_id: OWNED_VEHICLE, title: 'Tyre choice', updated_at: ORIGINAL_UPDATED_AT },
      { id: DEMO_THREAD, vehicle_id: DEMO_VEHICLE, title: 'CVT Fluid & Oil Dilution Questions', updated_at: ORIGINAL_UPDATED_AT },
    ],
    consultant_documents: [
      { id: 'doc-1', session_id: OWNED_THREAD, vehicle_id: OWNED_VEHICLE },
      { id: 'doc-2', session_id: OWNED_THREAD, vehicle_id: OWNED_VEHICLE },
      { id: 'doc-3', session_id: OTHER_THREAD, vehicle_id: OWNED_VEHICLE },
    ],
  };

  const from = (table: string) => {
    const rows = (tables[table] ??= []);

    const build = (op: 'select' | 'update' | 'delete', payload?: Row) => {
      const filters: Array<[string, unknown]> = [];
      const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);

      const run = () => {
        if (opts.failOn && opts.failOn.table === table && opts.failOn.op === op) {
          return { data: null, error: { message: `${op} on ${table} failed` } };
        }
        if (op === 'select') return { data: rows.filter(matches), error: null };
        if (op === 'update') {
          for (const row of rows) if (matches(row)) Object.assign(row, payload);
          return { data: null, error: null };
        }
        const kept = rows.filter((row) => !matches(row));
        rows.splice(0, rows.length, ...kept);
        return { data: null, error: null };
      };

      const chain: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return chain;
        },
        maybeSingle: async () => {
          const result = run();
          return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return chain;
    };

    return {
      select: () => build('select'),
      update: (values: Row) => build('update', values),
      delete: () => build('delete'),
    };
  };

  return { from, tables };
}

const getUser = jest.fn();

function signedInAs(userId: string | null) {
  getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null });
}

function install(db: ReturnType<typeof makeDb>) {
  serviceRole.mockReturnValue({ from: db.from });
  sessionClient.mockReturnValue({ auth: { getUser }, from: db.from });
}

const thread = (db: ReturnType<typeof makeDb>, id: string) =>
  db.tables.consultant_conversations.find((row) => row.id === id);

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('the gate', () => {
  it('refuses to rename a demo conversation, in the gate’s own words, even when signed in', async () => {
    const db = makeDb();
    install(db);
    signedInAs(OWNER);

    const result = await renameConsultantSession(DEMO_THREAD, 'Anything');

    expect(result).toEqual({ success: false, error: 'Demo vehicles are read-only' });
    expect(thread(db, DEMO_THREAD)?.title).toBe('CVT Fluid & Oil Dilution Questions');
  });

  it('refuses to delete a demo conversation, and the row stays', async () => {
    const db = makeDb();
    install(db);
    signedInAs(null);

    const result = await deleteConsultantSession(DEMO_THREAD);

    expect(result).toEqual({ success: false, error: 'Demo vehicles are read-only' });
    expect(thread(db, DEMO_THREAD)).toBeDefined();
  });

  it('turns an anonymous caller away from a real conversation', async () => {
    const db = makeDb();
    install(db);
    signedInAs(null);

    const rename = await renameConsultantSession(OWNED_THREAD, 'Anything');
    const remove = await deleteConsultantSession(OWNED_THREAD);

    expect(rename).toEqual({ success: false, error: 'Unauthorized' });
    expect(remove).toEqual({ success: false, error: 'Unauthorized' });
    expect(thread(db, OWNED_THREAD)?.title).toBe('Brake judder at speed');
  });

  it('gives a stranger the same answer as a missing row', async () => {
    /*
      NOT_FOUND_MESSAGE's argument: "not yours" and "does not exist" must be
      indistinguishable, or the action becomes an oracle for which ids exist.
    */
    const db = makeDb();
    install(db);
    signedInAs(STRANGER);

    const theirs = await renameConsultantSession(OWNED_THREAD, 'Mine now');
    const nobodys = await renameConsultantSession(MISSING_THREAD, 'Mine now');

    expect(theirs).toEqual({ success: false, error: NOT_FOUND_MESSAGE });
    expect(nobodys).toEqual(theirs);
    expect(thread(db, OWNED_THREAD)?.title).toBe('Brake judder at speed');
  });

  it('refuses an id that is not a uuid before touching the database', async () => {
    const db = makeDb();
    const from = jest.fn(db.from);
    serviceRole.mockReturnValue({ from });
    sessionClient.mockReturnValue({ auth: { getUser }, from });
    signedInAs(OWNER);

    const result = await deleteConsultantSession('not-a-uuid');

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('renaming, as the owner', () => {
  it('changes the title and only the title', async () => {
    const db = makeDb();
    install(db);
    signedInAs(OWNER);

    const result = await renameConsultantSession(OWNED_THREAD, '  Brake  judder\nat speed — fixed?  ');

    expect(result).toEqual({ success: true, title: 'Brake judder at speed — fixed?' });
    const row = thread(db, OWNED_THREAD);
    expect(row?.title).toBe('Brake judder at speed — fixed?');
    /*
      ⚠ The date the rail prints. A rename is housekeeping, not a turn; bumping
      this would float an old thread to the top wearing today's date.
    */
    expect(row?.updated_at).toBe(ORIGINAL_UPDATED_AT);
    expect(row?.message_history).toEqual([{ role: 'user', content: 'hi' }]);
    // The neighbour is untouched.
    expect(thread(db, OTHER_THREAD)?.title).toBe('Tyre choice');
  });

  it('accepts a title of exactly the cap', () => {
    // The anti-vacuous half of the validation cases below.
    const db = makeDb();
    install(db);
    signedInAs(OWNER);

    return renameConsultantSession(OWNED_THREAD, 'k'.repeat(CONSULTANT_TITLE_MAX)).then((result) => {
      expect(result.success).toBe(true);
      expect(thread(db, OWNED_THREAD)?.title).toHaveLength(CONSULTANT_TITLE_MAX);
    });
  });

  it('refuses an empty title without consulting the session or the row', async () => {
    const db = makeDb();
    const from = jest.fn(db.from);
    serviceRole.mockReturnValue({ from });
    sessionClient.mockReturnValue({ auth: { getUser }, from });
    signedInAs(OWNER);

    const result = await renameConsultantSession(OWNED_THREAD, '   ');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/name/i);
    // Pure validation runs first: a refusal that does not depend on the row
    // cannot be used to learn whether the row exists.
    expect(getUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(thread(db, OWNED_THREAD)?.title).toBe('Brake judder at speed');
  });

  it('refuses a title over the cap and leaves the row alone', async () => {
    const db = makeDb();
    install(db);
    signedInAs(OWNER);

    const result = await renameConsultantSession(OWNED_THREAD, 'k'.repeat(CONSULTANT_TITLE_MAX + 1));

    expect(result.success).toBe(false);
    expect(result.error).toContain(String(CONSULTANT_TITLE_MAX));
    expect(thread(db, OWNED_THREAD)?.title).toBe('Brake judder at speed');
  });

  it('reports a database refusal instead of claiming success', async () => {
    const db = makeDb({ failOn: { table: 'consultant_conversations', op: 'update' } });
    install(db);
    signedInAs(OWNER);

    const result = await renameConsultantSession(OWNED_THREAD, 'New name');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rename/i);
  });
});

describe('deleting, as the owner', () => {
  it('removes the row and the documents keyed to it, and nothing else', async () => {
    const db = makeDb();
    install(db);
    signedInAs(OWNER);

    const result = await deleteConsultantSession(OWNED_THREAD);

    expect(result).toEqual({ success: true });
    expect(thread(db, OWNED_THREAD)).toBeUndefined();
    // The messages were a column on that row; there is nothing else to check
    // for them. The documents are rows of their own.
    const docs = db.tables.consultant_documents.map((row) => row.id);
    expect(docs).not.toContain('doc-1');
    expect(docs).not.toContain('doc-2');
    // The neighbouring thread keeps its document and its row.
    expect(docs).toContain('doc-3');
    expect(thread(db, OTHER_THREAD)).toBeDefined();
    expect(thread(db, DEMO_THREAD)).toBeDefined();
  });

  it('does not delete the row if its documents could not be removed', async () => {
    /*
      Order matters: the documents go first, explicitly, because the cascade
      the migration file declares is not visible from outside the SQL editor.
      If that step fails the row must survive, or the documents are orphaned
      against a session that no longer exists.
    */
    const db = makeDb({ failOn: { table: 'consultant_documents', op: 'delete' } });
    install(db);
    signedInAs(OWNER);

    const result = await deleteConsultantSession(OWNED_THREAD);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/delete/i);
    expect(thread(db, OWNED_THREAD)).toBeDefined();
  });

  it('reports a database refusal on the row itself', async () => {
    const db = makeDb({ failOn: { table: 'consultant_conversations', op: 'delete' } });
    install(db);
    signedInAs(OWNER);

    const result = await deleteConsultantSession(OWNED_THREAD);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/delete/i);
    expect(thread(db, OWNED_THREAD)).toBeDefined();
  });
});
