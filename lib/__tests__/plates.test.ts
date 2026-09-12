/**
 * Generation plates — the pure half.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * 11 Sep, David: every car gets a generated night plate by default, keyed by
 * model generation, from a shared library, with colour not honoured and the
 * spend capped. `packages/core/src/plates.ts` holds everything decidable
 * without a network, and three things there must not drift:
 *
 * - the key: the trigger, the job and the reader spell it identically;
 * - the validator: a classifier answer that does not cover the car's year,
 *   or claims a span no generation has, is refused rather than trusted
 *   (CLAUDE.md §10 — `unknown` over a guessed default);
 * - the cap: exhaustion leaves a row `pending` and the car on the house plate.
 *
 * Every refusal case has a passing twin beside it, so a validator that
 * refused everything could not pass.
 */
import {
  PLATE_DAILY_CAP,
  isClaimStale,
  plateCapReached,
  plateCoversYear,
  plateKey,
  plateNeedsGeneration,
  plateObjectPaths,
  platePrompt,
  platePublicUrl,
  plateSlug,
  plateStatusLine,
  readGenerationClassification,
  singleYearClassification,
} from '@tappet/core/plates';
import { cardSlotSource } from '@tappet/core/photo-slots';

describe('the key', () => {
  it('is three lower-case slugs, and the same for the same car however it is spelled', () => {
    expect(plateKey({ make: 'BMW', family: '2 Series', generation: 'F22' })).toBe('bmw/2-series/f22');
    expect(plateKey({ make: ' bmw ', family: '2-Series', generation: 'f22' })).toBe('bmw/2-series/f22');
    expect(plateKey({ make: 'Honda', family: 'Accord', generation: '10th generation' })).toBe(
      'honda/accord/10th-generation',
    );
  });

  it('strips accents and refuses an empty segment', () => {
    expect(plateSlug('Citroën C4 Picasso')).toBe('citroen-c4-picasso');
    expect(() => plateKey({ make: 'BMW', family: '', generation: 'F22' })).toThrow(/family/);
  });

  it('names the two derivatives under the key, in the public bucket', () => {
    expect(plateObjectPaths('bmw/2-series/f22')).toEqual({
      hero: 'plates/bmw/2-series/f22/hero-3x2.jpg',
      card: 'plates/bmw/2-series/f22/card-800.jpg',
    });
    expect(platePublicUrl('https://x.supabase.co/', 'plates/bmw/2-series/f22/hero-3x2.jpg')).toBe(
      'https://x.supabase.co/storage/v1/object/public/garage-images/plates/bmw/2-series/f22/hero-3x2.jpg',
    );
  });
});

describe('the card slot rule reaches the plates', () => {
  it('maps a plate hero to its card, and leaves an owner upload alone', () => {
    const hero = 'https://x.supabase.co/storage/v1/object/public/garage-images/plates/bmw/2-series/f22/hero-3x2.jpg';
    expect(cardSlotSource(hero)).toBe(
      'https://x.supabase.co/storage/v1/object/public/garage-images/plates/bmw/2-series/f22/card-800.jpg',
    );
    // The demo rule still holds — the anti-vacuous twin.
    expect(cardSlotSource('/vehicles/m3/hero-3x2.jpg')).toBe('/vehicles/m3/card-800.jpg');
    // A signed upload carries any path and must not be rewritten.
    const signed = 'https://x.supabase.co/storage/v1/object/sign/vehicle-documents/u1/photos/hero-3x2.jpg?token=abc';
    expect(cardSlotSource(signed)).toBe(signed);
  });
});

describe('the prompt', () => {
  it('names the car, fixes the colour, and asks the badges away', () => {
    const prompt = platePrompt({ year: 2015, make: 'BMW', family: '2 Series', body: 'coupe' });
    expect(prompt).toContain('2015 BMW 2 Series coupe');
    expect(prompt).toContain('dark graphite metallic');
    expect(prompt).toContain('stock and unmodified');
    expect(prompt).toMatch(/No legible badges/);
    expect(prompt).toMatch(/sodium streetlamp/);
    expect(prompt).toMatch(/cold cyan light/);
    // Colour is not honoured, so no colour word from the owner's row can leak in.
    expect(prompt).not.toMatch(/\bred\b|\bwhite\b|\bblue\b/i);
  });
});

describe('the classifier answer is validated, not trusted', () => {
  const good = {
    family: '2 Series',
    generation: 'F22',
    label: 'F22 (2014–2021)',
    year_from: 2014,
    year_to: 2021,
    body: 'coupe',
  };

  it('accepts a range that covers the car and a body it knows', () => {
    expect(readGenerationClassification(good, 2015)).toEqual(good);
    // The range may run past the car's own year; it is bounded by today.
    expect(readGenerationClassification({ ...good, year_to: 2021 }, 2014)).not.toBeNull();
  });

  it('fills a missing label and an unknown body rather than failing on them', () => {
    const read = readGenerationClassification({ ...good, label: '', body: 'spaceship' }, 2015);
    expect(read?.label).toBe('F22 (2014–2021)');
    expect(read?.body).toBe('sedan');
  });

  it.each([
    ['a range that misses the car', { ...good, year_from: 2022, year_to: 2025 }, 2015],
    ['a span no generation has', { ...good, year_from: 2000, year_to: 2021 }, 2015],
    ['an inverted range', { ...good, year_from: 2021, year_to: 2014 }, 2015],
    ['an admitted unknown', { ...good, generation: 'unknown' }, 2015],
    ['no family', { ...good, family: '' }, 2015],
    ['non-numeric years', { ...good, year_from: 'twenty', year_to: 2021 }, 2015],
    ['a future too far', { ...good, year_to: new Date().getFullYear() + 5 }, 2015],
    ['not an object', 'F22', 2015],
    ['null', null, 2015],
  ])('refuses %s', (_name, raw, year) => {
    expect(readGenerationClassification(raw, year as number)).toBeNull();
  });

  it('falls back to exactly the one year it knows', () => {
    expect(singleYearClassification({ year: 2015, make: 'BMW', model: 'M235i' })).toEqual({
      family: 'M235i',
      generation: '2015',
      label: '2015',
      year_from: 2015,
      year_to: 2015,
      body: 'sedan',
    });
  });
});

describe('library rows', () => {
  it('cover their years inclusively', () => {
    const row = { year_from: 2014, year_to: 2021 };
    expect(plateCoversYear(row, 2014)).toBe(true);
    expect(plateCoversYear(row, 2021)).toBe(true);
    expect(plateCoversYear(row, 2013)).toBe(false);
    expect(plateCoversYear(row, 2022)).toBe(false);
  });

  it('a claim goes stale after ten minutes, and only a claim can', () => {
    const now = Date.parse('2026-09-11T20:00:00Z');
    const fresh = { status: 'generating' as const, claimed_at: '2026-09-11T19:55:00Z' };
    const old = { status: 'generating' as const, claimed_at: '2026-09-11T19:40:00Z' };
    expect(isClaimStale(fresh, now)).toBe(false);
    expect(isClaimStale(old, now)).toBe(true);
    expect(isClaimStale({ status: 'generating', claimed_at: null }, now)).toBe(true);
    expect(isClaimStale({ status: 'ready', claimed_at: '2026-09-11T19:40:00Z' }, now)).toBe(false);
  });

  it('needs generation unless ready or freshly claimed', () => {
    const now = Date.parse('2026-09-11T20:00:00Z');
    expect(plateNeedsGeneration({ status: 'pending', claimed_at: null }, now)).toBe(true);
    expect(plateNeedsGeneration({ status: 'failed', claimed_at: null }, now)).toBe(true);
    expect(plateNeedsGeneration({ status: 'generating', claimed_at: '2026-09-11T19:59:00Z' }, now)).toBe(false);
    expect(plateNeedsGeneration({ status: 'generating', claimed_at: '2026-09-11T19:00:00Z' }, now)).toBe(true);
    expect(plateNeedsGeneration({ status: 'ready', claimed_at: null }, now)).toBe(false);
  });
});

describe('the cap', () => {
  it('is reached at the cap, not before', () => {
    expect(plateCapReached(PLATE_DAILY_CAP - 1)).toBe(false);
    expect(plateCapReached(PLATE_DAILY_CAP)).toBe(true);
    expect(plateCapReached(0)).toBe(false);
  });

  it('is bounded in money terms that a bad day can absorb', () => {
    expect(PLATE_DAILY_CAP * 0.134).toBeLessThan(5);
  });
});

describe('what the card says', () => {
  it('names the wait and the failure, and says nothing when there is nothing to say', () => {
    expect(plateStatusLine('pending')).toMatch(/drawing/i);
    expect(plateStatusLine('generating')).toMatch(/drawing/i);
    expect(plateStatusLine('failed')).toMatch(/not drawn/i);
    expect(plateStatusLine('ready')).toBeNull();
    expect(plateStatusLine(null)).toBeNull();
    // Never a percentage — there is no progress to report honestly.
    expect(plateStatusLine('pending')).not.toMatch(/%|\d/);
  });
});
