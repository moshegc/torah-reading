import React, { useEffect, useRef, useState } from 'react';
import { formatDateIL, parseFlexibleDate } from '../utils/trackerCalculations';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  className,
  required,
}) => {
  const [text, setText] = useState(() => formatDateIL(value));
  const lastValue = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== lastValue.current) {
      setText(formatDateIL(value));
      inputRef.current?.setCustomValidity('');
      lastValue.current = value;
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      dir="ltr"
      placeholder="DD/MM/YYYY"
      aria-label="תאריך (DD/MM/YYYY)"
      required={required}
      className={className}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const date = /^\d{2}\/\d{2}\/\d{4}$/.test(next) ? parseFlexibleDate(next) : null;
        event.target.setCustomValidity(
          next && !date ? 'יש להזין תאריך תקין בפורמט DD/MM/YYYY' : ''
        );
        const iso = date
          ? `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          : '';
        lastValue.current = iso;
        onChange(iso);
      }}
      onBlur={(event) => event.currentTarget.reportValidity()}
    />
  );
};
