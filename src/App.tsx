import React, { useState, useEffect, useMemo } from 'react';
import { Lock, BookOpen, ShieldCheck, ArrowLeft } from 'lucide-react';
import {
  STUDENTS as INITIAL_STUDENTS,
  StudentProfile,
} from './data/driveCatalog';
import { decodeStudentShareToken } from './utils/trackerCalculations';
import { StudentView } from './components/StudentView';
import { TeacherView } from './components/TeacherView';

const STORAGE_KEY_STUDENTS = 'torah_trainer_students_v3';
const STORAGE_KEY_TEACHER_AUTH = 'torah_trainer_teacher_unlocked';
const DEFAULT_TEACHER_PIN = '1234';

export default function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const studentParam = urlParams.get('student');
  const cfgParam = urlParams.get('cfg');
  const teacherParam = urlParams.get('teacher');

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

  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_TEACHER_AUTH) === 'true';
  });

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showPinModal, setShowPinModal] = useState(Boolean(teacherParam && !isTeacherUnlocked));
  const [previewStudent, setPreviewStudent] = useState<StudentProfile | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
    } catch {
      // ignore quota errors
    }
  }, [students]);

  const handleUpdateStudent = (updated: StudentProfile) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleAddStudent = (created: StudentProfile) => {
    setStudents((prev) => [...prev, created]);
  };

  const handleDeleteStudent = (studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
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

    if (found && decodedToken) {
      return {
        ...found,
        ...Object.fromEntries(
          Object.entries(decodedToken).filter(([_, v]) => v !== undefined)
        ),
      } as StudentProfile;
    }

    if (found) return found;

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
