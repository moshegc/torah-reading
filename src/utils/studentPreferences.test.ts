import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STUDENT_PREFERENCES,
  loadRecordingPitch,
  loadStudentPreferences,
  saveRecordingPitch,
  saveStudentPreferences,
} from './studentPreferences';

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recording pitch preferences', () => {
  it('starts at normal pitch and ignores the former student-wide default', () => {
    localStorage.setItem('torah_trainer_student_prefs_v1_student', JSON.stringify({
      ...DEFAULT_STUDENT_PREFERENCES, pitchShift: 4,
    }));
    expect(loadRecordingPitch('student', 'first')).toBe(0);
    expect(loadStudentPreferences('student')).not.toHaveProperty('pitchShift');
  });

  it('remembers the latest pitch independently for each student and recording', () => {
    saveRecordingPitch('student', 'first', 2);
    saveRecordingPitch('student', 'second', -1.5);
    saveRecordingPitch('other', 'first', 4);
    saveRecordingPitch(undefined, 'first', -3);
    saveRecordingPitch('student', 'first', 0.5);

    expect(loadRecordingPitch('student', 'first')).toBe(0.5);
    expect(loadRecordingPitch('student', 'second')).toBe(-1.5);
    expect(loadRecordingPitch('other', 'first')).toBe(4);
    expect(loadRecordingPitch(undefined, 'first')).toBe(-3);
    expect(loadRecordingPitch('student', 'unplayed')).toBe(0);
    expect(loadRecordingPitch(' STUDENT ', 'first')).toBe(0.5);
  });

  it('persists resetting a recording without changing other recordings or preferences', () => {
    saveStudentPreferences('student', { playbackRate: 0.85, textFontSize: 'lg' });
    saveRecordingPitch('student', 'first', 2);
    saveRecordingPitch('student', 'second', -2);
    saveRecordingPitch('student', 'first', 0);
    saveStudentPreferences('student', { isLooping: true });

    expect(loadRecordingPitch('student', 'first')).toBe(0);
    expect(loadRecordingPitch('student', 'second')).toBe(-2);
    expect(loadStudentPreferences('student')).toEqual({
      ...DEFAULT_STUDENT_PREFERENCES, playbackRate: 0.85, textFontSize: 'lg', isLooping: true,
    });
  });

  it.each([
    [20, 6], [-20, -6], [1.2, 1], [-1.7, -1.5], [NaN, 0], [Infinity, 0],
  ])('normalizes pitch %s to %s', (pitch, expected) => {
    saveRecordingPitch('student', 'first', pitch);
    expect(loadRecordingPitch('student', 'first')).toBe(expected);
  });

  it.each(['null', '"2"', '{}', '15', '-15'])('validates stored pitch %s', (raw) => {
    vi.mocked(localStorage.getItem).mockReturnValue(raw);
    expect(loadRecordingPitch('student', 'first')).toBe(
      raw === '15' ? 6 : raw === '-15' ? -6 : 0
    );
  });

  it('logs corrupt or inaccessible storage instead of silently failing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(localStorage.getItem).mockReturnValue('{broken');
    expect(loadRecordingPitch('student', 'first')).toBe(0);
    expect(warn).toHaveBeenCalledWith('Could not load recording pitch:', expect.any(Error));
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('Storage full'); });
    saveRecordingPitch('student', 'first', 2);
    expect(warn).toHaveBeenCalledWith('Could not save recording pitch:', expect.any(Error));
  });
});
