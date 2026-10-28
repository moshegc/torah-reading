import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getLocalTeacherDataPath,
  isLocalTeacherDataActive,
  r2GetJson,
  r2PutJson,
  r2DeleteObject,
} from './_r2.js';

describe('local teacher data file support in _r2.js', () => {
  const testDir = path.resolve(process.cwd(), '.test-local-config');
  const testFile = path.join(testDir, 'custom-teacher.json');

  beforeEach(async () => {
    vi.unstubAllEnvs();
    delete process.env.LOCAL_TEACHER_DATA_FILE;
    delete process.env.USE_LOCAL_TEACHER_DATA;
    await fs.mkdir(testDir, { recursive: true }).catch(() => {});
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('resolves local teacher data path with LOCAL_TEACHER_DATA_FILE', () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', 'my-config.local.json');
    expect(getLocalTeacherDataPath('teacher1')).toBe(
      path.resolve(process.cwd(), 'my-config.local.json')
    );
    expect(isLocalTeacherDataActive('teacher1')).toBe(true);
  });

  it('interpolates {teacherId} in LOCAL_TEACHER_DATA_FILE', () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', 'data/{teacherId}/config.json');
    expect(getLocalTeacherDataPath('moshe')).toBe(
      path.resolve(process.cwd(), 'data/moshe/config.json')
    );
  });

  it('defaults to teacher-data.local.json when USE_LOCAL_TEACHER_DATA=true', () => {
    vi.stubEnv('USE_LOCAL_TEACHER_DATA', 'true');
    expect(getLocalTeacherDataPath('any')).toBe(
      path.resolve(process.cwd(), 'teacher-data.local.json')
    );
    expect(isLocalTeacherDataActive('any')).toBe(true);
  });

  it('returns null when no local config is set in test environment', () => {
    expect(getLocalTeacherDataPath('teacher1')).toBeNull();
    expect(isLocalTeacherDataActive('teacher1')).toBe(false);
  });

  it('reads from local teacher data file instead of R2', async () => {
    const fakeData = { students: [{ id: 's1', name: 'Test Student' }] };
    await fs.writeFile(testFile, JSON.stringify(fakeData), 'utf8');

    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', testFile);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await r2GetJson('teachers/myteacher/data.json');
    expect(result).toEqual(fakeData);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('writes to local teacher data file instead of R2', async () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', testFile);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const payload = { students: [{ id: 's2', name: 'New Student' }], updatedAt: '2026-10-25' };
    const putResult = await r2PutJson('teachers/myteacher/data.json', payload);

    expect(putResult).toEqual({
      key: 'teachers/myteacher/data.json',
      storage: 'local-file',
    });
    expect(mockFetch).not.toHaveBeenCalled();

    const written = JSON.parse(await fs.readFile(testFile, 'utf8'));
    expect(written).toEqual(payload);
  });

  it('seeds local file from hosted R2 if local file does not exist yet', async () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', testFile);
    vi.stubEnv('R2_ACCOUNT_ID', 'test-account');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
    vi.stubEnv('R2_BUCKET_NAME', 'test-bucket');

    const hostedData = { students: [{ id: 'hosted-1', name: 'Hosted Student' }] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => hostedData,
      })
    );

    const result = await r2GetJson('teachers/myteacher/data.json');
    expect(result).toEqual(hostedData);

    const seeded = JSON.parse(await fs.readFile(testFile, 'utf8'));
    expect(seeded).toEqual(hostedData);
  });

  it('reports isLocalTeacherDataActive correctly based on configuration', () => {
    expect(isLocalTeacherDataActive('teacher1')).toBe(false);
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', testFile);
    expect(isLocalTeacherDataActive('teacher1')).toBe(true);
  });

  it('migrates embedded library and scans into an index and per-audio files, then hydrates assignments', async () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', testFile);
    vi.stubEnv('R2_ACCOUNT_ID', '');
    const normalization = { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 };
    const item = { id: 'audio', viewUrl: '/audio.mp3', r2Key: 'media/teacher/library/audio.mp3', normalization };
    const payload = {
      students: [{ id: 'student', parasha: 'second', portions: [{ ...item, visible: false }] }],
      parashaLibrary: { first: [item], second: [{ ...item, id: 'alias' }] },
      normalizationTargetLufs: -24,
      normalizationFolderTargets: { first: -24, second: -30 },
    };
    await fs.writeFile(testFile, JSON.stringify(payload), 'utf8');
    expect((await r2GetJson('teachers/teacher/data.json')).parashaLibrary.first[0].normalization)
      .toEqual({ ...normalization, targetLufs: -24, gainDb: 0 });
    await r2PutJson('teachers/teacher/data.json', payload);
    const teacher = JSON.parse(await fs.readFile(testFile, 'utf8'));
    const index = JSON.parse(await fs.readFile(`${testFile}.library.json`, 'utf8'));
    expect(teacher).not.toHaveProperty('parashaLibrary');
    expect(teacher).not.toHaveProperty('normalizationTargetLufs');
    expect(teacher).not.toHaveProperty('normalizationFolderTargets');
    expect(index.normalizationFolderTargets).toEqual({ first: -24, second: -30 });
    expect(teacher.students[0].portions[0]).not.toHaveProperty('normalization');
    expect(teacher.libraryKey).toBe('teachers/teacher/library.json');
    expect(index.folders.first[0]).not.toHaveProperty('normalization');
    expect(index.folders.first[0].normalizationKey).toBe(index.folders.second[0].normalizationKey);
    expect(await fs.readdir(`${testFile}.normalization`)).toHaveLength(1);
    const hydrated = await r2GetJson('teachers/teacher/data.json');
    expect(hydrated.students[0].portions[0]).toMatchObject({
      visible: false, normalization: { targetLufs: -30, gainDb: -6 },
    });
    expect(hydrated.parashaLibrary.first[0].normalization.gainDb).toBe(0);
    expect(hydrated.parashaLibrary.second[0].normalization.gainDb).toBe(-6);
    // A routine teacher save must preserve the shared target and external index.
    delete hydrated.normalizationTargetLufs;
    delete hydrated.normalizationFolderTargets;
    await r2PutJson('teachers/teacher/data.json', hydrated);
    expect((await r2GetJson('teachers/teacher/data.json')).normalizationTargetLufs).toBe(-24);
    expect((await r2GetJson('teachers/teacher/data.json')).normalizationFolderTargets)
      .toEqual({ first: -24, second: -30 });
    await r2PutJson('teachers/teacher/data.json', {
      ...hydrated, students: [], parashaLibrary: {}, normalizationFolderTargets: {},
    });
    expect(await fs.readdir(`${testFile}.normalization`)).toHaveLength(1);
  });
});
