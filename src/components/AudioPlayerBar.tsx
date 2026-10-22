import React, { useRef, useState, useEffect, useCallback } from 'react';
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
import { getMediaStreamUrl } from '../utils/trackerCalculations';
import {
  loadStudentPreferences,
  saveStudentPreferences,
  formatPitchLabel,
} from '../utils/studentPreferences';
import {
  createVoicePitchGraph,
  VoicePitchGraph,
} from '../utils/voicePitchShifter';
import { TorahTextViewer } from './TorahTextViewer';

interface AudioPlayerBarProps {
  recording: RecordingItem | null;
  onClose: () => void;
  parashaName?: string;
  haftarahName?: string;
  studentPortions?: RecordingItem[];
  studentId?: string;
  pitchShift?: number;
  onPitchShiftChange?: (nextPitch: number) => void;
  showTextExternally?: boolean;
  onToggleTextExternally?: () => void;
  /** Hide the Sefaria verse text entirely (e.g. teacher view). */
  hideText?: boolean;
  /** Start playing automatically when the recording changes (default true). */
  autoPlay?: boolean;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  recording,
  onClose,
  parashaName,
  haftarahName,
  studentPortions,
  studentId,
  pitchShift: controlledPitchShift,
  onPitchShiftChange,
  showTextExternally,
  onToggleTextExternally,
  hideText = false,
  autoPlay = true,
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
  const [internalPitchShift, setInternalPitchShift] = useState<number>(
    initialPrefs.pitchShift
  );
  const [showPitchPanel, setShowPitchPanel] = useState(false);
  const [showInternalText, setShowInternalText] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pitchShift =
    controlledPitchShift !== undefined ? controlledPitchShift : internalPitchShift;

  const hasSefariaText =
    !hideText &&
    recording &&
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
    setInternalPitchShift(prefs.pitchShift);
    if (audioRef.current) {
      audioRef.current.loop = prefs.isLooping;
      audioRef.current.playbackRate = prefs.playbackRate;
    }
  }, [studentId]);

  // Lazily connect the <audio> element to the PSOLA voice pitch worklet when pitchShift !== 0
  const ensurePitchGraph = useCallback(async (targetPitch: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    // If pitch is 0 and we haven't attached Web Audio yet, keep native direct playback
    if (targetPitch === 0 && !pitchGraphRef.current) {
      return;
    }

    try {
      if (pitchGraphRef.current && attachedAudioElRef.current === audio) {
        if (pitchGraphRef.current.context.state === 'suspended') {
          await pitchGraphRef.current.context.resume();
        }
        pitchGraphRef.current.setPitchSemitones(targetPitch);
        return;
      }

      if (!graphInitPromiseRef.current) {
        graphInitPromiseRef.current = createVoicePitchGraph(audio, targetPitch)
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
        graph.setPitchSemitones(targetPitch);
      }
    } catch (err) {
      console.warn('Voice pitch graph initialization warning:', err);
    }
  }, []);

  // Sync changes to pitchShift into the PSOLA voice pitch worklet
  useEffect(() => {
    if (pitchShift !== 0 || pitchGraphRef.current) {
      ensurePitchGraph(pitchShift);
    }
  }, [pitchShift, ensurePitchGraph]);

  // Cleanup graph on unmount
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
    setInternalPitchShift(clamped);
    saveStudentPreferences(studentId, { pitchShift: clamped });
    if (onPitchShiftChange) {
      onPitchShiftChange(clamped);
    }
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
      if (pitchShift !== 0 || pitchGraphRef.current) {
        await ensurePitchGraph(pitchShift);
      }
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
  }, [recording?.id, recording?.customAudioDataUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !recording) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setErrorMsg(null);
      if (pitchShift !== 0 || pitchGraphRef.current) {
        await ensurePitchGraph(pitchShift);
      }
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
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] px-4 py-3">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setIsLoading(false);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => {
          setIsLoading(false);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (!isLooping) setIsPlaying(false);
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

        {errorMsg && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
            <span>{errorMsg}</span>
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
