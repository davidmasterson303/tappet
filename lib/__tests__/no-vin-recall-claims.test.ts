/**
 * Nothing on the phone says a VIN gets a car's recalls.
 *
 * @jest-environment node
 *
 * CLAUDE.md §10: recalls match on year, make and model, not VIN — saying
 * otherwise tells an owner their specific car is clear when only its model
 * was checked. The add form's VIN lead said "every recall filed against it"
 * on the first screen a new user reads (QE 1.6, 20 Sep). Comments stripped;
 * `RECALL_MATCH_CAVEAT` is the sentence the product does say.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECALL_MATCH_CAVEAT } from '@tappet/core/advice-disclosure';

const SCREENS = join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'screens');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const CLAIM = /recall[^.]{0,60}\b(against it|for your VIN|by (?:your )?VIN|matched to (?:your|the) VIN)|VIN[^.]{0,80}every recall/i;

describe('no VIN recall claim on any screen', () => {
  const files = readdirSync(SCREENS).filter((f) => f.endsWith('.tsx'));

  it('finds the screens', () => {
    expect(files).toContain('AddVehicleScreen.tsx');
  });

  it.each(files)('%s', (file) => {
    const hit = CLAIM.exec(code(readFileSync(join(SCREENS, file), 'utf8')));
    expect(hit ? `${file}: "${hit[0]}"` : `${file}: clean`).toBe(`${file}: clean`);
  });

  it('the product’s own sentence says the opposite, and this reader would catch the shipped line', () => {
    expect(RECALL_MATCH_CAVEAT).toMatch(/not by your VIN/);
    expect(CLAIM.test('A VIN gets the exact build — engine, trim, factory options, and every recall filed against it.')).toBe(true);
    expect(CLAIM.test('Recalls are matched to the year, make and model either way.')).toBe(false);
  });
});
