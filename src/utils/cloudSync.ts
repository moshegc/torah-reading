import { StudentProfile, RecordingItem, DEFAULT_GAS_WEBAPP_URL } from '../data/driveCatalog';
import { classifyFileTitle } from './trackerCalculations';
import type { HaftarahTradition } from './readingPlan';

export const STORAGE_KEY_GAS_URL = 'torah_trainer_gas_webapp_url';
export const STORAGE_KEY_TEACHER_SESSION = 'torah_trainer_r2_teacher_session_v1';

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
  updatedAt: string;
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
    throw new Error(json.error || 'שגיאה ביצירת חשבון מורה');
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
    throw new Error(json.error || 'שם משתמש או סיסמה שגויים');
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
    throw new Error(json.error || 'התחברות באמצעות Google נכשלה');
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
    throw new Error(json.error || 'Failed to load teacher data from R2');
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
    throw new Error(json.error || 'Failed to load student data from R2');
  }
  return {
    student: json.student || null,
    updatedAt: json.updatedAt || null,
  };
}

export async function saveR2TeacherData(params: {
  teacherId: string;
  token: string;
  students: StudentProfile[];
  haftarotMap: Record<string, number>;
  settings?: TeacherSettings;
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
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'שגיאה בשמירת הנתונים לענן R2');
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
    throw new Error(json.error || 'העלאת הקובץ לענן R2 נכשלה');
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
    throw new Error(json.error || 'שגיאה בהעברת קבצים מ-Google Drive אל ענן R2');
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
