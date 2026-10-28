import { createHash } from 'node:crypto';

export function recordingKey(item) {
  return item.r2Key ? `r2:${item.r2Key}` : `id:${item.id}:${item.viewUrl}`;
}

export function normalizationMetadataKey(teacherId, item) {
  const hash = createHash('sha256').update(recordingKey(item)).digest('hex');
  return `teachers/${teacherId}/normalization/${hash}.json`;
}

export function allRecordings(data) {
  return [
    ...Object.values(data?.parashaLibrary || {}).flat(),
    ...(data?.students || []).flatMap((student) => student.portions || []),
  ];
}

export function mapRecordings(data, transform) {
  return {
    ...data,
    ...(data.parashaLibrary ? {
      parashaLibrary: Object.fromEntries(Object.entries(data.parashaLibrary)
        .map(([folder, items]) => [folder, items.map(transform)])),
    } : {}),
    ...(data.students ? {
      students: data.students.map((student) => ({
        ...student,
        ...(student.portions ? { portions: student.portions.map(transform) } : {}),
      })),
    } : {}),
  };
}

export function withTarget(normalization, targetLufs) {
  if (!Number.isFinite(targetLufs)) return normalization;
  const measured = normalization.leveling || normalization;
  return {
    ...normalization,
    targetLufs,
    gainDb: Math.min(targetLufs - measured.integratedLufs, -2 - measured.truePeakDbtp,
      12 - Math.max(0, ...(normalization.leveling?.points.map((point) => point.gainDb) || []))),
  };
}

export function percentileTarget(items) {
  const unique = new Map(items.filter((item) => item.normalization)
    .map((item) => [recordingKey(item), item.normalization]));
  const achievable = [...unique.values()].map((normalization) => {
    const measured = normalization.leveling || normalization;
    return measured.integratedLufs + Math.min(-2 - measured.truePeakDbtp,
      12 - Math.max(0, ...(normalization.leveling?.points.map((point) => point.gainDb) || [])));
  }).sort((a, b) => a - b);
  if (!achievable.length) throw new Error('יש לנתח לפחות הקלטה אחת לפני חישוב היעד');
  // Nearest-rank 10th percentile: small libraries retain a target all files can reach.
  return Math.min(-18, achievable[Math.max(0, Math.ceil(achievable.length * 0.1) - 1)]);
}

export function applyNormalizationTargets(data) {
  if (!data) return data;
  const targets = data.normalizationFolderTargets;
  const legacyTarget = data.normalizationTargetLufs;
  if (targets === undefined && !Number.isFinite(legacyTarget)) return data;
  if (targets !== undefined && (!targets || typeof targets !== 'object' ||
      Array.isArray(targets) || Object.values(targets).some((value) => !Number.isFinite(value)))) {
    throw new Error('Invalid folder normalization targets');
  }
  const update = (item, folder) => item.normalization
    ? { ...item, normalization: withTarget(item.normalization, targets?.[folder] ?? legacyTarget ?? -18) }
    : item;
  return {
    ...data,
    ...(data.parashaLibrary ? {
      parashaLibrary: Object.fromEntries(Object.entries(data.parashaLibrary)
        .map(([folder, items]) => [folder, items.map((item) => update(item, folder))])),
    } : {}),
    ...(data.students ? {
      students: data.students.map((student) => ({
        ...student,
        ...(student.portions ? {
          portions: student.portions.map((item) => update(item, student.parasha)),
        } : {}),
      })),
    } : {}),
  };
}
