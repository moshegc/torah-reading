import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutLink, AboutPage } from './AboutPage';
import { AudioPlayerBar } from './AudioPlayerBar';
import type { RecordingItem } from '../types';

afterEach(() => vi.unstubAllGlobals());

describe('About page', () => {
  it('links to About without losing student share parameters', () => {
    vi.stubGlobal('window', { location: { href: 'https://example.com/?teacher=test&student=student-id' } });
    const html = renderToStaticMarkup(<AboutLink />);
    expect(html).toContain('href="/?teacher=test&amp;student=student-id&amp;about=1"');
  });

  it('shows contact details, source code, attribution and licenses', () => {
    vi.stubGlobal('window', { location: { href: 'https://example.com/?teacher=test&student=student-id&about=1' } });
    const html = renderToStaticMarkup(<AboutPage />);
    for (const text of [
      'Moshe Goren',
      'mailto:mosheg81@gmail.com',
      'https://github.com/moshegc/torah-reading',
      'https://www.hebcal.com/',
      '/licenses/hebcal-core.txt',
      '/licenses/hebcal-leyning.txt',
      'https://www.sefaria.org/',
      'Dovi',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="/?teacher=test&amp;student=student-id"');
    expect(html).not.toContain('about=1');
  });

  it('returns to the landing page when there is no student link', () => {
    vi.stubGlobal('window', { location: { href: 'https://example.com/?about=1' } });
    expect(renderToStaticMarkup(<AboutPage />)).toContain('href="/"');
  });
});

describe('player controls', () => {
  it('offers an accessible close button instead of a Drive link', () => {
    const recording: RecordingItem = {
      id: 'test-recording',
      title: 'Test recording',
      aliyah: 'Test',
      category: 'blessings',
      ext: 'mp3',
      viewUrl: 'https://drive.google.com/file/d/test/view',
    };
    const html = renderToStaticMarkup(
      <AudioPlayerBar recording={recording} onClose={() => {}} hideText />
    );
    expect(html).toContain('aria-label="סגור נגן"');
    expect(html).not.toContain('drive.google.com');
    expect(html).not.toContain('Drive');
  });

  it('hides the player when no recording is selected', () => {
    expect(renderToStaticMarkup(
      <AudioPlayerBar recording={null} onClose={() => {}} />
    )).toBe('');
  });
});
