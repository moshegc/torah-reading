/// <reference lib="webworker" />
import init, {
  ebur128_integrated_mono,
  ebur128_integrated_stereo,
  ebur128_true_peak_mono,
  ebur128_true_peak_stereo,
} from 'ebur128-wasm/ebur128_wasm.js';
import wasmUrl from 'ebur128-wasm/ebur128_wasm_bg.wasm?url';
import { createNormalization, gainDbToLinear, MAX_BOOST_DB, PEAK_CEILING_DBTP, TARGET_LUFS } from './normalization';
import type { RecordingNormalization } from '../types';

self.onmessage = async (event: MessageEvent<{ sampleRate: number; channels: Float32Array[] }>) => {
  try {
    await init(wasmUrl);
    const { sampleRate, channels } = event.data;
    // Browser playback sends mono to both speakers; meter it as dual mono.
    const loudness = channels.length === 1
      ? ebur128_integrated_mono(sampleRate, channels[0]) + 10 * Math.log10(2)
      : ebur128_integrated_stereo(sampleRate, channels[0], channels[1]);
    const peak = channels.length === 1
      ? ebur128_true_peak_mono(sampleRate, channels[0])
      : ebur128_true_peak_stereo(sampleRate, channels[0], channels[1]);
    createNormalization(loudness, peak);
    const duration = channels[0].length / sampleRate;
    const measureLoudness = (samples: Float32Array[]) => samples.length === 1
      ? ebur128_integrated_mono(sampleRate, samples[0]) + 10 * Math.log10(2)
      : ebur128_integrated_stereo(sampleRate, samples[0], samples[1]);
    const points: { time: number; gainDb: number }[] = [];
    for (let time = 0; time < duration; time += 1) {
      const start = Math.max(0, Math.min(time - 1.5, duration - 3));
      const end = Math.min(duration, start + 3);
      const level = measureLoudness(channels.map((channel) =>
        channel.subarray(Math.round(start * sampleRate), Math.round(end * sampleRate))));
      const active = Number.isFinite(level) && level > Math.max(-50, loudness - 20);
      points.push({ time, gainDb: active ? Math.max(-6, Math.min(6, (loudness - level) * 0.5)) : 0 });
    }
    points.push({ time: duration, gainDb: points[points.length - 1].gainDb });
    // Limit gain motion in both directions to preserve phrasing and avoid pumping.
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const limit = 1.5 * (points[index].time - previous.time);
      points[index].gainDb = Math.max(previous.gainDb - limit, Math.min(previous.gainDb + limit, points[index].gainDb));
    }
    for (let index = points.length - 2; index >= 0; index--) {
      const next = points[index + 1];
      const limit = 1.5 * (next.time - points[index].time);
      points[index].gainDb = Math.max(next.gainDb - limit, Math.min(next.gainDb + limit, points[index].gainDb));
    }
    let segment = 0;
    for (let index = 0; index < channels[0].length; index++) {
      const time = index / sampleRate;
      while (segment + 1 < points.length - 1 && time > points[segment + 1].time) segment++;
      const left = points[segment];
      const right = points[segment + 1];
      const gain = gainDbToLinear(left.gainDb +
        (right.gainDb - left.gainDb) * (time - left.time) / (right.time - left.time));
      for (const channel of channels) channel[index] *= gain;
    }
    const leveledLufs = measureLoudness(channels);
    const leveledPeak = channels.length === 1
      ? ebur128_true_peak_mono(sampleRate, channels[0])
      : ebur128_true_peak_stereo(sampleRate, channels[0], channels[1]);
    const normalization: RecordingNormalization = {
      version: 2, integratedLufs: loudness, truePeakDbtp: peak, targetLufs: TARGET_LUFS,
      gainDb: Math.min(TARGET_LUFS - leveledLufs, PEAK_CEILING_DBTP - leveledPeak,
        MAX_BOOST_DB - Math.max(0, ...points.map((point) => point.gainDb))),
      leveling: { duration, points, integratedLufs: leveledLufs, truePeakDbtp: leveledPeak },
    };
    self.postMessage({ normalization });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'ניתוח העוצמה נכשל' });
  }
};
