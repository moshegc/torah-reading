import { PARASHA_SEFARIA_REFS, ParashaSefariaRefs } from '../data/sefariaParashaRefs';
import { RecordingItem } from '../data/driveCatalog';
import { getJointParashaSefariaRefs } from './jointParashaRefs';

export type TextDisplayMode = 'full' | 'no_nikud' | 'tikkun' | 'nikud_only';
export type TextFontSize = 'sm' | 'md' | 'lg' | 'xl';

export type PortionSelectorKey =
  | 'shabbat-1'
  | 'shabbat-2'
  | 'shabbat-3'
  | 'shabbat-4'
  | 'shabbat-5'
  | 'shabbat-6'
  | 'shabbat-7'
  | 'maftir'
  | 'chol-1'
  | 'chol-2'
  | 'chol-3'
  | 'haftarah'
  | 'whole';

export interface TorahVerse {
  chapter: number;
  verse: number;
  heChapter: string;
  heVerse: string;
  withTaamim: string;
  nikudOnly: string;
  withoutNikud: string;
  parashaBreak: 'פ' | 'ס' | null;
}

export interface FetchedPortionText {
  refs: string[];
  heRef: string;
  sefariaUrl: string;
  verses: TorahVerse[];
}

export interface ResolvedPortionTarget {
  parasha: ParashaSefariaRefs | null;
  portionKey: PortionSelectorKey;
  label: string;
  shortLabel: string;
  refs: string[];
  sefariaUrl: string;
}

export const SPECIAL_HAFTAROT_REFS: Record<string, string[]> = {
  'מחר חודש': ['I Samuel 20:18-20:42'],
  'שמות א': ['Isaiah 27:6-28:13', 'Isaiah 29:22-29:23'],
  'שמות ס': ['Jeremiah 1:1-2:3'],
  'שובה': ['Hosea 14:2-14:10', 'Joel 2:15-2:27'],
  'חזון': ['Isaiah 1:1-1:27'],
  'ראש חודש': ['Isaiah 66:1-66:24'],
  'שבת חנוכה': ['Zechariah 2:14-4:7'],
  'פרשת שקלים': ['II Kings 11:17-12:17'],
  'שקלים': ['II Kings 11:17-12:17'],
  'פרשת זכור': ['I Samuel 15:2-15:34'],
  'זכור': ['I Samuel 15:2-15:34'],
  'פרשת פרה': ['Ezekiel 36:16-36:38'],
  'פרה': ['Ezekiel 36:16-36:38'],
  'פרשת החודש': ['Ezekiel 45:16-46:18'],
  'החודש': ['Ezekiel 45:16-46:18'],
  'שבת הגדול': ['Malachi 3:4-3:24'],
};

const PARASHA_ALIASES: Record<string, string> = {
  'תצוה': 'תצווה',
  'בחוקתי': 'בחוקותי',
  'נצבים': 'ניצבים',
  'חוקת': 'חקת',
  'שלח לך': 'שלח',
  'לך-לך': 'לך לך',
  'אחרי': 'אחרי מות',
};

/**
 * Converts a positive integer (1..999) into Hebrew letters (Gematria)
 */
export function toHebrewNumber(num: number, addGershayim = true): string {
  if (!Number.isFinite(num) || num <= 0) return String(num);
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

  const h = Math.floor((num % 1000) / 100);
  const rem = num % 100;
  let result = hundreds[h] || '';

  if (rem === 15) {
    result += 'טו';
  } else if (rem === 16) {
    result += 'טז';
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    result += (tens[t] || '') + (ones[o] || '');
  }

  if (!addGershayim) return result;
  if (result.length === 1) return `${result}׳`;
  return `${result.slice(0, -1)}״${result.slice(-1)}`;
}

export function normalizeParashaName(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/^פרשת\s+/g, '')
    .replace(/^הפטרת\s+/g, '')
    .trim();
  return PARASHA_ALIASES[cleaned] || cleaned;
}

export function findParashaRefs(parashaName?: string): ParashaSefariaRefs | null {
  const norm = normalizeParashaName(parashaName);
  if (!norm) return null;
  const exact = PARASHA_SEFARIA_REFS.find((p) => p.heName === norm);
  if (exact) return exact;
  // Joint parashot (e.g. "ויקהל-פקודי") must be resolved before the substring fallback below,
  // which would otherwise match only the first of the two parashot.
  const joint = getJointParashaSefariaRefs(norm);
  if (joint) return joint;
  // Substring fallback (e.g., if raw string contains the parasha name)
  return (
    PARASHA_SEFARIA_REFS.find((p) => norm.includes(p.heName) || p.heName.includes(norm)) ||
    null
  );
}

/**
 * Infers Parasha name from a recording's title or aliyah if not explicitly provided
 */
export function inferParashaFromRecording(
  recording?: RecordingItem | null,
  fallbackParasha?: string
): string {
  if (fallbackParasha && findParashaRefs(fallbackParasha)) {
    return normalizeParashaName(fallbackParasha);
  }
  if (!recording) return normalizeParashaName(fallbackParasha);

  const combined = `${recording.title} ${recording.aliyah}`;
  // Sort by length descending so multi-word parashot ('חיי שרה', 'לך לך', 'כי תשא') match before shorter ones ('נח', 'בא')
  const sorted = [...PARASHA_SEFARIA_REFS].sort(
    (a, b) => b.heName.length - a.heName.length
  );
  for (const p of sorted) {
    if (combined.includes(p.heName)) {
      return p.heName;
    }
  }
  for (const [alias, canonical] of Object.entries(PARASHA_ALIASES)) {
    if (combined.includes(alias)) {
      return canonical;
    }
  }
  return normalizeParashaName(fallbackParasha);
}

/**
 * Infers which portion key ('shabbat-1'..'shabbat-7', 'chol-1'..'chol-3', 'maftir', 'haftarah')
 * corresponds to a given RecordingItem
 */
export function inferPortionKeyFromRecording(
  recording?: RecordingItem | null
): PortionSelectorKey | null {
  if (!recording) return null;
  if (recording.category === 'blessings' || recording.category === 'doc') {
    return null;
  }

  const text = `${recording.aliyah} ${recording.title}`;

  if (recording.category === 'haftarah' || text.includes('הפטרה') || text.includes('הפטרת')) {
    return 'haftarah';
  }

  if (
    recording.category === 'chol' ||
    text.includes('חול') ||
    text.includes('מנחה') ||
    text.includes('כהן') ||
    text.includes('לוי') ||
    text.includes('ישראל')
  ) {
    if (text.includes('כהן') || text.includes('ראשון')) return 'chol-1';
    if (text.includes('לוי') || text.includes('שני')) return 'chol-2';
    if (text.includes('ישראל') || text.includes('שלישי')) return 'chol-3';
    return 'chol-1';
  }

  if (text.includes('מפטיר')) return 'maftir';
  if (text.includes('ראשון')) return 'shabbat-1';
  if (text.includes('שני')) return 'shabbat-2';
  if (text.includes('שלישי')) return 'shabbat-3';
  if (text.includes('רביעי')) return 'shabbat-4';
  if (text.includes('חמישי')) return 'shabbat-5';
  if (text.includes('שישי')) return 'shabbat-6';
  if (text.includes('שביעי')) return 'shabbat-7';

  return 'shabbat-1';
}

export function buildSefariaWebUrl(ref: string): string {
  const dotted = ref.trim().replace(/\s+/g, '.').replace(/:/g, '.');
  return `https://www.sefaria.org/${encodeURIComponent(dotted)}?lang=he`;
}

export function resolveHaftarahRefs(
  haftarahName?: string,
  parashaName?: string,
  recording?: RecordingItem | null
): { label: string; refs: string[] } | null {
  const recText = recording ? `${recording.aliyah} ${recording.title}` : '';

  // 1. Check if recording or haftarahName matches a special Haftarah
  for (const [specialName, refs] of Object.entries(SPECIAL_HAFTAROT_REFS)) {
    if (
      (haftarahName && haftarahName.trim() === specialName) ||
      recText.includes(specialName)
    ) {
      return {
        label: `הפטרת ${specialName}`,
        refs,
      };
    }
  }

  // 2. Check if haftarahName matches a Parasha's Haftarah
  const byHaftarahProp = findParashaRefs(haftarahName);
  if (byHaftarahProp && byHaftarahProp.haftarah.length > 0) {
    return {
      label: `הפטרת ${byHaftarahProp.heName}`,
      refs: byHaftarahProp.haftarah,
    };
  }

  // 3. Fallback to the student's Parasha Haftarah
  const byParashaProp = findParashaRefs(parashaName);
  if (byParashaProp && byParashaProp.haftarah.length > 0) {
    return {
      label: `הפטרת ${byParashaProp.heName}`,
      refs: byParashaProp.haftarah,
    };
  }

  return null;
}

export const PORTION_SELECTOR_OPTIONS: {
  key: PortionSelectorKey;
  label: string;
  shortLabel: string;
  group: 'shabbat' | 'chol' | 'other';
}[] = [
  { key: 'shabbat-1', label: 'עליית ראשון', shortLabel: 'ראשון', group: 'shabbat' },
  { key: 'shabbat-2', label: 'עליית שני', shortLabel: 'שני', group: 'shabbat' },
  { key: 'shabbat-3', label: 'עליית שלישי', shortLabel: 'שלישי', group: 'shabbat' },
  { key: 'shabbat-4', label: 'עליית רביעי', shortLabel: 'רביעי', group: 'shabbat' },
  { key: 'shabbat-5', label: 'עליית חמישי', shortLabel: 'חמישי', group: 'shabbat' },
  { key: 'shabbat-6', label: 'עליית שישי', shortLabel: 'שישי', group: 'shabbat' },
  { key: 'shabbat-7', label: 'עליית שביעי', shortLabel: 'שביעי', group: 'shabbat' },
  { key: 'maftir', label: 'מפטיר', shortLabel: 'מפטיר', group: 'shabbat' },
  { key: 'chol-1', label: 'כהן (חול/מנחה)', shortLabel: 'כהן (חול)', group: 'chol' },
  { key: 'chol-2', label: 'לוי (חול/מנחה)', shortLabel: 'לוי (חול)', group: 'chol' },
  { key: 'chol-3', label: 'ישראל (חול/מנחה)', shortLabel: 'ישראל (חול)', group: 'chol' },
  { key: 'haftarah', label: 'הפטרה', shortLabel: 'הפטרה', group: 'other' },
  { key: 'whole', label: 'כל הפרשה', shortLabel: 'כל הפרשה', group: 'other' },
];

export function resolvePortionTarget(params: {
  parashaName?: string;
  haftarahName?: string;
  recording?: RecordingItem | null;
  overrideKey?: PortionSelectorKey | null;
}): ResolvedPortionTarget | null {
  const { parashaName, haftarahName, recording, overrideKey } = params;
  const inferredParasha = inferParashaFromRecording(recording, parashaName);
  const parasha = findParashaRefs(inferredParasha);

  const portionKey: PortionSelectorKey | null =
    overrideKey || inferPortionKeyFromRecording(recording) || (parasha ? 'shabbat-1' : null);

  if (!portionKey) return null;

  if (portionKey === 'haftarah') {
    const haft = resolveHaftarahRefs(haftarahName, inferredParasha, recording);
    if (!haft) return null;
    return {
      parasha,
      portionKey: 'haftarah',
      label: haft.label,
      shortLabel: 'הפטרה',
      refs: haft.refs,
      sefariaUrl: buildSefariaWebUrl(haft.refs[0]),
    };
  }

  if (!parasha) return null;

  const opt = PORTION_SELECTOR_OPTIONS.find((o) => o.key === portionKey);
  const shortLabel =
    (!overrideKey && recording?.aliyah?.trim()) || opt?.label || 'עליית ראשון';

  let ref = parasha.shabbat[0];
  if (portionKey.startsWith('shabbat-')) {
    const idx = Math.max(0, Math.min(6, Number(portionKey.split('-')[1]) - 1));
    ref = parasha.shabbat[idx];
  } else if (portionKey === 'maftir') {
    ref = parasha.maftir;
  } else if (portionKey.startsWith('chol-')) {
    const idx = Math.max(0, Math.min(2, Number(portionKey.split('-')[1]) - 1));
    ref = parasha.weekday[idx];
  } else if (portionKey === 'whole') {
    ref = parasha.wholeRef;
  }

  return {
    parasha,
    portionKey,
    label: `פרשת ${parasha.heName} • ${shortLabel}`,
    shortLabel,
    refs: [ref],
    sefariaUrl: buildSefariaWebUrl(ref),
  };
}

/**
 * Parses a raw HTML verse string from Sefaria's "Miqra according to the Masorah"
 * into vocalized (with Taamim), nikud-only, and unvocalized (Sefer Torah / Tikkun) strings.
 */
export function parseSefariaVerseHtml(rawHtml: string): {
  withTaamim: string;
  nikudOnly: string;
  withoutNikud: string;
  parashaBreak: 'פ' | 'ס' | null;
} {
  if (!rawHtml) {
    return { withTaamim: '', nikudOnly: '', withoutNikud: '', parashaBreak: null };
  }

  // Detect open {פ} or closed {ס} parasha break at end of verse
  let parashaBreak: 'פ' | 'ס' | null = null;
  if (/\{פ\}|\(פ\)/.test(rawHtml)) {
    parashaBreak = 'פ';
  } else if (/\{ס\}|\(ס\)/.test(rawHtml)) {
    parashaBreak = 'ס';
  }

  // 1. Strip footnotes
  const noFootnotes = rawHtml
    .replace(/<sup class="footnote-marker">[\s\S]*?<\/sup>/gi, '')
    .replace(/<i class="footnote">[\s\S]*?<\/i>/gi, '');

  // 2. Build vocalized string (Qere for pronunciation, with Nikud & Teamim)
  const withTaamim = noFootnotes
    // In MAM Ketiv/Qere: drop Ketiv span, keep Qere span without brackets
    .replace(/<span class="mam-kq-k">[\s\S]*?<\/span>/gi, '')
    .replace(/<span class="mam-kq-q">\[?([\s\S]*?)\]?<\/span>/gi, '$1')
    .replace(/\{[פס]\}|\([פס]\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&thinsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Build Nikud-only string (strip cantillation accents \u0591-\u05AF, paseq \u05C0, meteg \u05BD)
  const nikudOnly = withTaamim
    .replace(/[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C4\u05C5]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 4. Build Sefer Torah unvocalized string (Ketiv only, no nikud, no teamim, no maqaf, no sof-pasuk)
  const withoutNikud = noFootnotes
    // In MAM Ketiv/Qere: drop Qere span, keep Ketiv span without parentheses
    .replace(/<span class="mam-kq-q">[\s\S]*?<\/span>/gi, '')
    .replace(/<span class="mam-kq-k">\(?([\s\S]*?)\)?<\/span>/gi, '$1')
    // Also strip any bracketed Qere in non-MAM versions
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[פס]\}|\([פס]\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&thinsp;/gi, ' ')
    // Replace maqaf (־) with space as written in a Sefer Torah
    .replace(/\u05BE/g, ' ')
    // Remove all cantillation, nikud, paseq (׀), and sof-pasuk (׃)
    .replace(/[\u0591-\u05C7\uFB1E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    withTaamim,
    nikudOnly,
    withoutNikud,
    parashaBreak,
  };
}

const memoryCache = new Map<string, FetchedPortionText>();
const STORAGE_CACHE_PREFIX = 'torah_sefaria_cache_v1_';

async function fetchSingleRefFromSefaria(ref: string): Promise<{
  heRef: string;
  verses: TorahVerse[];
}> {
  const cleanRef = ref.replace(/–/g, '-').trim();
  const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(cleanRef)}?version=hebrew`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`שגיאה בטעינת הפסוקים מספריא (${res.status})`);
  }
  const data = await res.json();
  const version = Array.isArray(data.versions) ? data.versions[0] : null;
  const rawText = version?.text;
  if (!rawText || !Array.isArray(rawText)) {
    throw new Error('לא נמצא טקסט עברי עבור קטע זה בספריא');
  }

  const startChapter = Number(data.sections?.[0]) || 1;
  const startVerse = Number(data.sections?.[1]) || 1;
  const verses: TorahVerse[] = [];

  if (rawText.length > 0 && Array.isArray(rawText[0])) {
    // Multi-chapter 2D array: rawText[chapterOffset][verseOffset]
    rawText.forEach((chapterArr: string[], cIdx: number) => {
      if (!Array.isArray(chapterArr)) return;
      const chapterNum = startChapter + cIdx;
      const baseVerse = cIdx === 0 ? startVerse : 1;
      chapterArr.forEach((rawVerse: string, vIdx: number) => {
        if (!rawVerse || typeof rawVerse !== 'string' || !rawVerse.trim()) return;
        const verseNum = baseVerse + vIdx;
        const parsed = parseSefariaVerseHtml(rawVerse);
        verses.push({
          chapter: chapterNum,
          verse: verseNum,
          heChapter: toHebrewNumber(chapterNum, true),
          heVerse: toHebrewNumber(verseNum, false),
          ...parsed,
        });
      });
    });
  } else {
    // Single-chapter 1D array: rawText[verseOffset]
    rawText.forEach((rawVerse: string, vIdx: number) => {
      if (!rawVerse || typeof rawVerse !== 'string' || !rawVerse.trim()) return;
      const verseNum = startVerse + vIdx;
      const parsed = parseSefariaVerseHtml(rawVerse);
      verses.push({
        chapter: startChapter,
        verse: verseNum,
        heChapter: toHebrewNumber(startChapter, true),
        heVerse: toHebrewNumber(verseNum, false),
        ...parsed,
      });
    });
  }

  return {
    heRef: data.heRef || cleanRef,
    verses,
  };
}

export async function fetchPortionTextFromSefaria(
  refs: string[]
): Promise<FetchedPortionText> {
  const cacheKey = refs.join('|');
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const saved = sessionStorage.getItem(STORAGE_CACHE_PREFIX + cacheKey);
    if (saved) {
      const parsed = JSON.parse(saved) as FetchedPortionText;
      if (parsed && Array.isArray(parsed.verses) && parsed.verses.length > 0) {
        memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }

  const results = await Promise.all(refs.map((r) => fetchSingleRefFromSefaria(r)));
  const combined: FetchedPortionText = {
    refs,
    heRef: results.map((r) => r.heRef).join(' ; '),
    sefariaUrl: buildSefariaWebUrl(refs[0]),
    verses: results.flatMap((r) => r.verses),
  };

  memoryCache.set(cacheKey, combined);
  try {
    sessionStorage.setItem(STORAGE_CACHE_PREFIX + cacheKey, JSON.stringify(combined));
  } catch {
    // ignore storage quota errors
  }

  return combined;
}
