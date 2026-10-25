import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeRecording, analyzeRecordingUrl, analyzeUpload, MAX_ANALYSIS_BYTES, MAX_ANALYSIS_SECONDS } from './analyzeRecording';
import { createNormalization } from './normalization';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function environment(duration = 2, workerFails = false) {
  const channels = [new Float32Array(96000)];
  const decoded = {
    sampleRate: 48000, duration, length: channels[0].length,
    numberOfChannels: 1, getChannelData: (index: number) => channels[index],
  };
  const decode = vi.fn().mockResolvedValue(decoded);
  vi.stubGlobal('OfflineAudioContext', function () { return { decodeAudioData: decode }; });
  const audio = {
    duration, onloadedmetadata: null as (() => void) | null, onerror: null,
    load: vi.fn(), removeAttribute: vi.fn(), preload: '',
    set src(_url: string) { queueMicrotask(() => audio.onloadedmetadata?.()); },
  };
  vi.stubGlobal('document', { createElement: () => audio });
  const terminate = vi.fn();
  const postMessage = vi.fn(function (this: { onmessage: (event: { data: unknown }) => void; onerror: () => void }) {
    queueMicrotask(() => workerFails
      ? this.onerror() : this.onmessage({ data: { normalization: createNormalization(-24, -10) } }));
  });
  vi.stubGlobal('Worker', function () { return { postMessage, terminate, onmessage: null, onerror: null }; });
  return { channels, decode, terminate, postMessage };
}

describe('browser analysis orchestration', () => {
  it('transfers decoded channels to the worker and releases the worker after completion', async () => {
    const { channels, postMessage, terminate } = environment();
    await expect(analyzeRecording(new Blob(['audio']))).resolves.toEqual(createNormalization(-24, -10));
    expect(postMessage).toHaveBeenCalledWith({ sampleRate: 48000, channels }, [channels[0].buffer]);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it.each([Infinity, 0.1, MAX_ANALYSIS_SECONDS + 1])('rejects unsupported duration %s before decoding', async (duration) => {
    const { decode } = environment(duration);
    await expect(analyzeRecording(new Blob(['audio']))).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects large files before allocating a decoder', async () => {
    const { decode } = environment();
    await expect(analyzeRecording(new Blob([new Uint8Array(MAX_ANALYSIS_BYTES + 1)]))).rejects.toThrow('16MB');
    expect(decode).not.toHaveBeenCalled();
  });

  it('surfaces worker failures and requires explicit permission to upload unanalysed audio', async () => {
    const { terminate } = environment(2, true);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('window', { confirm });
    await expect(analyzeUpload(new Blob(['audio']))).rejects.toThrow('בוטלה');
    await expect(analyzeUpload(new Blob(['audio']))).resolves.toBeUndefined();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(terminate).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized responses before reading the body', async () => {
    const blob = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: new Headers({ 'Content-Length': String(MAX_ANALYSIS_BYTES + 1) }), blob,
    }));
    await expect(analyzeRecordingUrl('/recording')).rejects.toThrow('16MB');
    expect(blob).not.toHaveBeenCalled();
  });

  it('stops downloading when an unknown-length response exceeds the cap', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, headers: new Headers(),
      body: { getReader: () => ({
        read: async () => ({ done: false, value: new Uint8Array(MAX_ANALYSIS_BYTES + 1) }), cancel,
      }) },
    }));
    await expect(analyzeRecordingUrl('/recording')).rejects.toThrow('16MB');
    expect(cancel).toHaveBeenCalled();
  });
});
