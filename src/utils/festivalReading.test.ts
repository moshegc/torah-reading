import { describe, expect, it } from 'vitest';
import { FESTIVAL_OPTIONS, getParashaVerseReading } from '../data/parashaOptions';
import { VERSE_READINGS } from '../data/verseCounts';
import { barMitzvaFromHebrew, getBarMitzvaReadingChoices } from './barMitzvaParsha';
import { getFestivalReadingForDate, getFestivalSpecialForDate, getShabbatParashaForDate } from './festivalReading';
import { applyPlanPreset, computePlanVerses } from './readingPlan';
import { resolvePortionTarget } from './sefariaApi';

describe('Israel festival readings', () => {
  it('offers every Israel holiday reading with unique names, without diaspora-only variants', () => {
    const readings = VERSE_READINGS.filter((reading) => reading.kind === 'holiday' && reading.israel);
    expect(FESTIVAL_OPTIONS.map((option) => option.readingId)).toEqual(readings.map((reading) => reading.id));
    expect(new Set(FESTIVAL_OPTIONS.map((option) => option.name)).size).toBe(FESTIVAL_OPTIONS.length);
    for (const option of FESTIVAL_OPTIONS) {
      expect(getParashaVerseReading(option.name)?.id).toBe(option.readingId);
      const reading = getParashaVerseReading(option.name)!;
      const plan = { ...applyPlanPreset('all'), aliyot: Object.keys(reading.aliyot) };
      expect(computePlanVerses(option.name, plan, 'ashkenazi').torah).toBe(option.verses);
    }
  });

  it.each([
    ['2027-04-22', 'Pesach I'],
    ['2027-04-23', "Pesach II (CH''M)"],
    ['2027-04-24', 'Pesach Shabbat Chol ha-Moed'],
    ['2027-04-25', "Pesach IV (CH''M)"],
    ['2027-04-26', "Pesach V (CH''M)"],
    ['2027-04-27', "Pesach VI (CH''M)"],
    ['2027-04-28', 'Pesach VII'],
    ['2025-10-11', 'Sukkot Shabbat Chol ha-Moed (Day 4)'],
    ['2027-10-16', 'Sukkot I (on Shabbat)'],
    ['2027-10-17', 'Sukkot Chol ha-Moed Day 1'],
    ['2027-10-21', 'Sukkot Chol ha-Moed Day 5'],
    ['2027-10-22', 'Sukkot Final Day (Hoshana Raba)'],
    ['2027-10-23', 'Simchat Torah (on Shabbat)'],
    ['2027-10-02', 'Rosh Hashana I (on Shabbat)'],
    ['2025-12-21', 'Chanukah Day 7 (on Rosh Chodesh)'],
    ['2027-06-11', 'Shavuot'],
  ])('suggests the reading for %s', (date, id) => {
    expect(getFestivalReadingForDate(date)?.readingId).toBe(id);
  });

  it('does not suggest a reading for invalid or ordinary dates', () => {
    expect(getFestivalReadingForDate('2027-02-30')).toBeUndefined();
    expect(getFestivalReadingForDate('')).toBeUndefined();
    expect(getFestivalReadingForDate('2027-01-05')).toBeUndefined();
  });

  it('suggests Chanukah on Shabbat as an addition to the weekly reading', () => {
    const special = getFestivalSpecialForDate('2025-12-20');
    expect(special?.id).toBe('Shabbat Rosh Chodesh Chanukah');
    expect(getShabbatParashaForDate('2025-12-20')?.name).toBe('מקץ');
    expect(getShabbatParashaForDate('2025-12-21')).toBeUndefined();
    expect(getFestivalReadingForDate('2025-12-20')).toBeUndefined();
    expect(resolvePortionTarget({ parashaName: 'מקץ', specialId: special?.id, overrideKey: 'shabbat-7' })?.refs)
      .toEqual(['Numbers 28:9-28:15']);
    expect(resolvePortionTarget({ parashaName: 'מקץ', specialId: special?.id, overrideKey: 'maftir' })?.refs)
      .toEqual(['Numbers 7:42-7:47']);
  });

  it('resolves available aliyot, maftir and haftarah from the selected festival, never the nearby parasha', () => {
    for (const option of FESTIVAL_OPTIONS) {
      const reading = getParashaVerseReading(option.name)!;
      for (const [key, segment] of Object.entries(reading.aliyot)) {
        expect(resolvePortionTarget({ parashaName: option.name, overrideKey: `shabbat-${key}` as 'shabbat-1' })?.refs).toEqual([segment.ref]);
      }
      if (reading.maftir) {
        expect(resolvePortionTarget({ parashaName: option.name, overrideKey: 'maftir' })?.refs).toEqual([reading.maftir.ref]);
      }
      expect(resolvePortionTarget({ parashaName: option.name, overrideKey: 'whole' })?.refs.length).toBeGreaterThan(0);
      if (reading.haftarah.length) {
        expect(resolvePortionTarget({ parashaName: option.name, haftarahName: option.name, overrideKey: 'haftarah' })?.refs)
          .toEqual(reading.haftarah.map((segment) => segment.ref));
      }
    }
    const pesach = getFestivalReadingForDate('2027-04-23')!.name;
    expect(resolvePortionTarget({ parashaName: pesach, overrideKey: 'shabbat-7' })).toBeNull();
    expect(resolvePortionTarget({ parashaName: pesach, overrideKey: 'chol-1' })?.refs)
      .toEqual([getParashaVerseReading(pesach)!.aliyot['1'].ref]);
  });

  it('keeps the first Shabbat even when it is a festival', () => {
    const result = barMitzvaFromHebrew({ day: 17, month: 1, year: 5774 });
    expect(getBarMitzvaReadingChoices(result)?.shabbat).toEqual({
      date: '2027-04-24', name: 'שבת חל המועד פסח',
    });
  });
});
