/**
 * The research runner asks, and never advances.
 *
 * Every transition here comes from a row the (mocked) API returned, never
 * from the clock: the interval only calls `reload`, and the lines change
 * when the observation does. The one thing the clock decides is the stall,
 * which is the client's to observe and must end in a stated failure.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { ResearchObservation } from '@tappet/core/research-milestones';
import { apiRequest } from '../../api/client';
import { DEADLINE_MS, POLL_MS, useResearchRunner } from '../useResearchRunner';

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const ACCORD = { year: 2003, make: 'Honda', model: 'Accord' };
const PLATE = { generation: '7th-generation', year_from: 2003, year_to: 2007 };
const pending = (): ResearchObservation => ({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'pending' }, nhtsa: null, health: null });

const calls = (path: string) => request.mock.calls.filter(([p]) => p === path);

beforeEach(() => {
  jest.useFakeTimers();
  request.mockReset();
  request.mockResolvedValue({ state: 'researching' } as never);
});
afterEach(() => jest.useRealTimers());

async function mount(initial: ResearchObservation | null) {
  const reload = jest.fn().mockResolvedValue(undefined);
  const hook = await renderHook(
    ({ observation }: { observation: ResearchObservation | null }) =>
      useResearchRunner({ vehicleId: 'v1', observation, reload }),
    { initialProps: { observation: initial } }
  );
  return { ...hook, reload };
}

describe('starting', () => {
  it('posts the trigger once for a pending car, and shows the log', async () => {
    const { result, rerender } = await mount(pending());
    await act(async () => {});
    expect(calls('/research')).toHaveLength(1);
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', body: { vehicleId: 'v1' } });
    expect(result.current.visible).toBe(true);
    // A re-render with the same pending row is not a second trigger.
    await rerender({ observation: pending() });
    await act(async () => {});
    expect(calls('/research')).toHaveLength(1);
  });

  it('does nothing for a car already researched', async () => {
    const { result } = await mount({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'completed' }, nhtsa: { recalls: [], lookup_status: 'matched' }, health: { health_score: 70 } });
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
  });

  it('shows a failed car settled on its failure with the retry, without spending on its own', async () => {
    const { result } = await mount({ vehicle: ACCORD, plate: PLATE, knowledge: { research_status: 'failed' }, nhtsa: null, health: null });
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(true);
    expect(result.current.settled).toBe(true);
    expect(result.current.failed).toBe(true);
    // The retry is the decision.
    await act(async () => result.current.retry());
    await act(async () => {});
    expect(calls('/research')).toHaveLength(1);
  });
});

describe('while it runs', () => {
  it('polls by reloading — it asks; it never marks a line done itself', async () => {
    const { result, reload } = await mount(pending());
    await act(async () => {});
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
    expect(reload).toHaveBeenCalledTimes(2);
    // Nothing changed in the rows, so nothing changed in the log.
    const recalls = result.current.milestones.find((m) => m.key === 'recalls')!;
    expect(recalls.state).toBe('active');
    expect(recalls.answer).toBeUndefined();
  });

  it('lines change when the rows do, in the order they land', async () => {
    const { result, rerender } = await mount(pending());
    await act(async () => {});
    await rerender({ observation: { ...pending(), nhtsa: { recalls: [{ Component: 'AIR BAGS', Summary: 'x' }], lookup_status: 'matched' } } });
    const byKey = () => Object.fromEntries(result.current.milestones.map((m) => [m.key, m]));
    expect(byKey().recalls).toMatchObject({ state: 'done', answer: '1 on file.' });
    expect(byKey().dossier.state).toBe('active');
    expect(result.current.line).toBe('Researching what this model is known for');
  });

  it('asks for the score once, only after the dossier, and refreshed', async () => {
    const { result, rerender } = await mount(pending());
    await act(async () => {});
    expect(calls('/health')).toHaveLength(0);
    const done: ResearchObservation = {
      ...pending(),
      knowledge: { research_status: 'completed', known_issues: [1] },
      nhtsa: { recalls: [], lookup_status: 'matched' },
      health: null,
    };
    await rerender({ observation: done });
    await act(async () => {});
    expect(calls('/health')).toHaveLength(1);
    expect(calls('/health')[0][1]).toMatchObject({ method: 'POST', body: { vehicleId: 'v1', refresh: true } });
    await rerender({ observation: { ...done } });
    await act(async () => {});
    expect(calls('/health')).toHaveLength(1);
    expect(result.current.milestones.find((m) => m.key === 'score')!.state).toBe('active');
  });

  it('settles when every line has its answer, and stops polling', async () => {
    const { result, rerender, reload } = await mount(pending());
    await act(async () => {});
    await rerender({
      observation: {
        vehicle: { ...ACCORD, next_service_label: 'Oil change', next_service_at_miles: 175_000 },
        plate: PLATE,
        knowledge: { research_status: 'completed', known_issues: [1, 2] },
        nhtsa: { recalls: [], lookup_status: 'matched' },
        health: { health_score: 64, last_generated: '2026-09-20T01:00:00Z' },
      },
    });
    await act(async () => {});
    expect(result.current.settled).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.line).toBe('Research complete');
    const before = reload.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS * 3);
    });
    expect(reload.mock.calls.length).toBe(before);
  });

  it('a refused score is a failed line, not a spinner', async () => {
    request.mockImplementation(async (path: string) => {
      if (path === '/health') throw Object.assign(new Error('Too many AI requests. Try again in 30s.'), { status: 429 });
      return { state: 'researching' };
    });
    const { result, rerender } = await mount(pending());
    await act(async () => {});
    await rerender({ observation: { ...pending(), knowledge: { research_status: 'completed' }, nhtsa: { recalls: [], lookup_status: 'matched' } } });
    await act(async () => {});
    const score = result.current.milestones.find((m) => m.key === 'score')!;
    expect(score.state).toBe('failed');
    expect(score.answer).toBe('Too many AI requests. Try again in 30s.');
    expect(result.current.settled).toBe(true);
  });
});

describe('the deadline — the one thing the clock decides', () => {
  it('ends in a stated failure on the step that did not come back, and stops polling', async () => {
    const { result, reload } = await mount(pending());
    await act(async () => {});
    await act(async () => {
      jest.advanceTimersByTime(DEADLINE_MS + POLL_MS);
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.failed).toBe(true);
    const recalls = result.current.milestones.find((m) => m.key === 'recalls')!;
    expect(recalls.state).toBe('failed');
    expect(recalls.answer).toMatch(/longer than it should/);
    expect(result.current.milestones.some((m) => m.state === 'active')).toBe(false);
    const before = reload.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS * 4);
    });
    expect(reload.mock.calls.length).toBe(before);
  });

  it('a retry after a stall starts again, clean', async () => {
    const { result } = await mount(pending());
    await act(async () => {});
    await act(async () => {
      jest.advanceTimersByTime(DEADLINE_MS + POLL_MS);
    });
    expect(calls('/research')).toHaveLength(1);
    await act(async () => result.current.retry());
    await act(async () => {});
    expect(calls('/research')).toHaveLength(2);
    expect(result.current.settled).toBe(false);
    expect(result.current.milestones.find((m) => m.key === 'recalls')!.state).toBe('active');
  });
});

describe('the margin', () => {
  it('quotes the plate while nothing else is on file, and NHTSA once it is', async () => {
    const { result, rerender } = await mount(pending());
    await act(async () => {});
    expect(result.current.marginalia).toBe('The 7th generation Honda Accord ran 5 model years, 2003 to 2007.');
    await rerender({
      observation: {
        ...pending(),
        nhtsa: {
          recalls: [
            { Component: 'POWER TRAIN', Summary: 'x', ReportReceivedDate: '15/04/2004' },
            { Component: 'AIR BAGS', Summary: 'y', ReportReceivedDate: '27/06/2019' },
          ],
          lookup_status: 'matched',
        },
      },
    });
    expect(result.current.marginalia).toBe("NHTSA's record for this model runs 15 years, from 2004 to 2019.");
  });
});
