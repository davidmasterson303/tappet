/**
 * "Add a service record" lands on the Needs list with its dialog open.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * 11 Sep, David, on the live demo: the Service tab's "Add a service record"
 * went to the advisor; it should go to the Plan tab's Needs segment with
 * "Add to Needs" already open — the by-hand path to a record is Needs → Mark
 * as Complete. Two pages agree on that hand-off through `lib/plan-entry.ts`:
 * the Service tab writes the URL with `planHref`, the Plan tab reads it with
 * `readPlanEntry`. This pins the round-trip, and the two fallbacks that must
 * not guess (CLAUDE.md §6): an unknown segment opens Needs, and only `add=1`
 * on Needs opens the dialog.
 *
 * The source block pins that the two pages actually go through the helper —
 * a helper nobody calls is the shape of fix this repo has shipped before.
 */
import fs from 'fs';
import path from 'path';
import { planHref, readPlanEntry } from '@/lib/plan-entry';

const read = (rel: string) => {
  const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  expect(text.length).toBeGreaterThan(0);
  return text;
};

describe('planHref → readPlanEntry round-trips', () => {
  it('the Service tab\'s hand-off opens Needs with the dialog', () => {
    const href = planHref('v1', { openAdd: true });
    expect(href).toBe('/plan/v1?segment=needs&add=1');
    const entry = readPlanEntry(new URL(href, 'http://x').searchParams);
    expect(entry).toEqual({ segment: 'needs', openAdd: true });
  });

  it('a plain visit is Needs, closed', () => {
    expect(planHref('v1')).toBe('/plan/v1');
    expect(readPlanEntry(new URLSearchParams())).toEqual({ segment: 'needs', openAdd: false });
    expect(readPlanEntry(null)).toEqual({ segment: 'needs', openAdd: false });
  });

  it('mods can be chosen, and never opens the Needs dialog', () => {
    const href = planHref('v1', { segment: 'mods' });
    expect(href).toBe('/plan/v1?segment=mods');
    expect(readPlanEntry(new URL(href, 'http://x').searchParams)).toEqual({
      segment: 'mods',
      openAdd: false,
    });
    // Even if someone hand-writes add=1 onto mods — the dialog belongs to Needs.
    expect(readPlanEntry(new URLSearchParams('segment=mods&add=1'))).toEqual({
      segment: 'mods',
      openAdd: false,
    });
  });

  it('does not guess from junk — the anti-vacuous half', () => {
    expect(readPlanEntry(new URLSearchParams('segment=history'))).toEqual({
      segment: 'needs',
      openAdd: false,
    });
    expect(readPlanEntry(new URLSearchParams('add=true'))).toEqual({
      segment: 'needs',
      openAdd: false,
    });
    expect(readPlanEntry(new URLSearchParams('add=1'))).toEqual({
      segment: 'needs',
      openAdd: true,
    });
  });
});

describe('both pages go through the helper', () => {
  it('the Service tab pushes planHref with openAdd, not a consultant route', () => {
    const src = read('app/documents/[vehicleId]/page.tsx');
    expect(src).toMatch(/router\.push\(planHref\(params\.vehicleId, \{ openAdd: true \}\)\)/);
    // The "Add a service record" button must not still point at the advisor.
    const button = src.slice(src.indexOf('Add a service record') - 3000, src.indexOf('Add a service record'));
    expect(button).not.toMatch(/router\.push\(`\/consultant/);
  });

  it('the Plan tab reads the entry and hands openAdd to the Needs card', () => {
    const src = read('app/plan/[vehicleId]/page.tsx');
    expect(src).toMatch(/readPlanEntry\(useSearchParams\(\)\)/);
    expect(src).toMatch(/<WishlistSection vehicleId=\{data\.vehicle\.id\} openAdd=\{entry\.openAdd\} \/>/);
    // useSearchParams needs the boundary, or the route de-opts at build.
    expect(src).toMatch(/<Suspense fallback=\{null\}>\s*<PlanPageInner/);
  });

  it('the Needs card seeds its dialog from the prop', () => {
    const src = read('components/WishlistSection.tsx');
    expect(src).toMatch(/useState\(openAdd\)/);
  });
});
