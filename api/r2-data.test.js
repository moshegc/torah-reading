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

describe('student archive persistence', () => {
  it.each([true, false])('preserves student data and personal links when archived is %s', async (archived) => {
    const recording = {
      id: 'assigned-recording', category: 'shabbat', section: 'torah',
      r2Key: 'media/teacher/library/assigned.mp3', visible: true,
    };
    const updatedStudent = {
      ...student, archived, parasha: 'Test', barMitzvahDate: '2027-04-01',
      studyStartDate: '2026-11-15',
      learnedParashaVerses: 12, learnedHaftarahVerses: 5,
      readingPlan: { weekday: false, aliyot: ['1'], maftir: false, haftarah: true }, portions: [recording],
    };
    const legacyStudent = { id: 'legacy', name: 'Legacy student', portions: [] };
    const students = [updatedStudent, legacyStudent];
    const parashaLibrary = { Test: [recording] };
    r2GetJson.mockResolvedValue({ students, parashaLibrary });
    readJsonBody.mockResolvedValue({ students, haftarotMap: {} });
    r2PutJson.mockResolvedValue({ storage: 'r2' });

    const saveResponse = response();
    await handler({ method: 'POST', headers: {} }, saveResponse);
    expect(saveResponse.status).toHaveBeenCalledWith(200);
    expect(r2PutJson).toHaveBeenCalledWith('teachers/teacher/data.json', expect.objectContaining({
      students, parashaLibrary,
    }));

    const storedData = r2PutJson.mock.calls[0][1];
    r2GetJson.mockResolvedValue(JSON.parse(JSON.stringify(storedData)));
    const teacherResponse = response();
    await handler({ method: 'GET', query: { teacher: 'teacher' } }, teacherResponse);
    expect(teacherResponse.json.mock.calls[0][0].data.students).toEqual(students);

    const studentResponse = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, studentResponse);
    expect(studentResponse.json.mock.calls[0][0].student).toEqual(updatedStudent);
  });
});

describe('teacher-owned study materials', () => {
  it.each([
    ['torah', 'shabbat', 'mp3'],
    ['haftarah', 'haftarah', 'mp3'],
    ['general', 'blessings', 'mp3'],
    ['torah', 'doc', 'pdf'],
    ['haftarah', 'doc', 'pdf'],
    ['general', 'doc', 'pdf'],
  ])('returns an assigned %s file (%s, %s) with its designation and media metadata', async (section, category, ext) => {
    const assignedFile = {
      id: `assigned-${section}-${ext}`,
      title: `original.${ext}`,
      aliyah: 'Assigned display name',
      section,
      category,
      ext,
      visible: true,
      r2Key: `media/teacher/library/assigned-${section}.${ext}`,
      r2Url: `/api/r2-media?key=assigned-${section}.${ext}`,
      viewUrl: `/assigned-${section}.${ext}`,
    };
    const assignedStudent = { ...student, portions: [assignedFile] };
    r2GetJson.mockResolvedValue({
      students: [assignedStudent, { id: 'other-student', portions: [] }],
      parashaLibrary: { ...library, 'Custom folder': [assignedFile] },
    });

    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.student).toEqual(assignedStudent);
    expect(payload.student.portions).toEqual([assignedFile]);
    expect(payload.parashaLibrary).toEqual({});
    expect(payload).not.toHaveProperty('data');
  });

  it('returns all of the requested student assignments but no other students or unassigned materials', async () => {
    const portions = [
      { ...library['בראשית'][0], section: 'torah', aliyah: 'First portion', ext: 'mp3', visible: true },
      { id: 'assigned-haftarah', category: 'haftarah', section: 'haftarah', aliyah: 'Haftarah', ext: 'mp3', visible: true },
      { ...library['כללי'][0], category: 'blessings', section: 'general', aliyah: 'General practice', ext: 'mp3', visible: true },
      { ...library['תמונות'][0], section: 'general', aliyah: 'Practice guide', ext: 'pdf', visible: true },
    ];
    const assignedStudent = { ...student, portions };
    const otherStudent = {
      id: 'other-student',
      portions: [{ id: 'other-student-only', category: 'haftarah', section: 'haftarah' }],
    };
    const unassignedFile = { id: 'unassigned-general', category: 'blessings', section: 'general' };
    r2GetJson.mockResolvedValue({
      students: [otherStudent, assignedStudent],
      parashaLibrary: {
        ...library,
        'בראשית': [portions[0]],
        'כללי': [portions[2], unassignedFile],
        'תמונות': [portions[3]],
      },
    });

    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.student).toEqual(assignedStudent);
    expect(payload.student.portions).toEqual(portions);
    expect(payload.parashaLibrary).toEqual({});
    expect(payload).not.toHaveProperty('data');
    expect(payload).not.toHaveProperty('students');
    expect(JSON.stringify(payload)).not.toContain(otherStudent.id);
    expect(JSON.stringify(payload)).not.toContain(otherStudent.portions[0].id);
    expect(JSON.stringify(payload)).not.toContain(unassignedFile.id);
  });

  it('returns directly assigned files even when the teacher has no library folders', async () => {
    const assignedFile = {
      id: 'student-upload', title: 'upload.mp3', aliyah: 'Student practice',
      category: 'blessings', section: 'general', ext: 'mp3', visible: true,
      r2Key: 'media/teacher/student/upload.mp3', viewUrl: '/student-upload.mp3',
    };
    const assignedStudent = { ...student, portions: [assignedFile] };
    r2GetJson.mockResolvedValue({ students: [assignedStudent] });

    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true, student: assignedStudent, parashaLibrary: {},
    }));
  });

  it.each(['student', undefined])('uses the stored file category instead of stale student overrides (student=%s)', async (studentId) => {
    const source = {
      id: 'library-file', section: 'haftarah', category: 'haftarah', ext: 'mp3',
      r2Key: 'media/teacher/library/shared.mp3', title: 'Original file', aliyah: 'Haftarah',
    };
    const assigned = {
      ...source, id: 'student-copy', section: 'general', category: 'blessings', visible: false,
    };
    const data = {
      students: [{ ...student, portions: [assigned] }],
      parashaLibrary: { Custom: [source] },
    };
    r2GetJson.mockResolvedValue(data);
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: studentId } }, res);
    const payload = res.json.mock.calls[0][0];
    const profile = studentId ? payload.student : payload.data.students[0];
    expect(profile.portions).toEqual([{ ...assigned, section: 'haftarah', category: 'haftarah' }]);
    expect(data.students[0].portions).toEqual([assigned]);
    if (studentId) expect(payload.parashaLibrary).toEqual({});
  });

  it('does not persist a student category override submitted during a regular save', async () => {
    const source = {
      id: 'shared', category: 'haftarah', section: 'haftarah', ext: 'mp3',
      r2Key: 'media/teacher/library/shared.mp3',
    };
    const assigned = { ...source, category: 'blessings', section: 'general', visible: true };
    r2GetJson.mockResolvedValue({ parashaLibrary: { Custom: [source] } });
    readJsonBody.mockResolvedValue({ students: [{ ...student, portions: [assigned] }] });
    r2PutJson.mockResolvedValue({ storage: 'r2' });
    await handler({ method: 'POST', headers: {} }, response());
    expect(r2PutJson).toHaveBeenCalledWith('teachers/teacher/data.json', expect.objectContaining({
      students: [{ ...student, portions: [{ ...assigned, section: 'haftarah', category: 'haftarah' }] }],
    }));
  });

  it('returns canonical normalization to students and preserves it during regular saves', async () => {
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    const source = {
      id: 'shared', category: 'shabbat', ext: 'mp3',
      r2Key: 'media/teacher/library/shared.mp3', normalization,
    };
    const assigned = { ...source, id: 'alias', visible: false, normalization: undefined };
    r2GetJson.mockResolvedValue({
      students: [{ ...student, portions: [assigned] }], parashaLibrary: { Custom: [source] },
    });
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);
    expect(res.json.mock.calls[0][0].student.portions[0]).toMatchObject({ normalization, visible: false });
    readJsonBody.mockResolvedValue({ students: [{ ...student, portions: [assigned] }] });
    r2PutJson.mockResolvedValue({ storage: 'r2' });
    await handler({ method: 'POST', headers: {} }, response());
    expect(r2PutJson).toHaveBeenCalledWith('teachers/teacher/data.json', expect.objectContaining({
      students: [{ ...student, portions: [{ ...assigned, normalization }] }],
    }));
  });

  it('uses a legacy file category even when a student copy has an explicit conflicting section', async () => {
    const source = { id: 'legacy', category: 'blessings', ext: 'mp3' };
    const assigned = { ...source, category: 'shabbat', section: 'torah', visible: true };
    r2GetJson.mockResolvedValue({
      students: [{ ...student, portions: [assigned] }],
      parashaLibrary: { Custom: [source] },
    });
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);
    const returned = res.json.mock.calls[0][0].student.portions[0];
    expect(returned).toEqual({ ...source, visible: true });
    expect(returned).not.toHaveProperty('section');
  });

  it('returns only the requested student and no unassigned library folders', async () => {
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);
    expect(r2GetJson).toHaveBeenCalledWith('teachers/teacher/data.json');
    const payload = res.json.mock.calls[0][0];
    expect(payload.student).toEqual(student);
    expect(payload.parashaLibrary).toEqual({});
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

  it('returns no library folders for an unconfigured library', async () => {
    r2GetJson.mockResolvedValue({ students: [student] });
    const res = response();
    await handler({ method: 'GET', query: { teacher: 'teacher', student: 'student' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      parashaLibrary: {},
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
