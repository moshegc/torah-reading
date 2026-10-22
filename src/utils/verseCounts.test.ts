import { describe, expect, it } from 'vitest';
import {
  countDistinctVerses,
  countSelectedVerses,
  getVerseReadingByHeName,
  getVerseReadingById,
} from './verseCounts';

const reading = (id: string) => {
  const r = getVerseReadingById(id);
  if (!r) throw new Error(`missing reading ${id}`);
  return r;
};

describe('countDistinctVerses', () => {
  const seg = (book: string, start: number, end: number) => ({
    ref: '',
    book,
    start,
    end,
    count: end - start + 1,
  });

  it('merges overlapping and adjacent ranges', () => {
    expect(countDistinctVerses([seg('Genesis', 1, 10), seg('Genesis', 5, 12), seg('Genesis', 13, 20)])).toBe(20);
  });

  it('keeps disjoint ranges and different books separate', () => {
    expect(countDistinctVerses([seg('Genesis', 1, 3), seg('Genesis', 10, 12), seg('Exodus', 1, 3)])).toBe(9);
  });
});

describe('countSelectedVerses', () => {
  it('counts the whole of Bereshit as 146 verses', () => {
    const r = reading('Bereshit');
    expect(countSelectedVerses(r, { aliyot: 'all', maftir: true }).torah).toBe(146);
    expect(r.torahCount).toBe(146);
  });

  it('does not add the maftir when the 7th aliyah is also selected', () => {
    const r = reading('Bereshit');
    const seventh = countSelectedVerses(r, { aliyot: ['7'] }).torah;
    expect(countSelectedVerses(r, { aliyot: ['7'], maftir: true }).torah).toBe(seventh);
  });

  it('adds the maftir when the 7th aliyah is not selected', () => {
    const r = reading('Bereshit');
    const maftirOnly = countSelectedVerses(r, { maftir: true }).torah;
    const sixth = countSelectedVerses(r, { aliyot: ['6'] }).torah;
    expect(countSelectedVerses(r, { aliyot: ['6'], maftir: true }).torah).toBe(sixth + maftirOnly);
  });

  it('does not double count the weekday reading together with the 1st aliyah', () => {
    const r = reading('Bereshit');
    const first = countSelectedVerses(r, { aliyot: ['1'] }).torah;
    expect(countSelectedVerses(r, { weekday: true, aliyot: ['1'] }).torah).toBe(first);
    expect(countSelectedVerses(r, { weekday: true }).torah).toBeLessThan(first);
  });

  it('keeps the haftarah separate from the Torah count', () => {
    const r = reading('Bereshit');
    const res = countSelectedVerses(r, { aliyot: 'all', maftir: true, haftarah: true });
    expect(res.torah).toBe(146);
    expect(res.haftarah).toBe(r.haftarahCount);
    expect(res.total).toBe(res.torah + res.haftarah);
  });

  it('uses the Sephardi haftarah when requested', () => {
    const r = reading('Bereshit');
    const res = countSelectedVerses(r, { haftarah: true }, { tradition: 'sephardi' });
    expect(res.haftarah).toBe(r.haftarahSephardiCount);
    expect(r.haftarahSephardiCount).not.toBe(r.haftarahCount);
  });

  it('returns zeros for an empty selection', () => {
    expect(countSelectedVerses(reading('Bereshit'), {})).toEqual({ torah: 0, haftarah: 0, total: 0 });
  });

  it('ignores unknown aliyah keys', () => {
    expect(countSelectedVerses(reading('Chukat-Balak'), { aliyot: ['9'] }).torah).toBe(0);
  });
});

describe('joint parashot and holidays', () => {
  it('finds joint parashot by Hebrew name', () => {
    const r = getVerseReadingByHeName('ויקהל-פקודי');
    expect(r?.id).toBe('Vayakhel-Pekudei');
    expect(r?.kind).toBe('joint');
    expect(r?.torahCount).toBe(214);
  });

  it('counts a holiday reading once even when its maftir overlaps its aliyot', () => {
    const r = reading('Simchat Torah');
    const all = countSelectedVerses(r, { aliyot: 'all', maftir: true }).torah;
    expect(all).toBe(r.torahCount);
  });

  it('uses the same-day Chol ha-Moed maftir variants', () => {
    const day1 = reading('Sukkot Shabbat Chol ha-Moed (Day 1)');
    const day3 = reading('Sukkot Shabbat Chol ha-Moed (Day 3)');
    expect(day1.maftir?.ref).not.toBe(day3.maftir?.ref);
  });
});


describe('special maftir', () => {
  const special = (id: string) => reading(id);

  it('adds a special maftir even when the 7th aliyah is selected (Shekalim on Mishpatim)', () => {
    const r = reading('Mishpatim');
    const seventh = countSelectedVerses(r, { aliyot: ['7'] }).torah;
    const withShekalim = countSelectedVerses(
      r,
      { aliyot: ['7'], maftir: true },
      { special: special('Shabbat Shekalim') }
    ).torah;
    expect(withShekalim).toBe(seventh + 6);
  });

  it('adds Zachor (3 verses) and Parah (22 verses) maftirs', () => {
    expect(
      countSelectedVerses(reading('Tetzaveh'), { maftir: true }, { special: special('Shabbat Zachor') }).torah
    ).toBe(3);
    expect(
      countSelectedVerses(reading('Chukat'), { maftir: true }, { special: special('Shabbat Parah') }).torah
    ).toBe(22);
  });

  it('replaces the regular maftir instead of adding both', () => {
    const r = reading('Mishpatim');
    const res = countSelectedVerses(r, { maftir: true }, { special: special('Shabbat Shekalim') });
    expect(res.torah).toBe(6);
  });

  it('uses the special haftarah, with tradition-specific variants', () => {
    const r = reading('Mishpatim');
    const sp = special('Shabbat Shekalim');
    expect(countSelectedVerses(r, { haftarah: true }, { special: sp }).haftarah).toBe(sp.haftarahCount);
    expect(countSelectedVerses(r, { haftarah: true }, { special: sp, tradition: 'sephardi' }).haftarah).toBe(
      sp.haftarahSephardiCount
    );
  });

  it('does not double count the Rosh Chodesh maftir when it lies inside the parasha (Pinchas)', () => {
    const r = reading('Pinchas');
    const res = countSelectedVerses(
      r,
      { aliyot: 'all', maftir: true },
      { special: special('Shabbat Rosh Chodesh') }
    );
    expect(res.torah).toBe(r.torahCount);
  });

  it('adds the Rosh Chodesh maftir when it lies outside the parasha (Bereshit)', () => {
    const r = reading('Bereshit');
    const res = countSelectedVerses(
      r,
      { aliyot: 'all', maftir: true },
      { special: special('Shabbat Rosh Chodesh') }
    );
    expect(res.torah).toBe(r.torahCount + 7);
  });
});