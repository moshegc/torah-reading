import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingPlanPicker, type ReadingPlanChange } from './ReadingPlanPicker';
import { EMPTY_READING_PLAN } from '../utils/readingPlan';

function findElements(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...Children.toArray(node.props.children as ReactNode).flatMap((child) => findElements(child, type)),
  ];
}

describe('festival reading plans', () => {
  it('selects all eight aliyot and the separate maftir for Simchat Torah on Shabbat', () => {
    const onChange = vi.fn<(change: ReadingPlanChange) => void>();
    const tree = ReadingPlanPicker({
      parasha: 'שמחת תורה (בשבת)',
      haftarahName: 'שמחת תורה (בשבת)',
      plan: EMPTY_READING_PLAN,
      defaultTradition: 'ashkenazi',
      onChange,
    });
    const preset = findElements(tree, 'select').find((element) => element.props['aria-label'] === 'תבניות מוכנות')!;
    (preset.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'all' } });
    expect(onChange.mock.calls[0][0].plan.aliyot).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(onChange.mock.calls[0][0].verses.torah).toBe(81);
  });

  it('does not select a nonexistent festival maftir or haftarah', () => {
    const onChange = vi.fn<(change: ReadingPlanChange) => void>();
    const tree = ReadingPlanPicker({
      parasha: 'פסח ב׳ (חוה״מ)',
      haftarahName: '',
      plan: EMPTY_READING_PLAN,
      defaultTradition: 'ashkenazi',
      onChange,
    });
    const preset = findElements(tree, 'select').find((element) => element.props['aria-label'] === 'תבניות מוכנות')!;
    (preset.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'all' } });
    expect(onChange.mock.calls[0][0].plan.aliyot).toEqual(['1', '2', '3', '4']);
    expect(onChange.mock.calls[0][0].plan.haftarah).toBe(false);
  });
});
