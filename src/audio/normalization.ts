import type { RecordingNormalization } from '../types';

export const TARGET_LUFS = -18;
export const PEAK_CEILING_DBTP = -2;
export const MAX_BOOST_DB = 12;

export function formatGainDb(gainDb: number): string {
  return `${gainDb > 0 ? '+' : ''}${gainDb.toFixed(1)} dB`;
}

export function gainDbToLinear(gainDb: number): number {
  if (!Number.isFinite(gainDb)) throw new Error('תיקון העוצמה אינו תקין');
  const gain = Math.pow(10, gainDb / 20);
  if (!Number.isFinite(gain)) throw new Error('תיקון העוצמה גדול מדי');
  return gain;
}

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
  const { leveling, targetLufs = TARGET_LUFS } = normalization;
  const validCurve = normalization.version === 2 && leveling &&
    Number.isFinite(leveling.duration) && leveling.duration >= 0.4 && leveling.duration <= 600 &&
    Number.isFinite(leveling.integratedLufs) && Number.isFinite(leveling.truePeakDbtp) &&
    leveling.points.length >= 2 && leveling.points.length <= 602 &&
    leveling.points[0].time === 0 && leveling.points[leveling.points.length - 1].time === leveling.duration &&
    leveling.points.every((point, index, points) => Number.isFinite(point.time) &&
      Number.isFinite(point.gainDb) && Math.abs(point.gainDb) <= 6 &&
      (index === 0 || point.time > points[index - 1].time));
  const expectedGain = Math.min(
    targetLufs - (leveling?.integratedLufs ?? normalization.integratedLufs),
    PEAK_CEILING_DBTP - (leveling?.truePeakDbtp ?? normalization.truePeakDbtp),
    MAX_BOOST_DB - Math.max(0, ...(leveling?.points.map((point) => point.gainDb) ?? [])),
  );
  if (!Number.isFinite(normalization.integratedLufs) || !Number.isFinite(normalization.truePeakDbtp) ||
      !Number.isFinite(targetLufs) || (normalization.version !== 1 && !validCurve) ||
      (normalization.version === 1 && leveling !== undefined) || !Number.isFinite(normalization.gainDb) ||
      Math.abs(expectedGain - normalization.gainDb) > 0.001) {
    throw new Error('נתוני איזון העוצמה אינם תקינים. יש לנתח את ההקלטה מחדש במאגר.');
  }
  return gainDbToLinear(normalization.gainDb);
}

export function levelingGainAt(points: { time: number; gainDb: number }[], time: number): number {
  if (time <= points[0].time) return points[0].gainDb;
  for (let index = 1; index < points.length; index++) {
    const right = points[index];
    if (time <= right.time) {
      const left = points[index - 1];
      return left.gainDb + (right.gainDb - left.gainDb) * (time - left.time) / (right.time - left.time);
    }
  }
  return points[points.length - 1].gainDb;
}
