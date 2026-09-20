import { checkDigitAnswer, decodeLine, decodeStages, type DecodeObservation } from '../working-stages';

/**
 * The decode's stages are facts — the model behind `DecodeLog`.
 *
 * The rule `working-stages.ts` holds for every ledger: a row with an answer
 * is `done` or `failed`, a running row has none, and nothing is marked by a
 * clock. Every shape a decode can be in is walked here, and the coupling is
 * asserted over all of them rather than by example, because the value of the
 * log is that it cannot depict a step that did not happen.
 */

const ACCORD = '1HGCM82633A004352';
const SENTENCE = '2003 Honda Accord EX-V6, 3.0L V6.';

const shapes: Record<string, DecodeObservation> = {
  'sticker, nothing read yet': { source: 'sticker', vin: null, checkDigit: null, outcome: { status: 'asking' } },
  'sticker, asking': { source: 'sticker', vin: ACCORD, checkDigit: true, outcome: { status: 'asking' } },
  'sticker, named': { source: 'sticker', vin: ACCORD, checkDigit: true, outcome: { status: 'named', sentence: SENTENCE } },
  'sticker, named with a bad check digit': {
    source: 'sticker',
    vin: 'JF1VA1E60G9800001',
    checkDigit: false,
    outcome: { status: 'named', sentence: '2016 Subaru WRX Premium + MR, 2.0L 4-cylinder.' },
  },
  'typed, asking': { source: 'typed', vin: ACCORD, checkDigit: true, outcome: { status: 'asking' } },
  'typed, asking with a bad check digit': { source: 'typed', vin: 'JF1VA1E60G9800001', checkDigit: false, outcome: { status: 'asking' } },
  'typed, failed': {
    source: 'typed',
    vin: 'ZZZZZZZZZZZZZZZZZ',
    checkDigit: false,
    outcome: { status: 'failed', reason: 'NHTSA has nothing for that number. Read it over, or describe the car instead.' },
  },
  'document, named': { source: 'document', vin: ACCORD, checkDigit: true, outcome: { status: 'named', sentence: SENTENCE } },
};

describe('a stage with an answer is done or failed, and a running one has none', () => {
  it.each(Object.entries(shapes))('%s', (_name, observation) => {
    const stages = decodeStages(observation);
    expect(stages).toHaveLength(2);
    for (const stage of stages) {
      if (stage.answer) expect(['done', 'failed']).toContain(stage.state);
      else expect(['active', 'pending']).toContain(stage.state);
    }
  });

  it('is asserted over every shape — the table is not empty', () => {
    expect(Object.keys(shapes).length).toBeGreaterThanOrEqual(8);
  });
});

describe('the two rows', () => {
  it('reads the sticker first, with the number as a mono answer, and asks NHTSA second', () => {
    expect(decodeStages(shapes['sticker, asking'])).toEqual([
      { label: 'Reading the sticker', state: 'done', answer: ACCORD, mono: true },
      { label: 'Asking NHTSA what that is', state: 'active' },
    ]);
  });

  it('is still reading while the door has produced nothing, with NHTSA pending', () => {
    expect(decodeStages(shapes['sticker, nothing read yet'])).toEqual([
      { label: 'Reading the sticker', state: 'active' },
      { label: 'Asking NHTSA what that is', state: 'pending' },
    ]);
  });

  it('checks a typed number first, and the answer is the check-digit verdict', () => {
    expect(decodeStages(shapes['typed, asking'])[0]).toEqual({
      label: 'Checking the number',
      state: 'done',
      answer: checkDigitAnswer(true),
    });
    // A mismatch is an answer, not a failure: the decode proceeds and says so.
    const mismatch = decodeStages(shapes['typed, asking with a bad check digit']);
    expect(mismatch[0]).toMatchObject({ state: 'done', answer: checkDigitAnswer(false) });
    expect(mismatch[0].answer).toMatch(/does not agree/);
    expect(mismatch[1]).toEqual({ label: 'Asking NHTSA what that is', state: 'active' });
  });

  it('names the car when NHTSA has, and flags a mismatch it has not yet said', () => {
    expect(decodeStages(shapes['sticker, named'])[1]).toEqual({
      label: 'Asking NHTSA what that is',
      state: 'done',
      answer: SENTENCE,
    });
    // Off the sticker the mismatch rides the answer; typed, the first row said it.
    expect(decodeStages(shapes['sticker, named with a bad check digit'])[1].answer).toMatch(
      /^2016 Subaru WRX .* Its check digit does not agree/
    );
    const typedNamed: DecodeObservation = { ...shapes['typed, asking with a bad check digit'], outcome: { status: 'named', sentence: SENTENCE } };
    expect(decodeStages(typedNamed)[1].answer).toBe(SENTENCE);
  });

  it('fails the NHTSA row with the stated reason', () => {
    expect(decodeStages(shapes['typed, failed'])[1]).toEqual({
      label: 'Asking NHTSA what that is',
      state: 'failed',
      answer: 'NHTSA has nothing for that number. Read it over, or describe the car instead.',
    });
  });
});

describe('the line', () => {
  it('is the active stage while one runs, and the outcome once it is over', () => {
    expect(decodeLine(shapes['sticker, nothing read yet'])).toBe('Reading the sticker');
    expect(decodeLine(shapes['typed, asking'])).toBe('Asking NHTSA what that is');
    expect(decodeLine(shapes['sticker, named'])).toBe('Identified');
    expect(decodeLine(shapes['typed, failed'])).toBe('Not identified');
  });
});
