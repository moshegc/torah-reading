// Vercel Serverless Function: Reads torah-app-data.json directly from the teacher's
// Google Drive folder (0B6cVWsWs-t94Y2xzWnJaWlF0ZXc) so students on any device
// always get the latest saved student data & portions without needing any keys or tokens.

const ROOT_FOLDER_ID = '0B6cVWsWs-t94Y2xzWnJaWlF0ZXc';
const ROOT_RESOURCE_KEY = '0-74NHOzXbUQNLQVKYpF9CNQ';
const DATA_FILENAME = 'torah-app-data.json';

function findDataFileInHtml(htmlText) {
  const match = htmlText.match(/window\['_DRIVE_ivd'\]\s*=\s*'([^']+)'/);
  if (!match) return null;
  const escaped = match[1];
  const decoded = escaped
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');

  let data;
  try {
    data = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;

  for (const entry of data[0]) {
    if (!Array.isArray(entry) || entry.length < 4) continue;
    const id = entry[0];
    const name = entry[2];
    if (name === DATA_FILENAME) {
      let resourceKey = null;
      const flat = JSON.stringify(entry);
      const rkMatch = flat.match(/"(0-[A-Za-z0-9_-]{15,30})"/);
      if (rkMatch) resourceKey = rkMatch[1];
      return { id, resourceKey };
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const folderUrl = `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}?resourcekey=${ROOT_RESOURCE_KEY}`;
    const folderResp = await fetch(folderUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!folderResp.ok) {
      return res.status(folderResp.status).json({ ok: false, error: 'Failed to read root Drive folder' });
    }
    const html = await folderResp.text();
    const found = findDataFileInHtml(html);
    if (!found) {
      return res.status(200).json({ ok: true, initialized: false, data: null });
    }

    const rkParam = found.resourceKey ? `&resourcekey=${encodeURIComponent(found.resourceKey)}` : '';
    const downloadUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(found.id)}${rkParam}&t=${Date.now()}`;
    const fileResp = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });

    if (!fileResp.ok) {
      return res.status(fileResp.status).json({ ok: false, error: 'Failed to download torah-app-data.json' });
    }

    const text = await fileResp.text();
    const parsed = JSON.parse(text);
    return res.status(200).json({
      ok: true,
      initialized: true,
      fileId: found.id,
      data: parsed,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

