import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Eye,
  Columns2,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlignJustify,
  ListOrdered,
  RefreshCw,
} from 'lucide-react';
import type { RecordingItem } from '../types';
import { getRecordingSection, isDocument, sortRecordings } from '../utils/recordings';
import {
  TextDisplayMode,
  TextFontSize,
  PortionSelectorKey,
  PORTION_SELECTOR_OPTIONS,
  FetchedPortionText,
  resolvePortionTarget,
  fetchPortionTextFromSefaria,
} from '../utils/sefariaApi';
import {
  loadStudentPreferences,
  saveStudentPreferences,
} from '../utils/studentPreferences';

interface TorahTextViewerProps {
  parashaName?: string;
  haftarahName?: string;
  recording?: RecordingItem | null;
  studentPortions?: RecordingItem[];
  studentId?: string;
  defaultPortionKey?: PortionSelectorKey;
  compactHeader?: boolean;
  onClose?: () => void;
  tradition?: 'ashkenazi' | 'sephardi';
  /** Called when the prev/next arrows move to another assigned recording. */
  onSelectRecording?: (recording: RecordingItem) => void;
  /** Controlled fullscreen state */
  isFullscreen?: boolean;
  /** Fullscreen change handler */
  onToggleFullscreen?: (fullscreen: boolean) => void;
  /** Initial/default fullscreen state if uncontrolled */
  defaultFullscreen?: boolean;
}

const FONT_SIZE_ORDER: TextFontSize[] = ['sm', 'md', 'lg', 'xl'];

const FONT_SIZE_CLASSES: Record<
  TextFontSize,
  {
    single: string;
    tikkun: string;
    badge: string;
  }
> = {
  sm: {
    single: 'text-lg leading-[2.1]',
    tikkun: 'text-base leading-[2.0]',
    badge: 'text-xs',
  },
  md: {
    single: 'text-xl sm:text-2xl leading-[2.2]',
    tikkun: 'text-lg sm:text-xl leading-[2.1]',
    badge: 'text-xs',
  },
  lg: {
    single: 'text-2xl sm:text-3xl leading-[2.25]',
    tikkun: 'text-xl sm:text-2xl leading-[2.15]',
    badge: 'text-sm',
  },
  xl: {
    single: 'text-3xl sm:text-4xl leading-[2.3]',
    tikkun: 'text-2xl sm:text-3xl leading-[2.2]',
    badge: 'text-sm',
  },
};

export const TorahTextViewer: React.FC<TorahTextViewerProps> = ({
  parashaName,
  haftarahName,
  recording,
  studentPortions,
  studentId,
  defaultPortionKey,
  compactHeader = false,
  onClose,
  tradition,
  onSelectRecording,
  isFullscreen: controlledFullscreen,
  onToggleFullscreen,
  defaultFullscreen = false,
}) => {
  const initialPrefs = useMemo(() => loadStudentPreferences(studentId), [studentId]);

  const [displayMode, setDisplayMode] = useState<TextDisplayMode>(
    initialPrefs.textDisplayMode
  );
  const [fontSize, setFontSize] = useState<TextFontSize>(initialPrefs.textFontSize);
  const [layoutFlow, setLayoutFlow] = useState<'inline' | 'list'>('inline');
  const [overrideRecording, setOverrideRecording] = useState<RecordingItem | null>(null);
  const [overridePortionKey, setOverridePortionKey] =
    useState<PortionSelectorKey | null>(defaultPortionKey || null);
  const [showPortionPicker, setShowPortionPicker] = useState(false);
  const [internalFullscreen, setInternalFullscreen] = useState(defaultFullscreen);
  const isFullscreen =
    controlledFullscreen !== undefined ? controlledFullscreen : internalFullscreen;

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setInternalFullscreen(next);
    onToggleFullscreen?.(next);
  };

  const contentRef = useRef<HTMLDivElement | null>(null);

  // Filter studentPortions to those that have Sefaria text (Torah or Haftarah)
  const availableStudentPortions = useMemo(
    () =>
      sortRecordings((studentPortions || []).filter(
        (p) =>
          getRecordingSection(p) !== 'general' && !isDocument(p)
      )),
    [studentPortions]
  );

  // Set of verse keys ("chapter:verse") revealed when in 'no_nikud' self-test mode
  const [revealedVerses, setRevealedVerses] = useState<Record<string, boolean>>({});

  const [fetchedData, setFetchedData] = useState<FetchedPortionText | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Reset manual portion override whenever the active audio recording changes
  useEffect(() => {
    if (recording) {
      setOverrideRecording(null);
      setOverridePortionKey(null);
      setRevealedVerses({});
    }
  }, [recording?.id, recording?.aliyah]);

  // Reload saved preferences when studentId changes
  useEffect(() => {
    const prefs = loadStudentPreferences(studentId);
    setDisplayMode(prefs.textDisplayMode);
    setFontSize(prefs.textFontSize);
  }, [studentId]);

  const effectiveRecording =
    overrideRecording ||
    recording ||
    (!overridePortionKey && availableStudentPortions.length > 0
      ? availableStudentPortions[0]
      : null);

  const resolvedTarget = useMemo(
    () =>
      resolvePortionTarget({
        parashaName,
        haftarahName,
        recording: effectiveRecording,
        overrideKey: overridePortionKey,
        tradition,
      }),
    [parashaName, haftarahName, effectiveRecording, overridePortionKey, tradition]
  );

  const refsSignature = resolvedTarget ? resolvedTarget.refs.join('|') : '';

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [refsSignature]);

  useEffect(() => {
    if (!resolvedTarget || resolvedTarget.refs.length === 0) {
      setFetchedData(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);

    fetchPortionTextFromSefaria(resolvedTarget.refs)
      .then((res) => {
        if (!cancelled) {
          setFetchedData(res);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setErrorMsg(err?.message || 'שגיאה בטעינת הטקסט מספריא');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refsSignature, reloadCounter]);

  const handleModeChange = (mode: TextDisplayMode) => {
    setDisplayMode(mode);
    setRevealedVerses({});
    saveStudentPreferences(studentId, { textDisplayMode: mode });
  };

  const stepFontSize = (delta: number) => {
    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
    const nextIdx = Math.max(0, Math.min(FONT_SIZE_ORDER.length - 1, idx + delta));
    const nextSize = FONT_SIZE_ORDER[nextIdx];
    setFontSize(nextSize);
    saveStudentPreferences(studentId, { textFontSize: nextSize });
  };

  const toggleVerseReveal = (key: string) => {
    setRevealedVerses((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (!resolvedTarget) {
    return null;
  }

  // Previous / next portion navigation (RTL: right arrow = previous, left arrow = next)
  const navIndex =
    availableStudentPortions.length > 0
      ? availableStudentPortions.findIndex((p) => p.id === effectiveRecording?.id)
      : PORTION_SELECTOR_OPTIONS.findIndex((o) => o.key === resolvedTarget.portionKey);
  const navCount =
    availableStudentPortions.length > 0
      ? availableStudentPortions.length
      : PORTION_SELECTOR_OPTIONS.length;
  const canGoPrev = navIndex > 0;
  const canGoNext = navIndex >= 0 && navIndex < navCount - 1;
  const goToPortion = (delta: number) => {
    const nextIdx = navIndex + delta;
    if (nextIdx < 0 || nextIdx >= navCount) return;
    if (availableStudentPortions.length > 0) {
      setOverrideRecording(availableStudentPortions[nextIdx]);
      onSelectRecording?.(availableStudentPortions[nextIdx]);
      setOverridePortionKey(null);
    } else {
      setOverrideRecording(null);
      setOverridePortionKey(PORTION_SELECTOR_OPTIONS[nextIdx].key);
    }
    setShowPortionPicker(false);
    setRevealedVerses({});
  };

  const sizeConfig = FONT_SIZE_CLASSES[fontSize];
  const verses = fetchedData?.verses || [];

  const renderViewerBody = () => (
    <div
      className={`bg-white border border-slate-200 shadow-xs overflow-hidden flex flex-col ${
        isFullscreen
          ? 'fixed inset-x-0 top-0 bottom-[128px] z-40 rounded-none border-0 shadow-2xl'
          : 'rounded-2xl sticky top-0 z-30'
      }`}
      dir="rtl"
    >
      {/* Top Header Bar */}
      <div className="bg-gradient-to-l from-indigo-950 via-indigo-900 to-slate-900 text-white px-2 py-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => goToPortion(-1)}
          disabled={!canGoPrev}
          className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
          title="הקטע הקודם"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/15 text-indigo-200 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm sm:text-base truncate">
                {resolvedTarget.label}
              </span>
              {fetchedData?.heRef && (
                <span className="text-[11px] font-medium bg-white/15 text-indigo-100 px-2 py-0.5 rounded-full">
                  {fetchedData.heRef}
                </span>
              )}
              {verses.length > 0 && (
                <span className="text-[11px] text-indigo-300">
                  ({verses.length} פסוקים)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Switch Aliyah / Portion dropdown toggle */}
          {(availableStudentPortions.length > 1 ||
            (availableStudentPortions.length === 0 && resolvedTarget.parasha)) && (
            <button
              type="button"
              onClick={() => setShowPortionPicker((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white flex items-center gap-1 transition"
              title="מעבר לעלייה אחרת המשויכת לתלמיד"
            >
              <span>החלף עלייה</span>
              {showPortionPicker ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Fullscreen reader toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition"
            title={isFullscreen ? 'מזער תצוגה' : 'הגדל למסך מלא'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-indigo-100 transition"
            >
              סגור
            </button>
          )}
        </div>
        </div>
        <button
          type="button"
          onClick={() => goToPortion(1)}
          disabled={!canGoNext}
          className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
          title="הקטע הבא"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Expandable Aliyah / Portion Picker aligned with student's assigned portions */}
      {showPortionPicker && (
        <div className="bg-indigo-950/95 text-white px-3.5 py-2.5 border-b border-indigo-800/60">
          <div className="text-[11px] font-semibold text-indigo-300 mb-1.5">
            {availableStudentPortions.length > 0
              ? 'בחירת עלייה / קטע מתוך העליות המשויכות לתלמיד:'
              : `בחירת עלייה / קטע לקריאה (פרשת ${resolvedTarget.parasha?.heName || ''}):`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableStudentPortions.length > 0
              ? availableStudentPortions.map((portionItem) => {
                  const isActive = effectiveRecording?.id === portionItem.id;
                  return (
                    <button
                      key={portionItem.id}
                      type="button"
                      onClick={() => {
                        setOverrideRecording(portionItem);
                        onSelectRecording?.(portionItem);
                        setOverridePortionKey(null);
                        setShowPortionPicker(false);
                        setRevealedVerses({});
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 shadow-2xs'
                          : 'bg-white/10 text-indigo-100 hover:bg-white/20'
                      }`}
                    >
                      {portionItem.aliyah}
                    </button>
                  );
                })
              : PORTION_SELECTOR_OPTIONS.map((opt) => {
                  const isActive = resolvedTarget.portionKey === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setOverrideRecording(null);
                        setOverridePortionKey(opt.key);
                        setShowPortionPicker(false);
                        setRevealedVerses({});
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        isActive
                          ? 'bg-amber-400 text-slate-950 shadow-2xs'
                          : 'bg-white/10 text-indigo-100 hover:bg-white/20'
                      }`}
                    >
                      {opt.shortLabel}
                    </button>
                  );
                })}
          </div>
        </div>
      )}

      {/* Controls Toolbar: Nikud/Teamim Mode + Font Size + Flow Layout */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        {/* 4 Display Mode Buttons */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-200/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => handleModeChange('full')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
              displayMode === 'full'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>עם ניקוד וטעמים</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('no_nikud')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
              displayMode === 'no_nikud'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>ללא ניקוד וטעמים</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('tikkun')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
              displayMode === 'tikkun'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white/60'
            }`}
            title="תצוגת תיקון קוראים: ימין עם ניקוד וטעמים, שמאל כתיב ספר תורה"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>תיקון קוראים</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('nikud_only')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
              displayMode === 'nikud_only'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 hover:bg-white/60'
            }`}
            title="ניקוד בלבד ללא טעמי המקרא"
          >
            <span>ניקוד בלבד</span>
          </button>
        </div>

        {/* Right-side Reading Tools: Layout toggle & Font size */}
        <div className="flex items-center gap-1.5 mr-auto">
          {displayMode !== 'tikkun' && (
            <button
              type="button"
              onClick={() =>
                setLayoutFlow((prev) => (prev === 'inline' ? 'list' : 'inline'))
              }
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold flex items-center gap-1"
              title={
                layoutFlow === 'inline'
                  ? 'מעבר לתצוגת שורה לכל פסוק'
                  : 'מעבר לתצוגת רצף פסוקים'
              }
            >
              {layoutFlow === 'inline' ? (
                <ListOrdered className="w-3.5 h-3.5" />
              ) : (
                <AlignJustify className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => stepFontSize(-1)}
              disabled={fontSize === 'sm'}
              className="px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              title="הקטן גופן"
            >
              א-
            </button>
            <div className="w-px h-4 bg-slate-200" />
            <button
              type="button"
              onClick={() => stepFontSize(1)}
              disabled={fontSize === 'xl'}
              className="px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              title="הגדל גופן"
            >
              א+
            </button>
          </div>
        </div>
      </div>

      {/* Helper banner in 'no_nikud' mode */}
      {displayMode === 'no_nikud' && verses.length > 0 && (
        <div className="bg-amber-50/90 border-b border-amber-200/70 px-3.5 py-1.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              <strong>מצב תרגול ספר תורה:</strong> לחצו על כל פסוק כדי להציץ בניקוד ובטעמים שלו.
            </span>
          </div>
          {Object.values(revealedVerses).some(Boolean) && (
            <button
              type="button"
              onClick={() => setRevealedVerses({})}
              className="text-[11px] font-bold text-amber-800 underline shrink-0"
            >
              הסתר הכל
            </button>
          )}
        </div>
      )}

      {/* Main Text Content Area */}
      <div
        ref={contentRef}
        className={`p-4 sm:p-6 overflow-y-auto ${
          isFullscreen
            ? 'flex-1 bg-[#fdfbf7]'
            : compactHeader
            ? 'max-h-[calc(100vh-300px)] min-h-[120px] bg-[#fdfbf7]'
            : 'max-h-[calc(100vh-300px)] min-h-[120px] bg-[#fdfbf7]'
        }`}
      >
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold">
              טוען פסוקים מספריא ({resolvedTarget.shortLabel})...
            </span>
          </div>
        ) : errorMsg ? (
          <div className="py-8 text-center">
            <p className="text-sm font-bold text-rose-600 mb-2">{errorMsg}</p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setReloadCounter((c) => c + 1)}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>נסה שוב</span>
              </button>
              <a
                href={resolvedTarget.sefariaUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1"
              >
                <span>פתח באתר ספריא</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : verses.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            לא נמצאו פסוקים לקטע זה.
          </div>
        ) : displayMode === 'tikkun' ? (
          /* Side-by-Side Tikkun Kor'im View */
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 pb-2 mb-2 border-b border-amber-900/15 text-xs font-extrabold text-amber-950/70 text-center">
              <div className="bg-amber-100/60 py-1 rounded-lg">
                חומש (עם ניקוד וטעמים)
              </div>
              <div className="bg-amber-100/60 py-1 rounded-lg">
                ספר תורה (ללא ניקוד וטעמים)
              </div>
            </div>

            {verses.map((v, idx) => {
              const prevChapter = idx > 0 ? verses[idx - 1].chapter : v.chapter;
              const isNewChapter = idx > 0 && v.chapter !== prevChapter;

              return (
                <React.Fragment key={`${v.chapter}:${v.verse}`}>
                  {isNewChapter && (
                    <div className="py-2 text-center">
                      <span className="inline-block px-3 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-extrabold">
                        פרק {v.heChapter}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:gap-5 py-2.5 border-b border-amber-900/10 items-baseline">
                    {/* Right column: With Nikud & Teamim */}
                    <div
                      className={`font-torah text-slate-900 text-justify ${sizeConfig.tikkun}`}
                    >
                      <span
                        className={`inline-block font-sans font-bold text-indigo-600 ml-1.5 select-none ${sizeConfig.badge}`}
                      >
                        ({v.heVerse})
                      </span>
                      <span>{v.withTaamim}</span>
                    </div>

                    {/* Left column: Without Nikud & Teamim */}
                    <div
                      className={`font-torah text-slate-900 text-justify border-r border-amber-900/15 pr-3 sm:pr-5 ${sizeConfig.tikkun}`}
                    >
                      <span>{v.withoutNikud}</span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ) : layoutFlow === 'inline' ? (
          /* Continuous Flowing Paragraph View (Chumash / Sefer Torah style) */
          <div className={`font-torah text-slate-900 text-justify ${sizeConfig.single}`}>
            {verses.map((v, idx) => {
              const vKey = `${v.chapter}:${v.verse}`;
              const isRevealed = Boolean(revealedVerses[vKey]);
              const prevChapter = idx > 0 ? verses[idx - 1].chapter : v.chapter;
              const isNewChapter = idx > 0 && v.chapter !== prevChapter;

              const textToShow =
                displayMode === 'full'
                  ? v.withTaamim
                  : displayMode === 'nikud_only'
                  ? v.nikudOnly
                  : isRevealed
                  ? v.withTaamim
                  : v.withoutNikud;

              return (
                <React.Fragment key={vKey}>
                  {isNewChapter && (
                    <div className="my-3 text-center font-sans">
                      <span className="inline-block px-3 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-extrabold">
                        פרק {v.heChapter}
                      </span>
                    </div>
                  )}
                  <span
                    onClick={
                      displayMode === 'no_nikud'
                        ? () => toggleVerseReveal(vKey)
                        : undefined
                    }
                    className={`inline transition rounded-lg ${
                      displayMode === 'no_nikud'
                        ? isRevealed
                          ? 'bg-amber-100/90 text-indigo-950 px-1 cursor-pointer'
                          : 'hover:bg-amber-100/50 cursor-pointer'
                        : ''
                    }`}
                    title={
                      displayMode === 'no_nikud'
                        ? 'לחץ להצגת/הסתרת ניקוד וטעמים לפסוק זה'
                        : undefined
                    }
                  >
                    {textToShow !== v.withoutNikud && (<span className={`font-sans font-bold text-indigo-600/85 mx-1 select-none ${sizeConfig.badge}`}>({v.heVerse})</span>)}
                    <span>{textToShow}</span>{' '}
                  </span>
                  {textToShow !== v.withoutNikud && v.parashaBreak === 'פ' && <span className="block h-3" />}
                  {textToShow !== v.withoutNikud && v.parashaBreak === 'ס' && (
                    <span className="inline-block w-8" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          /* Verse-by-Verse List View */
          <div className="space-y-2.5">
            {verses.map((v, idx) => {
              const vKey = `${v.chapter}:${v.verse}`;
              const isRevealed = Boolean(revealedVerses[vKey]);
              const prevChapter = idx > 0 ? verses[idx - 1].chapter : v.chapter;
              const isNewChapter = idx > 0 && v.chapter !== prevChapter;

              const textToShow =
                displayMode === 'full'
                  ? v.withTaamim
                  : displayMode === 'nikud_only'
                  ? v.nikudOnly
                  : isRevealed
                  ? v.withTaamim
                  : v.withoutNikud;

              return (
                <React.Fragment key={vKey}>
                  {isNewChapter && (
                    <div className="pt-2 text-center font-sans">
                      <span className="inline-block px-3 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-xs font-extrabold">
                        פרק {v.heChapter}
                      </span>
                    </div>
                  )}
                  <div
                    onClick={
                      displayMode === 'no_nikud'
                        ? () => toggleVerseReveal(vKey)
                        : undefined
                    }
                    className={`p-2.5 rounded-xl border border-amber-900/10 bg-white/70 flex items-baseline gap-2.5 transition ${
                      displayMode === 'no_nikud'
                        ? isRevealed
                          ? 'bg-amber-50 border-amber-300 cursor-pointer'
                          : 'hover:bg-amber-50/50 cursor-pointer'
                        : ''
                    }`}
                  >
                    {textToShow !== v.withoutNikud && (<span className={`font-sans font-extrabold text-indigo-600 shrink-0 select-none ${sizeConfig.badge}`}>{v.heVerse}</span>)}
                    <div className={`font-torah text-slate-900 ${sizeConfig.single}`}>
                      {textToShow}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Attribution & Sefaria Link */}
      <div className="bg-slate-50 border-t border-slate-200/80 px-4 py-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>הטקסט באדיבות ספריא (Sefaria) • מקרא על פי המסורה</span>
        <a
          href={fetchedData?.sefariaUrl || resolvedTarget.sefariaUrl}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          <span>פתח בספריא</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );

  return renderViewerBody();
};
