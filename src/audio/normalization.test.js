import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initSync, ebur128_integrated_mono, ebur128_integrated_stereo, ebur128_true_peak_mono, ebur128_true_peak_stereo } from 'ebur128-wasm/ebur128_wasm.js';
import { createNormalization, normalizationGain } from './normalization';

function tone(amplitude = 0.1, seconds = 2) {
  return Float32Array.from({ length: 24000 * seconds }, (_, index) =>
    amplitude * Math.sin(2 * Math.PI * 1000 * index / 24000));
}

describe('EBU R128 measurement', () => {
  it('measures known mono/stereo levels and true peaks in dBTP using the shipped WASM', () => {
    initSync(readFileSync('node_modules\\ebur128-wasm\\ebur128_wasm_bg.wasm'));
    const samples = tone();
    const mono = ebur128_integrated_mono(24000, samples);
    const stereo = ebur128_integrated_stereo(24000, samples, samples);
    expect(mono).toBeCloseTo(-23, 0);
    expect(stereo - mono).toBeCloseTo(3.01, 1);
    expect(ebur128_true_peak_mono(24000, samples)).toBeCloseTo(-20, 1);
    expect(ebur128_true_peak_stereo(24000, samples, tone(0.2))).toBeCloseTo(20 * Math.log10(0.2), 1);
  });

  it('gates silence and rejects all-silent recordings rather than storing infinite gain', () => {
    initSync(readFileSync('node_modules\\ebur128-wasm\\ebur128_wasm_bg.wasm'));
    const samples = tone(0.1, 4);
    const padded = new Float32Array(samples.length * 2);
    padded.set(samples, samples.length);
    expect(Math.abs(ebur128_integrated_mono(24000, samples) - ebur128_integrated_mono(24000, padded))).toBeLessThan(0.4);
    const silence = new Float32Array(24000);
    expect(() => createNormalization(
      ebur128_integrated_mono(24000, silence),
      ebur128_true_peak_mono(24000, silence),
    )).toThrow();
  });
});

describe('normalization policy', () => {
  it('targets -18 LUFS when sufficient peak headroom exists', () => {
    const value = createNormalization(-24, -10);
    expect(value.gainDb).toBe(6);
    expect(normalizationGain(value)).toBeCloseTo(1.99526, 4);
  });
  it('caps boosts at both the peak ceiling and 12 dB', () => {
    expect(createNormalization(-30, -3).gainDb).toBe(1);
    expect(createNormalization(-50, -40).gainDb).toBe(12);
    expect(createNormalization(-10, -1).gainDb).toBe(-8);
  });
  it('preserves unanalysed playback and rejects invalid or tampered metadata', () => {
    expect(normalizationGain()).toBe(1);
    expect(() => createNormalization(NaN, -3)).toThrow();
    expect(() => normalizationGain({ ...createNormalization(-24, -10), gainDb: 20 })).toThrow();
  });
});
