/**
 * Audit 360, TL-18 (round 3) — a web turn rewrote the thread from the
 * browser's copy, so turns the phone added to the same thread were dropped.
 *
 * @jest-environment node
 *
 * The thread helpers are executed over an in-memory `consultant_conversations`
 * whose stub honours the filters the code chose; the action is pinned to use
 * them (executing it means Gemini and a session — `feature-gate-wire.test.ts`
 * says why it is read as source), with the shape that shipped as the
 * anti-vacuous case.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appendToStoredThread, storedThreadHistory, ThreadReadError } from '@/lib/consultant-thread';

type Row = { id: string; vehicle_id: string; message_history: unknown[]; updated_at?: string };

function table(rows: Row[]) {
  const from = jest.fn(() => {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Partial<Row> | null = null;
    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      update: jest.fn((values: Partial<Row>) => ((patch = values), chain)),
      eq: jest.fn((c: keyof Row, v: unknown) => (filters.push((r) => r[c] === v), chain)),
      maybeSingle: jest.fn(async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null })),
      then: (resolve: (v: unknown) => unknown) => {
        if (patch) for (const r of rows.filter((r) => filters.every((f) => f(r)))) Object.assign(r, patch);
        return resolve({ error: null });
      },
    };
    return chain;
  });
  return { from } as never;
}

const turn = (role: 'user' | 'assistant', content: string) => ({ role, content, timestamp: new Date().toISOString() });

describe('appendToStoredThread (TL-18)', () => {
  it('keeps the turns another device added since the caller loaded the thread', async () => {
    // The browser loaded [q1, a1]; the phone then added [q2, a2] to the same thread.
    const rows: Row[] = [
      {
        id: 't1',
        vehicle_id: 'car-1',
        message_history: [turn('user', 'q1'), turn('assistant', 'a1'), turn('user', 'q2 from the phone'), turn('assistant', 'a2')],
      },
    ];

    const ok = await appendToStoredThread(table(rows), {
      sessionId: 't1',
      vehicleId: 'car-1',
      turns: [turn('user', 'q3 from the web'), turn('assistant', 'a3')],
    });

    expect(ok).toBe(true);
    expect((rows[0].message_history as Array<{ content: string }>).map((t) => t.content)).toEqual([
      'q1',
      'a1',
      'q2 from the phone',
      'a2',
      'q3 from the web',
      'a3',
    ]);
  });

  it('writes nothing to a thread that is not this car’s', async () => {
    const rows: Row[] = [{ id: 't9', vehicle_id: 'someone-elses-car', message_history: [turn('user', 'theirs')] }];

    const ok = await appendToStoredThread(table(rows), { sessionId: 't9', vehicleId: 'car-1', turns: [turn('user', 'x')] });

    expect(ok).toBe(false);
    expect(rows[0].message_history).toHaveLength(1);
    expect(await storedThreadHistory(table(rows), 't9', 'car-1')).toBeNull();
    // Anti-vacuous: the same read finds it under its own car.
    expect(await storedThreadHistory(table(rows), 't9', 'someone-elses-car')).toHaveLength(1);
  });
});

describe('a read that failed is not a thread that is gone (TL-22)', () => {
  /** The same table, except every read answers a PostgREST error. */
  function failing(rows: Row[]) {
    const ok = table(rows) as unknown as { from: (n: string) => Record<string, unknown> };
    return {
      from: (name: string) => {
        const chain = ok.from(name);
        return {
          ...chain,
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '08006', message: 'connection reset' } }) }) }),
          }),
        };
      },
    } as never;
  }

  const rows = (): Row[] => [{ id: 't1', vehicle_id: 'car-1', message_history: [turn('user', 'q1')] }];

  it('throws ThreadReadError rather than answering null', async () => {
    await expect(storedThreadHistory(failing(rows()), 't1', 'car-1')).rejects.toBeInstanceOf(ThreadReadError);
  });

  it('still answers null for a thread that is genuinely absent', async () => {
    // Anti-vacuous: the healthy table's miss is null, not a throw.
    await expect(storedThreadHistory(table(rows()), 'gone', 'car-1')).resolves.toBeNull();
  });

  it('appends nothing when the read at the write fails, and says so', async () => {
    const r = rows();
    await expect(
      appendToStoredThread(failing(r), { sessionId: 't1', vehicleId: 'car-1', turns: [turn('user', 'x')] })
    ).resolves.toBe(false);
    expect(r[0].message_history).toHaveLength(1);
  });
});

describe('sendConsultantMessage reads and appends to the stored thread', () => {
  const ROOT = join(__dirname, '..', '..');
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  function action(src: string): string {
    const start = src.indexOf('export async function sendConsultantMessage');
    if (start < 0) return '';
    const next = src.indexOf('\nexport ', start + 10);
    return code(src.slice(start, next === -1 ? undefined : next));
  }

  /** The shape that shipped: the caller's copy, spread into the stored row. */
  const writesCallersCopy = (body: string) =>
    /\.\.\.messageHistory,\s*userMessage/.test(body) || /\.update\(\{\s*message_history: updatedHistory/.test(body);

  it('the prompt history is the row’s for a stored thread, and the write appends to the row', () => {
    const body = action(readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8'));
    expect(body.length).toBeGreaterThan(1000);

    expect(body).toMatch(/storedThreadHistory\(getServiceRoleClient\(\), sessionId, vehicleId\)/);
    expect(body).toMatch(/appendToStoredThread\(client, \{/);
    expect(writesCallersCopy(body)).toBe(false);
  });

  it('answers a failed read with the retry sentence, keeping "no longer here" for an absent row (TL-22)', () => {
    const body = action(readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8'));
    const read = body.indexOf('storedThreadHistory(getServiceRoleClient()');
    const gone = body.indexOf('That conversation is no longer here');
    expect(read).toBeGreaterThan(0);
    expect(gone).toBeGreaterThan(read);
    const between = body.slice(read, gone);
    expect(between).toMatch(/catch \(error\)/);
    expect(between).toMatch(/error instanceof ThreadReadError/);
    expect(between).toMatch(/Your question is still here — try again\./);
    // Anti-vacuous: the shape that shipped had nothing between the read and the sentence.
    const shipped = "const stored = await storedThreadHistory(getServiceRoleClient(), sessionId, vehicleId);\n if (!stored) { return { success: false, error: 'That conversation is no longer here. Start a new one.' }; }";
    expect(/instanceof ThreadReadError/.test(shipped)).toBe(false);
  });

  it('can still detect the shape that shipped', () => {
    const shipped = `
      const updatedHistory = [
        ...messageHistory,
        userMessage,
        { role: 'assistant', content: response },
      ];
      await client.from('consultant_conversations').update({ message_history: updatedHistory }).eq('id', sessionId);`;
    expect(writesCallersCopy(shipped)).toBe(true);
  });
});
