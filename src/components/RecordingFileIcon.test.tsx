import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RecordingItem } from '../types';
import { RecordingFileIcon } from './RecordingFileIcon';
import { TeacherLibraryManager } from './TeacherLibraryManager';

const file: RecordingItem = {
  id: 'file', title: 'Original file', aliyah: 'Display name', category: 'shabbat',
  ext: 'mp3', viewUrl: '/file',
};

describe('storage file icons', () => {
  it.each([
    ['mp3', 'הקלטה'], ['aac', 'הקלטה'], ['m4a', 'הקלטה'], ['pdf', 'מסמך'],
    ['png', 'תמונה'], ['jpg', 'תמונה'], ['jpeg', 'תמונה'], ['webp', 'תמונה'],
  ] as const)('shows an accessible %s icon labelled %s', (ext, label) => {
    expect(renderToStaticMarkup(<RecordingFileIcon item={{ ...file, ext }} />))
      .toContain(`role="img" aria-label="${label}"`);
  });

  it('renders file-type icons and shared category controls for existing library items', () => {
    const files: RecordingItem[] = [
      file,
      { ...file, id: 'document', ext: 'pdf', category: 'doc' },
      { ...file, id: 'picture', ext: 'png', category: 'doc' },
    ];
    const html = renderToStaticMarkup(<TeacherLibraryManager
      teacherId="teacher" teacherToken="test-token" library={{ Folder: files }}
      pendingDeletionCount={0} operationError={null} onChange={async () => true} onClose={() => {}}
    />);
    for (const label of ['הקלטה', 'מסמך', 'תמונה']) {
      expect(html).toContain(`role="img" aria-label="${label}"`);
    }
    expect(html.match(/aria-label="סוג קובץ: Display name"/g)).toHaveLength(3);
  });
});
