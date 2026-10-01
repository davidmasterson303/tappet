/**
 * A prompt states a missing odometer as unknown, never "0 miles" or "null"
 * (audit 360, TL-28; CLAUDE.md §6).
 *
 * @jest-environment node
 *
 * The health score's prompt read `vehicle.current_mileage.toLocaleString()`
 * raw: a stored 0 (one keystroke on either client's add form) was scored as a
 * 0-mile car with nothing mileage-based due, a null threw and failed the
 * score, and a null average printed "null". The two other prompts guarded
 * with `?.toLocaleString() || 'Unknown'`, which still prints "0 miles" for a
 * 0 — the string "0" is truthy.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { monthlyMilesForPrompt, odometerForPrompt } from '@tappet/core/mileage-tracking';

describe('odometerForPrompt / monthlyMilesForPrompt', () => {
  it('states no reading as unknown', () => {
    for (const missing of [0, null, undefined, -5, 12.5, Number.NaN]) {
      expect(odometerForPrompt(missing)).toMatch(/^Unknown/);
    }
    for (const missing of [0, null, undefined, Number.NaN]) {
      expect(monthlyMilesForPrompt(missing)).toBe('Unknown');
    }
  });

  it('anti-vacuous: a reading is stated as one', () => {
    expect(odometerForPrompt(45_000)).toBe('45,000 miles');
    expect(monthlyMilesForPrompt(1_000)).toBe('1,000 miles a month');
  });
});

describe('the prompts in app/actions.ts', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'app', 'actions.ts'), 'utf8');
  // A template hole that formats the odometer directly — the shape TL-28 found.
  const RAW = /\$\{vehicle\.current_mileage\??\.toLocaleString\(\)/g;
  const RAW_AVG = /\$\{vehicle\.avg_miles_per_month\}/g;

  it('found the prompts it guards', () => {
    expect((source.match(/odometerForPrompt\(vehicle\.current_mileage\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('monthlyMilesForPrompt(vehicle.avg_miles_per_month)');
  });

  it('never formats the stored odometer or average raw into a prompt', () => {
    expect(source.match(RAW) ?? []).toEqual([]);
    expect(source.match(RAW_AVG) ?? []).toEqual([]);
  });

  it('anti-vacuous: the scan catches the shapes that shipped', () => {
    const shipped = [
      '- Current Mileage: ${vehicle.current_mileage.toLocaleString()} miles',
      "- Current Mileage: ${vehicle.current_mileage?.toLocaleString() || 'Unknown'} miles",
      '- Average Monthly Miles: ${vehicle.avg_miles_per_month}',
    ].join('\n');
    expect((shipped.match(RAW) ?? []).length).toBe(2);
    expect((shipped.match(RAW_AVG) ?? []).length).toBe(1);
  });
});
