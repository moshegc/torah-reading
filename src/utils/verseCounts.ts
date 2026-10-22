import { VERSE_READINGS, VerseReadingData, VerseSegment } from '../data/verseCounts';

export type HaftarahTradition = 'ashkenazi' | 'sephardi';

/** Which parts of a reading the student is planning to learn. */
export interface VerseSelection {
  /** Monday/Thursday (weekday) reading */
  weekday?: boolean;
  /** Shabbat/Yom Tov aliyot keys ("1".."7"), or 'all' */
  aliyot?: string[] | 'all';
  maftir?: boolean;
  haftarah?: boolean;
}

export interface VerseCountResult {
  /** Distinct Torah verses (weekday + aliyot + maftir, overlaps counted once) */
  torah: number;
  /** Haftarah verses - kept separate from the Torah count */
  haftarah: number;
  total: number;
}

const readingsById = new Map<string, VerseReadingData>(VERSE_READINGS.map((r) => [r.id, r]));

export function getVerseReadingById(id: string): VerseReadingData | undefined {
  return readingsById.get(id);
}

/** Looks up a parasha (single or joint) by its Hebrew name without nikud, e.g. "ויקהל-פקודי". */
export function getVerseReadingByHeName(
  heName: string,
  kinds: VerseReadingData['kind'][] = ['parasha', 'joint']
): VerseReadingData | undefined {
  return VERSE_READINGS.find((r) => r.heName === heName && kinds.includes(r.kind));
}

/**
 * Number of distinct verses covered by the given segments. Overlapping or adjacent ranges
 * within the same book are merged, so e.g. 7th aliyah + maftir does not count the maftir twice.
 */
export function countDistinctVerses(segments: VerseSegment[]): number {
  const byBook = new Map<string, [number, number][]>();
  for (const s of segments) {
    const list = byBook.get(s.book) ?? [];
    list.push([s.start, s.end]);
    byBook.set(s.book, list);
  }

  let total = 0;
  for (const ranges of byBook.values()) {
    ranges.sort((a, b) => a[0] - b[0]);
    let [curStart, curEnd] = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const [start, end] = ranges[i];
      if (start <= curEnd + 1) {
        curEnd = Math.max(curEnd, end);
      } else {
        total += curEnd - curStart + 1;
        [curStart, curEnd] = [start, end];
      }
    }
    total += curEnd - curStart + 1;
  }
  return total;
}

export function getHaftarahSegments(
  reading: VerseReadingData,
  tradition: HaftarahTradition = 'ashkenazi'
): VerseSegment[] {
  return tradition === 'sephardi' ? reading.haftarahSephardi : reading.haftarah;
}

/** Segments of the Torah reading covered by the selection (may overlap each other). */
export function getSelectedTorahSegments(
  reading: VerseReadingData,
  selection: VerseSelection
): VerseSegment[] {
  const segments: VerseSegment[] = [];
  if (selection.weekday) segments.push(...reading.weekday);

  if (selection.aliyot === 'all') {
    segments.push(...Object.values(reading.aliyot));
  } else if (selection.aliyot) {
    for (const key of selection.aliyot) {
      const seg = reading.aliyot[key];
      if (seg) segments.push(seg);
    }
  }

  if (selection.maftir && reading.maftir) segments.push(reading.maftir);
  return segments;
}

/**
 * How many verses the student needs to learn for the selected parts of a reading.
 * Overlaps (7th aliyah + maftir, Monday/Thursday + 1st aliyah, ...) are counted once.
 */
export function countSelectedVerses(
  reading: VerseReadingData,
  selection: VerseSelection,
  tradition: HaftarahTradition = 'ashkenazi'
): VerseCountResult {
  const torahSegments = getSelectedTorahSegments(reading, selection);
  const torah = torahSegments.length ? countDistinctVerses(torahSegments) : 0;

  const haftarahSegments = selection.haftarah ? getHaftarahSegments(reading, tradition) : [];
  const haftarah = haftarahSegments.length ? countDistinctVerses(haftarahSegments) : 0;

  return { torah, haftarah, total: torah + haftarah };
}
