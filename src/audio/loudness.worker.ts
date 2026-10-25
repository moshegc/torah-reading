/// <reference lib="webworker" />
import init, {
  ebur128_integrated_mono,
  ebur128_integrated_stereo,
  ebur128_true_peak_mono,
  ebur128_true_peak_stereo,
} from 'ebur128-wasm/ebur128_wasm.js';
import wasmUrl from 'ebur128-wasm/ebur128_wasm_bg.wasm?url';
import { createNormalization } from './normalization';

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
    self.postMessage({ normalization: createNormalization(loudness, peak) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'ניתוח העוצמה נכשל' });
  }
};
