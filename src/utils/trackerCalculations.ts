import {
  StudentProfile,
  StudentComputedStats,
  PARASHA_META_LIST,
  HAFTAROT_VERSE_COUNTS,
  RecordingItem,
} from '../data/driveCatalog';

/**
 * Emulates Excel's DAYS360(start_date, end_date, FALSE)
 * used in the tracking sheet formula: roundup(DAYS360(TODAY(), D2)/7, 0)
 */
export function days360(startDate: Date, endDate: Date): number {
  let d1 = startDate.getDate();
  const m1 = startDate.getMonth() + 1;
  const y1 = startDate.getFullYear();

  let d2 = endDate.getDate();
  const m2 = endDate.getMonth() + 1;
  const y2 = endDate.getFullYear();

  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;

  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

export function roundUp(val: number): number {
  if (!Number.isFinite(val) || val === 0) return 0;
  return val > 0 ? Math.ceil(val) : Math.floor(val);
}

export function edate(dateStr: string, monthsOffset: number): string {
  const dt = parseFlexibleDate(dateStr);
  if (!dt) return '';
  const target = new Date(dt.getFullYear(), dt.getMonth() + monthsOffset, dt.getDate());
  return formatDateIL(target);
}

export function parseFlexibleDate(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const p1 = Number(slash[1]);
    const p2 = Number(slash[2]);
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    if (p1 > 12) {
      return new Date(y, p2 - 1, p1);
    }
    return new Date(y, p1 - 1, p2);
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateIL(input: string | Date): string {
  const dt = typeof input === 'string' ? parseFlexibleDate(input) : input;
  if (!dt) return typeof input === 'string' ? input : '';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
}

export function lookupParashaVerses(parashaName: string): number {
  const clean = parashaName.trim();
  const found = PARASHA_META_LIST.find(
    (p) => p.name === clean || (clean === 'בחוקתי' && p.name === 'בחוקותי')
  );
  return found ? found.verses : 0;
}

export function lookupHaftarahVerses(haftarahName: string): number {
  const clean = haftarahName.trim();
  if (clean in HAFTAROT_VERSE_COUNTS) {
    return HAFTAROT_VERSE_COUNTS[clean];
  }
  return 22;
}

/**
 * Exact tracking sheet calculations (columns J..S)
 */
export function calculateStudentStats(
  student: StudentProfile,
  todayInput: Date = new Date()
): StudentComputedStats {
  const today = new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate());
  const bmDate = parseFlexibleDate(student.barMitzvahDate) || today;

  const E = Number(student.parashaVerses) || 0;
  const F = Number(student.skippedVerses) || 0;
  const G = Number(student.learnedParashaVerses) || 0;
  const H = Number(student.haftarahVerses) || 0;
  const I = Number(student.learnedHaftarahVerses) || 0;

  const J = Math.max(0, E + H - F); // סה"כ פסוקים
  const K = Math.max(0, G + I); // סה"כ למדנו
  const L = Math.max(0, J - K); // פסוקים שנשארו

  const d360 = days360(today, bmDate);
  const N = Math.max(0, roundUp(d360 / 7)); // שבועות לבר מצווה

  const M = L === 0 ? 0 : N > 0 ? roundUp(L / N) : L; // פסוקים לשיעור
  const O = L === 0 ? 0 : roundUp(L / 5); // שיעורים ללימוד
  const P = N - O; // שבועות עודפים

  const R = roundUp(J / 5) + 8; // שבועות לימוד כולל
  const S = roundUp(J / 5 / 4) + 2; // חודשי לימוד
  const Q = edate(student.barMitzvahDate, -S); // התחלה משוערת

  const progressPercent = J > 0 ? Math.min(100, Math.round((K / J) * 100)) : 100;

  return {
    totalVerses: J,
    totalLearned: K,
    remainingVerses: L,
    versesPerLesson: M,
    weeksToBarMitzvah: N,
    lessonsNeeded: O,
    spareWeeks: P,
    estimatedStartDate: Q,
    totalStudyWeeks: R,
    totalStudyMonths: S,
    progressPercent,
  };
}

export function getMediaStreamUrl(rec: RecordingItem): string {
  if (rec.customAudioDataUrl) {
    return rec.customAudioDataUrl;
  }
  const params = new URLSearchParams({
    id: rec.id,
    ext: rec.ext,
  });
  if (rec.resourceKey) {
    params.set('resourceKey', rec.resourceKey);
  }
  return `/api/drive-media?${params.toString()}`;
}

/**
 * Extracts Google Drive file/folder ID and optional resourceKey from any Drive link
 */
export function parseDriveUrl(rawUrl: string): {
  id: string;
  resourceKey: string | null;
  isFolder: boolean;
} | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const isFolder = trimmed.includes('/folders/');
  const rkMatch = trimmed.match(/resourcekey=([0-9a-zA-Z_-]+)/i);
  const resourceKey = rkMatch ? rkMatch[1] : null;

  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{15,60})/);
  if (folderMatch) {
    return { id: folderMatch[1], resourceKey, isFolder: true };
  }

  const fileMatch =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{15,60})/) ||
    trimmed.match(/\/d\/([a-zA-Z0-9_-]{15,60})/) ||
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]{15,60})/);
  if (fileMatch) {
    return { id: fileMatch[1], resourceKey, isFolder: false };
  }

  // Raw ID pasted directly
  if (/^[a-zA-Z0-9_-]{20,50}$/.test(trimmed)) {
    return { id: trimmed, resourceKey: null, isFolder: false };
  }

  return null;
}

/**
 * Infers a clean Hebrew portion name and category from a file title
 */
export function classifyFileTitle(filename: string): {
  aliyah: string;
  category: RecordingItem['category'];
  ext: RecordingItem['ext'];
} {
  const extMatch = filename.trim().match(/\.([a-zA-Z0-9]+)$/);
  const rawExt = extMatch ? extMatch[1].toLowerCase() : 'aac';
  const ext = (
    ['m4a', 'aac', 'mp3', 'pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(rawExt)
      ? rawExt
      : 'aac'
  ) as RecordingItem['ext'];

  const base = filename.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return { aliyah: base, category: 'doc', ext };
  }
  if (base.includes('הפטרה')) {
    return { aliyah: 'הפטרה', category: 'haftarah', ext };
  }
  if (base.includes('כהן') || base.includes('ראשון חול')) {
    return { aliyah: 'כהן (חול/מנחה)', category: 'chol', ext };
  }
  if (base.includes('לוי') || base.includes('שני חול')) {
    return { aliyah: 'לוי (חול/מנחה)', category: 'chol', ext };
  }
  if (base.includes('ישראל') || base.includes('שלישי חול')) {
    return { aliyah: 'ישראל (חול/מנחה)', category: 'chol', ext };
  }
  for (const al of ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'מפטיר']) {
    if (base.includes(al)) {
      return {
        aliyah: al === 'מפטיר' ? 'מפטיר' : `עליית ${al}`,
        category: 'shabbat',
        ext,
      };
    }
  }
  return { aliyah: base, category: 'shabbat', ext };
}

/**
 * Encodes a student's profile & visible portions into a shareable URL token
 * so the student link (?student=id&cfg=...) works immediately on mobile.
 */
export function encodeStudentShareToken(student: StudentProfile): string {
  const visiblePortions = (student.portions || [])
    .filter((p) => p.visible !== false && !p.customAudioDataUrl)
    .map((p) => ({
      i: p.id,
      t: p.title,
      a: p.aliyah,
      c: p.category,
      e: p.ext,
      r: p.resourceKey || undefined,
    }));

  const payload = {
    i: student.id,
    n: student.name,
    p: student.parasha,
    h: student.haftarah,
    d: student.barMitzvahDate,
    pv: student.parashaVerses,
    sv: student.skippedVerses,
    lp: student.learnedParashaVerses,
    hv: student.haftarahVerses,
    lh: student.learnedHaftarahVerses,
    po: visiblePortions,
  };

  try {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

export function decodeStudentShareToken(token: string): Partial<StudentProfile> | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const portions: RecordingItem[] | undefined = Array.isArray(parsed.po)
      ? parsed.po.map((p: any) => ({
          id: p.i,
          title: p.t || p.a,
          aliyah: p.a,
          category: p.c || 'shabbat',
          ext: p.e || 'aac',
          resourceKey: p.r || null,
          visible: true,
          viewUrl: `https://drive.google.com/file/d/${p.i}/view?usp=drivesdk${
            p.r ? `&resourcekey=${p.r}` : ''
          }`,
        }))
      : undefined;

    return {
      id: parsed.i,
      name: parsed.n,
      parasha: parsed.p,
      haftarah: parsed.h,
      barMitzvahDate: parsed.d,
      parashaVerses: parsed.pv,
      skippedVerses: parsed.sv,
      learnedParashaVerses: parsed.lp,
      haftarahVerses: parsed.hv,
      learnedHaftarahVerses: parsed.lh,
      portions,
    };
  } catch {
    return null;
  }
}
