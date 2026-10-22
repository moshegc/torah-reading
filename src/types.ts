import type { ReadingPlan, HaftarahTradition } from './utils/readingPlan';


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

export type LibraryChange =
  | { action: 'create-folder' | 'delete-folder'; folder: string }
  | { action: 'add-item'; folder: string; item: RecordingItem }
  | { action: 'replace-item'; folder: string; itemId: string; item: RecordingItem }
  | { action: 'delete-item'; folder: string; itemId: string }
  | { action: 'retry-deletions' };

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
  readingPlan?: ReadingPlan; // Which parts of the parasha the student is going to learn
  haftarahTradition?: HaftarahTradition; // Per-student override of the teacher's default tradition
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
