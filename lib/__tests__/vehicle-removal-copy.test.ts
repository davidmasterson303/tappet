/**
 * The removal confirmation quotes rows, or says nothing.
 *
 * @jest-environment node
 */
import {
  REMOVAL_INCOMPLETE,
  removalInventoryIncomplete,
  removalLines,
  removalTitle,
} from '@tappet/core/vehicle-removal-copy';

const ACCORD = {
  vehicle: { year: 2003, make: 'Honda', model: 'Accord' },
  openRecalls: 24,
  markedRepaired: 1,
  serviceRecords: 6,
  receiptPhotographs: 3,
  hasHealthScore: true,
  hasSchedule: true,
  advisorThreads: 2,
  needs: 1,
};

describe('the lines', () => {
  it('reads the brief’s example back from the rows', () => {
    expect(removalTitle(ACCORD.vehicle)).toBe('Remove the 2003 Honda Accord?');
    expect(removalLines(ACCORD)).toEqual([
      '24 open recalls and what you have marked repaired',
      '6 service records',
      '3 receipt photographs',
      'its health score and maintenance schedule',
      '2 advisor threads',
      '1 item on its plan',
    ]);
  });

  it('draws no line for a count that could not be read, and says the list is incomplete', () => {
    const partial = { ...ACCORD, receiptPhotographs: null, serviceRecords: null };
    const lines = removalLines(partial);
    expect(lines.some((l) => /photograph/.test(l))).toBe(false);
    expect(lines.some((l) => /service record/.test(l))).toBe(false);
    expect(removalInventoryIncomplete(partial)).toBe(true);
    expect(removalInventoryIncomplete(ACCORD)).toBe(false);
    expect(REMOVAL_INCOMPLETE).toMatch(/could not be counted/);
  });

  it('a zero is not a line either — a car with nothing on file lists nothing', () => {
    expect(
      removalLines({
        vehicle: ACCORD.vehicle,
        openRecalls: 0,
        markedRepaired: 0,
        serviceRecords: 0,
        receiptPhotographs: 0,
        hasHealthScore: false,
        hasSchedule: false,
        advisorThreads: 0,
        needs: 0,
      })
    ).toEqual([]);
  });

  it('singular and the repaired-only case are worded, not templated', () => {
    expect(removalLines({ ...ACCORD, openRecalls: 1, markedRepaired: 0, serviceRecords: 1, receiptPhotographs: 1, advisorThreads: 1, needs: 2 })).toEqual([
      '1 open recall',
      '1 service record',
      '1 receipt photograph',
      'its health score and maintenance schedule',
      '1 advisor thread',
      '2 items on its plan',
    ]);
    expect(removalLines({ ...ACCORD, openRecalls: 0, markedRepaired: 3 })[0]).toBe('what you have marked repaired on 3 recalls');
    expect(removalLines({ ...ACCORD, hasSchedule: false })).toContain('its health score');
  });

  it('a car with no name still has a title', () => {
    expect(removalTitle({ year: null, make: null, model: null })).toBe('Remove this car?');
  });
});
