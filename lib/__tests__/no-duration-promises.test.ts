/**
 * The phone promises no duration it cannot keep.
 *
 * @jest-environment node
 *
 * ── The finding (20 Sep) ────────────────────────────────────────────────────
 *
 * The add form said the research "takes a few seconds"; the health screen
 * said the score "happens a few seconds after it is added"; the plan, the
 * wishlist and the recall screens said "shortly after" and "in a minute".
 * For a car added on the phone none of it happened at all — the trigger was
 * a web component — and once it does, the dossier is 23–60 s. A duration
 * the binary states and does not deliver is a Guideline 2.3.1 problem, not
 * a missing feature. The rule now: state the real duration or promise none
 * and let the research log carry it. The log needs no estimate, because a
 * log that is visibly working is its own answer.
 *
 * ── What is scanned ─────────────────────────────────────────────────────────
 *
 * Every screen's source with comments removed — comments may quote the old
 * sentences, and do. A retry suggestion after a failure or a rate limit
 * ("Try again in a minute") is not matched: it is about a real window, not
 * about work arriving, and the pattern requires the latter.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { researchLine, researchMilestones } from '@tappet/core/research-milestones';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/*
  Promises about *work landing*: a stated wait for research, a schedule, a
  score. "Try again in a minute" after a rate limit, or "in a moment" on a
  failed save, is a retry suggestion about a real window and is not matched
  — the sentence has to be about something arriving.
*/
const PROMISES =
  /a few seconds|few seconds after|shortly after a (car|vehicle)|(open|pull|check back|come back)[^.]{0,60}in a minute|fills in[^.]{0,40}(shortly|in a minute)|within seconds/i;

describe('the phone promises no duration it cannot keep', () => {
  const files = readdirSync(SCREENS).filter((f) => f.endsWith('.tsx'));

  it('finds the screens it is supposed to be scanning', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain('AddVehicleScreen.tsx');
    expect(files).toContain('HealthScreen.tsx');
  });

  it.each(files)('%s', (file) => {
    const source = code(readFileSync(join(SCREENS, file), 'utf8'));
    const hit = PROMISES.exec(source);
    expect(hit ? `${file}: "${hit[0]}"` : `${file}: clean`).toBe(`${file}: clean`);
  });

  it('the log needs no estimate: its line is the running step, never a duration', () => {
    const line = researchLine(
      researchMilestones({ vehicle: { year: 2003, make: 'Honda', model: 'Accord' }, plate: null, knowledge: { research_status: 'pending' } })
    );
    expect(line).toBe('Asking NHTSA about open campaigns');
    expect(PROMISES.test(line)).toBe(false);
  });

  it('can still detect the sentences that shipped, so this is not vacuous', () => {
    const shipped = [
      'We look up its known issues and service schedule in the background — that takes a few seconds.',
      'that happens a few seconds after it is added, and again as work is recorded.',
      'That fills in shortly after a car is added — pull down in a minute.',
      'open this screen again in a minute.',
    ];
    for (const sentence of shipped) expect(PROMISES.test(sentence)).toBe(true);
  });
});
