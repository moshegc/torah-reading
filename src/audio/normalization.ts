import type { RecordingNormalization } from '../types';

export const TARGET_LUFS = -18;
export const PEAK_CEILING_DBTP = -2;
export const MAX_BOOST_DB = 12;

export function createNormalization(integratedLufs: number, truePeakDbtp: number): RecordingNormalization {
  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) {
    throw new Error('לא ניתן למדוד עוצמה בהקלטה שקטה או קצרה מדי');
  }
  return {
    version: 1,
    integratedLufs,
    truePeakDbtp,
    gainDb: Math.min(TARGET_LUFS - integratedLufs, PEAK_CEILING_DBTP - truePeakDbtp, MAX_BOOST_DB),
  };
}

export function normalizationGain(normalization?: RecordingNormalization): number {
  if (!normalization) return 1;
  const expected = createNormalization(normalization.integratedLufs, normalization.truePeakDbtp);
  if (normalization.version !== 1 || !Number.isFinite(normalization.gainDb) ||
      Math.abs(expected.gainDb - normalization.gainDb) > 0.001) {
    throw new Error('נתוני איזון העוצמה אינם תקינים. יש לנתח את ההקלטה מחדש במאגר.');
  }
  return Math.pow(10, normalization.gainDb / 20);
}
