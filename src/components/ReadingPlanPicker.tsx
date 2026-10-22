import React from 'react';
import { getVerseReadingById } from '../utils/verseCounts';
import {
  ALIYOT_KEYS,
  EMPTY_READING_PLAN,
  PLAN_PRESETS,
  SPECIAL_SHABBAT_OPTIONS,
  applyPlanPreset,
  computePlanVerses,
  type HaftarahTradition,
  type PlanPresetId,
  type PlanVerses,
  type ReadingPlan,
} from '../utils/readingPlan';

const ALIYAH_LABELS: Record<string, string> = {
  '1': 'ראשון',
  '2': 'שני',
  '3': 'שלישי',
  '4': 'רביעי',
  '5': 'חמישי',
  '6': 'שישי',
  '7': 'שביעי',
};

export interface ReadingPlanChange {
  plan: ReadingPlan;
  /** Student-specific override; undefined means "use the teacher's default" */
  tradition: HaftarahTradition | undefined;
  verses: PlanVerses;
}

interface ReadingPlanPickerProps {
  parasha: string;
  haftarahName?: string;
  plan?: ReadingPlan;
  tradition?: HaftarahTradition;
  defaultTradition: HaftarahTradition;
  onChange: (change: ReadingPlanChange) => void;
}

const TRADITION_LABEL: Record<HaftarahTradition, string> = {
  ashkenazi: 'אשכנז',
  sephardi: 'ספרד',
};

/**
 * Lets the teacher pick which parts of the parasha the student learns (presets or manual choice)
 * and the haftarah tradition. Reports the resulting verse counts on every change.
 */
export const ReadingPlanPicker: React.FC<ReadingPlanPickerProps> = ({
  parasha,
  haftarahName,
  plan = EMPTY_READING_PLAN,
  tradition,
  defaultTradition,
  onChange,
}) => {
  const effectiveTradition = tradition ?? defaultTradition;

  const emit = (nextPlan: ReadingPlan, nextTradition: HaftarahTradition | undefined) => {
    const nextHaftarah = (nextPlan.specialId ?? null) !== (plan.specialId ?? null)
      ? (nextPlan.specialId ? getVerseReadingById(nextPlan.specialId)?.heName : parasha)
      : haftarahName;
    onChange({
      plan: nextPlan,
      tradition: nextTradition,
      verses: computePlanVerses(parasha, nextPlan, nextTradition ?? defaultTradition, nextHaftarah),
    });
  };

  const toggleAliyah = (key: string) => {
    const has = plan.aliyot.includes(key);
    const aliyot = has ? plan.aliyot.filter((k) => k !== key) : [...plan.aliyot, key];
    emit({ ...plan, aliyot: ALIYOT_KEYS.filter((k) => aliyot.includes(k)) }, tradition);
  };

  const verses = computePlanVerses(parasha, plan, effectiveTradition, haftarahName);

  const checkbox = (label: string, checked: boolean, onToggle: () => void) => (
    <label
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold cursor-pointer select-none ${
        checked
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      {label}
    </label>
  );

  return (
    <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">מה התלמיד ילמד?</span>
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            emit(applyPlanPreset(e.target.value as PlanPresetId, plan), tradition);
          }}
          className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
          aria-label="תבניות מוכנות"
        >
          <option value="">תבניות מוכנות…</option>
          {PLAN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {checkbox('שני/חמישי', plan.weekday, () => emit({ ...plan, weekday: !plan.weekday }, tradition))}
        {ALIYOT_KEYS.map((key) => (
          <React.Fragment key={key}>
            {checkbox(ALIYAH_LABELS[key], plan.aliyot.includes(key), () => toggleAliyah(key))}
          </React.Fragment>
        ))}
        {checkbox('מפטיר', plan.maftir, () => emit({ ...plan, maftir: !plan.maftir }, tradition))}
        {checkbox('הפטרה', plan.haftarah, () => emit({ ...plan, haftarah: !plan.haftarah }, tradition))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">שבת מיוחדת (מפטיר/הפטרה)</label>
          <select
            value={plan.specialId ?? ''}
            onChange={(e) => emit({ ...plan, specialId: e.target.value || null }, tradition)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
          >
            <option value="">ללא</option>
            {SPECIAL_SHABBAT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">נוסח ההפטרה</label>
          <select
            value={tradition ?? ''}
            onChange={(e) => emit(plan, (e.target.value || undefined) as HaftarahTradition | undefined)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
          >
            <option value="">ברירת מחדל ({TRADITION_LABEL[defaultTradition]})</option>
            <option value="ashkenazi">{TRADITION_LABEL.ashkenazi}</option>
            <option value="sephardi">{TRADITION_LABEL.sephardi}</option>
          </select>
        </div>
      </div>

      <p className="text-[11px] text-slate-600">
        {plan.weekday || plan.aliyot.length > 0 || plan.maftir || plan.haftarah ? (
          <>
            תורה: <strong>{verses.torah}</strong> פס׳ · הפטרה: <strong>{verses.haftarah}</strong> פס׳
          </>
        ) : (
          'לא נבחרו קטעים ללימוד'
        )}
      </p>
    </div>
  );
};
