/**
 * @jest-environment node
 *
 * Audit 360, UX-18 (1 Oct). A toast that carries an answer waits for it.
 *
 * The web's odometer refusal asked "Correcting an earlier mistake?" on a
 * sonner toast with no duration, and sonner dismisses at four seconds — the
 * *Yes, correct it* button vanished mid-decision. `questionToast` is the one
 * shape for a toast with an action; this holds both callers to it and refuses
 * an inline `action:` on any toast in the web tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { questionToast } from '@/components/question-toast';

const ROOT = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', 'api', 'ui'].includes(entry.name) ? [] : sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** A toast call whose options carry an inline action, read across lines. */
const INLINE_ACTION = /\btoast(?:\.\w+)?\([^;]*?\{\s*action:\s*\{/;

describe('a toast that asks waits for the answer (UX-18)', () => {
  it('stays until answered or closed', () => {
    const options = questionToast('Yes, correct it', () => undefined);
    expect(options.duration).toBe(Number.POSITIVE_INFINITY);
    expect(options.closeButton).toBe(true);
    expect(options.action.label).toBe('Yes, correct it');
  });

  it('is what both odometer refusals use', () => {
    for (const file of ['components/DashboardLayout.tsx', 'components/VehicleCard.tsx']) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect([file, /questionToast\(answer, /.test(source)]).toEqual([file, true]);
    }
  });

  it('no toast in the web tree carries an inline action', () => {
    const files = [...sources(join(ROOT, 'components')), ...sources(join(ROOT, 'app'))];
    expect(files.length).toBeGreaterThan(80);
    const offenders = files.filter((file) => INLINE_ACTION.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.slice(ROOT.length + 1))).toEqual([]);
  });

  it('can still see an inline action (anti-vacuous)', () => {
    const shipped = `toast.error(\n  result.error || 'x',\n  answer ? { action: { label: answer, onClick: () => void save(v, true) } } : undefined\n);`;
    expect(INLINE_ACTION.test(shipped)).toBe(true);
  });
});
