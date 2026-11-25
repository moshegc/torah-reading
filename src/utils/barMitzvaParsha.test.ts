import { HDate } from '@hebcal/core';
import { describe, expect, it } from 'vitest';
import { nextParashaReadingDate, barMitzvaFromHebrew, getBarMitzvaReadingChoices, localDateISO } from './barMitzvaParsha';

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

function birthdayOn(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const birthday = new HDate(new Date(year, month - 1, day));
  return barMitzvaFromHebrew({ day: birthday.getDate(), month: birthday.getMonth(), year: birthday.getFullYear() - 13 });
}

describe('festival reading choices', () => {
  it('finds a festival after the birthday and uses the first Shabbat even when it is a festival', () => {
    const info = birthdayOn('2027-04-20');
    expect(localDateISO(info.barMitzvaDate)).toBe('2027-04-20');
    const choices = getBarMitzvaReadingChoices(info)!;
    expect(choices.festival).toMatchObject({ date: '2027-04-22', name: 'פסח א׳' });
    expect(choices.shabbat).toEqual({ date: '2027-04-24', name: 'שבת חל המועד פסח' });
  });

  it('includes the birthday and the first Shabbat in the search', () => {
    expect(getBarMitzvaReadingChoices(birthdayOn('2027-04-22'))?.festival.date).toBe('2027-04-22');
    const onShabbat = getBarMitzvaReadingChoices(birthdayOn('2027-04-24'))!;
    expect(onShabbat.festival).toMatchObject({ date: '2027-04-24', name: 'שבת חל המועד פסח' });
    expect(onShabbat.shabbat).toEqual(onShabbat.festival);
  });

  it('finds a festival before a regular first Shabbat', () => {
    const choices = getBarMitzvaReadingChoices(birthdayOn('2027-06-11'))!;
    expect(choices.festival).toMatchObject({ date: '2027-06-11', name: 'שבועות' });
    expect(choices.shabbat.date).toBe('2027-06-12');
  });

  it('returns no choices when the first Shabbat interval has no festival', () => {
    expect(getBarMitzvaReadingChoices(birthdayOn('2027-01-05'))).toBeNull();
  });

  it('includes special Shabbat readings when the holiday itself is Shabbat', () => {
    const choices = getBarMitzvaReadingChoices(birthdayOn('2026-12-05'))!;
    expect(choices.festival).toMatchObject({
      date: '2026-12-05', specialId: 'Chanukah Day 1 (on Shabbat)',
    });
    expect(choices.shabbat).toEqual(choices.festival);
  });
});

describe('Hebrew birthday validation', () => {
  it.each([
    [0, 1, 5774], [31, 1, 5774], [30, 2, 5774], [1, 13, 5773], [1, 1, 4999],
  ])('rejects invalid Hebrew date %s/%s/%s', (day, month, year) => {
    expect(() => barMitzvaFromHebrew({ day, month, year })).toThrow();
  });

  it.each([4, 23])('accepts a manually entered day %s', (day) => {
    expect(barMitzvaFromHebrew({ day, month: 1, year: 5774 }).birthHDate.getDate()).toBe(day);
  });
});
