import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentView } from './StudentView';
import type { StudentProfile } from '../types';

vi.mock('./TorahTextViewer', () => ({ TorahTextViewer: () => null }));

afterEach(() => vi.unstubAllGlobals());

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
