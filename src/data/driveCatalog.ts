export interface RecordingItem {
  id: string;
  title: string;
  aliyah: string;
  category: 'shabbat' | 'chol' | 'haftarah' | 'blessings' | 'doc';
  ext: 'm4a' | 'aac' | 'mp3' | 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp';
  resourceKey?: string | null;
  viewUrl: string;
  localUrl?: string; // Bundled static file path in /docs/...
  visible?: boolean; // For student-specific portions: whether the student can see it
  customAudioDataUrl?: string;
  r2Key?: string; // Cloudflare R2 object key (e.g. media/{teacherId}/{studentId}/...)
  r2Url?: string; // Direct R2 stream URL
}

export interface ParashaMeta {
  order: number;
  name: string;
  book: 'בראשית' | 'שמות' | 'ויקרא' | 'במדבר' | 'דברים';
  verses: number;
}

export interface StudentProfile {
  id: string;
  name: string;
  parasha: string;
  haftarah: string;
  barMitzvahDate: string; // YYYY-MM-DD
  parashaVerses: number; // פסוקים בפרשה
  skippedVerses: number; // פסוקים שנדלג
  learnedParashaVerses: number; // פסוקים שלמדנו (פרשה)
  haftarahVerses: number; // פסוקים בהפטרה
  learnedHaftarahVerses: number; // פסוקים שלמדנו (הפטרה)
  driveFolderUrl?: string; // Optional Drive folder URL linked to this student
  portions: RecordingItem[]; // Portions linked to this student (teacher controls visibility)
}

export interface StudentComputedStats {
  totalVerses: number; // סה"כ פסוקים = E + H - F
  totalLearned: number; // סה"כ למדנו = G + I
  remainingVerses: number; // פסוקים שנשארו = J - K
  versesPerLesson: number; // פסוקים לשיעור = ROUNDUP(L / N, 0)
  weeksToBarMitzvah: number; // שבועות לבר מצווה = ROUNDUP(DAYS360(TODAY(), D) / 7, 0)
  lessonsNeeded: number; // שיעורים ללימוד = ROUNDUP(L / 5, 0)
  spareWeeks: number; // שבועות עודפים = N - O
  estimatedStartDate: string; // התחלה משוערת = EDATE(D, -S)
  totalStudyWeeks: number; // שבועות לימוד כולל = ROUNDUP(J / 5, 0) + 8
  totalStudyMonths: number; // חודשי לימוד = ROUNDUP((J / 5) / 4, 0) + 2
  progressPercent: number;
}

export const ROOT_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/0B6cVWsWs-t94Y2xzWnJaWlF0ZXc?resourcekey=0-74NHOzXbUQNLQVKYpF9CNQ';
export const STUDENT_TRACKER_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1PiuEGpkxS66oqIyhltwVuVJ480ygBVuQviqkbbIoDZE/edit?usp=drivesdk';

// Paste your deployed Google Apps Script Web App URL here (or set VITE_GAS_WEBAPP_URL in Vercel)
// so all student devices automatically read torah-app-data.json from your Google Drive:
export const DEFAULT_GAS_WEBAPP_URL =
  (import.meta as any).env?.VITE_GAS_WEBAPP_URL || '';

// 54 Parashot verse counts from the 'פרשות' tab in the tracking sheet
export const PARASHA_META_LIST: ParashaMeta[] = [
  { order: 1, name: 'בראשית', book: 'בראשית', verses: 146 },
  { order: 2, name: 'נח', book: 'בראשית', verses: 153 },
  { order: 3, name: 'לך לך', book: 'בראשית', verses: 126 },
  { order: 4, name: 'וירא', book: 'בראשית', verses: 147 },
  { order: 5, name: 'חיי שרה', book: 'בראשית', verses: 105 },
  { order: 6, name: 'תולדות', book: 'בראשית', verses: 106 },
  { order: 7, name: 'ויצא', book: 'בראשית', verses: 148 },
  { order: 8, name: 'וישלח', book: 'בראשית', verses: 153 },
  { order: 9, name: 'וישב', book: 'בראשית', verses: 112 },
  { order: 10, name: 'מקץ', book: 'בראשית', verses: 146 },
  { order: 11, name: 'ויגש', book: 'בראשית', verses: 106 },
  { order: 12, name: 'ויחי', book: 'בראשית', verses: 85 },
  { order: 13, name: 'שמות', book: 'שמות', verses: 124 },
  { order: 14, name: 'וארא', book: 'שמות', verses: 121 },
  { order: 15, name: 'בא', book: 'שמות', verses: 106 },
  { order: 16, name: 'בשלח', book: 'שמות', verses: 116 },
  { order: 17, name: 'יתרו', book: 'שמות', verses: 75 },
  { order: 18, name: 'משפטים', book: 'שמות', verses: 118 },
  { order: 19, name: 'תרומה', book: 'שמות', verses: 96 },
  { order: 20, name: 'תצווה', book: 'שמות', verses: 101 },
  { order: 21, name: 'כי תשא', book: 'שמות', verses: 139 },
  { order: 22, name: 'ויקהל', book: 'שמות', verses: 122 },
  { order: 23, name: 'פקודי', book: 'שמות', verses: 92 },
  { order: 24, name: 'ויקרא', book: 'ויקרא', verses: 111 },
  { order: 25, name: 'צו', book: 'ויקרא', verses: 97 },
  { order: 26, name: 'שמיני', book: 'ויקרא', verses: 91 },
  { order: 27, name: 'תזריע', book: 'ויקרא', verses: 67 },
  { order: 28, name: 'מצורע', book: 'ויקרא', verses: 90 },
  { order: 29, name: 'אחרי מות', book: 'ויקרא', verses: 80 },
  { order: 30, name: 'קדושים', book: 'ויקרא', verses: 64 },
  { order: 31, name: 'אמור', book: 'ויקרא', verses: 124 },
  { order: 32, name: 'בהר', book: 'ויקרא', verses: 57 },
  { order: 33, name: 'בחוקותי', book: 'ויקרא', verses: 78 },
  { order: 34, name: 'במדבר', book: 'במדבר', verses: 159 },
  { order: 35, name: 'נשא', book: 'במדבר', verses: 176 },
  { order: 36, name: 'בהעלותך', book: 'במדבר', verses: 136 },
  { order: 37, name: 'שלח', book: 'במדבר', verses: 119 },
  { order: 38, name: 'קרח', book: 'במדבר', verses: 95 },
  { order: 39, name: 'חקת', book: 'במדבר', verses: 87 },
  { order: 40, name: 'בלק', book: 'במדבר', verses: 104 },
  { order: 41, name: 'פנחס', book: 'במדבר', verses: 168 },
  { order: 42, name: 'מטות', book: 'במדבר', verses: 112 },
  { order: 43, name: 'מסעי', book: 'במדבר', verses: 132 },
  { order: 44, name: 'דברים', book: 'דברים', verses: 105 },
  { order: 45, name: 'ואתחנן', book: 'דברים', verses: 122 },
  { order: 46, name: 'עקב', book: 'דברים', verses: 111 },
  { order: 47, name: 'ראה', book: 'דברים', verses: 126 },
  { order: 48, name: 'שופטים', book: 'דברים', verses: 97 },
  { order: 49, name: 'כי תצא', book: 'דברים', verses: 110 },
  { order: 50, name: 'כי תבוא', book: 'דברים', verses: 122 },
  { order: 51, name: 'ניצבים', book: 'דברים', verses: 40 },
  { order: 52, name: 'וילך', book: 'דברים', verses: 30 },
  { order: 53, name: 'האזינו', book: 'דברים', verses: 52 },
  { order: 54, name: 'וזאת הברכה', book: 'דברים', verses: 41 },
];

// Haftarah verse counts from the 'הפטרות' tab in the tracking sheet
export const HAFTAROT_VERSE_COUNTS: Record<string, number> = {
  'עקב': 27,
  'שופטים': 24,
  'מחר חודש': 25,
  'ויגש': 14,
  'בחוקותי': 17,
  'שובה': 25,
  'חזון': 28,
  'חיי שרה': 32,
  'ויחי': 13,
  'כי תצא': 0,
  'ואתחנן': 26,
  'ויצא': 28,
  'בראשית': 23,
  'תזריע': 22,
  'שמות א': 23,
  'שמות ס': 22,
  'תולדות': 21,
  'בהעלותך': 22,
};

// General Audio Items (Blessings & Te'amim)
export const GENERAL_AUDIO_ITEMS: RecordingItem[] = [
  {
    id: '0B6cVWsWs-t94X0JBNXV1TmxTaDQ',
    title: 'ברכות התורה.aac',
    aliyah: 'ברכות התורה',
    category: 'blessings',
    ext: 'aac',
    resourceKey: '0-5f1ErdBd65p6uQq5HvzzEg',
    r2Key: 'media/mosheg/library/drive-0B6cVWsWs-t94X0JBNXV1TmxTaDQ.aac',
    viewUrl:
      'https://drive.google.com/file/d/0B6cVWsWs-t94X0JBNXV1TmxTaDQ/view?usp=drivesdk&resourcekey=0-5f1ErdBd65p6uQq5HvzzEg',
  },
  {
    id: '0B6cVWsWs-t94UVVGYXN2RkJPQVk',
    title: 'טעמים סימנים.aac',
    aliyah: 'טעמי המקרא (סימנים)',
    category: 'blessings',
    ext: 'aac',
    resourceKey: '0-Hovzjl6uhFezqzfth_05BA',
    r2Key: 'media/mosheg/library/drive-0B6cVWsWs-t94UVVGYXN2RkJPQVk.aac',
    viewUrl:
      'https://drive.google.com/file/d/0B6cVWsWs-t94UVVGYXN2RkJPQVk/view?usp=drivesdk&resourcekey=0-Hovzjl6uhFezqzfth_05BA',
  },
  {
    id: '0B6cVWsWs-t94TkJCSGN4cmhuWVk',
    title: 'טעמים - הפטרה.aac',
    aliyah: 'טעמי ההפטרה',
    category: 'blessings',
    ext: 'aac',
    resourceKey: '0-0ycSFGx3oKMW-UlMwq9jew',
    r2Key: 'media/mosheg/library/drive-0B6cVWsWs-t94TkJCSGN4cmhuWVk.aac',
    viewUrl:
      'https://drive.google.com/file/d/0B6cVWsWs-t94TkJCSGN4cmhuWVk/view?usp=drivesdk&resourcekey=0-0ycSFGx3oKMW-UlMwq9jew',
  },
  {
    id: '0B6cVWsWs-t94WXFvbEdZM2hiVkk',
    title: 'ברכת הפטרה.aac',
    aliyah: 'ברכה לפני ההפטרה',
    category: 'blessings',
    ext: 'aac',
    resourceKey: '0-tHwbf1uiFz9d8VfWokCJpQ',
    r2Key: 'media/mosheg/library/drive-0B6cVWsWs-t94WXFvbEdZM2hiVkk.aac',
    viewUrl:
      'https://drive.google.com/file/d/0B6cVWsWs-t94WXFvbEdZM2hiVkk/view?usp=drivesdk&resourcekey=0-tHwbf1uiFz9d8VfWokCJpQ',
  },
  {
    id: '0B6cVWsWs-t94RDlPLV9uYkU5UVk',
    title: 'ברכות אחרי ההפטרה.aac',
    aliyah: 'ברכות אחרי ההפטרה',
    category: 'blessings',
    ext: 'aac',
    resourceKey: '0-66cOSIS76Y_MzJuTWqdUcA',
    r2Key: 'media/mosheg/library/drive-0B6cVWsWs-t94RDlPLV9uYkU5UVk.aac',
    viewUrl:
      'https://drive.google.com/file/d/0B6cVWsWs-t94RDlPLV9uYkU5UVk/view?usp=drivesdk&resourcekey=0-66cOSIS76Y_MzJuTWqdUcA',
  },
];

// General Study Docs (PDFs & Images bundled in /public/docs + Drive link)
export const GENERAL_DOC_ITEMS: RecordingItem[] = [
  {
    id: '1ewMmc5-RU4-O374cnTusDtYJdN9c6s8f',
    title: 'טעמים - תווים.pdf',
    aliyah: 'טעמים - תווים',
    category: 'doc',
    ext: 'pdf',
    localUrl: '/docs/teamim-tavim.pdf',
    viewUrl: 'https://drive.google.com/file/d/1ewMmc5-RU4-O374cnTusDtYJdN9c6s8f/view?usp=drivesdk',
  },
  {
    id: '1EaSAddjlNus1fpQcstvW1R0RzzNURUdc',
    title: 'סימנים - כללי דקדוק.pdf',
    aliyah: 'סימנים - כללי דקדוק',
    category: 'doc',
    ext: 'pdf',
    localUrl: '/docs/simanim-dikduk.pdf',
    viewUrl: 'https://drive.google.com/file/d/1EaSAddjlNus1fpQcstvW1R0RzzNURUdc/view?usp=drivesdk',
  },
  {
    id: '0B6cVWsWs-t94cWtqNndlbERPNGc',
    title: 'טעמים סימנים.jpg',
    aliyah: 'דף טעמים סימנים',
    category: 'doc',
    ext: 'jpg',
    resourceKey: '0-UGgSXlrXlrPCBFX2sGvijw',
    localUrl: '/docs/teamim-simanim.jpg',
    viewUrl:
      'https://drive.google.com/file/d/0B6cVWsWs-t94cWtqNndlbERPNGc/view?usp=drivesdk&resourcekey=0-UGgSXlrXlrPCBFX2sGvijw',
  },
  {
    id: '1Cpj5sq5h0h3Ys58ICa-2d4VdG1IwJkZN',
    title: 'מלעיל מלרע.png',
    aliyah: 'מלעיל ומלרע',
    category: 'doc',
    ext: 'png',
    localUrl: '/docs/mileil-milra.png',
    viewUrl: 'https://drive.google.com/file/d/1Cpj5sq5h0h3Ys58ICa-2d4VdG1IwJkZN/view?usp=drivesdk',
  },
  {
    id: '1ClXFfB6izD-fL_PWSyvOeaZTCDJWST-j',
    title: 'מפיק בהא.png',
    aliyah: 'מפיק בה"א',
    category: 'doc',
    ext: 'png',
    localUrl: '/docs/mapik-behei.png',
    viewUrl: 'https://drive.google.com/file/d/1ClXFfB6izD-fL_PWSyvOeaZTCDJWST-j/view?usp=drivesdk',
  },
];

// Current Students from your tracking sheet
export const STUDENTS: StudentProfile[] = [
  {
    id: 'talia',
    name: 'טליה',
    parasha: 'חיי שרה',
    haftarah: 'חיי שרה',
    barMitzvahDate: '2026-11-07',
    parashaVerses: 105,
    skippedVerses: 0,
    learnedParashaVerses: 105,
    haftarahVerses: 32,
    learnedHaftarahVerses: 32,
    driveFolderUrl: 'https://drive.google.com/drive/folders/1PLrV10rRVrtBIA5MCooWyiEMCwwdPA-W',
    portions: [
      { id: '1LW3UZKaXTEg0gXLcSdWDqH53TW-X-A4x', title: '1-חיי שרה - ראשון.aac', aliyah: 'עליית ראשון', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1LW3UZKaXTEg0gXLcSdWDqH53TW-X-A4x/view?usp=drivesdk' },
      { id: '1-tt0P2SwKEJ4h4KYuKZ3CnsoVXIYGnWT', title: '2-חיי שרה - שני.aac', aliyah: 'עליית שני', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1-tt0P2SwKEJ4h4KYuKZ3CnsoVXIYGnWT/view?usp=drivesdk' },
      { id: '10H_ccVPwYI_vMxf0TRMWEh4C03btXh35', title: '3-חיי שרה - שלישי.aac', aliyah: 'עליית שלישי', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/10H_ccVPwYI_vMxf0TRMWEh4C03btXh35/view?usp=drivesdk' },
      { id: '1eWD05PnIXtrO9DMc0gkds8yQvDoKHn7I', title: '4-חיי שרה - רביעי.aac', aliyah: 'עליית רביעי', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1eWD05PnIXtrO9DMc0gkds8yQvDoKHn7I/view?usp=drivesdk' },
      { id: '13JnkjgDLUc40VhnS8RiIXkInOSKvHhTK', title: '5-חיי שרה - חמישי.aac', aliyah: 'עליית חמישי', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/13JnkjgDLUc40VhnS8RiIXkInOSKvHhTK/view?usp=drivesdk' },
      { id: '1J_0bMaP1MSUi1ynhweO3LjKo9J4e__LT', title: '6-חיי שרה - שישי.aac', aliyah: 'עליית שישי', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1J_0bMaP1MSUi1ynhweO3LjKo9J4e__LT/view?usp=drivesdk' },
      { id: '1vmcIqhb8fRZxZA2nqAOpOOEx_YtuNQaQ', title: '7-חיי שרה - שביעי.aac', aliyah: 'עליית שביעי', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1vmcIqhb8fRZxZA2nqAOpOOEx_YtuNQaQ/view?usp=drivesdk' },
      { id: '1rlFEBevZIgHIuInjCxlgy35Wy8CQo94S', title: 'חיי שרה - הפטרה.m4a', aliyah: 'הפטרה', category: 'haftarah', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/1rlFEBevZIgHIuInjCxlgy35Wy8CQo94S/view?usp=drivesdk' },
    ],
  },
  {
    id: 'itai',
    name: 'איתי נקלר (ויינברג)',
    parasha: 'תולדות',
    haftarah: 'תולדות',
    barMitzvahDate: '2026-11-07',
    parashaVerses: 106,
    skippedVerses: 106,
    learnedParashaVerses: 13,
    haftarahVerses: 21,
    learnedHaftarahVerses: 0,
    driveFolderUrl: 'https://drive.google.com/drive/folders/0B6cVWsWs-t94cXFCaE1iRmZjQm8?resourcekey=0-8tYiOdvUZl2i8tqYt2NBFg',
    portions: [
      { id: '0B6cVWsWs-t94MEdURjU0TEE4VW8', title: 'תולדות - ראשון.aac', aliyah: 'עליית ראשון', category: 'shabbat', ext: 'aac', resourceKey: '0-5PM9swB6RRGXu2s1TDLtJw', visible: true, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94MEdURjU0TEE4VW8/view?usp=drivesdk&resourcekey=0-5PM9swB6RRGXu2s1TDLtJw' },
      { id: '0B6cVWsWs-t94NGxIS19JOEowdW8', title: 'תולדות - שני.aac', aliyah: 'עליית שני', category: 'shabbat', ext: 'aac', resourceKey: '0-Pqp2w2VsrPzGwpqPTdsNXA', visible: false, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94NGxIS19JOEowdW8/view?usp=drivesdk&resourcekey=0-Pqp2w2VsrPzGwpqPTdsNXA' },
      { id: '0B6cVWsWs-t94bllGQ2Z1QmpLeEk', title: 'תולדות - שלישי.aac', aliyah: 'עליית שלישי', category: 'shabbat', ext: 'aac', resourceKey: '0-CWmnyrSbPsqXxKFckzgjcg', visible: false, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94bllGQ2Z1QmpLeEk/view?usp=drivesdk&resourcekey=0-CWmnyrSbPsqXxKFckzgjcg' },
      { id: '0B6cVWsWs-t94bUcxMDh2X3JBRGM', title: 'תולדות - רביעי.aac', aliyah: 'עליית רביעי', category: 'shabbat', ext: 'aac', resourceKey: '0-ppfN4Ebo00mnQzn7_MVHyw', visible: false, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94bUcxMDh2X3JBRGM/view?usp=drivesdk&resourcekey=0-ppfN4Ebo00mnQzn7_MVHyw' },
      { id: '0B6cVWsWs-t94RzV1VzBxQmtBSDQ', title: 'תולדות - חמישי.aac', aliyah: 'עליית חמישי', category: 'shabbat', ext: 'aac', resourceKey: '0-hknMRXmuCzlLJyrCJPNKMA', visible: false, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94RzV1VzBxQmtBSDQ/view?usp=drivesdk&resourcekey=0-hknMRXmuCzlLJyrCJPNKMA' },
      { id: '0B6cVWsWs-t94dGk0eFltTjRvRlE', title: 'תולדות - שישי.aac', aliyah: 'עליית שישי', category: 'shabbat', ext: 'aac', resourceKey: '0-hgexrDvV2lKMZ_K-A7ZX5Q', visible: false, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94dGk0eFltTjRvRlE/view?usp=drivesdk&resourcekey=0-hgexrDvV2lKMZ_K-A7ZX5Q' },
      { id: '0B6cVWsWs-t94TFZETW5fNTZtV3M', title: 'תולדות - שביעי.aac', aliyah: 'עליית שביעי', category: 'shabbat', ext: 'aac', resourceKey: '0-41PLR4O2hIrev6FhAFlEKg', visible: true, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94TFZETW5fNTZtV3M/view?usp=drivesdk&resourcekey=0-41PLR4O2hIrev6FhAFlEKg' },
    ],
  },
  {
    id: 'mila',
    name: 'מילה בן-ארי',
    parasha: 'ויצא',
    haftarah: 'ויצא',
    barMitzvahDate: '2026-11-21',
    parashaVerses: 148,
    skippedVerses: 100,
    learnedParashaVerses: 69,
    haftarahVerses: 28,
    learnedHaftarahVerses: 0,
    driveFolderUrl: 'https://drive.google.com/drive/folders/1X-cwMo2op6aAcjH-YuD7i4zRZ2h1aP5r',
    portions: [
      { id: '1UlZzy-yFL_7XSV0QcVTXhNJfDkuAGocl', title: 'ויצא - ראשון.aac', aliyah: 'עליית ראשון', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1UlZzy-yFL_7XSV0QcVTXhNJfDkuAGocl/view?usp=drivesdk' },
      { id: '1lgP8IdGbvLAel3VQjVAMlTPyUc1999Wq', title: 'ויצא - שני.m4a', aliyah: 'עליית שני', category: 'shabbat', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/1lgP8IdGbvLAel3VQjVAMlTPyUc1999Wq/view?usp=drivesdk' },
      { id: '1eMtCP38L1_JHbv38oiHTmB3tT8ILUg3s', title: 'ויצא - שלישי.m4a', aliyah: 'עליית שלישי', category: 'shabbat', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/1eMtCP38L1_JHbv38oiHTmB3tT8ILUg3s/view?usp=drivesdk' },
      { id: '1-cP8ubkgu7ULySJQZzN7tFkfKkxxCi-t', title: 'ויצא - רביעי.m4a', aliyah: 'עליית רביעי', category: 'shabbat', ext: 'm4a', visible: false, viewUrl: 'https://drive.google.com/file/d/1-cP8ubkgu7ULySJQZzN7tFkfKkxxCi-t/view?usp=drivesdk' },
      { id: '1JGP7uJtzbq3am0XHXqZxiEeitANV1j1c', title: 'ויצא - שביעי.m4a', aliyah: 'עליית שביעי', category: 'shabbat', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/1JGP7uJtzbq3am0XHXqZxiEeitANV1j1c/view?usp=drivesdk' },
    ],
  },
  {
    id: 'boaz',
    name: 'בועז תומסיס',
    parasha: 'שמות',
    haftarah: 'שמות א',
    barMitzvahDate: '2027-01-02',
    parashaVerses: 124,
    skippedVerses: 107,
    learnedParashaVerses: 11,
    haftarahVerses: 23,
    learnedHaftarahVerses: 0,
    driveFolderUrl: 'https://drive.google.com/drive/folders/1BJfZo9E2T5b4W8sajosOlWhRfAC0u9Vq',
    portions: [
      { id: '1fEzFpkJ2f6W0bF1ZCHszKekz3np4cdk-', title: 'שמות - כהן.m4a', aliyah: 'כהן (חול/מנחה)', category: 'chol', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/1fEzFpkJ2f6W0bF1ZCHszKekz3np4cdk-/view?usp=drivesdk' },
      { id: '1DuSPNNngZEbQ8gVMP00KpS7yGsfe1LWY', title: 'שמות - לוי.m4a', aliyah: 'לוי (חול/מנחה)', category: 'chol', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/1DuSPNNngZEbQ8gVMP00KpS7yGsfe1LWY/view?usp=drivesdk' },
      { id: '15fUjiON7mPAKK3xZQRzEFwXvRQCWVBPB', title: 'שמות - ישראל.m4a', aliyah: 'ישראל (חול/מנחה)', category: 'chol', ext: 'm4a', visible: true, viewUrl: 'https://drive.google.com/file/d/15fUjiON7mPAKK3xZQRzEFwXvRQCWVBPB/view?usp=drivesdk' },
      { id: '1_qotEIKp9pINyCECWKbzVNtI94Qcz4at', title: 'שמות - ראשון.aac', aliyah: 'עליית ראשון', category: 'shabbat', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1_qotEIKp9pINyCECWKbzVNtI94Qcz4at/view?usp=drivesdk' },
      { id: '14AAfilTb3yBaBPAkARdaz9uDVZ1SlbHQ', title: 'שמות - שני.aac', aliyah: 'עליית שני', category: 'shabbat', ext: 'aac', visible: false, viewUrl: 'https://drive.google.com/file/d/14AAfilTb3yBaBPAkARdaz9uDVZ1SlbHQ/view?usp=drivesdk' },
      { id: '1vT2QO6ETREsdlbkiBc4Ckhq5SXkSsCpe', title: 'שמות - שלישי.aac', aliyah: 'עליית שלישי', category: 'shabbat', ext: 'aac', visible: false, viewUrl: 'https://drive.google.com/file/d/1vT2QO6ETREsdlbkiBc4Ckhq5SXkSsCpe/view?usp=drivesdk' },
      { id: '1LSntcQO1k97wOCfcg5IrMR7vsQYHi-re', title: 'שמות - רביעי.aac', aliyah: 'עליית רביעי', category: 'shabbat', ext: 'aac', visible: false, viewUrl: 'https://drive.google.com/file/d/1LSntcQO1k97wOCfcg5IrMR7vsQYHi-re/view?usp=drivesdk' },
      { id: '1wBDeBJ8Ch9ynJx0xYUkwxgD0M1rB3CCX', title: 'שמות - חמישי.aac', aliyah: 'עליית חמישי', category: 'shabbat', ext: 'aac', visible: false, viewUrl: 'https://drive.google.com/file/d/1wBDeBJ8Ch9ynJx0xYUkwxgD0M1rB3CCX/view?usp=drivesdk' },
      { id: '1F0v9TvEwRAojrz0KMLjVeQxicnz1529Q', title: 'שמות - שישי.aac', aliyah: 'עליית שישי', category: 'shabbat', ext: 'aac', visible: false, viewUrl: 'https://drive.google.com/file/d/1F0v9TvEwRAojrz0KMLjVeQxicnz1529Q/view?usp=drivesdk' },
      { id: '1PtL-x8sctjHuh83ODdd6GS4f6-Cje5Yp', title: 'שמות - שביעי.aac', aliyah: 'עליית שביעי', category: 'shabbat', ext: 'aac', visible: false, viewUrl: 'https://drive.google.com/file/d/1PtL-x8sctjHuh83ODdd6GS4f6-Cje5Yp/view?usp=drivesdk' },
      { id: '1L2FcQLm4WcVsFrkyY7FroVa2QYiK4A3h', title: 'שמות - הפטרה.aac', aliyah: 'הפטרה', category: 'haftarah', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1L2FcQLm4WcVsFrkyY7FroVa2QYiK4A3h/view?usp=drivesdk' },
    ],
  },
  {
    id: 'brown',
    name: 'אילן בראון',
    parasha: 'משפטים',
    haftarah: 'מחר חודש',
    barMitzvahDate: '2027-02-06',
    parashaVerses: 118,
    skippedVerses: 43,
    learnedParashaVerses: 72,
    haftarahVerses: 25,
    learnedHaftarahVerses: 0,
    driveFolderUrl: 'https://drive.google.com/drive/folders/1b-AJBOdGQWctrDdHHWMVMd0EMbJLiNzl',
    portions: [
      { id: '1b2g7twQh5rxdw8ynweg7VKmb1WZkdZUq', title: 'משפטים - ראשון חול.aac', aliyah: 'ראשון חול (כהן)', category: 'chol', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1b2g7twQh5rxdw8ynweg7VKmb1WZkdZUq/view?usp=drivesdk' },
      { id: '1b3tBgHMfpCsHYimA9KiP1FttgtXZsb3p', title: 'משפטים - שני חול.aac', aliyah: 'שני חול (לוי)', category: 'chol', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1b3tBgHMfpCsHYimA9KiP1FttgtXZsb3p/view?usp=drivesdk' },
      { id: '1b1FkhuTpq7ZFwosMvfLwpaLuUseHolO6', title: 'משפטים - שלישי חול.aac', aliyah: 'שלישי חול (ישראל)', category: 'chol', ext: 'aac', visible: true, viewUrl: 'https://drive.google.com/file/d/1b1FkhuTpq7ZFwosMvfLwpaLuUseHolO6/view?usp=drivesdk' },
      { id: '0B6cVWsWs-t94S1BzT0JDV3NmTEk', title: 'מחר חודש - הפטרה.aac', aliyah: 'הפטרת מחר חודש', category: 'haftarah', ext: 'aac', resourceKey: '0-mTgOhq4c62xr7vZe3FBrNw', visible: true, viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94S1BzT0JDV3NmTEk/view?usp=drivesdk&resourcekey=0-mTgOhq4c62xr7vZe3FBrNw' },
    ],
  },
  {
    id: 'gelbert',
    name: 'יאיר גלברט',
    parasha: 'תזריע',
    haftarah: 'תזריע',
    barMitzvahDate: '2027-04-10',
    parashaVerses: 67,
    skippedVerses: 0,
    learnedParashaVerses: 0,
    haftarahVerses: 22,
    learnedHaftarahVerses: 0,
    portions: [],
  },
  {
    id: 'maayan',
    name: 'מעיין שפילר',
    parasha: 'בהעלותך',
    haftarah: 'בהעלותך',
    barMitzvahDate: '2027-06-19',
    parashaVerses: 136,
    skippedVerses: 115,
    learnedParashaVerses: 0,
    haftarahVerses: 22,
    learnedHaftarahVerses: 0,
    portions: [],
  },
];
