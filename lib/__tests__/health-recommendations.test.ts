/**
 * A recommendation is an imperative, not a preamble.
 * @jest-environment node
 *
 * Cowork, 21 Sep: every recommendation on every real car opened with "Based
 * on your provided service history, …" because the prompt mandated the
 * phrase. The prompt asks for substance now; this is the guarantee.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NO_HISTORY_RECOMMENDATION, shapeRecommendations, withoutPreamble } from '@tappet/core/health-recommendations';

const ROOT = join(__dirname, '..', '..');

describe('withoutPreamble', () => {
  it('drops the mandated clause and restores the capital', () => {
    expect(withoutPreamble('Based on your provided service history, schedule a comprehensive vehicle inspection.')).toBe(
      'Schedule a comprehensive vehicle inspection.'
    );
    expect(withoutPreamble('based on the provided service history: review routine maintenance requirements.')).toBe(
      'Review routine maintenance requirements.'
    );
    expect(withoutPreamble('Based on their documented records — replace the timing belt.')).toBe('Replace the timing belt.');
  });

  it('leaves a line that never had it alone', () => {
    expect(withoutPreamble('Replace the timing belt and water pump at 105,000 miles.')).toBe(
      'Replace the timing belt and water pump at 105,000 miles.'
    );
  });
});

describe('shapeRecommendations', () => {
  const REVIEWER = [
    'Based on your provided service history, upload past maintenance invoices or log completed services to establish an accurate baseline for your vehicle.',
    'Based on your provided service history, schedule a comprehensive vehicle inspection to identify any potential issues.',
    'Based on your provided service history, review routine maintenance requirements for your vehicle.',
  ];

  it('with a history on file: the preambles go, the lines stay in order', () => {
    expect(shapeRecommendations(REVIEWER, { historyOnFile: true })).toEqual([
      'Upload past maintenance invoices or log completed services to establish an accurate baseline for your vehicle.',
      'Schedule a comprehensive vehicle inspection to identify any potential issues.',
      'Review routine maintenance requirements for your vehicle.',
    ]);
  });

  it('with nothing on file: one honest first line, and the line that cited the history it asked for is gone', () => {
    // The App Review account's three, exactly as stored on 21 Aug.
    expect(shapeRecommendations(REVIEWER, { historyOnFile: false })).toEqual([
      NO_HISTORY_RECOMMENDATION,
      'Schedule a comprehensive vehicle inspection to identify any potential issues.',
      'Review routine maintenance requirements for your vehicle.',
    ]);
  });

  it('never says the sentence twice when the model already said it its own way', () => {
    const lines = shapeRecommendations([NO_HISTORY_RECOMMENDATION, 'Check the tire pressures.'], { historyOnFile: false });
    expect(lines).toEqual([NO_HISTORY_RECOMMENDATION, 'Check the tire pressures.']);
  });

  it('drops blanks and non-strings', () => {
    expect(shapeRecommendations(['', 4, null, 'Rotate the tires.'], { historyOnFile: true })).toEqual(['Rotate the tires.']);
  });
});

describe('the prompt asks for substance, not a phrase', () => {
  const actions = readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8');

  it('no longer mandates the clause, and asks for imperatives without a shared preamble', () => {
    expect(actions).not.toMatch(/Frame all recommendations as/);
    expect(actions).toMatch(/Ground every recommendation in the records listed above/);
    expect(actions).toMatch(/Do not begin recommendations with a shared preamble/);
    // And the guarantee is wired where the answer is stored.
    expect(actions).toMatch(/shapeRecommendations\(/);
  });

  it('the fixture and the screen test no longer carry the defect as the expected shape', () => {
    const fixture = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'dev', 'fixtures.ts'), 'utf8');
    const screenTest = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'screens', '__tests__', 'VehicleDetailScreen.test.tsx'), 'utf8');
    for (const source of [fixture, screenTest]) {
      expect(source).not.toMatch(/Based on your provided service history/);
    }
  });

  it('can still detect the prompt that shipped, so this is not vacuous', () => {
    const shipped = 'Important: Frame all recommendations as "based on your provided service history". Only reference issues';
    expect(shipped).toMatch(/Frame all recommendations as/);
  });
});
