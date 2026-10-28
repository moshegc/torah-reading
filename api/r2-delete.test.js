import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { r2DeleteObject } from './_r2.js';

vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn(), unlink: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) vi.stubEnv(key, '');
  fs.mkdir.mockResolvedValue(undefined);
  fs.unlink.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('stored media deletion', () => {
  it('deletes only the exact local media file and its metadata sidecar', async () => {
    await r2DeleteObject('media/teacher/library/file.mp3');
    expect(fs.unlink).toHaveBeenCalledTimes(2);
    const mediaPath = fs.unlink.mock.calls[0][0];
    expect(mediaPath.endsWith('file.mp3')).toBe(true);
    expect(fs.unlink.mock.calls[1][0]).toBe(`${mediaPath}.meta.json`);
  });

  it('tolerates an already-deleted file when retrying cleanup', async () => {
    fs.unlink.mockRejectedValueOnce(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
    await expect(r2DeleteObject('media/teacher/library/file.mp3')).resolves.toBeUndefined();
    expect(fs.unlink).toHaveBeenCalledTimes(2);
  });

  it('surfaces local permission failures', async () => {
    fs.unlink.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'EPERM' }));
    await expect(r2DeleteObject('media/teacher/library/file.mp3')).rejects.toThrow('Permission denied');
  });

  it('issues a signed DELETE request for configured object storage', async () => {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) vi.stubEnv(key, 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    await r2DeleteObject('media/teacher/library/file.mp3');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/media/teacher/library/file.mp3'), expect.objectContaining({
      method: 'DELETE', headers: expect.objectContaining({ Authorization: expect.stringContaining('AWS4-HMAC-SHA256') }),
    }));
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('does not hide a failed storage DELETE', async () => {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) vi.stubEnv(key, 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(r2DeleteObject('media/teacher/library/file.mp3')).rejects.toThrow('503');
  });

  it('deletes teacher-local normalization data without touching hosted storage', async () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', 'teacher-test.json');
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) vi.stubEnv(key, 'test');
    vi.stubGlobal('fetch', vi.fn());
    const hash = 'a'.repeat(64);
    await r2DeleteObject(`teachers/teacher/normalization/${hash}.json`);
    expect(fs.unlink).toHaveBeenCalledOnce();
    expect(fs.unlink.mock.calls[0][0]).toContain(`teacher-test.json.normalization`);
    expect(fs.unlink.mock.calls[0][0]).toContain(`${hash}.json`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces local normalization deletion failures', async () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', 'teacher-test.json');
    fs.unlink.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'EPERM' }));
    await expect(r2DeleteObject(`teachers/teacher/normalization/${'a'.repeat(64)}.json`)).rejects.toThrow('Permission denied');
  });

  it('deletes hosted normalization metadata and accepts an already-deleted object', async () => {
    vi.stubEnv('LOCAL_TEACHER_DATA_FILE', '');
    vi.stubEnv('USE_LOCAL_TEACHER_DATA', 'false');
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) vi.stubEnv(key, 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const key = `teachers/teacher/normalization/${'a'.repeat(64)}.json`;
    await expect(r2DeleteObject(key)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(key), expect.objectContaining({ method: 'DELETE' }));
  });
});
