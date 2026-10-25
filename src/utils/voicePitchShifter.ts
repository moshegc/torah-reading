/**
 * High-quality real-time voice pitch shifter using Pitch-Synchronous
 * Period-Locked Overlap-Add (TD-PSOLA / WSOLA) inside a Web Audio AudioWorklet.
 *
 * Why Tone.PitchShift sounded robotic:
 * Delay-line pitch shifters blindly crossfade two unaligned delay taps with a
 * 100ms window, creating severe comb-filtering (metallic robot voice) and
 * slapback echo on solo speech/cantillation.
 *
 * How this engine works:
 * 1. Audio is resampled smoothly with 4-point cubic Hermite interpolation.
 * 2. The read pointer only splices when its drift from the target latency
 *    exceeds half a vocal pitch period (|drift| > 0.5 * T0). For most hops,
 *    readPosB === readPosA, producing a 100% continuous, splice-free waveform.
 * 3. When a splice is needed, Normalized Cross-Correlation (NCC) finds the
 *    exact fundamental vocal period T0 (between 75 Hz and 420 Hz) and shifts
 *    by an exact integer period so all vocal harmonics stay in phase.
 */

const WORKLET_PROCESSOR_NAME = 'psola-voice-pitch-processor';

const WORKLET_CODE = `
class PsolaVoicePitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'pitchFactor',
        defaultValue: 1.0,
        minValue: 0.5,
        maxValue: 2.0,
        automationRate: 'k-rate',
      },
      {
        name: 'bypass',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    const sr = typeof sampleRate === 'number' && sampleRate > 0 ? sampleRate : 48000;

    this.bufSize = 16384;
    this.bufMask = this.bufSize - 1;
    this.ring = [
      new Float32Array(this.bufSize),
      new Float32Array(this.bufSize),
    ];
    // Mono sum buffer for pitch period autocorrelation
    this.monoRing = new Float32Array(this.bufSize);

    // Vocal pitch period bounds: 75 Hz (deep bass) to 420 Hz (boy soprano)
    this.minPeriod = Math.max(64, Math.floor(sr / 420));
    this.maxPeriod = Math.min(1024, Math.ceil(sr / 75));

    // Grain size ~32 ms, hop size ~16 ms (50% Hann overlap)
    const halfGrain = Math.max(512, Math.round(sr * 0.016));
    this.hopSize = halfGrain;
    this.grainSize = halfGrain * 2;
    this.corrLen = Math.max(this.maxPeriod, Math.round(sr * 0.014));
    this.baseDelay = 3072;

    // Precompute Hann window: w[k] + w[k + hopSize] === 1.0 everywhere
    this.window = new Float32Array(this.grainSize);
    for (let i = 0; i < this.grainSize; i++) {
      this.window[i] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / this.grainSize));
    }

    //Scratch array for coarse NCC values across lags
    this.coarseNcc = new Float32Array(this.maxPeriod + 4);

    this.writePos = this.baseDelay + this.grainSize;
    this.grainPhase = 0;
    this.readPosA = this.writePos - this.baseDelay;
    this.readPosB = this.writePos - this.baseDelay;
  }

  // 4-point cubic Hermite interpolation from circular buffer
  readCubic(chanBuf, pos) {
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const mask = this.bufMask;

    const ym1 = chanBuf[(idx - 1) & mask];
    const y0  = chanBuf[idx & mask];
    const y1  = chanBuf[(idx + 1) & mask];
    const y2  = chanBuf[(idx + 2) & mask];

    const c0 = y0;
    const c1 = 0.5 * (y1 - ym1);
    const c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);

    return ((c3 * frac + c2) * frac + c1) * frac + c0;
  }

  // Finds the optimal vocal period shift lag in [minPeriod, maxPeriod] along direction dir (-1 or +1)
  findBestPitchPeriodLag(currentReadPos, dir, absDrift) {
    const mono = this.monoRing;
    const mask = this.bufMask;
    const corrLen = this.corrLen;
    const minP = this.minPeriod;
    const maxP = this.maxPeriod;
    const pA = Math.floor(currentReadPos);

    let templateEnergy = 0.0;
    for (let m = 0; m < corrLen; m += 3) {
      const v = mono[(pA + m) & mask];
      templateEnergy += v * v;
    }

    // Silence or breath: only reset if drift has grown large
    if (templateEnergy < 1e-7) {
      return absDrift > minP * 1.5 ? Math.min(maxP, Math.round(absDrift)) : 0;
    }

    // Stage 1: Coarse Normalized Cross-Correlation over lags in [minPeriod, maxPeriod] (step = 2)
    const nccArr = this.coarseNcc;
    let maxNcc = -1.0;
    let globalBestLag = minP;

    for (let lag = minP; lag <= maxP; lag += 2) {
      const pCand = pA + dir * lag;
      let cross = 0.0;
      let candEnergy = 1e-9;
      for (let m = 0; m < corrLen; m += 3) {
        const t = mono[(pA + m) & mask];
        const c = mono[(pCand + m) & mask];
        cross += t * c;
        candEnergy += c * c;
      }
      const ncc = cross / Math.sqrt(templateEnergy * candEnergy);
      nccArr[lag] = ncc;
      if (ncc > maxNcc) {
        maxNcc = ncc;
        globalBestLag = lag;
      }
    }

    // Pick the period multiple (T0, 2*T0, ...) with strong correlation that brings drift closest to 0
    let chosenCoarseLag = globalBestLag;
    if (maxNcc > 0.35) {
      const threshold = maxNcc * 0.78;
      let bestResidualDrift = Math.abs(absDrift - globalBestLag);

      for (let lag = minP + 2; lag <= maxP - 2; lag += 2) {
        const val = nccArr[lag];
        if (val >= threshold && val >= nccArr[lag - 2] && val >= nccArr[lag + 2]) {
          const residual = Math.abs(absDrift - lag);
          if (residual < bestResidualDrift) {
            bestResidualDrift = residual;
            chosenCoarseLag = lag;
          }
        }
      }
    }

    // Only splice on this hop if jumping by chosenCoarseLag actually reduces |drift|!
    // (i.e. |drift| > 0.5 * T0). Otherwise wait for a later hop so we do fewer splices.
    if (Math.abs(absDrift - chosenCoarseLag) >= absDrift && absDrift < maxP * 0.9) {
      return 0;
    }

    // Stage 2: Sample-accurate fine search around chosenCoarseLag (-3 .. +3)
    const fineStart = Math.max(minP, chosenCoarseLag - 3);
    const fineEnd = Math.min(maxP, chosenCoarseLag + 3);
    let bestFineLag = chosenCoarseLag;
    let bestFineScore = -1e30;

    for (let lag = fineStart; lag <= fineEnd; lag++) {
      const pCand = pA + dir * lag;
      let cross = 0.0;
      let candEnergy = 1e-9;
      for (let m = 0; m < corrLen; m += 2) {
        const t = mono[(pA + m) & mask];
        const c = mono[(pCand + m) & mask];
        cross += t * c;
        candEnergy += c * c;
      }
      const score = cross / Math.sqrt(candEnergy);
      if (score > bestFineScore) {
        bestFineScore = score;
        bestFineLag = lag;
      }
    }

    return bestFineLag;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const numOutChannels = output.length;
    const numInChannels = input ? input.length : 0;
    const blockLen = output[0].length;

    const pitchFactor = parameters.pitchFactor[0];
    const bypass = parameters.bypass[0] >= 0.5 || Math.abs(pitchFactor - 1.0) < 0.001;

    if (numInChannels === 0) {
      for (let ch = 0; ch < numOutChannels; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const mask = this.bufMask;
    const ring0 = this.ring[0];
    const ring1 = this.ring[1];
    const mono = this.monoRing;
    const win = this.window;
    const hop = this.hopSize;

    for (let i = 0; i < blockLen; i++) {
      const in0 = input[0][i] || 0.0;
      const in1 = numInChannels > 1 ? input[1][i] : in0;

      const wIdx = this.writePos & mask;
      ring0[wIdx] = in0;
      ring1[wIdx] = in1;
      mono[wIdx] = 0.5 * (in0 + in1);
      this.writePos++;

      if (bypass) {
        output[0][i] = in0;
        if (numOutChannels > 1) {
          output[1][i] = in1;
        }
        this.readPosA = this.writePos - this.baseDelay;
        this.readPosB = this.writePos - this.baseDelay;
        this.grainPhase = 0;
        continue;
      }

      if (this.readPosA === this.readPosB) {
        // Both grains are at the identical position: zero crossfade, pure cubic resampling!
        const s0 = this.readCubic(ring0, this.readPosA);
        output[0][i] = s0;
        if (numOutChannels > 1) {
          output[1][i] = numInChannels > 1 ? this.readCubic(ring1, this.readPosA) : s0;
        }
      } else {
        // Smooth Hann crossfade between phase-locked periods A and B
        const k = this.grainPhase;
        const wA = win[k + hop];
        const wB = win[k];

        const sA0 = this.readCubic(ring0, this.readPosA);
        const sB0 = this.readCubic(ring0, this.readPosB);
        output[0][i] = wA * sA0 + wB * sB0;

        if (numOutChannels > 1) {
          if (numInChannels > 1) {
            const sA1 = this.readCubic(ring1, this.readPosA);
            const sB1 = this.readCubic(ring1, this.readPosB);
            output[1][i] = wA * sA1 + wB * sB1;
          } else {
            output[1][i] = output[0][i];
          }
        }
      }

      this.readPosA += pitchFactor;
      this.readPosB += pitchFactor;
      this.grainPhase++;

      if (this.grainPhase >= hop) {
        this.grainPhase = 0;
        this.readPosA = this.readPosB;

        const nominalPos = this.writePos - this.baseDelay;
        const drift = this.readPosA - nominalPos;
        const absDrift = Math.abs(drift);

        if (absDrift < this.minPeriod * 0.55) {
          // Drift is tiny: keep single continuous grain with no splice
          this.readPosB = this.readPosA;
        } else if (absDrift > this.maxPeriod * 1.8) {
          // Safety clamp if pointers ever drifted too far
          this.readPosB = nominalPos;
        } else {
          const dir = drift > 0 ? -1 : 1;
          const shiftLag = this.findBestPitchPeriodLag(this.readPosA, dir, absDrift);
          this.readPosB = shiftLag > 0 ? this.readPosA + dir * shiftLag : this.readPosA;
        }
      }
    }

    return true;
  }
}

registerProcessor('${WORKLET_PROCESSOR_NAME}', PsolaVoicePitchProcessor);
`;

export interface VoicePitchGraph {
  context: AudioContext;
  sourceNode: MediaElementAudioSourceNode;
  setPitchSemitones: (semitones: number) => Promise<void>;
  setGain: (gain: number) => void;
  dispose: () => void;
}

let sharedAudioContext: AudioContext | null = null;
let workletModulePromise: Promise<void> | null = null;

function getOrCreateAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioCtx({ latencyHint: 'playback' });
  }
  return sharedAudioContext;
}

async function ensureWorkletLoaded(ctx: AudioContext): Promise<void> {
  if (!workletModulePromise) {
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    workletModulePromise = ctx.audioWorklet
      .addModule(url)
      .catch((error) => {
        workletModulePromise = null;
        throw error;
      })
      .finally(() => URL.revokeObjectURL(url));
  }
  return workletModulePromise;
}

export async function createVoicePitchGraph(
  audioElement: HTMLMediaElement,
  initialSemitones: number
): Promise<VoicePitchGraph> {
  const ctx = getOrCreateAudioContext();
  const sourceNode = ctx.createMediaElementSource(audioElement);
  const gainNode = ctx.createGain();
  let workletNode: AudioWorkletNode | null = null;
  let disposed = false;
  let pitchRequest = 0;
  let shifted = false;

  const setPitchSemitones = async (semitones: number) => {
    const request = ++pitchRequest;
    if (disposed) return;
    if (Math.abs(semitones) < 0.01) {
      if (shifted) {
        sourceNode.disconnect();
        workletNode?.disconnect();
        sourceNode.connect(gainNode);
        shifted = false;
      }
      return;
    }
    await ensureWorkletLoaded(ctx);
    if (disposed || request !== pitchRequest) return;
    if (!workletNode) {
      workletNode = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
    }
    const factor = Math.pow(2, semitones / 12);
    const pitchParam = workletNode.parameters.get('pitchFactor');
    const bypassParam = workletNode.parameters.get('bypass');
    if (pitchParam) {
      pitchParam.setValueAtTime(factor, ctx.currentTime);
    }
    if (bypassParam) {
      bypassParam.setValueAtTime(0, ctx.currentTime);
    }
    if (!shifted) {
      sourceNode.disconnect();
      sourceNode.connect(workletNode);
      workletNode.connect(gainNode);
      shifted = true;
    }
  };

  sourceNode.connect(gainNode);
  gainNode.connect(ctx.destination);

  const graph: VoicePitchGraph = {
    context: ctx,
    sourceNode,
    setPitchSemitones,
    setGain: (gain) => {
      if (!Number.isFinite(gain) || gain < 0) throw new Error('Invalid playback gain');
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    },
    dispose: () => {
      disposed = true;
      sourceNode.disconnect();
      workletNode?.disconnect();
      gainNode.disconnect();
    },
  };
  if (initialSemitones !== 0) await setPitchSemitones(initialSemitones);
  return graph;
}
