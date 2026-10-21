import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Lock, BookOpen, ShieldCheck, ArrowLeft } from 'lucide-react';
import {
  STUDENTS as INITIAL_STUDENTS,
  HAFTAROT_VERSE_COUNTS as INITIAL_HAFTAROT,
  DEFAULT_GAS_WEBAPP_URL,
  StudentProfile,
} from './data/driveCatalog';
import { decodeStudentShareToken } from './utils/trackerCalculations';
import { fetchCloudAppData, saveCloudAppData } from './utils/cloudSync';
import { StudentView } from './components/StudentView';
import { TeacherView } from './components/TeacherView';

const STORAGE_KEY_STUDENTS = 'torah_trainer_students_v3';
const STORAGE_KEY_HAFTAROT = 'torah_trainer_haftarot_v1';
const STORAGE_KEY_TEACHER_AUTH = 'torah_trainer_teacher_unlocked';
const STORAGE_KEY_GAS_URL = 'torah_trainer_gas_url_v1';
const DEFAULT_TEACHER_PIN = '1234';

export type DriveSyncStatus = 'unconfigured' | 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const studentParam = urlParams.get('student');
  const cfgParam = urlParams.get('cfg');
  const teacherParam = urlParams.get('teacher');

  const [gasUrl, setGasUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_GAS_URL) || DEFAULT_GAS_WEBAPP_URL || '';
    } catch {
      return DEFAULT_GAS_WEBAPP_URL || '';
    }
  });

  const [students, setStudents] = useState<StudentProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STUDENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_STUDENTS;
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
    gasUrl ? 'idle' : 'unconfigured'
  );
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_TEACHER_AUTH) === 'true';
  });

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showPinModal, setShowPinModal] = useState(Boolean(teacherParam && !isTeacherUnlocked));
  const [previewStudent, setPreviewStudent] = useState<StudentProfile | null>(null);

  const studentsRef = useRef(students);
  studentsRef.current = students;
  const haftarotRef = useRef(haftarotMap);
  haftarotRef.current = haftarotMap;
  const gasUrlRef = useRef(gasUrl);
  gasUrlRef.current = gasUrl;

  // Save to localStorage whenever state changes
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

  // On startup, load latest data from Google Drive (via GAS Web App or public Drive folder `/api/drive-data`)
  useEffect(() => {
    let cancelled = false;
    async function loadFromDrive() {
      try {
        // 1. If GAS URL is configured, try reading from it first
        if (gasUrlRef.current) {
          const cloudRes = await fetchCloudAppData(gasUrlRef.current);
          const cloudData = cloudRes.data;
          if (!cancelled && cloudData && Array.isArray(cloudData.students) && cloudData.students.length > 0) {
            setStudents(cloudData.students);
            if (cloudData.haftarotMap) {
              setHaftarotMap((prev) => ({ ...prev, ...cloudData.haftarotMap }));
            }
            setSyncStatus('saved');
            if (cloudData.updatedAt) setLastSyncedAt(cloudData.updatedAt);
            return;
          }
        }

        // 2. Fallback: read `torah-app-data.json` directly from the public Google Drive folder via `/api/drive-data`
        // This works for all students on any mobile phone without needing the GAS URL!
        const res = await fetch('/api/drive-data');
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.found && json.data && Array.isArray(json.data.students) && json.data.students.length > 0) {
            setStudents(json.data.students);
            if (json.data.haftarotMap) {
              setHaftarotMap((prev) => ({ ...prev, ...json.data.haftarotMap }));
            }
            if (json.data.updatedAt) setLastSyncedAt(json.data.updatedAt);
            if (gasUrlRef.current) setSyncStatus('saved');
          }
        }
      } catch {
        // Offline or not yet created in Drive - use local/initial data
      }
    }
    loadFromDrive();
    return () => {
      cancelled = true;
    };
  }, []);

  // Push updated data to Google Drive via Google Apps Script Web App
  const syncToDrive = useCallback(
    async (
      nextStudents: StudentProfile[],
      nextHaftarot: Record<string, number>,
      overrideGasUrl?: string
    ) => {
      const targetUrl = (overrideGasUrl ?? gasUrlRef.current).trim();
      if (!targetUrl) {
        setSyncStatus('unconfigured');
        return false;
      }

      setSyncStatus('saving');
      setSyncErrorMessage(null);
      try {
        const result = await saveCloudAppData(targetUrl, {
          students: nextStudents,
          haftarotMap: nextHaftarot,
        });
        setSyncStatus('saved');
        setLastSyncedAt(result.updatedAt);
        return true;
      } catch (err: any) {
        setSyncStatus('error');
        setSyncErrorMessage(err?.message || 'שגיאה בשמירה ל-Google Drive');
        return false;
      }
    },
    []
  );

  const handleSaveGasUrl = async (newUrl: string): Promise<boolean> => {
    const clean = newUrl.trim();
    setGasUrl(clean);
    gasUrlRef.current = clean;
    try {
      localStorage.setItem(STORAGE_KEY_GAS_URL, clean);
    } catch {
      // ignore
    }
    if (!clean) {
      setSyncStatus('unconfigured');
      return false;
    }
    return await syncToDrive(studentsRef.current, haftarotRef.current, clean);
  };

  const handleUpdateStudent = (updated: StudentProfile) => {
    const nextStudents = studentsRef.current.map((s) =>
      s.id === updated.id ? updated : s
    );
    setStudents(nextStudents);
    syncToDrive(nextStudents, haftarotRef.current);
  };

  const handleAddStudent = (created: StudentProfile) => {
    const nextStudents = [...studentsRef.current, created];
    setStudents(nextStudents);
    syncToDrive(nextStudents, haftarotRef.current);
  };

  const handleDeleteStudent = (studentId: string) => {
    const nextStudents = studentsRef.current.filter((s) => s.id !== studentId);
    setStudents(nextStudents);
    syncToDrive(nextStudents, haftarotRef.current);
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
    syncToDrive(nextStudents, nextHaftarot);
  };

  const handleDeleteHaftarahLength = (name: string) => {
    const nextHaftarot = { ...haftarotRef.current };
    delete nextHaftarot[name];
    setHaftarotMap(nextHaftarot);
    syncToDrive(studentsRef.current, nextHaftarot);
  };

  const handleUnlockTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === DEFAULT_TEACHER_PIN) {
      setIsTeacherUnlocked(true);
      localStorage.setItem(STORAGE_KEY_TEACHER_AUTH, 'true');
      setShowPinModal(false);
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  // Resolve student from URL (?student=boaz&cfg=...)
  const activeStudentFromUrl = useMemo(() => {
    if (!studentParam) return null;
    const decodedToken = cfgParam ? decodeStudentShareToken(cfgParam) : null;
    const found = students.find(
      (s) =>
        s.id.toLowerCase() === studentParam.toLowerCase() ||
        s.name.trim() === studentParam.trim()
    );

    if (found) {
      // If we have portions from cloud/state, prefer cloud state if it has portions, or merge with token
      if (decodedToken && (!found.portions || found.portions.length === 0) && decodedToken.portions?.length) {
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
  }, [studentParam, cfgParam, students]);

  if (previewStudent) {
    const livePreviewStudent =
      students.find((s) => s.id === previewStudent.id) || previewStudent;
    return (
      <StudentView
        student={livePreviewStudent}
        isTeacherPreview
        onExitPreview={() => setPreviewStudent(null)}
      />
    );
  }

  if (activeStudentFromUrl && !teacherParam) {
    return (
      <div className="relative">
        <StudentView student={activeStudentFromUrl} />
        <div className="fixed top-3 left-3 z-30">
          <button
            type="button"
            onClick={() => {
              if (isTeacherUnlocked) {
                window.history.pushState({}, '', window.location.pathname);
                window.location.reload();
              } else {
                setShowPinModal(true);
              }
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition"
            title="כניסת מורה"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>

        {showPinModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
            <form
              onSubmit={(e) => {
                handleUnlockTeacher(e);
                if (pinInput.trim() === DEFAULT_TEACHER_PIN) {
                  window.location.href = window.location.pathname;
                }
              }}
              className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl text-center"
            >
              <Lock className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
              <h3 className="font-extrabold text-lg text-slate-900 mb-1">כניסת מורה</h3>
              <p className="text-xs text-slate-500 mb-4">הזן קוד מורה לניהול התלמידים</p>
              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="קוד (1234)"
                className="w-full text-center text-lg font-bold tracking-widest border border-slate-300 rounded-xl py-2 mb-2"
                autoFocus
              />
              {pinError && (
                <p className="text-xs text-rose-600 font-semibold mb-2">קוד שגוי</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                >
                  כניסה
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (isTeacherUnlocked) {
    return (
      <TeacherView
        students={students}
        haftarotMap={haftarotMap}
        gasUrl={gasUrl}
        syncStatus={syncStatus}
        syncErrorMessage={syncErrorMessage}
        lastSyncedAt={lastSyncedAt}
        onSaveGasUrl={handleSaveGasUrl}
        onForceSync={() => syncToDrive(students, haftarotMap)}
        onSetHaftarahLength={handleSetHaftarahLength}
        onDeleteHaftarahLength={handleDeleteHaftarahLength}
        onUpdateStudent={handleUpdateStudent}
        onAddStudent={handleAddStudent}
        onDeleteStudent={handleDeleteStudent}
        onPreviewStudent={(st) => setPreviewStudent(st)}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white flex flex-col justify-between p-5"
      dir="rtl"
    >
      <div className="max-w-md w-full mx-auto pt-8 pb-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300 flex items-center justify-center mx-auto mb-3 shadow-lg">
            <BookOpen className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            קריאה בתורה והפטרה לבר מצווה
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            בחרו את שמכם לכניסה לאזור האישי או היכנסו כמורה
          </p>
        </div>

        <div className="space-y-2.5 mb-8">
          {students.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setPreviewStudent(st)}
              className="w-full text-right p-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 transition flex items-center justify-between gap-3 active:scale-[0.99]"
            >
              <div>
                <div className="font-bold text-base text-white">{st.name}</div>
                <div className="text-xs text-indigo-200 mt-0.5">
                  פרשת {st.parasha} • הפטרה: {st.haftarah}
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-indigo-300 shrink-0" />
            </button>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h2 className="font-bold text-sm">כניסת מורה (ניהול ומעקב תלמידים)</h2>
          </div>
          <form onSubmit={handleUnlockTeacher} className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="קוד מורה (1234)"
              className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-400"
            />
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 transition"
            >
              כניסה
            </button>
          </form>
          {pinError && (
            <p className="text-xs text-rose-400 mt-2">קוד שגוי (קוד ברירת מחדל: 1234)</p>
          )}
        </div>
      </div>
    </div>
  );
}
