import type { RecordingSection } from '../types';

interface RecordingSectionSelectProps {
  value: RecordingSection;
  onChange: (section: RecordingSection) => void;
  label: string;
  disabled?: boolean;
}

export function RecordingSectionSelect({ value, onChange, label, disabled }: RecordingSectionSelectProps) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(event) => {
      const next = event.target.value;
      if (next === 'torah' || next === 'haftarah' || next === 'general') onChange(next);
    }} className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs">
      <option value="torah">קריאה בתורה</option>
      <option value="haftarah">הפטרה</option>
      <option value="general">כללי וטעמים</option>
    </select>
  );
}
