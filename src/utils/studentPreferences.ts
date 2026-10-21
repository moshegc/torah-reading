export interface StudentLocalPreferences {
  pitchShift: number; // in semitones, default 0 (no pitch shift)
  playbackRate: number; // speed multiplier, default 1.0
  isLooping: boolean; // default false
}

export const DEFAULT_STUDENT_PREFERENCES: StudentLocalPreferences = {
  pitchShift: 0,
  playbackRate: 1.0,
  isLooping: false,
};

const PREFS_STORAGE_PREFIX = 'torah_trainer_student_prefs_v1_';

function getStorageKey(studentId?: string): string {
  return `${PREFS_STORAGE_PREFIX}${studentId ? studentId.toLowerCase().trim() : 'default'}`;
}

export function loadStudentPreferences(studentId?: string): StudentLocalPreferences {
  try {
    const raw = localStorage.getItem(getStorageKey(studentId));
    if (!raw) return { ...DEFAULT_STUDENT_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      pitchShift:
        typeof parsed.pitchShift === 'number' && Number.isFinite(parsed.pitchShift)
          ? Math.max(-12, Math.min(12, parsed.pitchShift))
          : DEFAULT_STUDENT_PREFERENCES.pitchShift,
      playbackRate:
        typeof parsed.playbackRate === 'number' &&
        [0.75, 0.85, 1.0, 1.15, 1.25].includes(parsed.playbackRate)
          ? parsed.playbackRate
          : DEFAULT_STUDENT_PREFERENCES.playbackRate,
      isLooping:
        typeof parsed.isLooping === 'boolean'
          ? parsed.isLooping
          : DEFAULT_STUDENT_PREFERENCES.isLooping,
    };
  } catch {
    return { ...DEFAULT_STUDENT_PREFERENCES };
  }
}

export function saveStudentPreferences(
  studentId: string | undefined,
  prefs: Partial<StudentLocalPreferences>
): StudentLocalPreferences {
  const current = loadStudentPreferences(studentId);
  const updated: StudentLocalPreferences = {
    ...current,
    ...prefs,
  };
  try {
    localStorage.setItem(getStorageKey(studentId), JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }
  return updated;
}

export function formatPitchLabel(semitones: number): string {
  if (semitones === 0) return 'ללא שינוי (0)';
  const sign = semitones > 0 ? `+${semitones}` : `${semitones}`;
  return `${sign} חצאי טון`;
}

