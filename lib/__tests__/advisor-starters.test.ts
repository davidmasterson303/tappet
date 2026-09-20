/**
 * The advisor's opening questions come from the car's rows, not a list.
 * @jest-environment node
 *
 * QE 2.1 (20 Sep): "Ask about this car" sat over the same three questions for
 * every car. These pin that each slot reads a row, that an empty slot claims
 * nothing, and that the result is always three distinct lines.
 */
import { GENERIC_STARTERS, advisorStarters, inSentence } from '@tappet/core/advisor-starters';

const ACCORD = {
  nextService: 'Engine Oil and Filter Change',
  knownIssues: [
    { part: 'Automatic transmission', severity: 'High', mileage_range: '90,000–150,000 mi', description: '…' },
    { part: 'Power steering pump', severity: 'Medium', mileage_range: '', description: '…' },
  ],
  openRecalls: Array.from({ length: 10 }, (_, i) => ({
    NHTSACampaignNumber: `1${i}V000000`,
    Component: 'AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE',
    Summary: 'Takata inflator.',
  })).concat([{ NHTSACampaignNumber: '20V999000', Component: 'STEERING', Summary: 'Something else.' }]),
};

describe('advisorStarters', () => {
  it('asks about the service due next, the worst known issue and the largest open recall system', () => {
    expect(advisorStarters(ACCORD)).toEqual([
      'What does the engine oil and filter change that is due next involve?',
      'Is the automatic transmission something I should worry about?',
      'What do the 10 open recalls involving the airbags mean for this car?',
    ]);
  });

  it('ranks known issues by severity, not by position', () => {
    const [issue] = advisorStarters({
      knownIssues: [
        { part: 'Window regulator', severity: 'Low' },
        { part: 'Timing belt', severity: 'High' },
      ],
    });
    expect(issue).toBe('Is the timing belt something I should worry about?');
  });

  it('says "the open recall" for exactly one', () => {
    const lines = advisorStarters({ openRecalls: [{ Component: 'STEERING', Summary: 'x' }] });
    expect(lines).toContain('What does the open recall involving the steering mean for this car?');
  });

  it('fills what the rows cannot with questions that claim nothing, always three', () => {
    expect(advisorStarters({})).toEqual([...GENERIC_STARTERS]);
    expect(advisorStarters({ nextService: null, knownIssues: 'pending', openRecalls: null })).toEqual([...GENERIC_STARTERS]);

    const one = advisorStarters({ nextService: 'Brake Fluid Flush' });
    expect(one).toHaveLength(3);
    expect(one[0]).toBe('What does the brake fluid flush that is due next involve?');
    // The generic lines of the two slots the rows left empty — never the
    // next-service one, which would ask the first question twice.
    expect(one.slice(1)).toEqual(GENERIC_STARTERS.slice(1));
    expect(new Set(one).size).toBe(3);
  });

  it('a car with a service and an issue but no open recalls asks about recalls generically — the M235i, seen live', () => {
    const lines = advisorStarters({
      nextService: 'Engine Oil & Filter Change',
      knownIssues: [{ part: 'Electric water pump / thermostat', severity: 'High' }],
      openRecalls: [],
    });
    expect(lines).toEqual([
      'What does the engine oil & filter change that is due next involve?',
      'Is the electric water pump / thermostat something I should worry about?',
      'Are there any recalls I should know about?',
    ]);
    expect(lines).not.toContain('What should I do at the next service?');
  });

  it('counts only the campaigns it is given — the caller decides which are open', () => {
    // Marked-repaired campaigns are the phone's `openRecalls` to drop; a
    // caller passing an empty list gets no count — only the slot's generic
    // question, which claims nothing.
    const lines = advisorStarters({ openRecalls: [] });
    expect(lines.some((l) => /open recalls? involving/.test(l))).toBe(false);
    expect(lines).toContain('Are there any recalls I should know about?');
  });

  it('never offers the list that shipped for a car it does not describe', () => {
    // The Accord's schedule has a timing belt and nobody quoted control arms.
    const lines = advisorStarters(ACCORD);
    expect(lines).not.toContain('Is the timing chain something I should worry about?');
    expect(lines).not.toContain('Is $1,400 fair for front control arms?');
  });
});

describe('inSentence', () => {
  it('lowers Title Case and leaves names alone', () => {
    expect(inSentence('Engine Oil and Filter Change')).toBe('engine oil and filter change');
    expect(inSentence('VANOS Solenoid Replacement')).toBe('VANOS solenoid replacement');
    expect(inSentence('PCV valve')).toBe('PCV valve');
    expect(inSentence('  N55 Oil  Filter Housing ')).toBe('N55 oil filter housing');
    expect(inSentence('')).toBeNull();
    expect(inSentence(null)).toBeNull();
  });
});
