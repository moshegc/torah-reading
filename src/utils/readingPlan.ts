import { getParashaVerseReading } from '../data/parashaOptions';
import {
  HaftarahTradition,
  countSelectedVerses,
  getVerseReadingById,
} from './verseCounts';

export type { HaftarahTradition };

/** Which parts of the parasha the student is going to learn. Stored on the student profile. */
export interface ReadingPlan {
  /** Monday/Thursday reading */
  weekday: boolean;
  /** Shabbat aliyot "1".."7" */
  aliyot: string[];
  maftir: boolean;
  haftarah: boolean;
  /** Special Shabbat (Rosh Chodesh, Shekalim, ...) that replaces the maftir and haftarah */
  specialId?: string | null;
}

export const ALIYOT_KEYS = ['1', '2', '3', '4', '5', '6', '7'];

export const EMPTY_READING_PLAN: ReadingPlan = {
  weekday: false,
  aliyot: [],
  maftir: false,
  haftarah: false,
  specialId: null,
};

export type PlanPresetId = 'all' | 'maftir-haftarah' | 'weekday';

export const PLAN_PRESETS: { id: PlanPresetId; label: string }[] = [
  { id: 'all', label: 'הכל (7 עליות, מפטיר והפטרה)' },
  { id: 'maftir-haftarah', label: 'מפטיר + הפטרה' },
  { id: 'weekday', label: 'שני/חמישי' },
];

export const SPECIAL_SHABBAT_OPTIONS: { id: string; label: string }[] = [
  { id: 'Shabbat Rosh Chodesh', label: 'שבת ראש חודש' },
  { id: 'Shabbat Shekalim', label: 'שבת שקלים' },
  { id: 'Shabbat Zachor', label: 'שבת זכור' },
  { id: 'Shabbat Parah', label: 'שבת פרה' },
  { id: 'Shabbat HaChodesh', label: 'שבת החודש' },
];

export function applyPlanPreset(id: PlanPresetId, current?: ReadingPlan | null): ReadingPlan {
  const specialId = current?.specialId ?? null;
  switch (id) {
    case 'all':
      return { weekday: false, aliyot: [...ALIYOT_KEYS], maftir: true, haftarah: true, specialId };
    case 'maftir-haftarah':
      return { weekday: false, aliyot: [], maftir: true, haftarah: true, specialId };
    case 'weekday':
      return { weekday: true, aliyot: [], maftir: false, haftarah: false, specialId };
  }
}

export function isPlanEmpty(plan?: ReadingPlan | null): boolean {
  return !plan || (!plan.weekday && plan.aliyot.length === 0 && !plan.maftir && !plan.haftarah);
}

export interface PlanVerses {
  torah: number;
  haftarah: number;
}

/**
 * Verses the student has to learn for the chosen parasha (single or joint) and plan.
 * Overlaps are counted once; a special Shabbat's maftir/haftarah replaces the regular one.
 */
export function computePlanVerses(
  parashaName: string,
  plan: ReadingPlan | null | undefined,
  tradition: HaftarahTradition
): PlanVerses {
  const reading = getParashaVerseReading(parashaName);
  if (!reading || !plan) return { torah: 0, haftarah: 0 };
  const special = plan.specialId ? getVerseReadingById(plan.specialId) : null;
  const res = countSelectedVerses(
    reading,
    { weekday: plan.weekday, aliyot: plan.aliyot, maftir: plan.maftir, haftarah: plan.haftarah },
    { tradition, special }
  );
  return { torah: res.torah, haftarah: res.haftarah };
}
