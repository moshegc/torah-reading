import React from 'react';

interface HebrewDateFieldsProps {
  day: string;
  month: number;
  year: string;
  onDayChange: (day: string) => void;
  onMonthChange: (month: number) => void;
  onYearChange: (year: string) => void;
}

export const HebrewDateFields: React.FC<HebrewDateFieldsProps> = ({
  day, month, year, onDayChange, onMonthChange, onYearChange,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <input
      type="number" min={1} max={30} value={day}
      onChange={(event) => onDayChange(event.target.value)}
      aria-label="יום לידה עברי"
      className="w-16 border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
    />
    <select
      value={month}
      onChange={(event) => onMonthChange(Number(event.target.value))}
      aria-label="חודש לידה עברי"
      className="border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
    >
      {([
        [7, 'תשרי'], [8, 'חשוון'], [9, 'כסלו'], [10, 'טבת'], [11, 'שבט'],
        [12, 'אדר (אדר א׳)'], [13, 'אדר ב׳'], [1, 'ניסן'], [2, 'אייר'],
        [3, 'סיוון'], [4, 'תמוז'], [5, 'אב'], [6, 'אלול'],
      ] as [number, string][]).map(([number, label]) => (
        <option key={number} value={number}>{label}</option>
      ))}
    </select>
    <input
      type="number" min={5000} max={6000} value={year}
      onChange={(event) => onYearChange(event.target.value)}
      aria-label="שנת לידה עברית"
      className="w-24 border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
    />
  </div>
);
