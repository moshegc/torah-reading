import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentView } from './StudentView';
import { AudioPlayerBar } from './AudioPlayerBar';
import { TorahTextViewer } from './TorahTextViewer';
import type { RecordingItem, StudentProfile } from '../types';

const playbackState = vi.hoisted(() => ({
  enabled: false,
  index: 0,
  values: new Map<number, unknown>(),
}));

vi.mock('./TorahTextViewer', () => ({ TorahTextViewer: vi.fn(() => null) }));
vi.mock('./AudioPlayerBar', () => ({ AudioPlayerBar: vi.fn(() => null) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn(actual.useEffect),
    useState: (initial: unknown) => {
      if (!playbackState.enabled) return actual.useState(initial);
      const index = playbackState.index++;
      const [value] = actual.useState(playbackState.values.has(index) ? playbackState.values.get(index) : initial);
      return [value, (next: unknown) => {
        playbackState.values.set(index, typeof next === 'function' ? next(value) : next);
      }];
    },
  };
});

afterEach(() => {
  playbackState.enabled = false;
  playbackState.index = 0;
  playbackState.values.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('student auto-play', () => {
  const recording = (id: string, aliyah: string, category: RecordingItem['category'] = 'shabbat'): RecordingItem => ({
    id, aliyah, category, title: `${id}.mp3`, ext: 'mp3', viewUrl: `/audio/${id}`,
  });
  const first = recording('first', 'עליית ראשון');
  const second = recording('second', 'עליית שני');
  const third = recording('third', 'עליית שלישי');
  const seventh = recording('seventh', 'עליית שביעי');
  const maftir = recording('maftir', 'מפטיר');
  const haftarah = recording('haftarah', 'הפטרה', 'haftarah');

  function setup(current: RecordingItem, portions: RecordingItem[], enabled = true, haftarahName = 'בראשית') {
    vi.stubGlobal('window', { location: { href: 'https://example.com/?student=student' } });
    const student: StudentProfile = {
      id: 'student', name: 'Student', parasha: 'בראשית', haftarah: haftarahName,
      barMitzvahDate: '2027-01-01', parashaVerses: 146, skippedVerses: 0,
      learnedParashaVerses: 0, haftarahVerses: 31, learnedHaftarahVerses: 0, portions,
    };
    playbackState.enabled = true;
    playbackState.values.set(1, current);
    playbackState.values.set(4, enabled);
    const render = () => {
      playbackState.index = 0;
      vi.mocked(TorahTextViewer).mockClear();
      const html = renderToStaticMarkup(<StudentView student={student} />);
      const calls = vi.mocked(AudioPlayerBar).mock.calls;
      const player = calls[calls.length - 1][0];
      const viewers = vi.mocked(TorahTextViewer).mock.calls.map(([props]) => props);
      return { html, player, viewers };
    };
    const finish = () => {
      render().player.onEnded?.();
      return render();
    };
    return { render, finish };
  }

  it('is off by default and leaves manual playback unchanged when disabled', () => {
    const { render, finish } = setup(first, [first, second], false);
    expect(render().html).not.toContain('הפעלה אוטומטית של הקטע הבא');
    expect(render().player.autoAdvance).toBe(false);
    expect(finish().player.recording?.id).toBe(first.id);
  });

  it('updates auto-play from the audio player checkbox', () => {
    const { render, finish } = setup(first, [first, second], false);
    render().player.onAutoAdvanceChange?.(true);
    expect(render().player.autoAdvance).toBe(true);
    expect(finish().player.recording?.id).toBe(second.id);
    render().player.onAutoAdvanceChange?.(false);
    expect(render().player.autoAdvance).toBe(false);
  });

  it('displays and auto-plays the next portion in reading order', () => {
    const { finish } = setup(first, [third, second, first]);
    const { player, viewers } = finish();
    expect(player.recording?.id).toBe(second.id);
    expect(player.autoPlay).toBe(true);
    expect(viewers.some((props) => props.recording?.id === second.id)).toBe(true);
  });

  it.each(['absent', 'hidden', 'document', 'general'] as const)('displays missing text and stops rather than skipping a %s next recording', (kind) => {
    const unavailable: RecordingItem[] = kind === 'absent' ? [] : [{
      ...second,
      ...(kind === 'hidden' ? { visible: false } : {}),
      ...(kind === 'document' ? { ext: 'pdf' as const, category: 'doc' as const } : {}),
      ...(kind === 'general' ? { section: 'general' as const } : {}),
    }];
    const { finish } = setup(first, [first, ...unavailable, third]);
    const { player, viewers } = finish();
    expect(player.recording).toBeNull();
    expect(viewers.some((props) => props.defaultPortionKey === 'shabbat-2')).toBe(true);
  });

  it('skips the separate maftir recording after seventh and plays haftarah, then stops', () => {
    const { finish } = setup(seventh, [haftarah, maftir, seventh]);
    const result = finish();
    expect(result.player.recording?.id).toBe(haftarah.id);
    expect(result.player.autoPlay).toBe(true);
    expect(result.viewers.some((props) => props.recording?.id === haftarah.id)).toBe(true);
    expect(finish().player.recording?.id).toBe(haftarah.id);
  });

  it('uses the separate maftir recording when selected on its own, then plays haftarah', () => {
    const { render, finish } = setup(maftir, [seventh, maftir, haftarah]);
    expect(render().player.recording?.id).toBe(maftir.id);
    expect(finish().player.recording?.id).toBe(haftarah.id);
  });

  it.each([seventh, maftir])('stops after $id without a configured haftarah', (current) => {
    const { finish } = setup(current, [seventh, maftir, haftarah], true, '');
    expect(finish().player.recording?.id).toBe(current.id);
  });

  it.each([seventh, maftir])('displays the configured haftarah after $id and stops if its recording is missing', (current) => {
    const { finish } = setup(current, [seventh, maftir]);
    const { player, viewers } = finish();
    expect(player.recording).toBeNull();
    expect(viewers.some((props) => props.defaultPortionKey === 'haftarah')).toBe(true);
  });

  it('advances weekday portions without switching to Shabbat readings', () => {
    const kohen = recording('kohen', 'כהן', 'chol');
    const levi = recording('levi', 'לוי', 'chol');
    const { finish } = setup(kohen, [first, levi, kohen]);
    expect(finish().player.recording?.id).toBe(levi.id);
    expect(finish().viewers.some((props) => props.defaultPortionKey === 'chol-3')).toBe(true);
  });

  it('does not advance general recordings', () => {
    const blessing = recording('blessing', 'ברכה', 'blessings');
    const { finish } = setup(blessing, [blessing, first]);
    expect(finish().player.recording?.id).toBe(blessing.id);
  });
});

describe('student opening position', () => {
  it('resets scrolling immediately on opening or changing student, not on profile updates', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { scrollTo, location: { href: 'https://example.com/?student=student' } });
    const student: StudentProfile = {
      id: 'student', name: 'Student', parasha: 'בראשית', haftarah: '',
      barMitzvahDate: '2027-01-01', parashaVerses: 146, skippedVerses: 0,
      learnedParashaVerses: 0, haftarahVerses: 0, learnedHaftarahVerses: 0, portions: [],
    };
    renderToStaticMarkup(<StudentView student={student} />);
    const [resetScroll, dependencies] = vi.mocked(useEffect).mock.calls[0];
    expect(dependencies).toEqual([student.id]);
    resetScroll();
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
});

describe('student file labels', () => {
  it('shows display names, not original filenames, and respects visibility', () => {
    vi.stubGlobal('window', { location: { href: 'https://example.com/?student=student' } });
    const student: StudentProfile = {
      id: 'student', name: 'Student', parasha: 'בראשית', haftarah: '',
      barMitzvahDate: '2027-01-01', parashaVerses: 146, skippedVerses: 0,
      learnedParashaVerses: 0, haftarahVerses: 0, learnedHaftarahVerses: 0,
      portions: [
        { id: 'audio', title: 'private-recording.mp3', aliyah: 'First portion', category: 'shabbat', ext: 'mp3', viewUrl: '/audio' },
        { id: 'doc', title: 'private-document.pdf', aliyah: 'Practice guide', category: 'doc', ext: 'pdf', viewUrl: '/document' },
        { id: 'hidden', title: 'hidden.mp3', aliyah: 'Hidden portion', category: 'shabbat', ext: 'mp3', viewUrl: '/hidden', visible: false },
      ],
    };
    const html = renderToStaticMarkup(<StudentView student={student} />);
    expect(html).toContain('First portion');
    expect(html).toContain('Practice guide');
    expect(html).not.toContain('private-recording.mp3');
    expect(html).not.toContain('private-document.pdf');
    expect(html).not.toContain('Hidden portion');
    expect(html).not.toContain('Pitch');
  });

  it('sorts Torah portions and excludes unassigned folders and other sections', () => {
    vi.stubGlobal('window', { location: { href: 'https://example.com/?student=student' } });
    const item = (id: string, aliyah: string): StudentProfile['portions'][number] => ({
      id, aliyah, title: `${id}.mp3`, ext: 'mp3', category: 'shabbat', viewUrl: '/audio',
    });
    const student: StudentProfile = {
      id: 'student', name: 'Student', parasha: 'בראשית', haftarah: '',
      barMitzvahDate: '2027-01-01', parashaVerses: 146, skippedVerses: 0,
      learnedParashaVerses: 0, haftarahVerses: 0, learnedHaftarahVerses: 0,
      portions: [
        item('third', 'עליית שלישי'), item('second', 'עליית שני'), item('first', 'עליית ראשון'),
        { ...item('general', 'Assigned general'), section: 'general' },
        { ...item('haftarah', 'Assigned Haftarah'), section: 'haftarah' },
        { ...item('document', 'Haftarah document'), ext: 'pdf', category: 'doc', section: 'haftarah' },
      ],
    };
    const html = renderToStaticMarkup(<StudentView student={student} parashaLibrary={{ 'כללי': [item('unassigned', 'Unassigned material')] }} />);
    expect(html.indexOf('עליית ראשון')).toBeLessThan(html.indexOf('עליית שני'));
    expect(html.indexOf('עליית שני')).toBeLessThan(html.indexOf('עליית שלישי'));
    for (const label of ['Unassigned material', 'Assigned general', 'Assigned Haftarah', 'Haftarah document']) {
      expect(html).not.toContain(label);
    }
  });
});
