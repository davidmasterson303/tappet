/**
 * The research log narrates real work and never elapsed time.
 *
 * @jest-environment node
 *
 * `research-milestones.ts` is the rule made structural: every answer line
 * quotes a row the API handed the client, so a screen rendering it cannot
 * depict work that has not happened. These cases hold the model to that —
 * an answer exists only with its data, failure is a line rather than a
 * spinner, a stall is reported on the step that did not come back, and the
 * marginalia is sourced or absent.
 */

import {
  generationPhrase,
  largestRecallSystem,
  researchHasFailure,
  researchLine,
  researchMarginalia,
  researchMilestones,
  researchSettled,
  type ResearchObservation,
} from '@tappet/core/research-milestones';

const ACCORD: ResearchObservation['vehicle'] = { year: 2003, make: 'Honda', model: 'Accord', current_mileage: 170_000 };
const PLATE = { generation: '7th-generation', year_from: 2003, year_to: 2007 };

/** NHTSA's shape as `fetchNHTSARecalls` stores it. */
const recall = (component: string, date: string, n: string) => ({
  NHTSACampaignNumber: n,
  Component: component,
  Summary: `Honda is recalling certain ${component}`,
  ReportReceivedDate: date,
});
const TAKATA = [
  recall('AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE', '27/06/2019', '19V499000'),
  recall('AIR BAGS:FRONTAL:PASSENGER SIDE:INFLATOR MODULE', '27/06/2019', '19V501000'),
  recall('AIR BAGS', '04/11/2014', '14V700000'),
  recall('EXTERIOR LIGHTING:HEADLIGHTS', '11/08/2008', '08E050000'),
  recall('POWER TRAIN:AUTOMATIC TRANSMISSION', '15/04/2004', '04V176000'),
];

const byKey = (observed: ResearchObservation) =>
  Object.fromEntries(researchMilestones(observed).map((m) => [m.key, m]));

describe('an answer exists only once its data is in hand', () => {
  it('a car just added has one done line (its plate) and one running, nothing else answered', () => {
    const m = byKey({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'pending' }, nhtsa: null, health: null });
    expect(m.decode).toMatchObject({ state: 'done', answer: '7th generation, 2003–2007.' });
    expect(m.recalls.state).toBe('active');
    expect(m.recalls.answer).toBeUndefined();
    for (const key of ['sort', 'dossier', 'schedule', 'score']) {
      expect(`${key}: ${m[key].state}`).toBe(`${key}: pending`);
      expect(m[key].answer).toBeUndefined();
    }
  });

  it('never carries an answer on an active or pending line — the coupling is the rule', () => {
    const observations: ResearchObservation[] = [
      { vehicle: ACCORD, plate: null, knowledge: null, nhtsa: null, health: null },
      { vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'pending' }, nhtsa: { recalls: TAKATA, lookup_status: 'matched' } },
      { vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'completed', known_issues: [1, 2] }, nhtsa: { recalls: [], lookup_status: 'matched' } },
    ];
    for (const observed of observations) {
      for (const milestone of researchMilestones(observed)) {
        if (milestone.state === 'active' || milestone.state === 'pending') expect(milestone.answer).toBeUndefined();
        else expect(typeof milestone.answer).toBe('string');
      }
    }
  });

  it('NHTSA lands before the dossier and both of its lines quote the row', () => {
    const m = byKey({
      vehicle: ACCORD,
      plate: PLATE,
      knowledge: { research_status: 'pending' },
      nhtsa: { recalls: TAKATA, lookup_status: 'matched' },
    });
    expect(m.recalls).toMatchObject({ state: 'done', answer: '5 on file.' });
    expect(m.sort).toMatchObject({ state: 'done', answer: '3 involve the airbags.' });
    expect(m.dossier.state).toBe('active');
  });

  it('a clean NHTSA answer is "none on file", not silence and not a green tick', () => {
    const m = byKey({ vehicle: ACCORD, plate: PLATE, nhtsa: { recalls: [], lookup_status: 'matched' } });
    expect(m.recalls).toMatchObject({ state: 'done', answer: 'None on file for this model.' });
    expect(m.sort).toMatchObject({ state: 'done', answer: 'Nothing to sort.' });
  });

  it('the dossier line quotes the knowledge base, and the schedule the projected column', () => {
    const m = byKey({
      vehicle: { ...ACCORD, next_service_label: 'Timing belt', next_service_at_miles: 175_000 },
      plate: PLATE,
      knowledge: { research_status: 'completed', known_issues: [1, 2, 3, 4, 5, 6], engine_type: '2.4L I4', transmission_type: '5-speed automatic', maintenance_schedule: [1, 2, 3] },
      nhtsa: { recalls: TAKATA, lookup_status: 'matched' },
      health: { health_score: 62, last_generated: '2026-09-20T01:00:00Z' },
    });
    expect(m.dossier).toMatchObject({ state: 'done', answer: '6 known issues on file for it; 2.4L I4, 5-speed automatic.' });
    expect(m.schedule).toMatchObject({ state: 'done', answer: 'Next up: Timing belt, around 175,000 mi.' });
    expect(m.score.state).toBe('done');
    expect(m.score.answer).toMatch(/^62 · /);
    expect(researchSettled(researchMilestones({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'completed' }, nhtsa: { recalls: [], lookup_status: 'matched' }, health: { health_score: 62, last_generated: 'x' } }))).toBe(true);
  });

  it('a schedule on file with nothing projected says so rather than "nothing due"', () => {
    const m = byKey({
      vehicle: ACCORD,
      plate: PLATE,
      knowledge: { research_status: 'completed', maintenance_schedule: [1, 2, 3, 4] },
      nhtsa: { recalls: [], lookup_status: 'matched' },
    });
    expect(m.schedule).toMatchObject({ state: 'done', answer: '4 services on the schedule; nothing projected yet.' });
    expect(m.schedule.answer).not.toMatch(/nothing due/i);
  });
});

describe('failure is a line, not a spinner', () => {
  it('NHTSA not answering is a failed line that says when it is asked again', () => {
    const m = byKey({ vehicle: ACCORD, plate: PLATE, nhtsa: { recalls: [], lookup_status: 'failed' } });
    expect(m.recalls).toMatchObject({ state: 'failed', answer: 'NHTSA did not answer. It is asked again overnight.' });
    // And the pipeline moves on: the dossier is what runs next.
    expect(m.dossier.state).toBe('active');
  });

  it('research marked failed fails its line and the lines that wait on it', () => {
    const m = byKey({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'failed' }, nhtsa: { recalls: [], lookup_status: 'matched' } });
    expect(m.dossier).toMatchObject({ state: 'failed', answer: 'The research did not finish.' });
    expect(m.schedule.state).toBe('failed');
    expect(m.score.state).toBe('failed');
    const all = researchMilestones({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'failed' }, nhtsa: { recalls: [], lookup_status: 'matched' } });
    expect(researchSettled(all)).toBe(true);
    expect(researchHasFailure(all)).toBe(true);
    expect(researchLine(all)).toBe('Research stopped');
  });

  it('a refused score carries the refusal as its line', () => {
    const m = byKey({
      vehicle: ACCORD,
      plate: PLATE,
      knowledge: { research_status: 'completed' },
      nhtsa: { recalls: [], lookup_status: 'matched' },
      health: null,
      healthFailure: 'Too many AI requests. Try again in 30s.',
    });
    expect(m.score).toMatchObject({ state: 'failed', answer: 'Too many AI requests. Try again in 30s.' });
  });

  it('a score row without a number is the honest "could not say", and is done', () => {
    const m = byKey({
      vehicle: ACCORD,
      plate: PLATE,
      knowledge: { research_status: 'completed' },
      nhtsa: { recalls: [], lookup_status: 'matched' },
      health: { health_score: null, last_generated: '2026-09-20T01:00:00Z' },
    });
    expect(m.score).toMatchObject({ state: 'done', answer: 'No reading could be made from the records on file.' });
  });

  it('a stall is reported on the step that did not come back — no state is active forever', () => {
    const all = researchMilestones({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'pending' }, nhtsa: { recalls: TAKATA, lookup_status: 'matched' }, stalled: true });
    const dossier = all.find((m) => m.key === 'dossier')!;
    expect(dossier.state).toBe('failed');
    expect(dossier.answer).toMatch(/longer than it should/);
    expect(all.some((m) => m.state === 'active')).toBe(false);
    expect(researchSettled(all)).toBe(false); // schedule and score are still pending — they never started
    expect(researchLine(all)).toBe('Research stopped');
  });

  it('the line above the ledger is the running step, so the two cannot disagree', () => {
    const all = researchMilestones({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'pending' }, nhtsa: null });
    expect(researchLine(all)).toBe('Asking NHTSA about open campaigns');
  });
});

describe('the marginalia is sourced or absent', () => {
  it('quotes NHTSA’s own record when it spans years', () => {
    const line = researchMarginalia({ vehicle: ACCORD, plate: PLATE, nhtsa: { recalls: TAKATA, lookup_status: 'matched' } });
    expect(line).toBe("NHTSA's record for this model runs 15 years, from 2004 to 2019.");
  });

  it('falls back to the plate’s generation, which is a stored row', () => {
    const line = researchMarginalia({ vehicle: ACCORD, plate: PLATE, nhtsa: null });
    expect(line).toBe('The 7th generation Honda Accord ran 5 model years, 2003 to 2007.');
  });

  it('says nothing when nothing true is on file — never filler', () => {
    expect(researchMarginalia({ vehicle: ACCORD, plate: null, nhtsa: null })).toBeNull();
    expect(researchMarginalia({ vehicle: ACCORD, plate: { generation: null }, nhtsa: { recalls: [], lookup_status: 'matched' } })).toBeNull();
  });
});

describe('the decode line can never stay pending — found live on the first car', () => {
  it('phrases a chassis code, an ordinal, and a worded slug', () => {
    expect(generationPhrase('xv50')).toBe('XV50');
    expect(generationPhrase('f22')).toBe('F22');
    expect(generationPhrase('7th-generation')).toBe('7th generation');
    expect(generationPhrase('third-generation-facelift')).toBe('Third Generation Facelift');
    expect(generationPhrase(null)).toBeNull();
  });

  it('is done on a Toyota plate — the 2012 Camry, whose key is xv50', () => {
    const m = byKey({ vehicle: { year: 2012, make: 'Toyota', model: 'Camry' }, plate: { generation: 'xv50', year_from: 2012, year_to: 2017 }, nhtsa: null });
    expect(m.decode).toMatchObject({ state: 'done', answer: 'XV50, 2012–2017.' });
    expect(m.recalls.state).toBe('active');
  });

  it('is done even when the plate carries years but no generation it can phrase, or neither', () => {
    expect(byKey({ vehicle: ACCORD, plate: { generation: null, year_from: 2003, year_to: 2007 } }).decode).toMatchObject({ state: 'done', answer: 'A 2003–2007 car, by its plate.' });
    expect(byKey({ vehicle: ACCORD, plate: { generation: null, year_from: null, year_to: null } }).decode).toMatchObject({ state: 'done', answer: 'Filed as a 2003 Honda Accord.' });
    // Every observation in this file leaves decode done — never the running step.
    expect(researchMilestones({ vehicle: ACCORD, plate: { generation: 'nonsense here' } }).find((m) => m.key === 'decode')!.state).toBe('done');
  });
});

describe('the sort line', () => {
  it('names the largest system in plain words', () => {
    expect(largestRecallSystem(TAKATA)).toEqual({ system: 'the airbags', count: 3 });
    expect(largestRecallSystem([recall('EXTERIOR LIGHTING', '2006-01-01', 'x')])).toEqual({ system: 'the exterior lighting', count: 1 });
    expect(largestRecallSystem([])).toBeNull();
  });
});

describe('can still detect a log that narrates a clock, so this is not vacuous', () => {
  it('a milestone marked done with no row behind it fails the coupling check', () => {
    // The shape a timer-driven "step" would produce: done, no data, no answer.
    const fake = { key: 'recalls', label: 'Asking NHTSA', state: 'done' as const };
    const carriesAnswerIffFinished = (m: { state: string; answer?: string }) =>
      (m.state === 'done' || m.state === 'failed') === (typeof m.answer === 'string');
    expect(carriesAnswerIffFinished(fake)).toBe(false);
    for (const m of researchMilestones({ vehicle: ACCORD, plate: PLATE, nhtsa: { recalls: TAKATA, lookup_status: 'matched' } })) {
      expect(carriesAnswerIffFinished(m)).toBe(true);
    }
  });
});
