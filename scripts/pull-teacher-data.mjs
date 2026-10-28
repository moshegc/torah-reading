import fs from 'node:fs/promises';
import path from 'node:path';
import { r2GetJsonFromR2, isR2Configured, getLocalTeacherDataPath } from '../api/_r2.js';

async function main() {
  if (!isR2Configured()) {
    console.error('Cloudflare R2 credentials not found in environment.');
    process.exit(1);
  }
  const teacherId = process.argv[2] || process.env.TEACHER_ID || 'mosheg';
  const key = `teachers/${teacherId}/data.json`;
  console.log(`Fetching hosted data from Cloudflare R2: ${key}...`);
  const data = await r2GetJsonFromR2(key);
  if (!data) {
    console.error(`Teacher data not found in R2: ${key}`);
    process.exit(1);
  }
  const localPath =
    getLocalTeacherDataPath(teacherId) ||
    path.resolve(process.cwd(), 'teacher-data.local.json');
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  let library = data.parashaLibrary || {};
  if (data.libraryKey) {
    if (data.libraryKey !== `teachers/${teacherId}/library.json`) throw new Error('Invalid library reference');
    const index = await r2GetJsonFromR2(data.libraryKey);
    if (!index || index.version !== 1 || !index.folders) throw new Error('Missing library index');
    library = index.folders;
    await fs.writeFile(`${localPath}.library.json`, JSON.stringify(index, null, 2), 'utf8');
  }
  const metadataKeys = [...new Set([
    ...Object.values(library).flat(),
    ...(data.students || []).flatMap((student) => student.portions || []),
  ].map((item) => item.normalizationKey).filter(Boolean))];
  for (const metadataKey of metadataKeys) {
    const prefix = `teachers/${teacherId}/normalization/`;
    if (!metadataKey.startsWith(prefix) || !/^[a-f0-9]{64}\.json$/.test(metadataKey.slice(prefix.length))) {
      throw new Error('Invalid normalization metadata reference');
    }
    const metadata = await r2GetJsonFromR2(metadataKey);
    if (!metadata) throw new Error(`Missing normalization metadata: ${metadataKey}`);
    const metadataPath = path.join(`${localPath}.normalization`, path.basename(metadataKey));
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  }
  await fs.writeFile(localPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(
    `Successfully saved hosted teacher data to local file:\n${localPath} (${(
      Buffer.byteLength(JSON.stringify(data)) / 1024
    ).toFixed(1)} KB)`
  );
}

main().catch((err) => {
  console.error('Failed to pull teacher data:', err);
  process.exit(1);
});
