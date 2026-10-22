// Vercel Serverless Function:
// - GET /api/r2-media?key=... -> Streams audio/PDF/image from Cloudflare R2 with Range & CORS support
// - POST /api/r2-media -> Uploads a local audio/PDF/image file into Cloudflare R2

import { r2GetObjectStream, r2PutBuffer, readJsonBody, getPublicMediaUrl } from './_r2.js';
import { sanitizeTeacherId, verifyTeacherToken } from './r2-auth.js';

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

function sanitizeSegment(str) {
  return String(str || 'item')
    .trim()
    .replace(/[^a-zA-Z0-9\u0590-\u05fe_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const { key } = req.query || {};
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Missing R2 media key' });
      }

      const rangeHeader = req.headers?.range;
      const result = await r2GetObjectStream(key, rangeHeader);
      if (!result) {
        return res.status(404).json({ error: 'Media file not found in R2' });
      }

      const extMatch = key.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'aac';
      const contentType =
        MIME_BY_EXT[ext] || result.headers['content-type'] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Cache-Control',
        'public, max-age=31536000, s-maxage=31536000, immutable'
      );

      if (result.headers['content-length']) {
        res.setHeader('Content-Length', result.headers['content-length']);
      }
      if (result.headers['content-range']) {
        res.setHeader('Content-Range', result.headers['content-range']);
      }

      res.status(result.status);
      if (req.method === 'HEAD') {
        return res.end();
      }
      return res.send(result.buffer);
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const authHeader = req.headers?.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const token = bearerToken || body.token || '';
      const verified = verifyTeacherToken(token);

      const teacherId = sanitizeTeacherId(verified?.teacherId || body.teacherId || 'default');
      const studentId = sanitizeSegment(body.studentId || 'general');
      const fileName = String(body.fileName || 'recording.aac').trim();
      const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = (extMatch ? extMatch[1].toLowerCase() : body.ext || 'aac').replace(/^\./, '');
      const contentType = body.mimeType || MIME_BY_EXT[ext] || 'audio/aac';

      if (!body.base64Data) {
        return res.status(400).json({ ok: false, error: 'Missing base64Data for upload' });
      }

      const cleanBase64 = body.base64Data.includes(',')
        ? body.base64Data.split(',')[1]
        : body.base64Data;
      const buffer = Buffer.from(cleanBase64, 'base64');

      const uniqueId = `r2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const r2Key = `media/${teacherId}/${studentId}/${uniqueId}.${ext}`;

      const uploaded = await r2PutBuffer(r2Key, buffer, contentType);
      const streamUrl = getPublicMediaUrl(r2Key);

      return res.status(200).json({
        ok: true,
        id: uniqueId,
        r2Key,
        r2Url: streamUrl,
        viewUrl: streamUrl,
        name: fileName,
        ext,
        size: uploaded.size,
        storage: uploaded.storage,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
