import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function audioEnvironment() {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn() } };
  const context = {
    state: 'running', currentTime: 1, destination: {}, resume: vi.fn(),
    createMediaElementSource: vi.fn(() => source), createGain: vi.fn(() => gain),
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
  };
  const worklet = {
    connect: vi.fn(), disconnect: vi.fn(),
    parameters: new Map([
      ['pitchFactor', { setValueAtTime: vi.fn() }],
      ['bypass', { setValueAtTime: vi.fn() }],
    ]),
  };
  vi.stubGlobal('window', { AudioContext: function () { return context; } });
  const Worklet = vi.fn(function () { return worklet; });
  vi.stubGlobal('AudioWorkletNode', Worklet);
  return { source, gain, context, worklet, Worklet };
}

describe('normalization and pitch audio graph', () => {
  it('uses gain only at zero pitch and loads pitch processing only when requested', async () => {
    const { source, gain, context, worklet, Worklet } = audioEnvironment();
    const { createVoicePitchGraph } = await import('../utils/voicePitchShifter');
    const graph = await createVoicePitchGraph({} as HTMLAudioElement, 0);
    expect(source.connect).toHaveBeenLastCalledWith(gain);
    expect(context.audioWorklet.addModule).not.toHaveBeenCalled();
    graph.setGain(2);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(2, 1);
    await graph.setPitchSemitones(3);
    expect(Worklet).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenLastCalledWith(worklet);
    expect(worklet.connect).toHaveBeenLastCalledWith(gain);
    await graph.setPitchSemitones(0);
    expect(source.connect).toHaveBeenLastCalledWith(gain);
    await graph.setPitchSemitones(-2);
    expect(Worklet).toHaveBeenCalledTimes(1);
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    graph.setGain(1);
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 1);
    graph.dispose();
    expect(gain.disconnect).toHaveBeenCalled();
    expect(() => graph.setGain(Infinity)).toThrow();
  });

  it('does not attach a stale pitch request after returning to zero', async () => {
    const { context, source, gain, Worklet } = audioEnvironment();
    let loaded: () => void = () => {};
    context.audioWorklet.addModule.mockImplementation(() => new Promise<void>((resolve) => { loaded = resolve; }));
    const { createVoicePitchGraph } = await import('../utils/voicePitchShifter');
    const graph = await createVoicePitchGraph({} as HTMLAudioElement, 0);
    const pending = graph.setPitchSemitones(3);
    await graph.setPitchSemitones(0);
    loaded();
    await pending;
    expect(Worklet).not.toHaveBeenCalled();
    expect(source.connect).toHaveBeenLastCalledWith(gain);
    graph.dispose();
  });
});
