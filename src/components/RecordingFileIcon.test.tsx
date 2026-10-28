import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RecordingItem } from '../types';
import { RecordingFileIcon } from './RecordingFileIcon';
import { TeacherLibraryManager } from './TeacherLibraryManager';

const file: RecordingItem = {
  id: 'file', title: 'Original file', aliyah: 'Display name', category: 'shabbat',
  ext: 'mp3', viewUrl: '/file',
};

afterEach(() => vi.unstubAllEnvs());

describe('storage file icons', () => {
  it.each([
    ['mp3', 'הקלטה'], ['aac', 'הקלטה'], ['m4a', 'הקלטה'], ['pdf', 'מסמך'],
    ['png', 'תמונה'], ['jpg', 'תמונה'], ['jpeg', 'תמונה'], ['webp', 'תמונה'],
  ] as const)('shows an accessible %s icon labelled %s', (ext, label) => {
    expect(renderToStaticMarkup(<RecordingFileIcon item={{ ...file, ext }} />))
      .toContain(`role="img" aria-label="${label}"`);
  });

  describe('storage gain diagnostics', () => {
    it.each([[undefined, false], ['false', false], ['true', true]])('renders scan details only when enabled (%s)', (flag, enabled) => {
      vi.stubEnv('VITE_AUDIO_GAIN_DEBUG', flag);
      const scanned = { ...file, normalization: { version: 1 as const, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 } };
      const html = renderToStaticMarkup(<TeacherLibraryManager
        teacherId="teacher" teacherToken="test-token" library={{ Folder: [scanned] }}
        normalizationFolderTargets={{}}
        pendingDeletionCount={0} operationError={null} onChange={async () => true} onClose={() => {}}
      />);
      expect(html.includes('תוצאת סריקה:')).toBe(enabled);
      expect(html.includes('נתח עוצמה מחדש')).toBe(enabled);
      expect(html).toContain('הפעל איזון עוצמה אוטומטי לתיקייה');
      expect(html).not.toContain('אחוזון 10');
    });

    it('enables folder leveling for unscanned audio but not for document-only folders', () => {
      const renderLibrary = (items: RecordingItem[]) => renderToStaticMarkup(<TeacherLibraryManager
        teacherId="teacher" teacherToken="test-token" library={{ Folder: items }}
        normalizationFolderTargets={{}}
        pendingDeletionCount={0} operationError={null} onChange={async () => true} onClose={() => {}}
      />);
      const button = (html: string) => html.match(/<button[^>]*>הפעל איזון עוצמה אוטומטי לתיקייה<\/button>/)?.[0];
      expect(button(renderLibrary([file]))).not.toContain('disabled=');
      expect(button(renderLibrary([{ ...file, ext: 'pdf', category: 'doc' }]))).toContain('disabled=');
    });

    it('shows the selected folder target and warns about recordings awaiting analysis', () => {
      const renderLibrary = (targets: Record<string, number>, items: RecordingItem[]) => renderToStaticMarkup(<TeacherLibraryManager
        teacherId="teacher" teacherToken="test-token" library={{ Folder: items }}
        normalizationFolderTargets={targets}
        pendingDeletionCount={0} operationError={null} onChange={async () => true} onClose={() => {}}
      />);
      const inactive = renderLibrary({ Other: -18 }, [file]);
      expect(inactive).toContain('איזון לתיקייה: טרם הוגדר');
      expect(inactive).toContain('הפעל איזון עוצמה אוטומטי לתיקייה');
      expect(inactive).not.toContain('יש הקלטות שטרם נותחו');

      const pending = renderLibrary({ Folder: 0 }, [file]);
      expect(pending).toContain('איזון לתיקייה: הוגדר');
      expect(pending).toContain('יש הקלטות שטרם נותחו');
      expect(pending).toContain('עדכן איזון עוצמה אוטומטי לתיקייה');

      const scanned: RecordingItem = {
        ...file, normalization: {
          version: 2, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6,
          leveling: { duration: 1, integratedLufs: -24, truePeakDbtp: -10, points: [{ time: 0, gainDb: 0 }, { time: 1, gainDb: 0 }] },
        },
      };
      const active = renderLibrary({ Folder: -18 }, [scanned]);
      expect(active).toContain('איזון לתיקייה: הוגדר');
      expect(active).not.toContain('יש הקלטות שטרם נותחו');
    });

    it('still reports invalid scan data with diagnostics disabled', () => {
      vi.stubEnv('VITE_AUDIO_GAIN_DEBUG', 'false');
      const invalid = { ...file, normalization: { version: 1 as const, integratedLufs: -24, truePeakDbtp: -10, gainDb: 99 } };
      const html = renderToStaticMarkup(<TeacherLibraryManager
        teacherId="teacher" teacherToken="test-token" library={{ Folder: [invalid] }}
        normalizationFolderTargets={{}}
        pendingDeletionCount={0} operationError={null} onChange={async () => true} onClose={() => {}}
      />);
      expect(html).toContain('נתוני איזון העוצמה אינם תקינים');
      expect(html).toContain('role="alert"');
    });
  });

  it('renders file-type icons and shared category controls for existing library items', () => {
    const files: RecordingItem[] = [
      file,
      { ...file, id: 'document', ext: 'pdf', category: 'doc' },
      { ...file, id: 'picture', ext: 'png', category: 'doc' },
    ];
    const html = renderToStaticMarkup(<TeacherLibraryManager
      teacherId="teacher" teacherToken="test-token" library={{ Folder: files }}
      normalizationFolderTargets={{}}
      pendingDeletionCount={0} operationError={null} onChange={async () => true} onClose={() => {}}
    />);
    for (const label of ['הקלטה', 'מסמך', 'תמונה']) {
      expect(html).toContain(`role="img" aria-label="${label}"`);
    }
    expect(html.match(/aria-label="סוג קובץ: Display name"/g)).toHaveLength(3);
  });
});
