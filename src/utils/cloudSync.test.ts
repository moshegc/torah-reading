import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchR2StudentData,
  fetchR2TeacherData,
  googleAuthTeacherR2,
  loginTeacherR2,
  registerTeacherR2,
  saveR2TeacherData,
  transferDriveFilesToR2,
  uploadLocalFileToR2,
  changeTeacherLibrary,
  LibraryMutationError,
} from './cloudSync';
import { analyzeUpload } from '../audio/analyzeRecording';

vi.mock('../audio/analyzeRecording', () => ({ analyzeUpload: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const teacher = { teacherId: 'test', token: 'test-token' };
const saveParams = { ...teacher, students: [], haftarotMap: {} };

describe('upload loudness analysis', () => {
  const params = {
    ...teacher, studentId: 'student', fileName: 'audio.mp3',
    mimeType: 'audio/mpeg', ext: 'mp3', base64Data: 'data:audio/mpeg;base64,AAAA',
  };
  const normalization = { version: 1 as const, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
  function mockUpload() {
    const blob = new Blob(['original']);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => blob })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: 'uploaded' }) });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, blob };
  }

  it('analyses before upload, preserves original bytes and returns metadata for persistence', async () => {
    const { fetchMock, blob } = mockUpload();
    vi.mocked(analyzeUpload).mockResolvedValue(normalization);
    const onStatus = vi.fn();
    const result = await uploadLocalFileToR2({ ...params, onStatus });
    expect(analyzeUpload).toHaveBeenCalledWith(blob);
    expect(result.normalization).toEqual(normalization);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(params);
    expect(onStatus).toHaveBeenNthCalledWith(1, 'מנתח עוצמת הקלטה...');
    expect(onStatus).toHaveBeenNthCalledWith(2, 'מעלה קובץ...');
  });

  it('does not upload if analysis is cancelled', async () => {
    const { fetchMock } = mockUpload();
    vi.mocked(analyzeUpload).mockRejectedValueOnce(new Error('Cancelled'));
    await expect(uploadLocalFileToR2(params)).rejects.toThrow('Cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows explicitly accepted uploads without normalization', async () => {
    mockUpload();
    vi.mocked(analyzeUpload).mockResolvedValueOnce(undefined);
    expect(await uploadLocalFileToR2(params)).not.toHaveProperty('normalization');
  });

  it.each(['pdf', 'mp3'])('skips analysis for documents or an unchecked normalization option (%s)', async (ext) => {
    vi.mocked(analyzeUpload).mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    await uploadLocalFileToR2({ ...params, ext, normalizeAudio: ext === 'pdf' });
    expect(analyzeUpload).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('library management requests', () => {
  it('sends authenticated folder changes and returns the saved teacher configuration', async () => {
    const data = { students: [], haftarotMap: {}, parashaLibrary: { Custom: [] }, updatedAt: '2026-10-22T18:00:00Z' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data }) }));
    const change = { action: 'create-folder' as const, folder: 'Custom' };
    await expect(changeTeacherLibrary('test-token', change)).resolves.toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/api/library', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      body: JSON.stringify(change),
    }));
  });

  it('keeps the updated configuration available when physical deletion fails', async () => {
    const data = { students: [], parashaLibrary: {}, pendingMediaDeletes: ['media/test/library/file.mp3'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ ok: false, error: 'Deletion incomplete', data }),
    }));
    const request = changeTeacherLibrary('test-token', { action: 'retry-deletions' });
    await expect(request).rejects.toBeInstanceOf(LibraryMutationError);
    await expect(request).rejects.toMatchObject({ message: 'Deletion incomplete', data });
  });

  it('surfaces a failed mutation without inventing a successful result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ ok: false, error: 'Folder already exists' }),
    }));
    await expect(changeTeacherLibrary('test-token', { action: 'create-folder', folder: 'Custom' })).rejects.toThrow('Folder already exists');
  });

  it('rejects a malformed success response instead of clearing the teacher library', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true }),
    }));
    await expect(changeTeacherLibrary('test-token', { action: 'retry-deletions' })).rejects.toThrow('נתוני מאגר לא תקינים');
  });
});

describe('student configuration', () => {
  it('loads the teacher-provided general library alongside the student', async () => {
    const parashaLibrary = { 'כללי': [{ id: 'general-audio' }], 'תמונות': [{ id: 'general-document' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true, student: { id: 'student' }, parashaLibrary, updatedAt: '2026-10-22T16:45:00Z',
      }),
    }));
    await expect(fetchR2StudentData('test', 'student')).resolves.toEqual({
      student: { id: 'student' }, parashaLibrary, updatedAt: '2026-10-22T16:45:00Z',
    });
  });

  it('does not invent personal materials when no library is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, student: { id: 'student' } }),
    }));
    await expect(fetchR2StudentData('test', 'student')).resolves.toEqual({
      student: { id: 'student' }, parashaLibrary: {}, updatedAt: null,
    });
  });
});

describe('storage messages', () => {
  it.each([
    ['register', () => registerTeacherR2({ username: 'test', password: 'test' })],
    ['login', () => loginTeacherR2({ identifier: 'test', password: 'test' })],
    ['Google login', () => googleAuthTeacherR2({ idToken: 'test' })],
    ['load teacher', () => fetchR2TeacherData('test')],
    ['load student', () => fetchR2StudentData('test', 'student')],
    ['save', () => saveR2TeacherData(saveParams)],
    ['import', () => transferDriveFilesToR2({ ...teacher, studentId: 'student', fileId: 'file' })],
    ['upload', () => uploadLocalFileToR2({
      ...teacher, studentId: 'student', fileName: 'audio.mp3',
      mimeType: 'audio/mpeg', ext: 'mp3', base64Data: '', normalizeAudio: false,
    })],
  ])('hides provider details for %s while logging the original error', async (_name, request) => {
    const message = 'Cloudflare R2 request failed: R2_BUCKET_NAME';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: message }),
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(request()).rejects.toThrow();
    await expect(request()).rejects.not.toThrow(/r2|cloudflare/i);
    expect(log).toHaveBeenCalledWith('Storage request failed:', message);
  });

  it('preserves actionable errors that do not mention the provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'Session expired, please sign in again' }),
    }));
    await expect(saveR2TeacherData(saveParams)).rejects.toThrow('Session expired, please sign in again');
  });

  it('preserves a successful save and its timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true, updatedAt: '2026-10-22T16:45:00Z', storage: 'r2', r2Configured: true,
      }),
    }));
    await expect(saveR2TeacherData(saveParams)).resolves.toEqual({
      updatedAt: '2026-10-22T16:45:00Z', storage: 'r2', r2Configured: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/r2-data', expect.objectContaining({ method: 'POST' }));
  });

  it('saves library changes only when supplied, so other saves preserve the migrated library', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, updatedAt: '2026-10-22T16:45:00Z' }),
    }));
    const parashaLibrary = { 'כללי': [] };
    await saveR2TeacherData({ ...saveParams, parashaLibrary });
    const firstBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(firstBody.parashaLibrary).toEqual(parashaLibrary);
    await saveR2TeacherData(saveParams);
    const secondBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(secondBody).not.toHaveProperty('parashaLibrary');
  });
});
