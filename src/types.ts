import type { ReadingPlan, HaftarahTradition } from './utils/readingPlan';


export type RecordingSection = 'torah' | 'haftarah' | 'general';

export interface RecordingNormalization {
  version: 1 | 2;
  integratedLufs: number;
  truePeakDbtp: number;
  gainDb: number;
  targetLufs?: number;
  leveling?: {
    duration: number;
    points: { time: number; gainDb: number }[];
    integratedLufs: number;
    truePeakDbtp: number;
  };
}

export interface RecordingItem {
  id: string;
  title: string;
  aliyah: string;
  category: 'shabbat' | 'chol' | 'haftarah' | 'blessings' | 'doc';
  section?: RecordingSection;
  ext: 'm4a' | 'aac' | 'mp3' | 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp';
  resourceKey?: string | null;
  viewUrl: string;
  localUrl?: string; // Bundled static file path in /docs/...
  visible?: boolean; // For student-specific portions: whether the student can see it
  customAudioDataUrl?: string;
  r2Key?: string; // Cloudflare R2 object key (e.g. media/{teacherId}/{studentId}/...)
  r2Url?: string; // Direct R2 stream URL
  normalization?: RecordingNormalization;
  normalizationKey?: string;
}

export interface ParashaMeta {
  order: number;
  name: string;
  book: 'בראשית' | 'שמות' | 'ויקרא' | 'במדבר' | 'דברים';
  verses: number;
}

export type LibraryChange =
  | { action: 'recalculate-normalization-target'; folder: string }
  | { action: 'set-item-normalization'; folder: string; itemId: string; r2Key?: string; normalization: RecordingNormalization }
  | { action: 'create-folder' | 'delete-folder'; folder: string }
  | { action: 'add-item'; folder: string; item: RecordingItem }
  | { action: 'replace-item'; folder: string; itemId: string; item: RecordingItem }
  | { action: 'delete-item'; folder: string; itemId: string }
  | { action: 'rename-folder'; folder: string; name: string }
  | { action: 'rename-item'; folder: string; itemId: string; name: string }
  | { action: 'set-item-section'; folder: string; itemId: string; section: RecordingSection }
  | { action: 'move-item'; folder: string; itemId: string; destination: string }
  | { action: 'add-student-items'; folder: string; studentId: string; items: RecordingItem[]; driveFolderUrl?: string }
  | { action: 'retry-deletions' };

export interface StudentProfile {
  id: string;
  name: string;
  archived?: boolean;
  parasha: string;
  haftarah: string;
  barMitzvahDate: string; // YYYY-MM-DD
  studyStartDate?: string; // YYYY-MM-DD; absent means use the calculated suggestion
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
  studyStartDate: string;
  totalStudyWeeks: number; // שבועות לימוד כולל = ROUNDUP(J / 5, 0) + 8
  totalStudyMonths: number; // חודשי לימוד = ROUNDUP((J / 5) / 4, 0) + 2
  progressPercent: number;
}
