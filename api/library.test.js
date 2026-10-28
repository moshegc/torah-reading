import { beforeEach, describe, expect, it, vi } from 'vitest';
import { r2GetJson, r2PutJson, r2DeleteObject, readJsonBody, isLocalTeacherDataActive } from './_r2.js';
import { verifyTeacherToken } from './r2-auth.js';
import handler, { applyLibraryChange } from './library.js';
import dataHandler from './r2-data.js';
import { normalizationMetadataKey } from './_normalization.js';

vi.mock('./_r2.js', () => ({
  r2GetJson: vi.fn(),
  r2PutJson: vi.fn(),
  r2DeleteObject: vi.fn(),
  readJsonBody: vi.fn(),
  isR2Configured: () => true,
  isLocalTeacherDataActive: vi.fn(() => false),
}));
vi.mock('./r2-auth.js', () => ({
  sanitizeTeacherId: (value) => value,
  verifyTeacherToken: vi.fn(),
}));

const recording = {
  id: 'original',
  title: 'Original recording',
  aliyah: 'Original recording',
  category: 'shabbat',
  ext: 'mp3',
  r2Key: 'media/teacher/library/original.mp3',
  viewUrl: '/original.mp3',
  visible: true,
};
const document = {
  ...recording, id: 'document', title: 'Document', category: 'doc', ext: 'pdf',
  r2Key: 'media/teacher/library/document.pdf',
};
const replacement = {
  ...recording, id: 'uploaded', title: 'Replacement', ext: 'm4a',
  r2Key: 'media/teacher/library/new.m4a', viewUrl: '/new.m4a',
};

function fixture() {
  return structuredClone({
    students: [
      { id: 'visible-student', portions: [{ ...recording, visible: true }, document] },
      { id: 'hidden-student', portions: [{ ...recording, visible: false }] },
    ],
    parashaLibrary: { 'בראשית': [recording], 'כללי': [document] },
    haftarotMap: {},
    settings: { defaultHaftarahTradition: 'ashkenazi' },
    updatedAt: '2026-10-22T17:00:00Z',
  });
}
function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() };
}
async function request(change) {
  readJsonBody.mockResolvedValue(change);
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer token' } }, res);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

let stored;
beforeEach(() => {
  vi.resetAllMocks();
  stored = fixture();
  verifyTeacherToken.mockReturnValue({ teacherId: 'teacher' });
  r2GetJson.mockImplementation(async () => structuredClone(stored));
  r2PutJson.mockImplementation(async (_key, data) => { stored = structuredClone(data); });
  r2DeleteObject.mockResolvedValue(undefined);
});

describe('library changes', () => {
  const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };

  it('chooses the folder percentile independently and applies each student’s parsha target to all assigned audio', () => {
    const outlier = { ...recording, normalization: { version: 1, integratedLufs: -52, truePeakDbtp: -30, gainDb: 12 } };
    const normal = Array.from({ length: 10 }, (_, index) => ({
      ...recording, id: `normal-${index}`, r2Key: `media/teacher/library/${index}.mp3`, normalization,
    }));
    const next = applyLibraryChange({
      students: [
        { id: 'student', parasha: 'first', portions: [{ ...normal[0], visible: false }] },
        { id: 'other-student', parasha: 'second', portions: [normal[0]] },
      ],
      normalizationFolderTargets: { second: -30 },
      parashaLibrary: {
        first: [outlier, ...normal, { ...outlier, id: 'alias' }],
        second: [{ ...normal[0], id: 'shared' }, {
          ...outlier, id: 'other-outlier', r2Key: 'media/teacher/library/other.mp3',
          normalization: { version: 1, integratedLufs: -80, truePeakDbtp: -30, gainDb: 12 },
        }],
      },
    }, { action: 'recalculate-normalization-target', folder: 'first' }, 'teacher');
    expect(next.normalizationFolderTargets).toEqual({ first: -18, second: -30 });
    expect(next).not.toHaveProperty('normalizationTargetLufs');
    expect(next.students[0].portions[0]).toMatchObject({ visible: false, normalization: { targetLufs: -18, gainDb: 6 } });
    expect(next.students[1].portions[0].normalization).toMatchObject({ targetLufs: -30, gainDb: -6 });
    expect(next.parashaLibrary.first[1].normalization.gainDb).toBe(6);
    expect(next.parashaLibrary.second[0].normalization.gainDb).toBe(-6);
    const recalculated = applyLibraryChange(next, {
      action: 'recalculate-normalization-target', folder: 'second',
    }, 'teacher');
    expect(recalculated.normalizationFolderTargets).toEqual({ first: -18, second: -68 });
    expect(recalculated.students[0].portions[0].normalization.gainDb).toBe(6);
    expect(() => applyLibraryChange(next, {
      action: 'recalculate-normalization-target', folder: 'missing',
    }, 'teacher')).toThrow('התיקייה אינה קיימת');
  });

  it('saves normalization for matching files in every folder and student without changing visibility', () => {
    const data = fixture();
    data.parashaLibrary.shared = [{ ...recording, id: 'alias' }];
    data.students[1].portions[0].id = 'student-alias';
    const next = applyLibraryChange(data, {
      action: 'set-item-normalization', folder: 'בראשית', itemId: recording.id,
      r2Key: recording.r2Key, normalization,
    }, 'teacher');
    expect(next.parashaLibrary.shared[0].normalization).toEqual(normalization);
    expect(next.students[0].portions[0]).toMatchObject({ normalization, visible: true });
    expect(next.students[1].portions[0]).toMatchObject({ normalization, visible: false });
    expect(next.pendingMediaDeletes).toEqual([]);
    expect(data.students[0].portions[0].normalization).toBeUndefined();
  });

  it('rejects stale analysis, document analysis and unsafe or malformed gains', () => {
    const change = {
      action: 'set-item-normalization', folder: 'בראשית', itemId: recording.id,
      r2Key: recording.r2Key, normalization,
    };
    expect(() => applyLibraryChange(fixture(), { ...change, r2Key: 'old-file' }, 'teacher')).toThrow('הוחלף');
    expect(() => applyLibraryChange(fixture(), {
      ...change, folder: 'כללי', itemId: document.id, r2Key: document.r2Key,
    }, 'teacher')).toThrow();
    for (const invalid of [null, {}, { ...normalization, gainDb: 40 }, { ...normalization, truePeakDbtp: NaN }]) {
      expect(() => applyLibraryChange(fixture(), { ...change, normalization: invalid }, 'teacher')).toThrow();
      expect(() => applyLibraryChange(fixture(), {
        action: 'add-item', folder: 'בראשית', item: { ...replacement, normalization: invalid },
      }, 'teacher')).toThrow();
    }
  });

  it('preserves uploaded analysis when assigned and clears stale analysis on replacement', () => {
    let next = applyLibraryChange(fixture(), {
      action: 'add-student-items', folder: 'בראשית', studentId: 'visible-student',
      items: [{ ...replacement, normalization }],
    }, 'teacher');
    expect(next.students[0].portions.at(-1).normalization).toEqual(normalization);
    next = applyLibraryChange(next, {
      action: 'replace-item', folder: 'בראשית', itemId: replacement.id,
      item: { ...replacement, id: 'new', r2Key: 'media/teacher/library/next.mp3' },
    }, 'teacher');
    expect(next.students[0].portions.at(-1).normalization).toBeUndefined();
  });

  it('persists upload file categories in the library and assigned copies', () => {
    const documentUpload = {
      ...document, id: 'new-document', r2Key: 'media/teacher/library/new-document.pdf', section: 'general',
    };
    const next = applyLibraryChange(fixture(), {
      action: 'add-student-items', folder: 'כללי', studentId: 'visible-student',
      items: [{ ...replacement, section: 'haftarah' }, documentUpload],
    }, 'teacher');
    expect(next.parashaLibrary['כללי']).toContainEqual({ ...replacement, section: 'haftarah' });
    expect(next.students[0].portions).toContainEqual({ ...replacement, section: 'haftarah' });
    expect(next.parashaLibrary['כללי']).toContainEqual(documentUpload);
    expect(next.students[0].portions).toContainEqual(documentUpload);
  });

  it('uses the replacement file category for every student instead of preserving old overrides', () => {
    const data = fixture();
    data.parashaLibrary['בראשית'][0].section = 'general';
    data.students[0].portions[0].section = 'general';
    data.students[1].portions[0].section = 'haftarah';
    const next = applyLibraryChange(data, {
      action: 'replace-item', folder: 'בראשית', itemId: recording.id,
      item: { ...replacement, section: 'torah' },
    }, 'teacher');
    expect(next.students[0].portions[0]).toMatchObject({ section: 'torah', category: 'shabbat', visible: true });
    expect(next.students[1].portions[0]).toMatchObject({ section: 'torah', category: 'shabbat', visible: false });
    expect(next.parashaLibrary['בראשית'][0]).toMatchObject({ section: 'torah', category: 'shabbat' });
  });

  it.each([
    ['torah', 'shabbat'], ['haftarah', 'haftarah'], ['general', 'blessings'],
  ])('changes an existing file to %s for all folders and students', (section, category) => {
    const data = fixture();
    data.parashaLibrary.shared = [{ ...recording, id: 'shared-id', visible: false }];
    data.students[1].portions[0] = { ...recording, id: 'student-copy', visible: false, section: 'general' };
    const next = applyLibraryChange(data, {
      action: 'set-item-section', folder: 'בראשית', itemId: recording.id, section,
    }, 'teacher');
    expect(next.parashaLibrary['בראשית'][0]).toEqual({ ...recording, section, category });
    expect(next.parashaLibrary.shared[0]).toEqual({ ...data.parashaLibrary.shared[0], section, category });
    expect(next.students[0].portions[0]).toEqual({ ...recording, section, category });
    expect(next.students[1].portions[0]).toEqual({ ...data.students[1].portions[0], section, category });
    expect(next.students[0].portions[1]).toEqual(document);
    expect(next.pendingMediaDeletes).toEqual([]);
    expect(data.students[1].portions[0].section).toBe('general');
  });

  it.each(['pdf', 'png', 'jpg', 'jpeg', 'webp'])('keeps %s files as documents when changing their section', (ext) => {
    const data = fixture();
    data.parashaLibrary['כללי'][0].ext = ext;
    const next = applyLibraryChange(data, {
      action: 'set-item-section', folder: 'כללי', itemId: document.id, section: 'haftarah',
    }, 'teacher');
    expect(next.parashaLibrary['כללי'][0]).toMatchObject({ section: 'haftarah', category: 'doc', ext });
    expect(next.students[0].portions[1]).toMatchObject({ section: 'haftarah', category: 'doc' });
  });

  it('keeps weekday Torah classification on a category edit', () => {
    const data = fixture();
    data.parashaLibrary['בראשית'][0].category = 'chol';
    expect(applyLibraryChange(data, {
      action: 'set-item-section', folder: 'בראשית', itemId: recording.id, section: 'torah',
    }, 'teacher').students[0].portions[0]).toMatchObject({ section: 'torah', category: 'chol' });
  });

  it.each(['invalid', '', null])('rejects invalid file category %s without modifying assignments', (section) => {
    const data = fixture();
    expect(() => applyLibraryChange(data, {
      action: 'set-item-section', folder: 'בראשית', itemId: recording.id, section,
    }, 'teacher')).toThrow('סוג חומר לימוד תקין');
    expect(data).toEqual(fixture());
  });

  it('rejects category edits to missing folders or files', () => {
    const change = { action: 'set-item-section', folder: 'בראשית', itemId: recording.id, section: 'general' };
    expect(() => applyLibraryChange(fixture(), { ...change, folder: 'missing' }, 'teacher')).toThrow('התיקייה אינה קיימת');
    expect(() => applyLibraryChange(fixture(), { ...change, itemId: 'missing' }, 'teacher')).toThrow('חומר הלימוד אינו קיים');
  });

  it('rejects an invalid file section', () => {
    expect(() => applyLibraryChange(fixture(), {
      action: 'add-item', folder: 'כללי', item: { ...replacement, section: 'invalid' },
    }, 'teacher')).toThrow('אינם תקינים');
  });

  it('moves a file without changing its identity, visibility or student assignments', () => {
    const data = fixture();
    const next = applyLibraryChange(data, {
      action: 'move-item', folder: 'בראשית', itemId: recording.id, destination: 'כללי',
    }, 'teacher');
    expect(next.parashaLibrary['בראשית']).toEqual([]);
    expect(next.parashaLibrary['כללי']).toEqual([document, recording]);
    expect(next.students).toEqual(data.students);
    expect(next.pendingMediaDeletes).toEqual([]);
    expect(data.parashaLibrary['בראשית']).toEqual([recording]);
  });

  it('rejects missing move destinations and duplicate copies rather than overwriting files', () => {
    const data = fixture();
    const change = { action: 'move-item', folder: 'בראשית', itemId: recording.id, destination: 'missing' };
    expect(() => applyLibraryChange(data, change, 'teacher')).toThrow('אינה קיימת');
    data.parashaLibrary.shared = [{ ...recording, id: 'shared-copy', visible: false }];
    expect(() => applyLibraryChange(data, { ...change, destination: 'shared' }, 'teacher')).toThrow('כבר קיים');
    expect(() => applyLibraryChange(data, { ...change, itemId: 'missing' }, 'teacher')).toThrow('אינו קיים');
    expect(applyLibraryChange(data, { ...change, destination: 'בראשית' }, 'teacher').parashaLibrary).toEqual(data.parashaLibrary);
  });

  it('renames a folder without changing files, student parasha or assignments', () => {
    const data = fixture();
    data.students[0].parasha = 'בראשית';
    const next = applyLibraryChange(data, { action: 'rename-folder', folder: 'בראשית', name: ' Lessons ' }, 'teacher');
    expect(next.parashaLibrary.Lessons).toEqual([recording]);
    expect(next.parashaLibrary).not.toHaveProperty('בראשית');
    expect(next.students).toEqual(data.students);
    expect(next.pendingMediaDeletes).toEqual([]);
    expect(applyLibraryChange(data, { action: 'rename-folder', folder: 'בראשית', name: 'בראשית' }, 'teacher').parashaLibrary).toEqual(data.parashaLibrary);
  });

  it.each(['', '  ', '__proto__', 'constructor', 'prototype', 'כללי'])('rejects invalid or conflicting folder rename %s', (name) => {
    expect(() => applyLibraryChange(fixture(), { action: 'rename-folder', folder: 'בראשית', name }, 'teacher')).toThrow();
  });

  it('renames display labels across copies while preserving filenames and other metadata', () => {
    const data = fixture();
    data.parashaLibrary.shared = [{ ...recording, id: 'shared-id', visible: false }];
    const next = applyLibraryChange(data, { action: 'rename-item', folder: 'בראשית', itemId: recording.id, name: ' New description ' }, 'teacher');
    expect(next.parashaLibrary['בראשית'][0]).toEqual({ ...recording, aliyah: 'New description' });
    expect(next.parashaLibrary.shared[0]).toEqual({ ...data.parashaLibrary.shared[0], aliyah: 'New description' });
    expect(next.students[1].portions[0]).toEqual({ ...recording, visible: false, aliyah: 'New description' });
    expect(next.students[0].portions[1]).toEqual(document);
    expect(next.pendingMediaDeletes).toEqual([]);
    expect(data.parashaLibrary['בראשית'][0]).toEqual(recording);
  });

  it.each(['', '  ', null])('rejects an empty display label %s', (name) => {
    expect(() => applyLibraryChange(fixture(), { action: 'rename-item', folder: 'בראשית', itemId: recording.id, name }, 'teacher')).toThrow('יש להזין שם');
  });

  it('saves student uploads to the selected folder and student together, idempotently', () => {
    const data = fixture();
    const change = { action: 'add-student-items', folder: 'כללי', studentId: 'hidden-student', items: [replacement, replacement] };
    const next = applyLibraryChange(data, change, 'teacher');
    expect(next.parashaLibrary['כללי']).toEqual([document, replacement]);
    expect(next.students[1].portions).toEqual([{ ...recording, visible: false }, replacement]);
    expect(next.students[0]).toEqual(data.students[0]);
    const retried = applyLibraryChange(next, change, 'teacher');
    expect(retried.parashaLibrary).toEqual(next.parashaLibrary);
    expect(retried.students).toEqual(next.students);
    expect(next.pendingMediaDeletes).toEqual([]);
  });

  it('creates the default parasha folder when needed and retains Drive folder metadata', () => {
    const next = applyLibraryChange(fixture(), {
      action: 'add-student-items', folder: 'נח', studentId: 'visible-student',
      items: [replacement], driveFolderUrl: 'https://drive.google.com/drive/folders/example',
    }, 'teacher');
    expect(next.parashaLibrary['נח']).toEqual([replacement]);
    expect(next.students[0].portions).toContainEqual(replacement);
    expect(next.students[0].driveFolderUrl).toBe('https://drive.google.com/drive/folders/example');
  });

  it('validates every upload and the student before changing data', () => {
    const data = fixture();
    const change = { action: 'add-student-items', folder: 'new', studentId: 'visible-student', items: [replacement] };
    expect(() => applyLibraryChange(data, { ...change, studentId: 'missing' }, 'teacher')).toThrow('התלמיד אינו קיים');
    expect(() => applyLibraryChange(data, { ...change, items: [] }, 'teacher')).toThrow();
    expect(() => applyLibraryChange(data, { ...change, items: [replacement, { ...replacement, r2Key: 'media/other/file.mp3' }] }, 'teacher')).toThrow();
    expect(() => applyLibraryChange(data, { ...change, items: [{ ...replacement, id: recording.id }] }, 'teacher')).toThrow('בהחלפת קובץ');
    expect(data).toEqual(fixture());
  });

  it('persists an empty custom folder without mutating the input', () => {
    const original = fixture();
    const next = applyLibraryChange(original, { action: 'create-folder', folder: ' Custom folder ' }, 'teacher');
    expect(next.parashaLibrary['Custom folder']).toEqual([]);
    expect(original.parashaLibrary).not.toHaveProperty('Custom folder');
    expect(next.settings).toEqual(original.settings);
  });

  it.each(['', '  ', '__proto__', 'constructor', 'prototype'])('rejects invalid folder name %s', (folder) => {
    expect(() => applyLibraryChange(fixture(), { action: 'create-folder', folder }, 'teacher')).toThrow();
  });

  it('rejects a duplicate folder and an upload to a deleted folder', () => {
    expect(() => applyLibraryChange(fixture(), { action: 'create-folder', folder: 'כללי' }, 'teacher')).toThrow('כבר קיימת');
    expect(() => applyLibraryChange(fixture(), { action: 'add-item', folder: 'missing', item: replacement }, 'teacher')).toThrow('אינה קיימת');
  });

  it('deletes the last folder and removes its assignments without recreating defaults', () => {
    const data = { ...fixture(), parashaLibrary: { 'בראשית': [recording] }, normalizationFolderTargets: { 'בראשית': -20 } };
    const next = applyLibraryChange(data, { action: 'delete-folder', folder: 'בראשית' }, 'teacher');
    expect(next.parashaLibrary).toEqual({});
    expect(next.normalizationFolderTargets).toEqual({});
    expect(next.students[0].portions).toEqual([document]);
    expect(next.students[1].portions).toEqual([]);
    expect(next.pendingMediaDeletes).toEqual([recording.r2Key]);
  });

  it('deletes a document while keeping the folder and other student assignments', () => {
    const data = { ...fixture(), normalizationFolderTargets: { 'כללי': -20 } };
    const next = applyLibraryChange(data, { action: 'delete-item', folder: 'כללי', itemId: document.id }, 'teacher');
    expect(next.parashaLibrary['כללי']).toEqual([]);
    expect(next.normalizationFolderTargets).toEqual({ 'כללי': -20 });
    expect(next.students[0].portions).toEqual([{ ...recording, visible: true }]);
    expect(next.pendingMediaDeletes).toEqual([document.r2Key]);
  });

  it('preserves shared files and assignments when another folder still references them', () => {
    const data = fixture();
    data.parashaLibrary.shared = [{ ...recording, id: 'another-id' }];
    const next = applyLibraryChange(data, { action: 'delete-folder', folder: 'בראשית' }, 'teacher');
    expect(next.pendingMediaDeletes).toEqual([]);
    expect(next.students).toEqual(data.students);
    expect(next.parashaLibrary.shared).toEqual(data.parashaLibrary.shared);
  });

  it('queues unreferenced leveling data for deleted and replaced recordings, including Drive files', () => {
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    const normalized = { ...recording, normalization, normalizationKey: normalizationMetadataKey('teacher', recording) };
    const key = normalizationMetadataKey('teacher', normalized);
    const data = { ...fixture(), students: [], parashaLibrary: { Folder: [normalized] } };
    const deleted = applyLibraryChange(data, { action: 'delete-item', folder: 'Folder', itemId: normalized.id }, 'teacher');
    expect(deleted.pendingMediaDeletes).toEqual([recording.r2Key, key]);
    const replaced = applyLibraryChange(data, { action: 'replace-item', folder: 'Folder', itemId: normalized.id, item: replacement }, 'teacher');
    expect(replaced.pendingMediaDeletes).toEqual([recording.r2Key, key]);

    const drive = { ...recording, normalization, r2Key: undefined, id: 'drive' };
    const driveData = { ...data, parashaLibrary: { Folder: [drive] } };
    const deletedDrive = applyLibraryChange(driveData, { action: 'delete-folder', folder: 'Folder' }, 'teacher');
    expect(deletedDrive.pendingMediaDeletes).toEqual([normalizationMetadataKey('teacher', drive)]);
  });

  it('keeps leveling data used by another folder or a remaining student reference', () => {
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    const normalized = { ...recording, normalization, normalizationKey: normalizationMetadataKey('teacher', recording) };
    const alias = { ...normalized, id: 'alias' };
    const data = { ...fixture(), students: [], parashaLibrary: { Folder: [normalized], Other: [alias] } };
    const deleted = applyLibraryChange(data, { action: 'delete-folder', folder: 'Folder' }, 'teacher');
    expect(deleted.pendingMediaDeletes).toEqual([]);
    const replaced = applyLibraryChange({
      ...data, parashaLibrary: { Folder: [normalized] },
      students: [{ id: 's', portions: [{ ...normalized, id: 'student-alias', r2Key: 'media/teacher/library/other.mp3' }] }],
    }, { action: 'replace-item', folder: 'Folder', itemId: normalized.id, item: replacement }, 'teacher');
    expect(replaced.pendingMediaDeletes).not.toContain(normalizationMetadataKey('teacher', normalized));
  });

  it('updates copies across folders and students, preserving IDs and per-copy visibility', () => {
    const data = fixture();
    data.parashaLibrary.shared = [{ ...recording, id: 'shared-id', visible: false }];
    const next = applyLibraryChange(data, { action: 'replace-item', folder: 'בראשית', itemId: recording.id, item: replacement }, 'teacher');
    expect(next.parashaLibrary['בראשית'][0]).toMatchObject({ id: 'original', r2Key: replacement.r2Key, visible: true });
    expect(next.parashaLibrary.shared[0]).toMatchObject({ id: 'shared-id', r2Key: replacement.r2Key, visible: false });
    expect(next.students[0].portions[0]).toMatchObject({ id: 'original', r2Key: replacement.r2Key, visible: true });
    expect(next.students[1].portions[0]).toMatchObject({ id: 'original', r2Key: replacement.r2Key, visible: false });
    expect(next.students[0].portions[1]).toEqual(document);
    expect(next.pendingMediaDeletes).toEqual([recording.r2Key]);
  });

  it('queues old student-copy files as well when replacement IDs match but keys differ', () => {
    const data = fixture();
    data.students[0].portions[0].r2Key = 'media/teacher/student/old-copy.mp3';
    const next = applyLibraryChange(data, { action: 'replace-item', folder: 'בראשית', itemId: recording.id, item: replacement }, 'teacher');
    expect(next.pendingMediaDeletes).toEqual([recording.r2Key, 'media/teacher/student/old-copy.mp3']);
  });

  it('does not queue a replacement file that remains in use', () => {
    const next = applyLibraryChange(fixture(), { action: 'replace-item', folder: 'בראשית', itemId: recording.id, item: { ...replacement, r2Key: recording.r2Key } }, 'teacher');
    expect(next.pendingMediaDeletes).toEqual([]);
  });

  it('makes an add-item retry idempotent, but requires explicit replacement for a different file', () => {
    const change = { action: 'add-item', folder: 'בראשית', item: replacement };
    const once = applyLibraryChange(fixture(), change, 'teacher');
    expect(applyLibraryChange(once, change, 'teacher').parashaLibrary['בראשית']).toHaveLength(2);
    expect(() => applyLibraryChange(fixture(), { ...change, item: { ...replacement, id: recording.id } }, 'teacher')).toThrow('בהחלפת קובץ');
  });

  it.each(['media/other/file.mp3', 'media/teacher/../other.mp3', 'media/teacher/..\\other.mp3'])('rejects an unowned or unsafe media key %s', (r2Key) => {
    expect(() => applyLibraryChange(fixture(), { action: 'add-item', folder: 'כללי', item: { ...replacement, r2Key } }, 'teacher')).toThrow();
  });
});

describe('persistent deletion workflow', () => {
  it.each([
    { action: 'move-item', folder: 'בראשית', itemId: recording.id, destination: 'כללי' },
    { action: 'rename-item', folder: 'בראשית', itemId: recording.id, name: 'Display label' },
    { action: 'rename-folder', folder: 'בראשית', name: 'Lessons' },
    { action: 'add-student-items', folder: 'נח', studentId: 'visible-student', items: [replacement] },
    { action: 'set-item-section', folder: 'בראשית', itemId: recording.id, section: 'haftarah' },
  ])('persists $action without deleting media', async (change) => {
    const result = await request(change);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(r2PutJson).toHaveBeenCalledTimes(1);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(stored).toEqual(result.body.data);
  });

  it('returns the persisted file category on subsequent student loads, preserving IDs and visibility', async () => {
    const result = await request({
      action: 'set-item-section', folder: 'בראשית', itemId: recording.id, section: 'haftarah',
    });
    expect(result.status).toBe(200);
    for (const [studentId, visible] of [['visible-student', true], ['hidden-student', false]]) {
      const res = response();
      await dataHandler({ method: 'GET', query: { teacher: 'teacher', student: studentId } }, res);
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.student.portions[0]).toEqual({
        ...recording, section: 'haftarah', category: 'haftarah', visible,
      });
      expect(payload.parashaLibrary).toEqual({});
    }
    expect(stored.parashaLibrary['בראשית'][0]).toMatchObject({ section: 'haftarah', category: 'haftarah' });
    expect(r2DeleteObject).not.toHaveBeenCalled();
  });

  it('requires a verified teacher session and never trusts a teacherId in the body', async () => {
    verifyTeacherToken.mockReturnValue(null);
    expect((await request({ action: 'delete-folder', folder: 'בראשית', teacherId: 'teacher' })).status).toBe(401);
    expect(r2GetJson).not.toHaveBeenCalled();
    expect(r2DeleteObject).not.toHaveBeenCalled();
  });

  it('saves reference removals before permanently deleting a file', async () => {
    const result = await request({ action: 'delete-item', folder: 'בראשית', itemId: recording.id });
    expect(result.status).toBe(200);
    expect(r2PutJson.mock.calls[0][1].pendingMediaDeletes).toEqual([recording.r2Key]);
    expect(r2PutJson.mock.invocationCallOrder[0]).toBeLessThan(r2DeleteObject.mock.invocationCallOrder[0]);
    expect(r2DeleteObject).toHaveBeenCalledWith(recording.r2Key);
    expect(stored.pendingMediaDeletes).toEqual([]);
    expect(result.body.data.students[1].portions).toEqual([]);
  });

  it('does not delete a file when saving the new configuration fails', async () => {
    r2PutJson.mockRejectedValue(new Error('Save failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request({ action: 'delete-folder', folder: 'בראשית' })).status).toBe(500);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('retains a durable cleanup queue on deletion failure and supports retry after reload', async () => {
    r2DeleteObject.mockRejectedValueOnce(new Error('Delete failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await request({ action: 'delete-folder', folder: 'בראשית' });
    expect(failed.status).toBe(500);
    expect(failed.body.ok).toBe(false);
    expect(stored.parashaLibrary).not.toHaveProperty('בראשית');
    expect(stored.pendingMediaDeletes).toEqual([recording.r2Key]);
    expect(failed.body.data.pendingMediaDeletes).toEqual([recording.r2Key]);
    expect((await request({ action: 'create-folder', folder: 'Another folder' })).status).toBe(409);
    expect((await request({ action: 'retry-deletions' })).status).toBe(200);
    expect(stored.pendingMediaDeletes).toEqual([]);
    log.mockRestore();
  });

  it('retries failed leveling-data deletion without losing the durable queue', async () => {
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    const normalized = { ...recording, normalization };
    const key = normalizationMetadataKey('teacher', normalized);
    stored.parashaLibrary['בראשית'] = [normalized];
    stored.students.forEach((student) => {
      student.portions = student.portions.map((item) => item.id === recording.id ? { ...item, normalization } : item);
    });
    r2DeleteObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Metadata delete failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await request({ action: 'delete-item', folder: 'בראשית', itemId: recording.id });
    expect(failed.status).toBe(500);
    expect(stored.pendingMediaDeletes).toEqual([recording.r2Key, key]);
    expect((await request({ action: 'create-folder', folder: 'New' })).status).toBe(409);
    expect((await request({ action: 'retry-deletions' })).status).toBe(200);
    expect(r2DeleteObject.mock.calls.map(([deletedKey]) => deletedKey)).toEqual([recording.r2Key, key, recording.r2Key, key]);
    expect(stored.pendingMediaDeletes).toEqual([]);
    log.mockRestore();
  });

  it('does not delete queued leveling data that has since been referenced again', async () => {
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    const key = normalizationMetadataKey('teacher', recording);
    stored.parashaLibrary['בראשית'][0].normalization = normalization;
    stored.pendingMediaDeletes = [key];
    expect((await request({ action: 'retry-deletions' })).status).toBe(200);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(stored.pendingMediaDeletes).toEqual([]);
  });

  it('rejects leveling metadata keys owned by another teacher', async () => {
    stored.parashaLibrary['בראשית'][0].normalizationKey = `teachers/other/normalization/${'a'.repeat(64)}.json`;
    expect((await request({ action: 'delete-folder', folder: 'בראשית' })).status).toBe(403);
    expect(r2PutJson).not.toHaveBeenCalled();
    expect(r2DeleteObject).not.toHaveBeenCalled();
  });

  it('keeps the queue if saving cleanup completion fails, so deletion can be retried safely', async () => {
    r2PutJson.mockImplementationOnce(async (_key, data) => { stored = structuredClone(data); })
      .mockRejectedValueOnce(new Error('Completion save failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await request({ action: 'delete-item', folder: 'כללי', itemId: document.id });
    expect(failed.status).toBe(500);
    expect(stored.pendingMediaDeletes).toEqual([document.r2Key]);
    expect((await request({ action: 'retry-deletions' })).status).toBe(200);
    expect(r2DeleteObject).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('does not delete a queued file that has since been referenced again', async () => {
    stored.pendingMediaDeletes = [recording.r2Key];
    expect((await request({ action: 'retry-deletions' })).status).toBe(200);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(stored.pendingMediaDeletes).toEqual([]);
  });

  it('rejects deletion of a file owned by another teacher before writing anything', async () => {
    stored.parashaLibrary['כללי'][0].r2Key = 'media/other/document.pdf';
    expect((await request({ action: 'delete-folder', folder: 'כללי' })).status).toBe(403);
    expect(r2PutJson).not.toHaveBeenCalled();
    expect(r2DeleteObject).not.toHaveBeenCalled();
  });

  it('skips deleting hosted media when local teacher data mode is active', async () => {
    isLocalTeacherDataActive.mockReturnValueOnce(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await request({ action: 'delete-folder', folder: 'בראשית' });
    expect(result.status).toBe(200);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(stored.pendingMediaDeletes).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('deletes local leveling data even when hosted media deletion is skipped', async () => {
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    stored.parashaLibrary['בראשית'][0].normalization = normalization;
    isLocalTeacherDataActive.mockReturnValue(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await request({ action: 'delete-folder', folder: 'בראשית' })).status).toBe(200);
    expect(r2DeleteObject).toHaveBeenCalledOnce();
    expect(r2DeleteObject).toHaveBeenCalledWith(normalizationMetadataKey('teacher', recording));
    warn.mockRestore();
  });
});
