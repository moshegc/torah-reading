/**
 * Real-time Web Audio API Granular Pitch-Shifter + Tempo Controller
 * Allows modifying the musical key (in semitones) on the fly without changing speed,
 * while also supporting independent playback speed (tempo) and A-B section looping.
 */
export class PitchShiftEngine {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;

  private isPlaying = false;
  private playheadSamples = 0;
  private pitchSemitones = 0;
  private tempoRate = 1.0;
  private loopA: number | null = null;
  private loopB: number | null = null;

  // Dual overlapping grain pointers for smooth pitch shifting without speed change
  private grainPhase = 0;
  private readonly grainSize = 2048;

  private onProgressCallback?: (currentTime: number, duration: number) => void;

  public initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public async loadArrayBuffer(arrayBuffer: ArrayBuffer): Promise<number> {
    const ctx = this.initContext();
    this.stop();
    this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.playheadSamples = 0;
    return this.audioBuffer.duration;
  }

  public generateCantillationDemo(patternIndex = 0): number {
    const ctx = this.initContext();
    this.stop();
    const sampleRate = ctx.sampleRate;
    const notes = [
      // Kadma V'Azla -> Zakef Katan -> Etnachta -> Sof Pasuk (Baritone ~ D3-A3)
      [146.83, 164.81, 174.61, 196.00, 174.61, 164.81, 146.83, 130.81, 146.83, 164.81, 146.83],
      [164.81, 196.00, 220.00, 196.00, 174.61, 164.81, 146.83, 164.81, 196.00, 146.83],
      [130.81, 146.83, 164.81, 174.61, 164.81, 146.83, 130.81, 110.00, 130.81, 146.83]
    ][patternIndex % 3];

    const durationSec = notes.length * 0.75;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    let phase = 0;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.min(notes.length - 1, Math.floor(t / 0.75));
      const localT = (t % 0.75) / 0.75;
      const freq = notes[noteIdx] * (1 + 0.008 * Math.sin(2 * Math.PI * 5.2 * t)); // natural vocal vibrato
      phase += (2 * Math.PI * freq) / sampleRate;

      // Rich vocal formant harmonics (baritone voice)
      const sig =
        0.55 * Math.sin(phase) +
        0.28 * Math.sin(2 * phase) +
        0.12 * Math.sin(3 * phase) +
        0.05 * Math.sin(4 * phase);

      // Smooth syllable envelope
      const env = Math.sin(Math.PI * localT) ** 0.45;
      data[i] = sig * env * 0.45;
    }

    this.audioBuffer = buffer;
    this.playheadSamples = 0;
    return buffer.duration;
  }

  public play(): void {
    if (!this.audioBuffer) return;
    const ctx = this.initContext();
    this.stopNodeOnly();

    this.scriptNode = ctx.createScriptProcessor(2048, 1, 1);
    this.gainNode = ctx.createGain();

    const inputData = this.audioBuffer.getChannelData(0);
    const totalSamples = inputData.length;
    const sampleRate = this.audioBuffer.sampleRate;

    this.scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const out = e.outputBuffer.getChannelData(0);
      if (!this.isPlaying) {
        out.fill(0);
        return;
      }

      const pitchRatio = Math.pow(2, this.pitchSemitones / 12);
      const stepPlayhead = this.tempoRate;
      const relPitch = pitchRatio - stepPlayhead;

      for (let i = 0; i < out.length; i++) {
        if (this.loopB !== null && this.playheadSamples / sampleRate >= this.loopB) {
          this.playheadSamples = (this.loopA ?? 0) * sampleRate;
        }
        if (this.playheadSamples >= totalSamples - 2) {
          if (this.loopA !== null) {
            this.playheadSamples = this.loopA * sampleRate;
          } else {
            this.playheadSamples = 0;
            this.isPlaying = false;
            out[i] = 0;
            continue;
          }
        }

        // Hann-windowed dual-grain overlap-add pitch shifter
        this.grainPhase = (this.grainPhase + relPitch + this.grainSize) % this.grainSize;
        const offset1 = this.grainPhase;
        const offset2 = (this.grainPhase + this.grainSize / 2) % this.grainSize;

        const w1 = 0.5 * (1 - Math.cos((2 * Math.PI * offset1) / this.grainSize));
        const w2 = 0.5 * (1 - Math.cos((2 * Math.PI * offset2) / this.grainSize));

        const idx1 = Math.min(totalSamples - 2, Math.max(0, Math.floor(this.playheadSamples + offset1)));
        const idx2 = Math.min(totalSamples - 2, Math.max(0, Math.floor(this.playheadSamples + offset2)));

        out[i] = w1 * inputData[idx1] + w2 * inputData[idx2];
        this.playheadSamples += stepPlayhead;
      }

      if (this.onProgressCallback) {
        this.onProgressCallback(this.playheadSamples / sampleRate, totalSamples / sampleRate);
      }
    };

    this.scriptNode.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
    this.isPlaying = true;
  }

  public pause(): void {
    this.isPlaying = false;
  }

  public stop(): void {
    this.isPlaying = false;
    this.playheadSamples = 0;
    this.stopNodeOnly();
  }

  private stopNodeOnly(): void {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode.onaudioprocess = null;
      this.scriptNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }

  public seek(seconds: number): void {
    if (!this.audioBuffer) return;
    this.playheadSamples = Math.max(0, Math.min(this.audioBuffer.length - 1, seconds * this.audioBuffer.sampleRate));
  }

  public setPitchSemitones(semitones: number): void {
    this.pitchSemitones = semitones;
  }

  public setTempo(rate: number): void {
    this.tempoRate = rate;
  }

  public setLoop(a: number | null, b: number | null): void {
    this.loopA = a;
    this.loopB = b;
  }

  public onProgress(cb: (currentTime: number, duration: number) => void): void {
    this.onProgressCallback = cb;
  }
}
