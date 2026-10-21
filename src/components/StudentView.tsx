import React, { useState, useMemo } from 'react';
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
import { AudioPlayerBar } from './AudioPlayerBar';

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
  const [previewDoc, setPreviewDoc] = useState<RecordingItem | null>(null);

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
        <div className="max-w-md mx-auto">
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
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-4">
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
            <div className="flex items-center justify-between px-1">
              <h2 className="font-bold text-slate-800 text-base">
                עליות ללימוד – פרשת {student.parasha}
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {torahPortions.length} הקלטות
              </span>
            </div>

            {torahPortions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm mb-1">
                  טרם שויכו הקלטות קריאה בתורה
                </p>
                <p className="text-xs text-slate-500">
                  המורה יוסיף עבורך את העליות הרלוונטיות לפרשת {student.parasha}.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {torahPortions.map((rec) => {
                  const isSelected = selectedRecording?.id === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => setSelectedRecording(rec)}
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

                      <span
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'מנגן כעת' : 'השמע'}
                      </span>
                    </button>
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
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
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
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg shrink-0">
                        פתיחה
                      </span>
                    </button>
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
              <div className="flex items-center justify-between px-1 mb-2.5">
                <h2 className="font-bold text-slate-800 text-base">
                  הפטרת {student.haftarah || student.parasha}
                </h2>
                {student.haftarahVerses > 0 && (
                  <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-0.5 rounded-full">
                    {student.learnedHaftarahVerses} / {student.haftarahVerses} פסוקים
                  </span>
                )}
              </div>

              {haftarahPortions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                  <ScrollText className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 text-sm mb-1">
                    טרם שויכה הקלטת הפטרה
                  </p>
                  <p className="text-xs text-slate-500">
                    בינתיים ניתן לתרגל למטה את ברכות ההפטרה וטעמי ההפטרה.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {haftarahPortions.map((rec) => {
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

                        <span
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isSelected ? 'מנגן כעת' : 'השמע'}
                        </span>
                      </button>
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
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition"
                        >
                          הצג
                        </button>
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
                  href={previewDoc.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1 px-2 py-1"
                >
                  <span>פתח ב-Drive</span>
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
                  src={`https://drive.google.com/file/d/${previewDoc.id}/preview`}
                  title={previewDoc.aliyah}
                  className="w-full h-[72vh] rounded-xl border-0 bg-white"
                />
              ) : (
                <img
                  src={getMediaStreamUrl(previewDoc)}
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
      />
    </div>
  );
};
