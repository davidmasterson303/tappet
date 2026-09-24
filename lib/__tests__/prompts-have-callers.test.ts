/**
 * Every prompt this package exports is one the app sends.
 *
 * @jest-environment node
 *
 * Three exported prompts — invoice extraction, bundling, zone assignment —
 * had no caller for months while the live invoice prompt was inline in
 * `app/actions.ts`. An auditor reading `prompts.ts` read them as the product's
 * behaviour. CLAUDE.md §1: verify against the artefact, and a prompt nothing
 * sends is not the artefact.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PROMPTS = 'packages/core/src/prompts.ts';

function exportedNames(): string[] {
  const source = readFileSync(join(ROOT, PROMPTS), 'utf8');
  const names: string[] = [];
  const pattern = /^export const ([A-Z_]+)\b/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) names.push(match[1]);
  return names;
}

function callersOf(name: string): string[] {
  // Tracked files only. `-w -F`: a whole-word fixed string, because `\b` is
  // not portable across the regex engines git may be built with.
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['grep', '-l', '-w', '-F', name, '--', '*.ts', '*.tsx', '*.mts', '*.mjs'],
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
  } catch (error) {
    // Exit 1 is "no match", which is an answer, not a failure.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  return out
    .split('\n')
    .filter((f) => f && f !== PROMPTS && !f.includes('__tests__'));
}

describe('prompts.ts exports only what is sent', () => {
  const names = exportedNames();

  it('found the exports at all', () => {
    expect(names).toContain('CONSULTANT_SYSTEM_PROMPT');
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it.each(names)('%s has a caller outside the prompt file', (name) => {
    expect(callersOf(name).length).toBeGreaterThan(0);
  });

  it('can still detect a prompt with no caller', () => {
    expect(callersOf('INVOICE_EXTRACTION_PROMPT_THAT_NOBODY_SENDS')).toEqual([]);
  });
});
