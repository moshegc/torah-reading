import type { RecordingNormalization } from '../types';

export const MAX_ANALYSIS_BYTES = 16 * 1024 * 1024;
export const MAX_ANALYSIS_SECONDS = 300;
const ANALYSIS_SAMPLE_RATE = 48000;
const MAX_DECODED_BYTES = 128 * 1024 * 1024;
let analysisQueue: Promise<void> = Promise.resolve();

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

async function analyze(blob: Blob): Promise<RecordingNormalization> {
  if (!blob.size || blob.size > MAX_ANALYSIS_BYTES) {
    throw new Error('ניתוח בדפדפן מוגבל לקבצים לא ריקים עד 16MB');
  }
  const duration = await recordingDuration(blob);
  if (!Number.isFinite(duration) || duration < 0.4 || duration > MAX_ANALYSIS_SECONDS) {
    throw new Error('ניתוח בדפדפן דורש משך ידוע בין 0.4 שניות ל-5 דקות');
  }
  // Decode at a fixed rate to bound memory independently of the source sample rate.
  const context = new OfflineAudioContext(2, 1, ANALYSIS_SAMPLE_RATE);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  if (buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2 ||
      buffer.duration > MAX_ANALYSIS_SECONDS ||
      buffer.length * buffer.numberOfChannels * 4 > MAX_DECODED_BYTES) {
    throw new Error('ההקלטה גדולה מדי לניתוח בדפדפן או שאינה מונו/סטריאו');
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
    }, 60000);
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

export function analyzeRecording(blob: Blob): Promise<RecordingNormalization> {
  const result = analysisQueue.then(() => analyze(blob));
  analysisQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function analyzeRecordingUrl(url: string): Promise<RecordingNormalization> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`הורדת ההקלטה לניתוח נכשלה (${response.status})`);
    if (Number(response.headers.get('content-length')) > MAX_ANALYSIS_BYTES) {
      throw new Error('ניתוח בדפדפן מוגבל לקבצים עד 16MB');
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
        throw new Error('ניתוח בדפדפן מוגבל לקבצים עד 16MB');
      }
      chunks.push(value.slice().buffer);
    }
    return await analyzeRecording(new Blob(chunks));
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeUpload(blob: Blob): Promise<RecordingNormalization | undefined> {
  try {
    return await analyzeRecording(blob);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ניתוח העוצמה נכשל';
    if (window.confirm(`${message}\nלהעלות את הקובץ ללא איזון עוצמה? ניתן לנסות לנתח אותו מאוחר יותר במאגר.`)) {
      return undefined;
    }
    throw new Error('ההעלאה בוטלה: ניתוח העוצמה לא הושלם');
  }
}
