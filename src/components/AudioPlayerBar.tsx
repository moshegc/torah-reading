import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  Volume2,
  Loader2,
  Sliders,
  Minus,
  Plus,
  BookOpen,
} from 'lucide-react';
import type { RecordingItem } from '../types';
import { getRecordingSection, isDocument } from '../utils/recordings';
import { getMediaStreamUrl } from '../utils/trackerCalculations';
import {
  loadStudentPreferences,
  saveStudentPreferences,
  loadRecordingPitch,
  saveRecordingPitch,
  formatPitchLabel,
} from '../utils/studentPreferences';
import {
  createVoicePitchGraph,
  VoicePitchGraph,
} from '../utils/voicePitchShifter';
import { TorahTextViewer } from './TorahTextViewer';
import { formatGainDb, gainDbToLinear, levelingGainAt, normalizationGain, PEAK_CEILING_DBTP } from '../audio/normalization';
import { RecordingGainDetails } from './RecordingGainDetails';

interface AudioPlayerBarProps {
  recording: RecordingItem | null;
  onClose: () => void;
  parashaName?: string;
  haftarahName?: string;
  studentPortions?: RecordingItem[];
  studentId?: string;
  showTextExternally?: boolean;
  onToggleTextExternally?: () => void;
  /** Hide the Sefaria verse text entirely (e.g. teacher view). */
  hideText?: boolean;
  /** Start playing automatically when the recording changes (default true). */
  autoPlay?: boolean;
  onEnded?: () => void;
  autoAdvance?: boolean;
  onAutoAdvanceChange?: (enabled: boolean) => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  recording,
  onClose,
  parashaName,
  haftarahName,
  studentPortions,
  studentId,
  showTextExternally,
  onToggleTextExternally,
  hideText = false,
  autoPlay = true,
  onEnded,
  autoAdvance = false,
  onAutoAdvanceChange,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pitchGraphRef = useRef<VoicePitchGraph | null>(null);
  const attachedAudioElRef = useRef<HTMLAudioElement | null>(null);
  const graphInitPromiseRef = useRef<Promise<VoicePitchGraph | null> | null>(null);

  const initialPrefs = loadStudentPreferences(studentId);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState<boolean>(initialPrefs.isLooping);
  const [playbackRate, setPlaybackRate] = useState<number>(initialPrefs.playbackRate);
  const savedPitch = useMemo(
    () => recording ? loadRecordingPitch(studentId, recording.id) : 0,
    [studentId, recording?.id]
  );
  const [pitchSetting, setPitchSetting] = useState({
    studentId,
    recordingId: recording?.id,
    value: savedPitch,
  });
  const [showPitchPanel, setShowPitchPanel] = useState(false);
  const [showInternalText, setShowInternalText] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pitchShift =
    pitchSetting.studentId === studentId && pitchSetting.recordingId === recording?.id
      ? pitchSetting.value
      : savedPitch;
  const scanGain = useMemo(() => {
    try {
      normalizationGain(recording?.normalization);
      return { gainDb: recording?.normalization?.gainDb ?? 0, error: null };
    } catch (error) {
      return { gainDb: 0, error: error instanceof Error ? error.message : 'נתוני הסריקה אינם תקינים' };
    }
  }, [recording?.normalization]);
  const gainSelectionKey = JSON.stringify([
    studentId, recording?.id, recording ? getMediaStreamUrl(recording) : null, recording?.normalization,
  ]);
  const [gainSetting, setGainSetting] = useState<{ key: string; gainDb: number | null }>({
    key: gainSelectionKey, gainDb: null,
  });
  const [appliedGain, setAppliedGain] = useState<{ key: string; gainDb: number } | null>(null);
  const manualGainDb = gainSetting.key === gainSelectionKey ? gainSetting.gainDb : null;
  const manualGain = manualGainDb !== null;
  const gainDb = manualGainDb ?? scanGain.gainDb;
  const minimumGainDb = Math.min(-24, Math.floor(scanGain.gainDb));
  const leveling = !manualGain && !scanGain.error ? recording?.normalization?.leveling : undefined;
  const currentGainDb = gainDb + (leveling ? levelingGainAt(leveling.points, currentTime) : 0);
  const predictedPeak = recording?.normalization && !scanGain.error
    ? (leveling?.truePeakDbtp ?? recording.normalization.truePeakDbtp) + gainDb : null;
  const playbackSettings = {
    pitchShift, gainDb, key: gainSelectionKey, recordingId: recording?.id,
    title: recording?.title, scanGainDb: scanGain.gainDb, manualGain, leveling,
  };
  const playbackSettingsRef = useRef(playbackSettings);
  playbackSettingsRef.current = playbackSettings;
  const lastTimelinePositionRef = useRef(0);
  const syncGainTimeline = useCallback(() => {
    const graph = pitchGraphRef.current;
    const audio = audioRef.current;
    if (!graph || !audio) return;
    const settings = playbackSettingsRef.current;
    if (settings.leveling) {
      graph.setGainEnvelope(settings.gainDb, settings.leveling.points,
        audio.currentTime, audio.playbackRate, !audio.paused && !audio.seeking);
    } else {
      graph.setGain(gainDbToLinear(settings.gainDb));
    }
    lastTimelinePositionRef.current = audio.currentTime;
  }, []);

  useEffect(() => {
    setGainSetting({ key: gainSelectionKey, gainDb: null });
    console.info('[audio-gain] recording selected', {
      recordingId: recording?.id, title: recording?.title,
      scan: recording?.normalization ?? null, scanError: scanGain.error,
      initialGainDb: scanGain.gainDb,
    });
  }, [gainSelectionKey]);

  const hasSefariaText =
    !hideText &&
    recording &&
    getRecordingSection(recording) !== 'general' && !isDocument(recording) &&
    (recording.category === 'shabbat' ||
      recording.category === 'chol' ||
      recording.category === 'haftarah');

  const isTextVisible =
    showTextExternally !== undefined ? showTextExternally : showInternalText;

  const handleToggleText = () => {
    if (onToggleTextExternally) {
      onToggleTextExternally();
    } else {
      setShowInternalText((prev) => !prev);
    }
  };

  // Reload local browser preferences when studentId changes
  useEffect(() => {
    const prefs = loadStudentPreferences(studentId);
    setIsLooping(prefs.isLooping);
    setPlaybackRate(prefs.playbackRate);
    if (audioRef.current) {
      audioRef.current.loop = prefs.isLooping;
      audioRef.current.playbackRate = prefs.playbackRate;
    }
  }, [studentId]);

  const ensurePitchGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playbackSettingsRef.current.pitchShift === 0 &&
        playbackSettingsRef.current.gainDb === 0 && !playbackSettingsRef.current.leveling && !pitchGraphRef.current) {
      const settings = playbackSettingsRef.current;
      setAppliedGain({ key: settings.key, gainDb: 0 });
      console.info('[audio-gain] native playback (unity gain)', {
        recordingId: settings.recordingId, title: settings.title, gainDb: 0, linearGain: 1,
      });
      return;
    }

    const applySettings = async (graph: VoicePitchGraph) => {
      if (audioRef.current !== audio) return;
      const settings = playbackSettingsRef.current;
      const linearGain = gainDbToLinear(settings.gainDb);
      syncGainTimeline();
      setAppliedGain({ key: settings.key, gainDb: settings.gainDb });
      console.info('[audio-gain] playback gain applied', {
        recordingId: settings.recordingId, title: settings.title,
        scanGainDb: settings.scanGainDb, gainDb: settings.gainDb, linearGain,
        manual: settings.manualGain, contextState: graph.context.state,
      });
      await graph.setPitchSemitones(settings.pitchShift);
    };

    try {
      if (pitchGraphRef.current && attachedAudioElRef.current === audio) {
        if (pitchGraphRef.current.context.state === 'suspended') {
          await pitchGraphRef.current.context.resume();
        }
        await applySettings(pitchGraphRef.current);
        return;
      }

      if (!graphInitPromiseRef.current) {
        graphInitPromiseRef.current = createVoicePitchGraph(audio, 0)
          .then((graph) => {
            if (audioRef.current !== audio) {
              graph.dispose();
              return null;
            }
            pitchGraphRef.current = graph;
            attachedAudioElRef.current = audio;
            return graph;
          })
          .finally(() => {
            graphInitPromiseRef.current = null;
          });
      }

      const graph = await graphInitPromiseRef.current;
      if (graph) {
        if (graph.context.state === 'suspended') await graph.context.resume();
        await applySettings(graph);
      }
    } catch (err) {
      pitchGraphRef.current?.setGain(1);
      setAppliedGain({ key: playbackSettingsRef.current.key, gainDb: 0 });
      console.warn('Voice pitch graph initialization warning:', err);
      setErrorMsg('לא ניתן להחיל את איזון העוצמה או שינוי הסולם. נסו שוב.');
    }
  }, [syncGainTimeline]);

  useEffect(() => {
    ensurePitchGraph();
  }, [pitchShift, gainDb, gainSelectionKey, ensurePitchGraph]);

  // Cleanup graph on unmount
  useEffect(() => {
    if (!recording) {
      pitchGraphRef.current?.dispose();
      pitchGraphRef.current = null;
      attachedAudioElRef.current = null;
    }
  }, [Boolean(recording)]);

  useEffect(() => {
    return () => {
      if (pitchGraphRef.current) {
        pitchGraphRef.current.dispose();
        pitchGraphRef.current = null;
      }
    };
  }, []);

  const updatePitchShift = (nextPitch: number) => {
    const clamped = Math.max(-6, Math.min(6, Math.round(nextPitch * 2) / 2));
    if (recording) {
      setPitchSetting({ studentId, recordingId: recording.id, value: clamped });
      saveRecordingPitch(studentId, recording.id, clamped);
    }
  };

  const updateGain = (nextGainDb: number | null) => {
    if (nextGainDb !== null && !Number.isFinite(nextGainDb)) {
      console.error('[audio-gain] invalid manual gain', { nextGainDb });
      setErrorMsg('תיקון העוצמה אינו תקין');
      return;
    }
    const value = nextGainDb === null ? null : Math.max(minimumGainDb, Math.min(12, nextGainDb));
    console.info('[audio-gain] manual gain changed', {
      recordingId: recording?.id, title: recording?.title,
      scanGainDb: scanGain.gainDb, gainDb: value ?? scanGain.gainDb, resetToScan: value === null,
    });
    setGainSetting({ key: gainSelectionKey, gainDb: value });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !recording) return;
    let cancelled = false;

    // Stop whatever was playing before switching to the new recording
    audio.pause();
    setIsPlaying(false);

    setErrorMsg(null);
    setIsLoading(!autoPlay ? false : true);
    setCurrentTime(0);
    setDuration(0);

    const streamUrl = getMediaStreamUrl(recording);
    audio.src = streamUrl;
    audio.playbackRate = playbackRate;
    audio.preservesPitch = true;
    audio.loop = isLooping;
    audio.load();

    const startPlayback = async () => {
      await ensurePitchGraph();
      if (cancelled) return;
      await audio.play();
      if (cancelled) {
        audio.pause();
        return;
      }
      setIsPlaying(true);
      setIsLoading(false);
    };

    if (autoPlay) {
      startPlayback().catch(() => {
        if (cancelled) return;
        // Autoplay may be blocked on initial load until user taps play
        setIsPlaying(false);
        setIsLoading(false);
      });
    }

    return () => {
      cancelled = true;
      audio.pause();
    };
  }, [studentId, recording?.id, recording?.customAudioDataUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !recording) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setErrorMsg(null);
      await ensurePitchGraph();
      if (audioRef.current !== audio) return;
      audio
        .play()
        .then(() => {
          if (audioRef.current !== audio) {
            audio.pause();
            return;
          }
          setIsPlaying(true);
        })
        .catch(() => {
          if (audioRef.current !== audio) return;
          setErrorMsg('לא ניתן להפעיל את ההקלטה כרגע. נסו שוב.');
        });
    }
  };

  const skipSeconds = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration || 9999, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audio) {
      audio.currentTime = val;
    }
  };

  const speedStepRef = useRef<number>(0);

  const cycleSpeed = () => {
    // 1.0 appears twice, so track the position in the cycle explicitly
    const speeds = [1.0, 0.85, 0.75, 1.0, 1.15, 1.3, 1.5];
    const cur = speedStepRef.current;
    const stepValid = speeds[cur] === playbackRate;
    const nextIdx = ((stepValid ? cur : speeds.indexOf(playbackRate)) + 1) % speeds.length;
    speedStepRef.current = nextIdx;
    const nextSpeed = speeds[nextIdx];
    setPlaybackRate(nextSpeed);
    saveStudentPreferences(studentId, { playbackRate: nextSpeed });
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
      audioRef.current.preservesPitch = true;
    }
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!recording) {
    return null;
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] px-4 py-3 max-h-[90dvh] overflow-y-auto">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setIsLoading(false);
        }}
        onTimeUpdate={(e) => {
          const position = e.currentTarget.currentTime || 0;
          if (position < lastTimelinePositionRef.current) syncGainTimeline();
          lastTimelinePositionRef.current = position;
          setCurrentTime(position);
        }}
        onSeeking={syncGainTimeline}
        onSeeked={syncGainTimeline}
        onRateChange={syncGainTimeline}
        onWaiting={() => {
          setIsLoading(true);
          const graph = pitchGraphRef.current;
          const audio = audioRef.current;
          const settings = playbackSettingsRef.current;
          if (graph && audio && settings.leveling) {
            graph.setGainEnvelope(settings.gainDb, settings.leveling.points,
              audio.currentTime, audio.playbackRate, false);
          }
        }}
        onPlaying={() => {
          setIsLoading(false);
          setIsPlaying(true);
          syncGainTimeline();
        }}
        onPause={() => { setIsPlaying(false); syncGainTimeline(); }}
        onEnded={() => {
          if (!isLooping) {
            setIsPlaying(false);
            onEnded?.();
          }
        }}
        onError={() => {
          setIsLoading(false);
          setIsPlaying(false);
          setErrorMsg('שגיאה בטעינת הקובץ. נסו שוב מאוחר יותר.');
        }}
      />

      <div className="max-w-xl mx-auto flex flex-col gap-2">
        {/* Standalone Sefaria Text Drawer (used when not rendered inline by parent view) */}
        {!onToggleTextExternally && hasSefariaText && showInternalText && (
          <div className="mb-1">
            <TorahTextViewer
              recording={recording}
              parashaName={parashaName}
              haftarahName={haftarahName}
              studentPortions={studentPortions}
              studentId={studentId}
              compactHeader
              onClose={() => setShowInternalText(false)}
            />
          </div>
        )}

        {/* Track Info Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 truncate">
                {parashaName ? `${parashaName} • ` : ''}
                {recording.aliyah}
              </div>
              {!studentId && <div className="text-xs text-slate-500 truncate">{recording.title}</div>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasSefariaText && (
              <button
                type="button"
                onClick={handleToggleText}
                className={`text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
                  isTextVisible
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
                title="הצג/הסתר טקסט הפסוקים מספריא"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>פסוקים</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                pitchGraphRef.current?.dispose();
                pitchGraphRef.current = null;
                attachedAudioElRef.current = null;
                setIsPlaying(false);
                onClose();
              }}
              className="text-slate-500 hover:text-indigo-600 flex items-center justify-center shrink-0 w-10 h-10 rounded-lg hover:bg-slate-100"
              title="סגור נגן"
              aria-label="סגור נגן"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {onAutoAdvanceChange && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700" dir="rtl">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(event) => onAutoAdvanceChange(event.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            הפעלה אוטומטית של הקטע הבא
          </label>
        )}

        {errorMsg && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
            <span>{errorMsg}</span>
          </div>
        )}
        {scanGain.error && (
          <div role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
            {scanGain.error}
          </div>
        )}

        {/* Expandable Pitch Shift Drawer */}
        {showPitchPanel && (
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                <span>גובה צליל (Pitch):</span>
                <span
                  className={`px-2 py-0.5 rounded-md font-extrabold ${
                    pitchShift === 0
                      ? 'bg-slate-200/80 text-slate-700'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {formatPitchLabel(pitchShift)}
                </span>
              </div>

              {pitchShift !== 0 && (
                <button
                  type="button"
                  onClick={() => updatePitchShift(0)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                >
                  איפוס לרגיל (0)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2" dir="ltr">
              <button
                type="button"
                onClick={() => updatePitchShift(pitchShift - 0.5)}
                disabled={pitchShift <= -6}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center font-bold shadow-2xs active:scale-95 transition"
                title="הנמך"
              >
                <Minus className="w-4 h-4" />
              </button>

              <input
                type="range"
                min={-6}
                max={6}
                step={0.5}
                value={pitchShift}
                onChange={(e) => updatePitchShift(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />

              <button
                type="button"
                onClick={() => updatePitchShift(pitchShift + 0.5)}
                disabled={pitchShift >= 6}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center font-bold shadow-2xs active:scale-95 transition"
                title="הגבה"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1" dir="ltr">
              <span>-6 (נמוך)</span>
              <span>0 (מקורי)</span>
              <span>+6 (גבוה)</span>
            </div>
          </div>
        )}

        {import.meta.env.VITE_AUDIO_GAIN_DEBUG === 'true' && <details className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs" dir="rtl">
          <summary className="cursor-pointer font-bold text-slate-800">
            עוצמה: <bdi>{formatGainDb(gainDb)}</bdi>
            {' · '}{manualGain ? 'ידני' : recording.normalization && !scanGain.error ? 'לפי סריקה' : 'ללא תיקון'}
            {' · '}סריקה: <bdi>{scanGain.error ? 'לא תקינה' : recording.normalization ? formatGainDb(scanGain.gainDb) : 'טרם נסרק'}</bdi>
          </summary>
          <div className="pt-3 space-y-2">
            <RecordingGainDetails normalization={recording.normalization} />
            {leveling && <p className="text-indigo-700">איזון משתנה פעיל · תיקון ברגע זה: <bdi>{formatGainDb(currentGainDb)}</bdi>. שליטה ידנית מחליפה את האיזון המשתנה.</p>}
            <label className="block font-semibold">
              תיקון עוצמה ידני: <bdi>{formatGainDb(gainDb)}</bdi>
              <input
                type="range"
                aria-label="תיקון עוצמה ידני"
                min={minimumGainDb}
                max={12}
                step="any"
                value={gainDb}
                onChange={(event) => updateGain(Number(event.target.value))}
                className="block w-full mt-2 accent-indigo-600"
                dir="ltr"
              />
            </label>
            <div className="flex justify-between text-slate-500" dir="ltr">
              <span>{minimumGainDb} dB</span><span>0 dB</span><span>+12 dB</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => updateGain(null)} className="font-bold text-indigo-700 underline">חזרה לתוצאת הסריקה</button>
              <button type="button" onClick={() => updateGain(0)} className="font-bold text-indigo-700 underline">ללא תיקון (0 dB)</button>
            </div>
            <p>
              הוחל בפועל: <bdi>{appliedGain?.key === gainSelectionKey ? formatGainDb(leveling ? currentGainDb : appliedGain.gainDb) : 'טרם הוחל'}</bdi>
              {' · '}מכפיל מבוקש: <bdi>{gainDbToLinear(currentGainDb).toFixed(3)}×</bdi>
              {predictedPeak !== null && <> · פסגה צפויה: <bdi>{predictedPeak.toFixed(1)} dBTP</bdi></>}
            </p>
            {((manualGain && gainDb > scanGain.gainDb) || (predictedPeak !== null && predictedPeak > PEAK_CEILING_DBTP)) && (
              <p role="alert" className="text-amber-800 bg-amber-50 p-2 rounded-lg">
                העוצמה מעל ההמלצה או מרווח הפסגות של הסריקה. תיתכן חריגה או עיוות (Clipping), במיוחד בשינוי סולם.
              </p>
            )}
            {!recording.normalization && gainDb > 0 && <p className="text-amber-800">אין מדידת פסגות לקובץ זה; הגברה ידנית עלולה לגרום לעיוות.</p>}
            <p className="text-slate-500">השינוי הידני זמני ומתאפס בבחירת הקלטה. הפסגות מחושבות לפני שינוי סולם ומהירות, ללא לימיטר.</p>
          </div>
        </details>}

        {/* Scrubber Bar */}
        <div className="flex items-center gap-2.5" dir="ltr">
          <span className="text-[11px] font-mono text-slate-500 w-9 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <span className="text-[11px] font-mono text-slate-500 w-9">
            {duration > 0 ? formatTime(duration) : '--:--'}
          </span>
        </div>

        {/* Transport Controls Row */}
        <div className="flex items-center justify-between px-1 pt-0.5">
          {/* Left group: Speed & Pitch buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycleSpeed}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition"
              title="מהירות השמעה"
            >
              {playbackRate}x
            </button>

            <button
              type="button"
              onClick={() => setShowPitchPanel((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition ${
                pitchShift !== 0
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : showPitchPanel
                  ? 'bg-slate-200 text-slate-800'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="שינוי גובה צליל (Pitch)"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span dir="ltr">
                {pitchShift === 0
                  ? 'סולם'
                  : pitchShift > 0
                  ? `+${pitchShift}`
                  : `${pitchShift}`}
              </span>
            </button>
          </div>

          {/* Main transport */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => skipSeconds(-10)}
              className="p-2 rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 transition"
              title="10 שניות אחורה"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-200 active:scale-95 transition"
              aria-label={isPlaying ? 'השהה' : 'נגן'}
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(10)}
              className="p-2 rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 transition"
              title="10 שניות קדימה"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
