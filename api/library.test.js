import { beforeEach, describe, expect, it, vi } from 'vitest';
import { r2GetJson, r2PutJson, r2DeleteObject, readJsonBody } from './_r2.js';
import { verifyTeacherToken } from './r2-auth.js';
import handler, { applyLibraryChange } from './library.js';

vi.mock('./_r2.js', () => ({
  r2GetJson: vi.fn(),
  r2PutJson: vi.fn(),
  r2DeleteObject: vi.fn(),
  readJsonBody: vi.fn(),
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
    const data = { ...fixture(), parashaLibrary: { 'בראשית': [recording] } };
    const next = applyLibraryChange(data, { action: 'delete-folder', folder: 'בראשית' }, 'teacher');
    expect(next.parashaLibrary).toEqual({});
    expect(next.students[0].portions).toEqual([document]);
    expect(next.students[1].portions).toEqual([]);
    expect(next.pendingMediaDeletes).toEqual([recording.r2Key]);
  });

  it('deletes a document while keeping the folder and other student assignments', () => {
    const next = applyLibraryChange(fixture(), { action: 'delete-item', folder: 'כללי', itemId: document.id }, 'teacher');
    expect(next.parashaLibrary['כללי']).toEqual([]);
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
});
