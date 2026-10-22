import { describe, expect, it } from 'vitest';
import { PARASHA_META_LIST } from '../data/driveCatalog';
import { PARASHA_OPTIONS, findParashaOption, getParashaVerseReading } from '../data/parashaOptions';
import { findParashaRefs } from './sefariaApi';
import { getJointParashaSefariaRefs } from './jointParashaRefs';
import { lookupParashaVerses } from './trackerCalculations';

describe('PARASHA_OPTIONS', () => {
  it('contains the 54 single parashot and 7 joint parashot', () => {
    expect(PARASHA_OPTIONS.filter((o) => o.kind === 'parasha')).toHaveLength(54);
    expect(PARASHA_OPTIONS.filter((o) => o.kind === 'joint')).toHaveLength(7);
  });

  it('places each joint parasha right after its second part', () => {
    const names = PARASHA_OPTIONS.map((o) => o.name);
    const i = names.indexOf('ויקהל-פקודי');
    expect(names.slice(i - 2, i + 1)).toEqual(['ויקהל', 'פקודי', 'ויקהל-פקודי']);
  });

  it('keeps the tracking sheet verse counts for single parashot', () => {
    for (const meta of PARASHA_META_LIST) {
      expect(findParashaOption(meta.name)?.verses).toBe(meta.verses);
    }
  });

  it('names every joint parasha from the catalog spelling', () => {
    expect(PARASHA_OPTIONS.filter((o) => o.kind === 'joint').map((o) => o.name)).toEqual([
      'ויקהל-פקודי',
      'תזריע-מצורע',
      'אחרי מות-קדושים',
      'בהר-בחוקותי',
      'חקת-בלק',
      'מטות-מסעי',
      'ניצבים-וילך',
    ]);
  });

  it('finds joint parashot with alias spellings and different dashes', () => {
    expect(findParashaOption('בהר–בחוקתי')?.name).toBe('בהר-בחוקותי');
    expect(findParashaOption('חוקת-בלק')?.name).toBe('חקת-בלק');
    expect(findParashaOption('פרשת ויקהל־פקודי')?.name).toBe('ויקהל-פקודי');
  });
});

describe('joint parasha integration', () => {
  it('looks up the verse count of a joint parasha', () => {
    expect(lookupParashaVerses('ויקהל-פקודי')).toBe(214);
    expect(lookupParashaVerses('ויקהל')).toBe(122);
  });

  it('gives the joint parasha its own verse data', () => {
    const reading = getParashaVerseReading('ויקהל-פקודי');
    expect(reading?.id).toBe('Vayakhel-Pekudei');
    expect(reading?.haftarah.length).toBeGreaterThan(0);
  });

  it('builds Sefaria refs spanning both parashot', () => {
    const refs = getJointParashaSefariaRefs('ויקהל-פקודי');
    expect(refs?.wholeRef).toBe('Exodus 35:1-40:38');
    expect(refs?.shabbat).toHaveLength(7);
    expect(refs?.weekday).toHaveLength(3);
  });

  it('findParashaRefs resolves joint parashot instead of falling back to the first part', () => {
    expect(findParashaRefs('ויקהל-פקודי')?.wholeRef).toBe('Exodus 35:1-40:38');
    expect(findParashaRefs('ויקהל')?.wholeRef).not.toBe('Exodus 35:1-40:38');
    expect(getJointParashaSefariaRefs('ויקהל')).toBeNull();
  });
});

