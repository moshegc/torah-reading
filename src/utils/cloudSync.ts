import type { StudentProfile, RecordingItem, LibraryChange } from '../types';

const DEFAULT_GAS_WEBAPP_URL =
  (import.meta as any).env?.VITE_GAS_WEBAPP_URL || '';
import { classifyFileTitle } from './trackerCalculations';
import type { HaftarahTradition } from './readingPlan';

export const STORAGE_KEY_GAS_URL = 'torah_trainer_gas_webapp_url';
export const STORAGE_KEY_TEACHER_SESSION = 'torah_trainer_r2_teacher_session_v1';

function cloudRequestError(message: unknown, fallback: string): Error {
  if (typeof message === 'string' && /r2|cloudflare/i.test(message)) {
    console.error('Storage request failed:', message);
    return new Error(fallback);
  }
  return new Error(typeof message === 'string' && message ? message : fallback);
}

export interface TeacherProfile {
  teacherId: string;
  displayName: string;
  email?: string;
}

export interface TeacherSession {
  teacher: TeacherProfile;
  token: string;
}

export interface TeacherSettings {
  /** Haftarah tradition used for students that have no override of their own */
  defaultHaftarahTradition?: HaftarahTradition;
}

export interface CloudAppData {
  students: StudentProfile[];
  haftarotMap: Record<string, number>;
  parashaLibrary?: Record<string, RecordingItem[]>;
  settings?: TeacherSettings;
  pendingMediaDeletes?: string[];
  updatedAt: string;
}

export class LibraryMutationError extends Error {
  constructor(message: string, public readonly data?: CloudAppData) {
    super(message);
    this.name = 'LibraryMutationError';
  }
}

export async function changeTeacherLibrary(token: string, change: LibraryChange): Promise<CloudAppData> {
  const res = await fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(change),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    const error = cloudRequestError(json.error, 'השינוי במאגר לא נשמר');
    throw new LibraryMutationError(error.message, json.data);
  }
  if (!json.data || !Array.isArray(json.data.students) ||
      !json.data.parashaLibrary || typeof json.data.parashaLibrary !== 'object' ||
      Array.isArray(json.data.parashaLibrary)) {
    throw new LibraryMutationError('השרת החזיר נתוני מאגר לא תקינים');
  }
  return json.data;
}

export function loadTeacherSession(): TeacherSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TEACHER_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.teacher?.teacherId && parsed?.token) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveTeacherSession(session: TeacherSession | null) {
  try {
    if (!session) {
      localStorage.removeItem(STORAGE_KEY_TEACHER_SESSION);
    } else {
      localStorage.setItem(STORAGE_KEY_TEACHER_SESSION, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

export async function registerTeacherR2(params: {
  username: string;
  email?: string;
  password: string;
  displayName?: string;
  initialData?: { students: StudentProfile[]; haftarotMap: Record<string, number> };
}): Promise<{
  session: TeacherSession;
  data: CloudAppData | null;
  r2Configured: boolean;
}> {
  const res = await fetch('/api/r2-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      ...params,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw cloudRequestError(json.error, 'שגיאה ביצירת חשבון מורה');
  }
  return {
    session: { teacher: json.teacher, token: json.token },
    data: json.data || null,
    r2Configured: Boolean(json.r2Configured),
  };
}

export async function loginTeacherR2(params: {
  identifier: string;
  password: string;
}): Promise<{
  session: TeacherSession;
  data: CloudAppData | null;
  r2Configured: boolean;
}> {
  const res = await fetch('/api/r2-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'login',
      ...params,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw cloudRequestError(json.error, 'שם משתמש או סיסמה שגויים');
  }
  return {
    session: { teacher: json.teacher, token: json.token },
    data: json.data || null,
    r2Configured: Boolean(json.r2Configured),
  };
}

export async function googleAuthTeacherR2(params: {
  accessToken?: string;
  idToken?: string;
  preferredUsername?: string;
  initialData?: { students: StudentProfile[]; haftarotMap: Record<string, number> };
}): Promise<{
  session: TeacherSession;
  data: CloudAppData | null;
  r2Configured: boolean;
}> {
  const res = await fetch('/api/r2-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'google',
      ...params,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw cloudRequestError(json.error, 'התחברות באמצעות Google נכשלה');
  }
  return {
    session: { teacher: json.teacher, token: json.token },
    data: json.data || null,
    r2Configured: Boolean(json.r2Configured),
  };
}

export async function fetchR2TeacherData(teacherId: string): Promise<{
  initialized: boolean;
  data: CloudAppData | null;
  r2Configured: boolean;
}> {
  const res = await fetch(
    `/api/r2-data?teacher=${encodeURIComponent(teacherId)}&t=${Date.now()}`
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw cloudRequestError(json.error, 'שגיאה בטעינת נתוני המורה');
  }
  return {
    initialized: Boolean(json.initialized),
    data: json.data || null,
    r2Configured: Boolean(json.r2Configured),
  };
}

export async function fetchR2StudentData(
  teacherId: string,
  studentId: string
): Promise<{
  student: StudentProfile | null;
  parashaLibrary: Record<string, RecordingItem[]>;
  updatedAt: string | null;
}> {
  const res = await fetch(
    `/api/r2-data?teacher=${encodeURIComponent(teacherId)}&student=${encodeURIComponent(
      studentId
    )}&t=${Date.now()}`
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw cloudRequestError(json.error, 'שגיאה בטעינת נתוני התלמיד');
  }
  return {
    student: json.student || null,
    parashaLibrary: json.parashaLibrary || {},
    updatedAt: json.updatedAt || null,
  };
}

export async function saveR2TeacherData(params: {
  teacherId: string;
  token: string;
  students: StudentProfile[];
  haftarotMap: Record<string, number>;
  settings?: TeacherSettings;
  parashaLibrary?: Record<string, RecordingItem[]>;
}): Promise<{ updatedAt: string; storage: string; r2Configured: boolean }> {
  const res = await fetch('/api/r2-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      teacherId: params.teacherId,
      token: params.token,
      students: params.students,
      haftarotMap: params.haftarotMap,
      settings: params.settings,
      parashaLibrary: params.parashaLibrary,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw cloudRequestError(json.error, 'שגיאה בשמירת הנתונים');
  }
  return {
    updatedAt: json.updatedAt || new Date().toISOString(),
    storage: json.storage || 'r2',
    r2Configured: Boolean(json.r2Configured),
  };
}

export async function uploadLocalFileToR2(params: {
  teacherId: string;
  token: string;
  studentId: string;
  fileName: string;
  mimeType: string;
  ext: string;
  base64Data: string;
}): Promise<{
  id: string;
  r2Key: string;
  r2Url: string;
  viewUrl: string;
  name: string;
  ext: string;
}> {
  const res = await fetch('/api/r2-media', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw cloudRequestError(json.error, 'העלאת הקובץ נכשלה');
  }
  return {
    id: json.id,
    r2Key: json.r2Key,
    r2Url: json.r2Url,
    viewUrl: json.viewUrl,
    name: json.name,
    ext: json.ext,
  };
}

export async function transferDriveFilesToR2(params: {
  teacherId: string;
  token: string;
  studentId: string;
  folderId?: string;
  resourceKey?: string | null;
  fileId?: string;
  fileName?: string;
  ext?: string;
  files?: Array<{ id: string; name?: string; mimeType?: string; resourceKey?: string | null }>;
  oauthToken?: string;
}): Promise<RecordingItem[]> {
  const res = await fetch('/api/r2-transfer-drive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw cloudRequestError(json.error, 'שגיאה בייבוא קבצים מ-Google Drive');
  }

  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((item: any) => {
    const classified = classifyFileTitle(String(item.name || ''));
    return {
      id: item.id,
      title: String(item.name || '').trim() || classified.aliyah,
      aliyah: classified.aliyah,
      category: classified.category,
      ext: (item.ext || classified.ext || 'aac') as RecordingItem['ext'],
      r2Key: item.r2Key,
      r2Url: item.r2Url,
      viewUrl: item.viewUrl || item.r2Url,
      visible: true,
    };
  });
}

// Legacy exports kept for backward compatibility
export function getEffectiveGasUrl(): string {
  return DEFAULT_GAS_WEBAPP_URL.trim();
}
export const GOOGLE_APPS_SCRIPT_CODE = '';
export async function uploadAudioToDrive(): Promise<any> {
  throw new Error('Replaced by uploadLocalFileToR2');
}
