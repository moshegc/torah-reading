import { describe, expect, it, vi } from 'vitest';
import type { RecordingItem } from '../types';
import { activateFolderAudioLevels } from './activateFolderAudioLevels';

const audio: RecordingItem = {
  id: 'audio', title: 'audio.mp3', aliyah: 'Audio', category: 'shabbat', ext: 'mp3', viewUrl: '/audio',
};
const document: RecordingItem = { ...audio, id: 'document', category: 'doc', ext: 'pdf' };
const legacy: RecordingItem = {
  ...audio, id: 'legacy',
  normalization: { version: 1, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6 },
};
const scanned: RecordingItem = {
  ...audio, id: 'scanned',
  normalization: {
    version: 2, integratedLufs: -24, truePeakDbtp: -10, gainDb: 6,
    leveling: { duration: 1, integratedLufs: -24, truePeakDbtp: -10, points: [{ time: 0, gainDb: 0 }, { time: 1, gainDb: 0 }] },
  },
};

describe('activate folder audio levels', () => {
  it('scans missing and legacy recordings before saving the target', async () => {
    let finishScan!: (value: boolean) => void;
    const scan = vi.fn(() => new Promise<boolean>((resolve) => { finishScan = resolve; }));
    const saveTarget = vi.fn(async () => true);
    const result = activateFolderAudioLevels([audio, document, scanned, legacy], scan, saveTarget);
    expect(scan).toHaveBeenCalledWith([audio, legacy]);
    expect(saveTarget).not.toHaveBeenCalled();
    finishScan(true);
    await expect(result).resolves.toBe(true);
    expect(saveTarget).toHaveBeenCalledOnce();
  });

  it('does not save the target when scanning or saving a scan fails', async () => {
    const saveTarget = vi.fn(async () => true);
    await expect(activateFolderAudioLevels([audio, scanned], async () => false, saveTarget)).resolves.toBe(false);
    expect(saveTarget).not.toHaveBeenCalled();
  });

  it('calculates the target directly when all audio has current scans', async () => {
    const scan = vi.fn(async () => true);
    const saveTarget = vi.fn(async () => true);
    await expect(activateFolderAudioLevels([document, scanned], scan, saveTarget)).resolves.toBe(true);
    expect(scan).not.toHaveBeenCalled();
    expect(saveTarget).toHaveBeenCalledOnce();
  });

  it('propagates target save failures and rejects folders without audio', async () => {
    await expect(activateFolderAudioLevels([scanned], async () => true, async () => false)).resolves.toBe(false);
    const saveTarget = vi.fn(async () => true);
    await expect(activateFolderAudioLevels([document], async () => true, saveTarget)).rejects.toThrow('אין הקלטות');
    expect(saveTarget).not.toHaveBeenCalled();
  });
});
