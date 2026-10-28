import type { RecordingNormalization } from '../types';
import { formatGainDb, normalizationGain, TARGET_LUFS, PEAK_CEILING_DBTP } from '../audio/normalization';

export function RecordingGainDetails({ normalization }: { normalization?: RecordingNormalization }) {
  if (!normalization) {
    return import.meta.env.VITE_AUDIO_GAIN_DEBUG === 'true'
      ? <p className="text-xs text-slate-500">טרם נסרקה עוצמה — ברירת מחדל: <bdi>0.0 dB</bdi></p>
      : null;
  }
  let linearGain: number;
  try {
    linearGain = normalizationGain(normalization);
  } catch (error) {
    return <p role="alert" className="text-xs text-rose-700">{error instanceof Error ? error.message : 'נתוני הסריקה אינם תקינים'}</p>;
  }
  if (import.meta.env.VITE_AUDIO_GAIN_DEBUG !== 'true') return null;
  const targetLufs = normalization.targetLufs ?? TARGET_LUFS;
  const measured = normalization.leveling ?? normalization;
  const desiredGain = targetLufs - measured.integratedLufs;
  return (
    <div className="text-xs text-slate-600 space-y-1">
      <p className="font-semibold text-emerald-700">
        תוצאת סריקה: <bdi>{formatGainDb(normalization.gainDb)}</bdi> · מכפיל <bdi>{linearGain.toFixed(3)}×</bdi>
      </p>
      <p>
        עוצמה: <bdi>{normalization.integratedLufs.toFixed(1)} LUFS</bdi>
        {' · '}פסגה: <bdi>{normalization.truePeakDbtp.toFixed(1)} dBTP</bdi>
      </p>
      <p>
        יעד: <bdi>{targetLufs.toFixed(1)} LUFS</bdi>
        {' · '}לאחר התיקון: <bdi>{(measured.integratedLufs + normalization.gainDb).toFixed(1)} LUFS</bdi>
        {' · '}פסגה צפויה: <bdi>{(measured.truePeakDbtp + normalization.gainDb).toFixed(1)} dBTP</bdi>
      </p>
      {normalization.leveling
        ? <p className="text-indigo-700">איזון משתנה: {normalization.leveling.points.length} נקודות · עד ±6 dB, בתנועה של עד 1.5 dB לשנייה.</p>
        : <p className="text-amber-700">סריקה ישנה: תיקון קבוע בלבד. יש לנתח מחדש להפעלת איזון משתנה.</p>}
      {normalization.gainDb < desiredGain - 0.01 && (
        <p className="text-amber-700">ההגברה הוגבלה לשמירת מרווח פסגות ({PEAK_CEILING_DBTP} dBTP) או להגברה מרבית של 12 dB.</p>
      )}
    </div>
  );
}
