import type { RecordingItem, RecordingSection } from '../types';

export const RECORDING_SECTION_LABELS: Record<RecordingSection, string> = {
  torah: 'קריאה בתורה',
  haftarah: 'הפטרה',
  general: 'כללי וטעמים',
};

export function isDocument(item: RecordingItem): boolean {
  return ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(item.ext);
}

export function getRecordingSection(item: RecordingItem): RecordingSection {
  return item.section ?? (item.category === 'haftarah' ? 'haftarah'
    : item.category === 'blessings' ? 'general' : 'torah');
}

export function withRecordingSection(item: RecordingItem, section: RecordingSection): RecordingItem {
  return {
    ...item,
    section,
    category: isDocument(item) ? 'doc'
      : section === 'general' ? 'blessings'
      : section === 'haftarah' ? 'haftarah'
      : item.category === 'chol' ? 'chol' : 'shabbat',
  };
}

function portionOrder(item: RecordingItem): number {
  const section = getRecordingSection(item);
  if (section === 'general') return 30;
  if (section === 'haftarah') return 20;
  const label = item.aliyah.toLowerCase();
  const ordinals = ['ראשון|first|1', 'שני|second|2', 'שלישי|third|3', 'רביעי|fourth|4',
    'חמישי|fifth|5', 'שישי|sixth|6', 'שביעי|seventh|7', 'מפטיר|maftir'];
  const index = ordinals.findIndex((words) =>
    new RegExp(`(?:^|[^א-תa-z0-9])(?:${words})(?=$|[^א-תa-z0-9])`).test(label));
  if (item.category === 'chol') {
    const weekday = ['כהן', 'לוי', 'ישראל'].findIndex((name) => label.includes(name));
    return 10 + (weekday >= 0 ? weekday : index >= 0 ? index : 8);
  }
  return index >= 0 ? index : 9;
}

export function sortRecordings(items: readonly RecordingItem[]): RecordingItem[] {
  return [...items].sort((a, b) => portionOrder(a) - portionOrder(b));
}
