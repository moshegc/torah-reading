import { describe, expect, it } from 'vitest';
import {
  EMPTY_READING_PLAN,
  applyPlanPreset,
  computePlanVerses,
  isPlanEmpty,
} from './readingPlan';
import { getVerseReadingById } from './verseCounts';

describe('reading plan presets', () => {
  it('starts empty and counts nothing', () => {
    expect(isPlanEmpty(EMPTY_READING_PLAN)).toBe(true);
    expect(computePlanVerses('בראשית', EMPTY_READING_PLAN, 'ashkenazi')).toEqual({ torah: 0, haftarah: 0 });
  });

  it('"all" counts the whole parasha plus the haftarah', () => {
    const all = applyPlanPreset('all');
    const reading = getVerseReadingById('Bereshit')!;
    expect(computePlanVerses('בראשית', all, 'ashkenazi')).toEqual({
      torah: 146,
      haftarah: reading.haftarahCount,
    });
    expect(computePlanVerses('בראשית', all, 'sephardi').haftarah).toBe(reading.haftarahSephardiCount);
  });

  it('"maftir + haftarah" counts only the maftir and haftarah', () => {
    const plan = applyPlanPreset('maftir-haftarah');
    const reading = getVerseReadingById('Bereshit')!;
    expect(computePlanVerses('בראשית', plan, 'ashkenazi')).toEqual({
      torah: reading.maftir!.count,
      haftarah: reading.haftarahCount,
    });
  });

  it('"Mon/Thu" counts the weekday reading only', () => {
    const plan = applyPlanPreset('weekday');
    const res = computePlanVerses('בראשית', plan, 'ashkenazi');
    expect(res.torah).toBe(13);
    expect(res.haftarah).toBe(0);
  });

  it('works for joint parashot', () => {
    const res = computePlanVerses('ויקהל-פקודי', applyPlanPreset('all'), 'ashkenazi');
    expect(res.torah).toBe(214);
    expect(res.haftarah).toBeGreaterThan(0);
  });

  it('adds a special maftir and swaps the haftarah, keeping it through presets', () => {
    const plan = { ...applyPlanPreset('maftir-haftarah'), specialId: 'Shabbat Shekalim' };
    expect(computePlanVerses('משפטים', plan, 'ashkenazi')).toEqual({ torah: 6, haftarah: 17 });
    expect(applyPlanPreset('all', plan).specialId).toBe('Shabbat Shekalim');
  });

  it('returns zero for an unknown parasha', () => {
    expect(computePlanVerses('???', applyPlanPreset('all'), 'ashkenazi')).toEqual({ torah: 0, haftarah: 0 });
  });
});
