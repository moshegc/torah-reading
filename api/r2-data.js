// Vercel Serverless Function: Reads and writes teacher & student JSON data in Cloudflare R2
// Path in R2: `teachers/{teacherId}/data.json`

import { r2GetJson, r2PutJson, readJsonBody, isR2Configured } from './_r2.js';
import { sanitizeTeacherId, verifyTeacherToken } from './r2-auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { teacher, student } = req.query || {};
      const teacherId = sanitizeTeacherId(teacher);
      if (!teacherId) {
        return res.status(400).json({ ok: false, error: 'Missing teacher parameter' });
      }

      const dataKey = `teachers/${teacherId}/data.json`;
      const data = await r2GetJson(dataKey);

      if (!data) {
        return res.status(200).json({
          ok: true,
          initialized: false,
          teacherId,
          data: null,
          student: null,
          r2Configured: isR2Configured(),
        });
      }

      // If student parameter is provided, return only that student's profile (for `?teacher=...&student=...` links)
      if (student) {
        const cleanStudent = String(student).trim().toLowerCase();
        const studentsList = Array.isArray(data.students) ? data.students : [];
        const foundStudent =
          studentsList.find(
            (s) =>
              String(s.id || '').toLowerCase() === cleanStudent ||
              String(s.name || '').trim() === String(student).trim()
          ) || null;

        return res.status(200).json({
          ok: true,
          initialized: true,
          teacherId,
          student: foundStudent,
          parashaLibrary: foundStudent ? {
            'כללי': data.parashaLibrary?.['כללי'] || [],
            'תמונות': data.parashaLibrary?.['תמונות'] || [],
          } : {},
          updatedAt: data.updatedAt || null,
          r2Configured: isR2Configured(),
        });
      }

      return res.status(200).json({
        ok: true,
        initialized: true,
        teacherId,
        data,
        r2Configured: isR2Configured(),
      });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const authHeader = req.headers?.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const token = bearerToken || body.token || '';

      const verified = verifyTeacherToken(token);
      const teacherId = sanitizeTeacherId(verified?.teacherId || body.teacherId);
      if (!teacherId) {
        return res.status(401).json({ ok: false, error: 'Unauthorized: missing teacher session' });
      }

      const dataKey = `teachers/${teacherId}/data.json`;
      const existingData = await r2GetJson(dataKey);

      const payload = {
        students: Array.isArray(body.students) ? body.students : [],
        haftarotMap: body.haftarotMap && typeof body.haftarotMap === 'object' ? body.haftarotMap : {},
        parashaLibrary: body.parashaLibrary || existingData?.parashaLibrary || {},
        settings:
          body.settings && typeof body.settings === 'object' ? body.settings : existingData?.settings || {},
        updatedAt: new Date().toISOString(),
      };

      const saved = await r2PutJson(dataKey, payload);

      return res.status(200).json({
        ok: true,
        teacherId,
        updatedAt: payload.updatedAt,
        storage: saved.storage,
        r2Configured: isR2Configured(),
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
