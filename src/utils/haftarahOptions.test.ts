import { describe, expect, it } from 'vitest';
import { HAFTARAH_OPTIONS, findHaftarahReading, getHaftarahVerses } from '../data/haftarahOptions';
import { VERSE_READINGS } from '../data/verseCounts';
import { applyPlanPreset, computePlanVerses, EMPTY_READING_PLAN } from './readingPlan';
import { resolveHaftarahRefs } from './sefariaApi';

describe('haftarah choices', () => {
  it('includes every reading with a haftarah and no readings without one', () => {
    const readings = VERSE_READINGS.filter((reading) => reading.haftarah.length || reading.haftarahSephardi.length);
    expect(HAFTARAH_OPTIONS.map((option) => option.reading.id).sort()).toEqual(readings.map((reading) => reading.id).sort());
    expect(new Set(HAFTARAH_OPTIONS.map((option) => option.name)).size).toBe(HAFTARAH_OPTIONS.length);
    expect(HAFTARAH_OPTIONS[0].name).toBe('בראשית');
  });

  it('uses the dataset count for both traditions for every option', () => {
    for (const { name, reading } of HAFTARAH_OPTIONS) {
      expect(getHaftarahVerses(name, 'ashkenazi')).toBe(reading.haftarahCount);
      expect(getHaftarahVerses(name, 'sephardi')).toBe(reading.haftarahSephardiCount);
    }
    expect(getHaftarahVerses('שבת מחר חודש', 'ashkenazi')).toBe(25);
    expect(getHaftarahVerses('שבת זכור', 'ashkenazi')).toBe(33);
    expect(getHaftarahVerses('שבת זכור', 'sephardi')).toBe(34);
  });

  it('recognizes legacy names but never invents counts for unknown ones', () => {
    expect(findHaftarahReading('מחר חודש')?.id).toBe('Shabbat Machar Chodesh');
    expect(findHaftarahReading('פרשת החודש')?.id).toBe('Shabbat HaChodesh');
    expect(findHaftarahReading('שמות ס')?.id).toBe('Shemot');
    expect(getHaftarahVerses('Unknown', 'ashkenazi')).toBe(0);
  });

  it('opens the matching text for every dropdown choice in both traditions', () => {
    for (const { name, reading } of HAFTARAH_OPTIONS) {
      expect(resolveHaftarahRefs(name, 'בראשית', undefined, 'ashkenazi')?.refs)
        .toEqual(reading.haftarah.map((segment) => segment.ref));
      expect(resolveHaftarahRefs(name, 'בראשית', undefined, 'sephardi')?.refs)
        .toEqual(reading.haftarahSephardi.map((segment) => segment.ref));
    }
  });

  it('keeps the chosen haftarah independent of the Torah parasha and preset', () => {
    for (const preset of ['all', 'maftir-haftarah'] as const) {
      const plan = applyPlanPreset(preset);
      expect(computePlanVerses('בראשית', plan, 'ashkenazi', 'שבת מחר חודש').haftarah).toBe(25);
      expect(computePlanVerses('נח', plan, 'sephardi', 'שבת זכור').haftarah).toBe(34);
    }
    expect(computePlanVerses('בראשית', EMPTY_READING_PLAN, 'ashkenazi', 'שבת מחר חודש').haftarah).toBe(0);
    expect(computePlanVerses('Legacy parasha', applyPlanPreset('all'), 'ashkenazi', 'שבת מחר חודש')).toEqual({ torah: 0, haftarah: 25 });
    const special = { ...applyPlanPreset('maftir-haftarah'), specialId: 'Shabbat Shekalim' };
    expect(computePlanVerses('משפטים', special, 'ashkenazi', 'שבת מחר חודש')).toEqual({ torah: 6, haftarah: 25 });
  });
});
