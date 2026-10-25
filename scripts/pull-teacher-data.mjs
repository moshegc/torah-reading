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

