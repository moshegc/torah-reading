// Vercel Serverless Function: Streams audio/PDF/image files from Google Drive
// with proper MIME types and Range support for mobile iOS/Android playback.

const MIME_BY_EXT = {
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    return res.status(200).end();
  }

  const { id, resourceKey, ext = 'aac' } = req.query || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing Google Drive file id' });
  }

  const rkParam = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : '';
  const driveUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(id)}${rkParam}`;

  try {
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(driveUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({
        error: `Google Drive returned status ${upstream.status}`,
      });
    }

    const cleanExt = String(ext).toLowerCase().replace(/^\./, '');
    const contentType = MIME_BY_EXT[cleanExt] || upstream.headers.get('content-type') || 'audio/mp4';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    res.status(upstream.status);

    if (req.method === 'HEAD') {
      return res.end();
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
