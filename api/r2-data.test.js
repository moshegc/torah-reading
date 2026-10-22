import { beforeEach, describe, expect, it, vi } from 'vitest';
import { r2GetJson, r2PutJson, readJsonBody } from './_r2.js';
import handler from './r2-data.js';

vi.mock('./_r2.js', () => ({
  r2GetJson: vi.fn(),
  r2PutJson: vi.fn(),
  readJsonBody: vi.fn(),
  isR2Configured: () => true,
}));

vi.mock('./r2-auth.js', () => ({
  sanitizeTeacherId: (value) => value || '',
  verifyTeacherToken: () => ({ teacherId: 'teacher' }),
}));

const student = { id: 'student', name: 'Test student', portions: [] };
const library = {
  'כללי': [{ id: 'audio', category: 'shabbat', title: 'General audio' }],
  'תמונות': [{ id: 'document', category: 'doc', title: 'General document' }],
  'בראשית': [{ id: 'private-library-recording', category: 'shabbat' }],
};

function response() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  r2GetJson.mockResolvedValue({
    students: [student, { id: 'other-student' }],
    haftarotMap: {},
    parashaLibrary: library,
    updatedAt: '2026-10-22T16:45:00Z',
  });
});

describe('teacher-owned study materials', () => {
  it('includes only the general library and requested student in a student response', async () => {
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);
    expect(r2GetJson).toHaveBeenCalledWith('teachers/teacher/data.json');
    const payload = res.json.mock.calls[0][0];
    expect(payload.student).toEqual(student);
    expect(payload.parashaLibrary).toEqual({ 'כללי': library['כללי'], 'תמונות': library['תמונות'] });
    expect(payload).not.toHaveProperty('data');
    expect(payload.parashaLibrary).not.toHaveProperty('בראשית');
  });

  it('does not return materials for a missing student', async () => {
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'missing' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      student: null, parashaLibrary: {},
    }));
  });

  it('returns empty general folders rather than personal defaults for an unconfigured library', async () => {
    r2GetJson.mockResolvedValue({ students: [student] });
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      parashaLibrary: { 'כללי': [], 'תמונות': [] },
    }));
  });

  it('still loads the full library for the teacher', async () => {
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher' } }, res);
    expect(res.json.mock.calls[0][0].data.parashaLibrary).toEqual(library);
  });

  it('preserves the migrated library when saving student changes', async () => {
    readJsonBody.mockResolvedValue({ students: [student], haftarotMap: {} });
    r2PutJson.mockResolvedValue({ storage: 'r2' });
    const res = response();
    await handler({ method: 'POST', headers: {} }, res);
    expect(r2PutJson).toHaveBeenCalledWith('teachers/teacher/data.json', expect.objectContaining({
      students: [student], parashaLibrary: library,
    }));
  });

  it('persists uploaded library entries alongside existing folders', async () => {
    const updatedLibrary = {
      ...library,
      'כללי': [...library['כללי'], { id: 'new-audio', category: 'blessings', r2Key: 'media/teacher/library/new.mp3' }],
    };
    readJsonBody.mockResolvedValue({ students: [student], haftarotMap: {}, parashaLibrary: updatedLibrary });
    r2PutJson.mockResolvedValue({ storage: 'r2' });
    const res = response();
    await handler({ method: 'POST', headers: {} }, res);
    expect(r2PutJson).toHaveBeenCalledWith('teachers/teacher/data.json', expect.objectContaining({
      parashaLibrary: updatedLibrary,
    }));
  });

  it('does not let a regular data save discard pending permanent deletions', async () => {
    r2GetJson.mockResolvedValue({
      students: [student], parashaLibrary: library, pendingMediaDeletes: ['media/teacher/library/old.mp3'],
    });
    readJsonBody.mockResolvedValue({ students: [student], haftarotMap: {}, pendingMediaDeletes: [] });
    r2PutJson.mockResolvedValue({ storage: 'r2' });
    await handler({ method: 'POST', headers: {} }, response());
    expect(r2PutJson).toHaveBeenCalledWith('teachers/teacher/data.json', expect.objectContaining({
      pendingMediaDeletes: ['media/teacher/library/old.mp3'],
    }));
  });
});
