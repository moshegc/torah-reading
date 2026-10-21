// Vercel Serverless Function: Dynamically lists files/subfolders inside any public Google Drive folder
// in the teacher's "קריאה בתורה" directory without requiring a user API key.

function extractIvdItems(htmlText, parentId) {
  const match = htmlText.match(/window\['_DRIVE_ivd'\]\s*=\s*'([^']+)'/);
  if (!match) return [];
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
    return [];
  }
  if (!Array.isArray(data) || !Array.isArray(data[0])) return [];

  const items = [];
  for (const entry of data[0]) {
    if (!Array.isArray(entry) || entry.length < 4) continue;
    const id = entry[0];
    const parents = entry[1];
    const name = entry[2];
    const mimeType = entry[3];
    const size = entry.length > 13 ? entry[13] : null;
    let resourceKey = null;
    const flat = JSON.stringify(entry);
    const rkMatch = flat.match(/"(0-[A-Za-z0-9_-]{15,30})"/);
    if (rkMatch) {
      resourceKey = rkMatch[1];
    }
    items.push({
      id,
      parentId: Array.isArray(parents) && parents[0] ? parents[0] : parentId,
      name,
      mimeType,
      size,
      resourceKey,
    });
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { folderId = '0B6cVWsWs-t94Y2xzWnJaWlF0ZXc', resourceKey = '0-74NHOzXbUQNLQVKYpF9CNQ' } = req.query || {};
  const rkParam = resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}` : '';
  const url = `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}${rkParam}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Drive folder fetch failed: ${upstream.status}` });
    }
    const htmlText = await upstream.text();
    const items = extractIvdItems(htmlText, folderId);
    return res.status(200).json({ folderId, items, syncedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
