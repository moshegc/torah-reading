import { findParashaOption, PARASHA_OPTIONS, sortHaftarahNames } from './parashaOptions';
import { VERSE_READINGS, type VerseReadingData } from './verseCounts';
import type { HaftarahTradition } from '../utils/verseCounts';

const parashaNames = new Map(PARASHA_OPTIONS.map((option) => [option.readingId, option.name]));

const readingsByName = new Map(
  VERSE_READINGS
    .filter((reading) => reading.haftarah.length > 0 || reading.haftarahSephardi.length > 0)
    .map((reading) => [parashaNames.get(reading.id) ?? reading.heName, reading])
);

export const HAFTARAH_OPTIONS = sortHaftarahNames([...readingsByName.keys()]).map((name) => ({
  name,
  reading: readingsByName.get(name)!,
}));

const NAME_ALIASES: Record<string, string> = {
  'מחר חודש': 'שבת מחר חודש',
  'ראש חודש': 'שבת ראש חודש',
  'שובה': 'שבת שובה',
  'חזון': 'דברים',
  'פרשת שקלים': 'שבת שקלים',
  'פרשת זכור': 'שבת זכור',
  'פרשת פרה': 'שבת פרה',
  'פרשת החודש': 'שבת החדש',
};

export function findHaftarahReading(name: string): VerseReadingData | undefined {
  const clean = name.trim();
  const parasha = findParashaOption(clean.replace(/\s+[אס]$/, ''));
  return readingsByName.get(clean) ??
    readingsByName.get(NAME_ALIASES[clean] ?? parasha?.name ?? '');
}

export function getHaftarahVerses(name: string, tradition: HaftarahTradition): number {
  const reading = findHaftarahReading(name);
  return reading
    ? tradition === 'sephardi' ? reading.haftarahSephardiCount : reading.haftarahCount
    : 0;
}
