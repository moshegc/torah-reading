import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  ScrollText,
  Sparkles,
  Calendar,
  Clock,
  Play,
  Volume2,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  X,
  CheckCircle2,
  Sliders,
  Minus,
  Plus,
} from 'lucide-react';
import {
  StudentProfile,
  RecordingItem,
  GENERAL_AUDIO_ITEMS,
  GENERAL_DOC_ITEMS,
} from '../data/driveCatalog';
import {
  calculateStudentStats,
  formatDateIL,
  getMediaStreamUrl,
} from '../utils/trackerCalculations';
import {
  loadStudentPreferences,
  saveStudentPreferences,
  formatPitchLabel,
} from '../utils/studentPreferences';
import { AudioPlayerBar } from './AudioPlayerBar';
import { TorahTextViewer } from './TorahTextViewer';

interface StudentViewProps {
  student: StudentProfile;
  isTeacherPreview?: boolean;
  onExitPreview?: () => void;
}

type StudentTab = 'torah' | 'haftarah' | 'general';

export const StudentView: React.FC<StudentViewProps> = ({
  student,
  isTeacherPreview = false,
  onExitPreview,
}) => {
  const [activeTab, setActiveTab] = useState<StudentTab>('torah');
  const [selectedRecording, setSelectedRecording] = useState<RecordingItem | null>(null);
  const [showTextPanel, setShowTextPanel] = useState<boolean>(true);
  const [standaloneTorahReader, setStandaloneTorahReader] = useState<boolean>(false);
  const [standaloneHaftarahReader, setStandaloneHaftarahReader] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<RecordingItem | null>(null);
  const [pitchShift, setPitchShift] = useState<number>(
    () => loadStudentPreferences(student.id).pitchShift
  );

  useEffect(() => {
    setPitchShift(loadStudentPreferences(student.id).pitchShift);
  }, [student.id]);

  const handlePitchChange = (nextPitch: number) => {
    const clamped = Math.max(-6, Math.min(6, Math.round(nextPitch * 2) / 2));
    setPitchShift(clamped);
    saveStudentPreferences(student.id, { pitchShift: clamped });
  };

  const stats = useMemo(() => calculateStudentStats(student), [student]);

  const visiblePortions = useMemo(
    () => (student.portions || []).filter((p) => p.visible !== false),
    [student.portions]
  );

  const torahPortions = useMemo(
    () =>
      visiblePortions.filter(
        (r) => r.category === 'shabbat' || r.category === 'chol'
      ),
    [visiblePortions]
  );

  const parashaDocs = useMemo(
    () => visiblePortions.filter((r) => r.category === 'doc'),
    [visiblePortions]
  );

  const haftarahPortions = useMemo(
    () => visiblePortions.filter((r) => r.category === 'haftarah'),
    [visiblePortions]
  );

  const haftarahBlessings = useMemo(
    () => GENERAL_AUDIO_ITEMS.filter((r) => r.title.includes('הפטרה')),
    []
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-40" dir="rtl">
      {isTeacherPreview && onExitPreview && (
        <div className="bg-amber-500 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-sm">
          <span>תצוגת מסך תלמיד ({student.name})</span>
          <button
            type="button"
            onClick={onExitPreview}
            className="bg-white text-amber-900 px-3 py-1 rounded-lg font-bold shadow-xs hover:bg-amber-50"
          >
            חזרה למסך מורה
          </button>
        </div>
      )}

      {/* Top Student Summary Header */}
      <header className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white px-4 pt-6 pb-6 rounded-b-3xl shadow-md">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-indigo-200 bg-white/10 px-3 py-1 rounded-full">
              לימוד בר מצווה
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-200">
              <Calendar className="w-3.5 h-3.5 text-indigo-300" />
              <span>{formatDateIL(student.barMitzvahDate)}</span>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight mb-1">
            {student.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-indigo-100 text-sm mb-4">
            <span className="font-bold text-white text-base">
              פרשת {student.parasha}
            </span>
            {student.haftarah && student.haftarah !== student.parasha && (
              <>
                <span className="text-indigo-400">•</span>
                <span>הפטרה: {student.haftarah}</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="bg-white/10 border border-white/10 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-extrabold leading-none">
                  {stats.weeksToBarMitzvah}
                </div>
                <div className="text-xs text-indigo-200 mt-0.5">
                  שבועות לבר מצווה
                </div>
              </div>
            </div>

            <div className="bg-white/10 border border-white/10 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-extrabold leading-none">
                  {stats.progressPercent}%
                </div>
                <div className="text-xs text-indigo-200 mt-0.5">
                  {stats.totalLearned} מתוך {stats.totalVerses} פסוקים
                </div>
              </div>
            </div>
          </div>

          <div className="w-full bg-white/15 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-l from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>

          {/* Personalized Pitch Shift Setting (saved locally in student's browser) */}
          <div className="mt-4 bg-white/10 border border-white/15 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sliders className="w-4 h-4 text-indigo-300 shrink-0" />
              <div className="text-xs">
                <span className="text-indigo-200 font-medium">התאמת גובה צליל (Pitch): </span>
                <span className="font-extrabold text-white">
                  {formatPitchLabel(pitchShift)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
              <button
                type="button"
                onClick={() => handlePitchChange(pitchShift - 0.5)}
                disabled={pitchShift <= -6}
                className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white flex items-center justify-center transition active:scale-95"
                title="הנמך"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              {pitchShift !== 0 && (
                <button
                  type="button"
                  onClick={() => handlePitchChange(0)}
                  className="px-2 h-7 rounded-lg bg-indigo-500/40 hover:bg-indigo-500/60 text-[11px] font-bold text-white transition"
                  title="איפוס לברירת מחדל (ללא שינוי)"
                >
                  0
                </button>
              )}
              <button
                type="button"
                onClick={() => handlePitchChange(pitchShift + 0.5)}
                disabled={pitchShift >= 6}
                className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white flex items-center justify-center transition active:scale-95"
                title="הגבה"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 mt-4">
        {/* 3 Mobile Tabs: Torah Reading, Haftarah, General */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-200/80 p-1.5 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('torah')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'torah'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>קריאה בתורה</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('haftarah')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'haftarah'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ScrollText className="w-4 h-4 text-indigo-600" />
            <span>הפטרה</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'general'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>כללי וטעמים</span>
          </button>
        </div>

        {/* TAB 1: TORAH READING */}
        {activeTab === 'torah' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="font-bold text-slate-800 text-base">
                עליות ללימוד – פרשת {student.parasha}
              </h2>
              <div className="flex items-center gap-2">
                {torahPortions.length > 0 &&
                  !(
                    selectedRecording &&
                    (selectedRecording.category === 'shabbat' ||
                      selectedRecording.category === 'chol') &&
                    showTextPanel
                  ) && (
                    <button
                      type="button"
                      onClick={() => setStandaloneTorahReader((prev) => !prev)}
                      className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 px-2.5 py-1 rounded-xl flex items-center gap-1 transition"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>
                        {standaloneTorahReader ? 'הסתר פסוקים' : 'הצג פסוקי הפרשה'}
                      </span>
                    </button>
                  )}
                <span className="text-xs text-slate-500 font-medium">
                  {torahPortions.length} הקלטות
                </span>
              </div>
            </div>

            {standaloneTorahReader &&
              !(
                selectedRecording &&
                (selectedRecording.category === 'shabbat' ||
                  selectedRecording.category === 'chol') &&
                showTextPanel
              ) && (
                <TorahTextViewer
                  parashaName={student.parasha}
                  haftarahName={student.haftarah}
                  studentPortions={torahPortions}
                  studentId={student.id}
                  onClose={() => setStandaloneTorahReader(false)}
                />
              )}

            {torahPortions.length === 0 ? (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                  <BookOpen className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 text-sm mb-1">
                    טרם שויכו הקלטות שמע לפרשת {student.parasha}
                  </p>
                  <p className="text-xs text-slate-500">
                    בינתיים ניתן לקרוא ולתרגל את פסוקי הפרשה מתוך ספריא (עם או בלי ניקוד וטעמים):
                  </p>
                </div>

                <TorahTextViewer
                  parashaName={student.parasha}
                  haftarahName={student.haftarah}
                  studentId={student.id}
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                {torahPortions.map((rec) => {
                  const isSelected = selectedRecording?.id === rec.id;
                  return (
                    <div key={rec.id} className="space-y-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecording(rec);
                          setShowTextPanel(true);
                          setStandaloneTorahReader(false);
                        }}
                        className={`w-full text-right p-4 rounded-2xl border transition flex items-center justify-between gap-3 active:scale-[0.99] ${
                          isSelected
                            ? 'bg-indigo-50/90 border-indigo-600 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-indigo-50 text-indigo-600'
                            }`}
                          >
                            {isSelected ? (
                              <Volume2 className="w-5 h-5 animate-pulse" />
                            ) : (
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-base truncate">
                              {rec.aliyah}
                            </div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {rec.title}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isSelected && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowTextPanel((prev) => !prev);
                              }}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>{showTextPanel ? 'הסתר טקסט' : 'הצג טקסט'}</span>
                            </span>
                          )}
                          <span
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isSelected ? 'מנגן כעת' : 'השמע'}
                          </span>
                        </div>
                      </button>

                      {isSelected && showTextPanel && (
                        <TorahTextViewer
                          parashaName={student.parasha}
                          haftarahName={student.haftarah}
                          recording={rec}
                          studentPortions={torahPortions}
                          studentId={student.id}
                          onClose={() => setShowTextPanel(false)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {parashaDocs.length > 0 && (
              <div className="pt-2">
                <h3 className="text-xs font-bold text-slate-500 px-1 mb-2">
                  דפי עזר לפרשה
                </h3>
                <div className="space-y-2">
                  {parashaDocs.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.localUrl || doc.viewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full text-right p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="font-semibold text-sm text-slate-900 truncate">
                          {doc.aliyah}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1">
                        <span>פתיחה</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HAFTARAH */}
        {activeTab === 'haftarah' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2 px-1 mb-2.5">
                <h2 className="font-bold text-slate-800 text-base">
                  הפטרת {student.haftarah || student.parasha}
                </h2>
                <div className="flex items-center gap-2">
                  {haftarahPortions.length > 0 &&
                    !(
                      selectedRecording &&
                      selectedRecording.category === 'haftarah' &&
                      showTextPanel
                    ) && (
                      <button
                        type="button"
                        onClick={() => setStandaloneHaftarahReader((prev) => !prev)}
                        className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 px-2.5 py-1 rounded-xl flex items-center gap-1 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>
                          {standaloneHaftarahReader ? 'הסתר פסוקים' : 'הצג פסוקי ההפטרה'}
                        </span>
                      </button>
                    )}
                  {student.haftarahVerses > 0 && (
                    <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-0.5 rounded-full">
                      {student.learnedHaftarahVerses} / {student.haftarahVerses} פסוקים
                    </span>
                  )}
                </div>
              </div>

              {standaloneHaftarahReader &&
                !(
                  selectedRecording &&
                  selectedRecording.category === 'haftarah' &&
                  showTextPanel
                ) && (
                  <div className="mb-3">
                    <TorahTextViewer
                      parashaName={student.parasha}
                      haftarahName={student.haftarah}
                      studentPortions={haftarahPortions}
                      defaultPortionKey="haftarah"
                      studentId={student.id}
                      onClose={() => setStandaloneHaftarahReader(false)}
                    />
                  </div>
                )}

              {haftarahPortions.length === 0 ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                    <ScrollText className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 text-sm mb-1">
                      טרם שויכה הקלטת הפטרה
                    </p>
                    <p className="text-xs text-slate-500">
                      בינתיים ניתן לקרוא את פסוקי ההפטרה מתוך ספריא ולתרגל את ברכות ההפטרה למטה:
                    </p>
                  </div>

                  <TorahTextViewer
                    parashaName={student.parasha}
                    haftarahName={student.haftarah}
                    defaultPortionKey="haftarah"
                    studentId={student.id}
                  />
                </div>
              ) : (
                <div className="space-y-2.5">
                  {haftarahPortions.map((rec) => {
                    const isSelected = selectedRecording?.id === rec.id;
                    return (
                      <div key={rec.id} className="space-y-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecording(rec);
                            setShowTextPanel(true);
                            setStandaloneHaftarahReader(false);
                          }}
                          className={`w-full text-right p-4 rounded-2xl border transition flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-indigo-50/90 border-indigo-600 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-indigo-50 text-indigo-600'
                              }`}
                            >
                              {isSelected ? (
                                <Volume2 className="w-5 h-5 animate-pulse" />
                              ) : (
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-base truncate">
                                {rec.aliyah}
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">
                                {rec.title}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSelected && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowTextPanel((prev) => !prev);
                                }}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>{showTextPanel ? 'הסתר טקסט' : 'הצג טקסט'}</span>
                              </span>
                            )}
                            <span
                              className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {isSelected ? 'מנגן כעת' : 'השמע'}
                            </span>
                          </div>
                        </button>

                        {isSelected && showTextPanel && (
                          <TorahTextViewer
                            parashaName={student.parasha}
                            haftarahName={student.haftarah}
                            recording={rec}
                            studentPortions={haftarahPortions}
                            studentId={student.id}
                            onClose={() => setShowTextPanel(false)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-sm px-1 mb-2.5">
                ברכות וטעמי ההפטרה
              </h3>
              <div className="space-y-2.5">
                {haftarahBlessings.map((rec) => {
                  const isSelected = selectedRecording?.id === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => setSelectedRecording(rec)}
                      className={`w-full text-right p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-amber-50 border-amber-500'
                          : 'bg-white border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">
                            {rec.aliyah}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {rec.title}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-xl shrink-0">
                        {isSelected ? 'מנגן' : 'השמע'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: GENERAL (TE'AMIM, BLESSINGS, DOCS) */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-bold text-slate-800 text-base px-1 mb-2.5">
                הקלטות טעמי המקרא וברכות
              </h2>
              <div className="space-y-2.5">
                {GENERAL_AUDIO_ITEMS.map((rec) => {
                  const isSelected = selectedRecording?.id === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => setSelectedRecording(rec)}
                      className={`w-full text-right p-4 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-50/90 border-indigo-600 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-indigo-50 text-indigo-600'
                          }`}
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">
                            {rec.aliyah}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {rec.title}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'מנגן' : 'השמע'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="font-bold text-slate-800 text-base px-1 mb-2.5">
                דפי עזר, תווים וכללי דקדוק
              </h2>
              <div className="space-y-2.5">
                {GENERAL_DOC_ITEMS.map((doc) => {
                  const isPdf = doc.ext === 'pdf';
                  const directHref = doc.localUrl || doc.viewUrl;
                  return (
                    <div
                      key={doc.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isPdf
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {isPdf ? (
                            <FileText className="w-5 h-5" />
                          ) : (
                            <ImageIcon className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm truncate">
                            {doc.aliyah}
                          </div>
                          <div className="text-xs text-slate-500 uppercase">
                            קובץ {doc.ext}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPdf ? (
                          <a
                            href={directHref}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition flex items-center gap-1"
                          >
                            <span>פתח מסמך</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition"
                          >
                            הצג תמונה
                          </button>
                        )}
                        <a
                          href={doc.viewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                          title="פתח ב-Google Drive"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Document / Image Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="font-bold text-slate-900 truncate">
                {previewDoc.aliyah}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.localUrl || previewDoc.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1 px-2 py-1"
                >
                  <span>פתח בחלון מלא</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={previewDoc.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-slate-500 hover:underline flex items-center gap-1 px-2 py-1"
                >
                  <span>Drive</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-2 flex items-center justify-center min-h-[60vh]">
              {previewDoc.ext === 'pdf' ? (
                <iframe
                  src={previewDoc.localUrl || previewDoc.viewUrl}
                  title={previewDoc.aliyah}
                  className="w-full h-[72vh] rounded-xl border-0 bg-white"
                />
              ) : (
                <img
                  src={previewDoc.localUrl || getMediaStreamUrl(previewDoc)}
                  alt={previewDoc.aliyah}
                  className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-xs"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <AudioPlayerBar
        recording={selectedRecording}
        parashaName={
          activeTab === 'general' ? 'ברכות וטעמים' : `פרשת ${student.parasha}`
        }
        haftarahName={student.haftarah}
        studentPortions={visiblePortions}
        studentId={student.id}
        pitchShift={pitchShift}
        onPitchShiftChange={handlePitchChange}
        showTextExternally={showTextPanel}
        onToggleTextExternally={() => setShowTextPanel((prev) => !prev)}
      />
    </div>
  );
};
