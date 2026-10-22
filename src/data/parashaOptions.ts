import { PARASHA_META_LIST } from './driveCatalog';
import { VERSE_READINGS, VerseReadingData } from './verseCounts';

/** An entry of the "parasha" drop-down: a single parasha or a joint (doubled) parasha. */
export interface ParashaOption {
  /** Hebrew display name, also the value stored in `StudentProfile.parasha` (e.g. "ויקהל-פקודי") */
  name: string;
  kind: 'parasha' | 'joint';
  /** Id of the matching entry in VERSE_READINGS */
  readingId: string;
  /** Parasha order number(s) 1..54 */
  order: number[];
  /** Verses in the whole parasha (aliyot + maftir) */
  verses: number;
}

const readingByOrder = new Map<string, VerseReadingData>();
for (const r of VERSE_READINGS) {
  if ((r.kind === 'parasha' || r.kind === 'joint') && r.parashaOrder) {
    readingByOrder.set(r.parashaOrder.join('-'), r);
  }
}

/**
 * All parashot in reading order, with each joint parasha placed right after its second part,
 * e.g. ... ויקהל, פקודי, ויקהל-פקודי, ויקרא ...
 */
export const PARASHA_OPTIONS: ParashaOption[] = (() => {
  const nameByOrder = new Map(PARASHA_META_LIST.map((p) => [p.order, p.name]));
  const keyed: { sort: number; option: ParashaOption }[] = [];

  for (const meta of PARASHA_META_LIST) {
    const reading = readingByOrder.get(String(meta.order));
    if (!reading) continue;
    keyed.push({
      sort: meta.order,
      option: {
        name: meta.name,
        kind: 'parasha',
        readingId: reading.id,
        order: [meta.order],
        // The tracking sheet's count stays the source of truth for single parashot
        verses: meta.verses,
      },
    });
  }

  for (const r of VERSE_READINGS) {
    if (r.kind !== 'joint' || !r.parashaOrder) continue;
    const names = r.parashaOrder.map((o) => nameByOrder.get(o));
    if (names.some((n) => !n)) continue;
    keyed.push({
      sort: Math.max(...r.parashaOrder) + 0.5,
      option: {
        name: names.join('-'),
        kind: 'joint',
        readingId: r.id,
        order: r.parashaOrder,
        verses: r.torahCount,
      },
    });
  }

  return keyed.sort((a, b) => a.sort - b.sort).map((k) => k.option);
})();

const optionByName = new Map(PARASHA_OPTIONS.map((o) => [o.name, o]));

// Spelling variants that appear in student data / recording titles
const NAME_ALIASES: Record<string, string> = {
  'בחוקתי': 'בחוקותי',
  'חוקת': 'חקת',
  'נצבים': 'ניצבים',
  'תצוה': 'תצווה',
  'שלח לך': 'שלח',
  'פינחס': 'פנחס',
};

function canonicalPart(part: string): string {
  const p = part.trim().replace(/^פרשת\s+/, '');
  return NAME_ALIASES[p] ?? p;
}

/** Finds a single or joint parasha option by name (tolerating aliases and "-"/"–"/"־" separators). */
export function findParashaOption(name?: string | null): ParashaOption | undefined {
  if (!name) return undefined;
  const direct = optionByName.get(name.trim());
  if (direct) return direct;
  const parts = name.split(/[-–־]/).map(canonicalPart).filter(Boolean);
  return optionByName.get(parts.join('-'));
}

/** The verse data (aliyot, maftir, weekday, haftarah...) of the selected parasha. */
export function getParashaVerseReading(name?: string | null): VerseReadingData | undefined {
  const option = findParashaOption(name);
  return option ? VERSE_READINGS.find((r) => r.id === option.readingId) : undefined;
}

