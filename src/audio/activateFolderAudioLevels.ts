import type { RecordingItem } from '../types';
import { isDocument } from '../utils/recordings';

export async function activateFolderAudioLevels(
  items: RecordingItem[],
  scan: (recordings: RecordingItem[]) => Promise<boolean>,
  saveTarget: () => Promise<boolean>,
): Promise<boolean> {
  const recordings = items.filter((item) => !isDocument(item));
  if (!recordings.length) throw new Error('אין הקלטות בתיקייה לאיזון עוצמה');

  const unscanned = recordings.filter((item) => item.normalization?.version !== 2);
  if (unscanned.length && !await scan(unscanned)) return false;
  return saveTarget();
}
