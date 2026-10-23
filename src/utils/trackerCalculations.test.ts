import { describe, expect, it } from 'vitest';
import { calculateStudentStats, edate, formatDateIL, parseFlexibleDate } from './trackerCalculations';
import type { StudentProfile } from '../types';

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

  describe('study start date', () => {
    const student: StudentProfile = {
      id: 'test', name: 'Test', parasha: 'בראשית', haftarah: 'בראשית',
      barMitzvahDate: '2027-06-15', parashaVerses: 100, skippedVerses: 0,
      learnedParashaVerses: 0, haftarahVerses: 20, learnedHaftarahVerses: 0, portions: [],
    };

    it('keeps the calculated suggestion for existing students and when the override is cleared', () => {
      const stats = calculateStudentStats(student);
      expect(stats.estimatedStartDate).toBe('15/10/2026');
      expect(stats.studyStartDate).toBe(stats.estimatedStartDate);
      expect(calculateStudentStats({ ...student, studyStartDate: '' }).studyStartDate).toBe(stats.estimatedStartDate);
    });

    it('uses the teacher selection without changing the calculated suggestion or other statistics', () => {
      const suggested = calculateStudentStats(student);
      const selected = calculateStudentStats({ ...student, studyStartDate: '2026-11-07' });
      expect(selected).toEqual({ ...suggested, studyStartDate: '07/11/2026' });
    });

    it('preserves the selected start when the learning plan changes', () => {
      const stats = calculateStudentStats({ ...student, studyStartDate: '2026-11-07', parashaVerses: 200 });
      expect(stats.studyStartDate).toBe('07/11/2026');
      expect(stats.estimatedStartDate).not.toBe(calculateStudentStats(student).estimatedStartDate);
    });
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
