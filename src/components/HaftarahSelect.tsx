import React from 'react';
import { findHaftarahReading, HAFTARAH_OPTIONS, getHaftarahVerses } from '../data/haftarahOptions';
import type { HaftarahTradition } from '../utils/verseCounts';

interface HaftarahSelectProps {
  value: string;
  tradition: HaftarahTradition;
  onChange: (name: string) => void;
  className?: string;
  allowEmpty?: boolean;
}

export const HaftarahSelect: React.FC<HaftarahSelectProps> = ({
  value, tradition, onChange, className, allowEmpty = false,
}) => {
  const reading = findHaftarahReading(value);
  const selected = HAFTARAH_OPTIONS.find((option) => option.reading.id === reading?.id);
  return (
    <select
      aria-label="הפטרה"
      value={selected?.name ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      required={!allowEmpty}
    >
      {allowEmpty && <option value="">ללא הפטרה</option>}
      {!selected && !allowEmpty && <option value="" disabled>{value ? `${value} — יש לבחור הפטרה מהרשימה` : 'בחר הפטרה'}</option>}
      {HAFTARAH_OPTIONS.map((option) => (
        <option key={option.name} value={option.name}>
          {option.name} ({getHaftarahVerses(option.name, tradition)} פס׳)
        </option>
      ))}
    </select>
  );
};
