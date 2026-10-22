import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Lock,
  BookOpen,
  ShieldCheck,
  UserPlus,
  LogIn,
  Loader2,
  Cloud,
} from 'lucide-react';
import { HAFTAROT_VERSE_COUNTS as INITIAL_HAFTAROT } from './data/torahReference';
import type { StudentProfile, RecordingItem, LibraryChange } from './types';
import { decodeStudentShareToken } from './utils/trackerCalculations';
import {
  TeacherSession,
  loadTeacherSession,
  saveTeacherSession,
  loginTeacherR2,
  registerTeacherR2,
  googleAuthTeacherR2,
  fetchR2TeacherData,
  fetchR2StudentData,
  saveR2TeacherData,
  changeTeacherLibrary,
  LibraryMutationError,
} from './utils/cloudSync';
import type { CloudAppData, TeacherSettings } from './utils/cloudSync';
import type { HaftarahTradition } from './utils/readingPlan';
import {
  signInWithGooglePopup,
  getGoogleClientId,
  setGoogleClientId,
} from './utils/googleDrivePicker';
import { StudentView } from './components/StudentView';
import { TeacherView } from './components/TeacherView';
import { AboutLink, AboutPage } from './components/AboutPage';

const STORAGE_KEY_STUDENTS = 'torah_trainer_students_v3';
const STORAGE_KEY_HAFTAROT = 'torah_trainer_haftarot_v1';

export type DriveSyncStatus = 'unconfigured' | 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
  return new URLSearchParams(window.location.search).has('about') ? <AboutPage /> : <AppContent />;
}

function AppContent() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const studentParam = urlParams.get('student');
  const teacherParam = urlParams.get('teacher');
  const cfgParam = urlParams.get('cfg');

  const [teacherSession, setTeacherSession] = useState<TeacherSession | null>(() =>
    loadTeacherSession()
  );

  const [students, setStudents] = useState<StudentProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STUDENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [haftarotMap, setHaftarotMap] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HAFTAROT);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...INITIAL_HAFTAROT, ...parsed };
        }
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_HAFTAROT;
  });

  const [syncStatus, setSyncStatus] = useState<DriveSyncStatus>(() =>
    teacherSession ? 'idle' : 'unconfigured'
  );
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [previewStudent, setPreviewStudent] = useState<StudentProfile | null>(null);
  // Teacher-level settings (stored in the per-teacher JSON file)
  const [teacherSettings, setTeacherSettings] = useState<TeacherSettings>({});
  const [parashaLibrary, setParashaLibrary] = useState<Record<string, RecordingItem[]>>({});
  const [pendingMediaDeletes, setPendingMediaDeletes] = useState<string[]>([]);

  // Student share link state (?teacher=XXX&student=YYY)
  const [cloudStudent, setCloudStudent] = useState<StudentProfile | null>(null);
  const [cloudStudentLibrary, setCloudStudentLibrary] = useState<Record<string, RecordingItem[]>>({});
  const [isLoadingStudent, setIsLoadingStudent] = useState<boolean>(
    Boolean(studentParam && teacherParam)
  );

  // Auth form state (Landing page for teachers)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showGoogleClientModal, setShowGoogleClientModal] = useState(false);
  const [googleClientIdInput, setGoogleClientIdInput] = useState(() => getGoogleClientId());

  const studentsRef = useRef(students);
  studentsRef.current = students;
  const haftarotRef = useRef(haftarotMap);
  haftarotRef.current = haftarotMap;
  const settingsRef = useRef(teacherSettings);
  settingsRef.current = teacherSettings;
  const sessionRef = useRef(teacherSession);
  sessionRef.current = teacherSession;

  const applyTeacherData = useCallback((data: CloudAppData | null) => {
    setStudents(data?.students ?? []);
    setHaftarotMap({ ...INITIAL_HAFTAROT, ...data?.haftarotMap });
    setTeacherSettings(data?.settings ?? {});
    setParashaLibrary(data?.parashaLibrary ?? {});
    setPendingMediaDeletes(data?.pendingMediaDeletes ?? []);
    setLastSyncedAt(data?.updatedAt ?? null);
  }, []);

  // Save local cache whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
    } catch {
      // ignore quota errors
    }
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HAFTAROT, JSON.stringify(haftarotMap));
    } catch {
      // ignore quota errors
    }
  }, [haftarotMap]);

  // 1. If a student opens a share link (?teacher=XXX&student=YYY), fetch that student from R2
  useEffect(() => {
    if (!studentParam) return;
    let cancelled = false;

    async function loadStudentForShareLink() {
      if (teacherParam) {
        setIsLoadingStudent(true);
        try {
          const res = await fetchR2StudentData(teacherParam, studentParam!);
          if (!cancelled && res.student) {
            setCloudStudent(res.student);
            setCloudStudentLibrary(res.parashaLibrary);
            setIsLoadingStudent(false);
            return;
          }
        } catch {
          // fallback below
        }
        if (!cancelled) setIsLoadingStudent(false);
      }

      // Legacy fallback if link only has ?student=... without ?teacher=...
      try {
        const res = await fetch('/api/drive-data');
        if (res.ok) {
          const json = await res.json();
          if (
            !cancelled &&
            json.data &&
            Array.isArray(json.data.students) &&
            json.data.students.length > 0
          ) {
            const match = json.data.students.find(
              (s: StudentProfile) =>
                s.id.toLowerCase() === studentParam!.toLowerCase() ||
                s.name.trim() === studentParam!.trim()
            );
            if (match) setCloudStudent(match);
          }
        }
      } catch {
        // ignore
      }
    }

    loadStudentForShareLink();
    return () => {
      cancelled = true;
    };
  }, [studentParam, teacherParam]);

  // 2. When a teacher is logged in, load their latest data from R2 (`teachers/{teacherId}/data.json`)
  useEffect(() => {
    if (!teacherSession?.teacher?.teacherId || studentParam) return;
    let cancelled = false;

    async function loadTeacherFromR2() {
      try {
        const res = await fetchR2TeacherData(teacherSession!.teacher.teacherId);
        if (cancelled) return;
        applyTeacherData(res.data);
        if (res.initialized && res.data) {
          setSyncStatus('saved');
        }
      } catch {
        // Use cached data if offline
      }
    }

    loadTeacherFromR2();
    return () => {
      cancelled = true;
    };
  }, [teacherSession?.teacher?.teacherId, studentParam, applyTeacherData]);

  // Sync teacher data to Cloudflare R2
  const syncToR2 = useCallback(
    async (
      nextStudents: StudentProfile[],
      nextHaftarot: Record<string, number>
    ) => {
      const activeSession = sessionRef.current;
      if (!activeSession?.teacher?.teacherId || !activeSession?.token) {
        setSyncStatus('unconfigured');
        return false;
      }

      setSyncStatus('saving');
      setSyncErrorMessage(null);
      try {
        const result = await saveR2TeacherData({
          teacherId: activeSession.teacher.teacherId,
          token: activeSession.token,
          students: nextStudents,
          haftarotMap: nextHaftarot,
          settings: settingsRef.current,
        });
        setSyncStatus('saved');
        setLastSyncedAt(result.updatedAt);
        return true;
      } catch (err: any) {
        setSyncStatus('error');
        setSyncErrorMessage(err?.message || 'שגיאה בשמירת הנתונים');
        return false;
      }
    },
    []
  );

  const handleUpdateStudent = (updated: StudentProfile) => {
    const nextStudents = studentsRef.current.map((s) =>
      s.id === updated.id ? updated : s
    );
    setStudents(nextStudents);
    syncToR2(nextStudents, haftarotRef.current);
  };

  const handleAddStudent = (created: StudentProfile) => {
    const nextStudents = [...studentsRef.current, created];
    setStudents(nextStudents);
    syncToR2(nextStudents, haftarotRef.current);
  };

  const handleSetHaftarahLength = (name: string, verses: number) => {
    const clean = name.trim();
    if (!clean) return;
    const nextHaftarot = {
      ...haftarotRef.current,
      [clean]: verses,
    };
    const nextStudents = studentsRef.current.map((s) =>
      s.haftarah.trim() === clean ? { ...s, haftarahVerses: verses } : s
    );
    setHaftarotMap(nextHaftarot);
    setStudents(nextStudents);
    syncToR2(nextStudents, nextHaftarot);
  };

  const handleSetDefaultHaftarahTradition = (tradition: HaftarahTradition) => {
    const next: TeacherSettings = { ...settingsRef.current, defaultHaftarahTradition: tradition };
    settingsRef.current = next;
    setTeacherSettings(next);
    syncToR2(studentsRef.current, haftarotRef.current);
  };

  const handleChangeLibrary = async (change: LibraryChange): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session?.token) {
      setSyncStatus('error');
      setSyncErrorMessage('יש להתחבר מחדש לחשבון המורה');
      return false;
    }
    setSyncStatus('saving');
    setSyncErrorMessage(null);
    try {
      const data = await changeTeacherLibrary(session.token, change);
      applyTeacherData(data);
      setSyncStatus('saved');
      return true;
    } catch (error) {
      if (error instanceof LibraryMutationError && error.data) applyTeacherData(error.data);
      setSyncStatus('error');
      setSyncErrorMessage(error instanceof Error ? error.message : 'השינוי במאגר לא נשמר');
      return false;
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await loginTeacherR2({
        identifier: loginIdentifier,
        password: loginPassword,
      });
      saveTeacherSession(result.session);
      setTeacherSession(result.session);
      applyTeacherData(result.data);
      setSyncStatus('saved');
      setLoginPassword('');
    } catch (err: any) {
      setAuthError(err?.message || 'שגיאה בהתחברות');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await registerTeacherR2({
        username: regUsername,
        displayName: regDisplayName || regUsername,
        email: regEmail,
        password: regPassword,
        initialData: {
          students: [],
          haftarotMap: INITIAL_HAFTAROT,
        },
      });
      saveTeacherSession(result.session);
      setTeacherSession(result.session);
      applyTeacherData(result.data);
      setSyncStatus('saved');
      setRegPassword('');
    } catch (err: any) {
      setAuthError(err?.message || 'שגיאה בהרשמה');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async (overrideClientId?: string) => {
    setAuthError(null);
    if (!overrideClientId && !getGoogleClientId()) {
      setShowGoogleClientModal(true);
      return;
    }
    setAuthLoading(true);
    try {
      const accessToken = await signInWithGooglePopup(overrideClientId);
      const result = await googleAuthTeacherR2({
        accessToken,
        preferredUsername: regUsername || undefined,
        initialData: {
          students: [],
          haftarotMap: INITIAL_HAFTAROT,
        },
      });
      saveTeacherSession(result.session);
      setTeacherSession(result.session);
      applyTeacherData(result.data);
      setSyncStatus('saved');
    } catch (err: any) {
      if (err?.message === 'MISSING_GOOGLE_CLIENT_ID') {
        setShowGoogleClientModal(true);
      } else {
        setAuthError(err?.message || 'התחברות באמצעות Google נכשלה');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    saveTeacherSession(null);
    setTeacherSession(null);
    applyTeacherData(null);
    setSyncStatus('unconfigured');
    setPreviewStudent(null);
  };

  // Resolve student from URL (?teacher=XXX&student=YYY)
  const activeStudentFromUrl = useMemo(() => {
    if (!studentParam) return null;
    if (cloudStudent) return cloudStudent;

    const decodedToken = cfgParam ? decodeStudentShareToken(cfgParam) : null;
    const found = students.find(
      (s) =>
        s.id.toLowerCase() === studentParam.toLowerCase() ||
        s.name.trim() === studentParam.trim()
    );

    if (found) {
      if (
        decodedToken &&
        (!found.portions || found.portions.length === 0) &&
        decodedToken.portions?.length
      ) {
        return {
          ...found,
          ...Object.fromEntries(
            Object.entries(decodedToken).filter(([_, v]) => v !== undefined)
          ),
        } as StudentProfile;
      }
      return found;
    }

    if (decodedToken && decodedToken.name && decodedToken.parasha) {
      return {
        id: decodedToken.id || studentParam,
        name: decodedToken.name,
        parasha: decodedToken.parasha,
        haftarah: decodedToken.haftarah || decodedToken.parasha,
        barMitzvahDate: decodedToken.barMitzvahDate || '2027-01-01',
        parashaVerses: decodedToken.parashaVerses ?? 100,
        skippedVerses: decodedToken.skippedVerses ?? 0,
        learnedParashaVerses: decodedToken.learnedParashaVerses ?? 0,
        haftarahVerses: decodedToken.haftarahVerses ?? 22,
        learnedHaftarahVerses: decodedToken.learnedHaftarahVerses ?? 0,
        portions: decodedToken.portions || [],
      };
    }

    return null;
  }, [studentParam, cfgParam, students, cloudStudent]);

  // Teacher previewing a student screen
  if (previewStudent) {
    const livePreviewStudent =
      students.find((s) => s.id === previewStudent.id) || previewStudent;
    return (
      <StudentView
        student={livePreviewStudent}
        parashaLibrary={parashaLibrary}
        isTeacherPreview
        onExitPreview={() => setPreviewStudent(null)}
      />
    );
  }

  // Student share link view (?teacher=XXX&student=YYY)
  if (studentParam) {
    if (isLoadingStudent && !activeStudentFromUrl) {
      return (
        <div
          className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6"
          dir="rtl"
        >
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-300">טוען את אזור הלמידה האישי...</p>
        </div>
      );
    }

    if (activeStudentFromUrl) {
      return (
        <div className="relative">
          <StudentView student={activeStudentFromUrl} parashaLibrary={cloudStudentLibrary} />
          <div className="fixed top-3 left-3 z-30">
            <button
              type="button"
              onClick={() => {
                window.location.href = window.location.pathname;
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition"
              title="כניסת מורה"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }
  }

  // Logged-in Teacher Dashboard
  if (teacherSession) {
    return (
      <TeacherView
        teacherId={teacherSession.teacher.teacherId}
        teacherDisplayName={teacherSession.teacher.displayName}
        teacherToken={teacherSession.token}
        students={students}
        haftarotMap={haftarotMap}
        parashaLibrary={parashaLibrary}
        onChangeLibrary={handleChangeLibrary}
        pendingDeletionCount={pendingMediaDeletes.length}
        defaultHaftarahTradition={teacherSettings.defaultHaftarahTradition ?? 'ashkenazi'}
        onSetDefaultHaftarahTradition={handleSetDefaultHaftarahTradition}
        syncStatus={syncStatus}
        syncErrorMessage={syncErrorMessage}
        lastSyncedAt={lastSyncedAt}
        onForceSync={() => syncToR2(students, haftarotMap)}
        onLogout={handleLogout}
        onSetHaftarahLength={handleSetHaftarahLength}
        onUpdateStudent={handleUpdateStudent}
        onAddStudent={handleAddStudent}
        onPreviewStudent={(st) => setPreviewStudent(st)}
      />
    );
  }

  // Landing Page: Teacher Login / Sign-up Only
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white flex flex-col justify-center p-5"
      dir="rtl"
    >
      <div className="max-w-md w-full mx-auto">
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300 flex items-center justify-center mx-auto mb-3 shadow-lg">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            מערכת מורים – קריאה בתורה והפטרה
          </h1>          
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xs">
          {/* Tabs: Login / Register */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-900/80 p-1 rounded-2xl mb-5 border border-white/10">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setAuthError(null);
              }}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                authTab === 'login'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>התחברות מורה</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setAuthError(null);
              }}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                authTab === 'register'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>הרשמת מורה חדש</span>
            </button>
          </div>

          {authTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  שם משתמש (מזהה מורה) או אימייל
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="לדוגמה: michael או email@example.com"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  סיסמה
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400"
                  dir="ltr"
                />
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 font-semibold">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition shadow-md"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>התחבר לחשבון מורה</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  מזהה מורה לקישורי תלמידים (באנגלית, ללא רווחים) *
                </label>
                <input
                  type="text"
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="לדוגמה: michael"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400"
                  dir="ltr"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  יופיע בקישור התלמיד: <code dir="ltr">?teacher={regUsername || 'name'}&amp;student=...</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  שם תצוגה של המורה
                </label>
                <input
                  type="text"
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                  placeholder="לדוגמה: הרב מיכאל"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  כתובת אימייל (אופציונלי – להתחברות גם עם אימייל)
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="teacher@example.com"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  סיסמה (לפחות 4 תווים) *
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-400"
                  dir="ltr"
                />
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 font-semibold">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition shadow-md"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                <span>צור חשבון מורה</span>
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-slate-900 px-3 text-slate-400">או</span>
            </div>
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            disabled={authLoading}
            onClick={() => handleGoogleSignIn()}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-extrabold flex items-center justify-center gap-2.5 transition shadow-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>המשך באמצעות חשבון Google</span>
          </button>
        </div>
      </div>

      <div className="text-center mt-5">
        <AboutLink />
      </div>

      {/* Modal to configure Google Client ID if not set in env */}
      {showGoogleClientModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3">
            <h3 className="font-extrabold text-base text-white">
              הגדרת Google OAuth Client ID
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              כדי לאפשר התחברות עם Google ובחירת קבצים ישירה מ-Google Drive, הזן את ה-Client ID שלך מ-Google Cloud Console (או הגדר <code className="text-indigo-300">VITE_GOOGLE_CLIENT_ID</code> בקובץ הסביבה):
            </p>
            <input
              type="text"
              value={googleClientIdInput}
              onChange={(e) => setGoogleClientIdInput(e.target.value)}
              placeholder="xxxx-xxxx.apps.googleusercontent.com"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white font-mono"
              dir="ltr"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGoogleClientModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-slate-300 text-xs font-bold"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => {
                  const clean = googleClientIdInput.trim();
                  setGoogleClientId(clean);
                  setShowGoogleClientModal(false);
                  if (clean) {
                    handleGoogleSignIn(clean);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                שמור והתחבר
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
