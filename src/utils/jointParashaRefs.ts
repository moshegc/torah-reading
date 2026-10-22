import { ParashaSefariaRefs } from '../data/sefariaParashaRefs';
import { findParashaOption, getParashaVerseReading } from '../data/parashaOptions';
import { VerseSegment } from '../data/verseCounts';

/** "Genesis 1:1-2:3" + "Genesis 5:25-6:8" -> "Genesis 1:1-6:8" */
function spanRef(first: VerseSegment, last: VerseSegment): string {
  const start = first.ref.slice(first.ref.lastIndexOf(' ') + 1).split('-')[0];
  const end = last.ref.slice(last.ref.lastIndexOf(' ') + 1).split('-').pop();
  return `${first.book} ${start}-${end}`;
}

/**
 * Sefaria references for a joint parasha (e.g. "ויקהל-פקודי"), built from the generated verse data.
 * Returns null when `name` is not a joint parasha.
 */
export function getJointParashaSefariaRefs(name?: string | null): ParashaSefariaRefs | null {
  const option = findParashaOption(name);
  if (!option || option.kind !== 'joint') return null;
  const reading = getParashaVerseReading(name);
  if (!reading) return null;

  const aliyot = ['1', '2', '3', '4', '5', '6', '7'].map((k) => reading.aliyot[k]);
  if (aliyot.some((a) => !a)) return null;
  const weekday = reading.weekday.slice(0, 3);
  if (weekday.length < 3 || !reading.maftir) return null;

  return {
    order: option.order[0],
    heName: option.name,
    enName: reading.enName,
    wholeRef: spanRef(aliyot[0], aliyot[6]),
    shabbat: aliyot.map((a) => a.ref) as ParashaSefariaRefs['shabbat'],
    maftir: reading.maftir.ref,
    weekday: weekday.map((w) => w.ref) as ParashaSefariaRefs['weekday'],
    haftarah: reading.haftarah.map((h) => h.ref),
    haftarahSephardi: reading.haftarahSephardi.map((h) => h.ref),
  };
}
