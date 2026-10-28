import type { RecordingNormalization } from '../types';
import { gainDbToLinear, TARGET_LUFS, PEAK_CEILING_DBTP } from './normalization';

export const MAX_ANALYSIS_BYTES = 16 * 1024 * 1024;
export const MAX_ANALYSIS_SECONDS = 600;
const ANALYSIS_SAMPLE_RATE = 24000;
const MAX_DECODED_BYTES = 128 * 1024 * 1024;
let analysisQueue: Promise<void> = Promise.resolve();

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString()} bytes (${(bytes / (1024 * 1024)).toFixed(2)} MiB)`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'לא זמין';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')} (${seconds.toFixed(2)} שניות)`;
}

function fileDetails(fileName: string, blob: Blob, duration?: number): string {
  return `קובץ: ${fileName}; גודל: ${formatBytes(blob.size)}; סוג: ${blob.type || 'לא ידוע'}; משך: ${formatDuration(duration ?? NaN)}`;
}

function recordingDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      const duration = audio.duration;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(duration);
    };
    const timer = setTimeout(() => finish(new Error('קריאת משך ההקלטה ארכה זמן רב מדי')), 20000);
    audio.onloadedmetadata = () => finish();
    audio.onerror = () => finish(new Error('הדפדפן אינו יכול לקרוא את ההקלטה'));
    audio.preload = 'metadata';
    audio.src = url;
  });
}

async function analyze(blob: Blob, fileName: string): Promise<RecordingNormalization> {
  let duration: number;
  let metadataError: string | undefined;
  try {
    duration = await recordingDuration(blob);
  } catch (error) {
    duration = NaN;
    metadataError = error instanceof Error ? error.message : String(error);
  }
  const details = fileDetails(fileName, blob, duration);
  console.info('[audio-gain] file metadata', {
    fileName, bytes: blob.size, sizeMiB: blob.size / (1024 * 1024),
    mimeType: blob.type || 'unknown', durationSeconds: Number.isFinite(duration) ? duration : null,
    durationFormatted: formatDuration(duration), maxBytes: MAX_ANALYSIS_BYTES,
    maxBytesFormatted: formatBytes(MAX_ANALYSIS_BYTES), maxDurationSeconds: MAX_ANALYSIS_SECONDS,
    maxDecodedBytes: MAX_DECODED_BYTES,
  });
  if (!blob.size) {
    throw new Error(`הקובץ ריק ולכן לא ניתן לסרוק אותו. ${details}`);
  }
  if (blob.size > MAX_ANALYSIS_BYTES) {
    throw new Error(`הקובץ חורג ממגבלת הגודל לסריקה של 16MB: ${formatBytes(blob.size)}; המגבלה המדויקת היא ${formatBytes(MAX_ANALYSIS_BYTES)}. ${details}`);
  }
  if (!Number.isFinite(duration) || duration < 0.4 || duration > MAX_ANALYSIS_SECONDS) {
    const reason = !Number.isFinite(duration)
      ? `הדפדפן לא הצליח לזהות את משך ההקלטה (${metadataError || 'משך לא ידוע'})`
      : `המשך שזוהה הוא ${formatDuration(duration)}; הטווח הנתמך הוא 0:00.4 עד 10:00`;
    throw new Error(`${reason}. ${details}`);
  }
  // Decode at a fixed rate to bound memory independently of the source sample rate.
  const context = new OfflineAudioContext(2, 1, ANALYSIS_SAMPLE_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(await blob.arrayBuffer());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`הדפדפן לא הצליח לפענח את קובץ האודיו (${reason}). ${details}`);
  }
  const decodedBytes = buffer.length * buffer.numberOfChannels * 4;
  console.info('[audio-gain] decoded recording', {
    fileName, bytes: blob.size, duration: buffer.duration, sampleRate: buffer.sampleRate,
    analysisSampleRate: ANALYSIS_SAMPLE_RATE,
    channels: buffer.numberOfChannels, decodedBytes, decodedMiB: decodedBytes / (1024 * 1024),
    monoMeasuredAsDualMono: buffer.numberOfChannels === 1,
  });
  if (buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2) {
    throw new Error(`מספר ערוצי האודיו אינו נתמך: ${buffer.numberOfChannels}; ניתן לסרוק רק מונו או סטריאו. ${details}`);
  }
  if (buffer.duration > MAX_ANALYSIS_SECONDS) {
    throw new Error(`משך האודיו לאחר פענוח הוא ${formatDuration(buffer.duration)}, מעל מגבלת 10 הדקות. ${details}`);
  }
  if (decodedBytes > MAX_DECODED_BYTES) {
    throw new Error(`האודיו המפוענח דורש ${formatBytes(decodedBytes)}; מגבלת הזיכרון לסריקה היא ${formatBytes(MAX_DECODED_BYTES)}. נסו קובץ קצר יותר או מונו. ${details}`);
  }
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./loudness.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('ניתוח העוצמה ארך זמן רב מדי. נסו בדפדפן במחשב.'));
    }, 180000);
    worker.onmessage = (event: MessageEvent<{ normalization?: RecordingNormalization; error?: string }>) => {
      finish();
      if (event.data.normalization) resolve(event.data.normalization);
      else reject(new Error(event.data.error || 'ניתוח העוצמה נכשל'));
    };
    worker.onerror = () => {
      finish();
      reject(new Error('ניתוח העוצמה נכשל. נסו בדפדפן במחשב.'));
    };
    try {
      worker.postMessage({ sampleRate: buffer.sampleRate, channels }, channels.map((channel) => channel.buffer));
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

export function analyzeRecording(blob: Blob, fileName = 'unnamed recording'): Promise<RecordingNormalization> {
  const result = analysisQueue.then(async () => {
    console.info('[audio-gain] scan started', {
      fileName, bytes: blob.size, sizeMiB: blob.size / (1024 * 1024),
      mimeType: blob.type || 'unknown', maxBytes: MAX_ANALYSIS_BYTES,
      maxDurationSeconds: MAX_ANALYSIS_SECONDS,
    });
    try {
      const normalization = await analyze(blob, fileName);
      console.info('[audio-gain] scan completed', {
        fileName, ...normalization,
        targetLufs: normalization.targetLufs ?? TARGET_LUFS,
        desiredGainDb: (normalization.targetLufs ?? TARGET_LUFS) - (normalization.leveling?.integratedLufs ?? normalization.integratedLufs),
        peakCeilingDbtp: PEAK_CEILING_DBTP,
        linearGain: gainDbToLinear(normalization.gainDb),
        predictedLufs: (normalization.leveling?.integratedLufs ?? normalization.integratedLufs) + normalization.gainDb,
        predictedTruePeakDbtp: (normalization.leveling?.truePeakDbtp ?? normalization.truePeakDbtp) + normalization.gainDb,
      });
      return normalization;
    } catch (error) {
      console.error('[audio-gain] scan failed', {
        fileName, bytes: blob.size, sizeMiB: blob.size / (1024 * 1024),
        mimeType: blob.type || 'unknown',
        reason: error instanceof Error ? error.message : String(error), error,
      });
      throw error;
    }
  });
  analysisQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function analyzeRecordingUrl(url: string, fileName = 'existing recording'): Promise<RecordingNormalization> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let responseBytes: number | null = null;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`הורדת ההקלטה לניתוח נכשלה (${response.status})`);
    const contentLength = response.headers.get('content-length');
    responseBytes = contentLength && Number.isFinite(Number(contentLength)) ? Number(contentLength) : null;
    console.info('[audio-gain] existing recording response', {
      fileName, contentLength: responseBytes, contentLengthFormatted: responseBytes === null ? 'unknown' : formatBytes(responseBytes),
      mimeType: response.headers.get('content-type') || 'unknown', maxBytes: MAX_ANALYSIS_BYTES,
    });
    if (responseBytes !== null && responseBytes > MAX_ANALYSIS_BYTES) {
      throw new Error(`הקובץ חורג ממגבלת הגודל לסריקה של 16MB: ${formatBytes(responseBytes)}; המגבלה המדויקת היא ${formatBytes(MAX_ANALYSIS_BYTES)}. לא הורד הקובץ.`);
    }
    if (!response.body) throw new Error('לא ניתן לקרוא את ההקלטה לניתוח');
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ANALYSIS_BYTES) {
        await reader.cancel();
        throw new Error(`הקובץ שהורד חורג ממגבלת הגודל לסריקה של 16MB: ${formatBytes(size)}; המגבלה המדויקת היא ${formatBytes(MAX_ANALYSIS_BYTES)}.`);
      }
      chunks.push(value.slice().buffer);
    }
    return await analyzeRecording(new Blob(chunks), fileName);
  } catch (error) {
    console.error('[audio-gain] existing recording analysis failed', {
      fileName, contentLength: responseBytes,
      reason: error instanceof Error ? error.message : String(error), error,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeUpload(blob: Blob, fileName?: string): Promise<RecordingNormalization | undefined> {
  try {
    return await analyzeRecording(blob, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ניתוח העוצמה נכשל';
    const details = fileDetails(fileName || 'ללא שם', blob);
    console.error('[audio-gain] upload scan rejected', {
      fileName, bytes: blob.size, sizeMiB: blob.size / (1024 * 1024),
      mimeType: blob.type || 'unknown', reason: message,
    });
    if (window.confirm(`הסריקה נכשלה.\n${message}\n${details}\n\nלהעלות את הקובץ המקורי ללא איזון עוצמה?`)) {
      console.warn('[audio-gain] uploading without scan results', { fileName });
      return undefined;
    }
    throw new Error(`ההעלאה בוטלה: ניתוח העוצמה לא הושלם. ${message}`);
  }
}
