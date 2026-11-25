import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HebrewDateFields } from './HebrewDateFields';

describe('Hebrew birth date fields', () => {
  it('passes through empty, partial, and completed numeric input without restoring a default', () => {
    const onDayChange = vi.fn();
    const onYearChange = vi.fn();
    const tree = HebrewDateFields({
      day: '1', month: 1, year: '5780', onDayChange, onMonthChange: vi.fn(), onYearChange,
    });
    if (!isValidElement<{ children: ReactNode }>(tree)) throw new Error('Expected date fields');
    const inputs = Children.toArray(tree.props.children).filter(
      (child): child is ReactElement<{ onChange: (event: { target: { value: string } }) => void }> =>
        isValidElement(child) && child.type === 'input',
    );
    for (const value of ['', '4', '', '2', '23']) inputs[0].props.onChange({ target: { value } });
    for (const value of ['', '5', '57', '5774']) inputs[1].props.onChange({ target: { value } });
    expect(onDayChange.mock.calls.map(([value]) => value)).toEqual(['', '4', '', '2', '23']);
    expect(onYearChange.mock.calls.map(([value]) => value)).toEqual(['', '5', '57', '5774']);
  });
});
