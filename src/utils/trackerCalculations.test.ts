import { describe, expect, it } from 'vitest';
import { edate, formatDateIL, parseFlexibleDate } from './trackerCalculations';

describe('European dates', () => {
  it.each([
    ['2026-11-07', '07/11/2026'],
    ['07/11/2026', '07/11/2026'],
    ['11/07/2026', '11/07/2026'],
    ['22/10/2026', '22/10/2026'],
    ['7/1/27', '07/01/2027'],
    ['29/02/2028', '29/02/2028'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatDateIL(input)).toBe(expected);
  });

  it.each(['31/02/2026', '29/02/2026', '01/13/2026', '00/01/2026', '12/31/2026'])(
    'rejects invalid European date %s',
    (input) => expect(parseFlexibleDate(input)).toBeNull()
  );

  it('preserves local calendar dates without a UTC conversion', () => {
    const date = parseFlexibleDate('07/11/2026')!;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 7]);
    expect(formatDateIL(new Date(2026, 10, 7))).toBe('07/11/2026');
  });

  it('round-trips calculated start dates without swapping day and month', () => {
    const result = edate('2026-11-07', -1);
    expect(result).toBe('07/10/2026');
    expect(formatDateIL(parseFlexibleDate(result)!)).toBe(result);
  });
});
