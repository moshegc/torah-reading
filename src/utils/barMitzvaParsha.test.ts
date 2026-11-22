import { describe, expect, it } from 'vitest';
import { nextParashaReadingDate } from './barMitzvaParsha';

describe('nextParashaReadingDate', () => {
  it('finds the upcoming Shabbat and includes today when it matches', () => {
    const shabbat = new Date(2026, 10, 21);
    expect(nextParashaReadingDate('ויצא', new Date(2026, 10, 20))).toEqual(shabbat);
    expect(nextParashaReadingDate('ויצא', new Date(2026, 10, 21, 15))).toEqual(shabbat);
  });

  it('rolls into the next Hebrew year when the reading has passed', () => {
    expect(nextParashaReadingDate('בראשית', new Date(2026, 10, 20))).toEqual(new Date(2027, 9, 30));
  });

  it('waits until a doubled portion is actually read together in Israel', () => {
    expect(nextParashaReadingDate('ויקהל-פקודי', new Date(2026, 10, 20))).toEqual(new Date(2028, 2, 25));
  });

  it('uses Simchat Torah in Israel for Vezot Haberakhah, even on a weekday', () => {
    expect(nextParashaReadingDate('וזאת הברכה', new Date(2027, 9, 24))).toEqual(new Date(2028, 9, 12));
  });

  it('returns no suggestion for an unknown reading', () => {
    expect(nextParashaReadingDate('unknown')).toBeNull();
  });

  it('does not use a Diaspora date for a pair that is not read together in Israel', () => {
    expect(nextParashaReadingDate('חקת-בלק', new Date(2026, 10, 20))).toBeNull();
  });
});
