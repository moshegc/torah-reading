// Vercel Serverless Function: Teacher Authentication (Login, Sign-up, Google OAuth)
// Stores teacher accounts & credentials in Cloudflare R2 under `teachers/{teacherId}/account.json`

import crypto from 'node:crypto';
import { r2GetJson, r2PutJson, readJsonBody, isR2Configured } from './_r2.js';

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.R2_SECRET_ACCESS_KEY ||
  'torah-reading-trainer-default-secret-key';

export function sanitizeTeacherId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/@.*$/, '') // if email passed, take local part
    .replace(/[^a-z0-9\u0590-\u05fe_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch {
    return false;
  }
}

export function createTeacherToken(teacherId, email = '') {
  const payload = Buffer.from(
    JSON.stringify({
      teacherId,
      email,
      iat: Date.now(),
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyTeacherToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function getTeacherIndex() {
  const idx = await r2GetJson('teachers/_index.json');
  return idx && typeof idx === 'object' ? idx : { byEmail: {} };
}

async function updateTeacherIndex(email, teacherId) {
  if (!email) return;
  const cleanEmail = String(email).trim().toLowerCase();
  const idx = await getTeacherIndex();
  idx.byEmail = idx.byEmail || {};
  idx.byEmail[cleanEmail] = teacherId;
  await r2PutJson('teachers/_index.json', idx);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const { action } = body;

    if (action === 'register') {
      const { username, email, password, displayName, initialData } = body;
      const teacherId = sanitizeTeacherId(username || email);
      if (!teacherId || teacherId.length < 2) {
        return res
          .status(400)
          .json({ ok: false, error: 'נא לבחור שם משתמש / מזהה מורה תקין (לפחות 2 תווים)' });
      }
      if (!password || String(password).length < 4) {
        return res
          .status(400)
          .json({ ok: false, error: 'הסיסמה חייבת להכיל לפחות 4 תווים' });
      }

      const accountKey = `teachers/${teacherId}/account.json`;
      const existing = await r2GetJson(accountKey);
      if (existing) {
        return res
          .status(409)
          .json({ ok: false, error: 'שם המשתמש כבר קיים במערכת. בחר מזהה אחר או התחבר.' });
      }

      const cleanEmail = String(email || '').trim().toLowerCase();
      if (cleanEmail) {
        const idx = await getTeacherIndex();
        if (idx.byEmail?.[cleanEmail]) {
          return res
            .status(409)
            .json({ ok: false, error: 'כתובת האימייל כבר רשומה במערכת. נא להתחבר.' });
        }
      }

      const account = {
        teacherId,
        displayName: String(displayName || username || teacherId).trim(),
        email: cleanEmail,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
      };

      await r2PutJson(accountKey, account);
      if (cleanEmail) {
        await updateTeacherIndex(cleanEmail, teacherId);
      }

      const dataKey = `teachers/${teacherId}/data.json`;
      let teacherData = await r2GetJson(dataKey);
      if (!teacherData && initialData) {
        teacherData = {
          students: Array.isArray(initialData.students) ? initialData.students : [],
          haftarotMap: initialData.haftarotMap || {},
          updatedAt: new Date().toISOString(),
        };
        await r2PutJson(dataKey, teacherData);
      }

      const token = createTeacherToken(teacherId, cleanEmail);
      return res.status(200).json({
        ok: true,
        teacher: {
          teacherId: account.teacherId,
          displayName: account.displayName,
          email: account.email,
        },
        token,
        data: teacherData,
        r2Configured: isR2Configured(),
      });
    }

    if (action === 'login') {
      const { identifier, password } = body;
      const rawId = String(identifier || '').trim();
      if (!rawId || !password) {
        return res.status(400).json({ ok: false, error: 'נא להזין שם משתמש/אימייל וסיסמה' });
      }

      let teacherId = sanitizeTeacherId(rawId);
      if (rawId.includes('@')) {
        const idx = await getTeacherIndex();
        const mapped = idx.byEmail?.[rawId.toLowerCase()];
        if (mapped) teacherId = mapped;
      }

      const accountKey = `teachers/${teacherId}/account.json`;
      const account = await r2GetJson(accountKey);
      if (!account || !verifyPassword(password, account.passwordHash)) {
        return res.status(401).json({ ok: false, error: 'שם משתמש או סיסמה שגויים' });
      }

      const dataKey = `teachers/${teacherId}/data.json`;
      const teacherData = await r2GetJson(dataKey);
      const token = createTeacherToken(account.teacherId, account.email);

      return res.status(200).json({
        ok: true,
        teacher: {
          teacherId: account.teacherId,
          displayName: account.displayName,
          email: account.email,
        },
        token,
        data: teacherData,
        r2Configured: isR2Configured(),
      });
    }

    if (action === 'google') {
      const { accessToken, idToken, preferredUsername, initialData } = body;
      let email = '';
      let name = '';
      let sub = '';

      if (accessToken) {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userRes.ok) {
          return res.status(401).json({ ok: false, error: 'אימות Google נכשל' });
        }
        const info = await userRes.json();
        email = String(info.email || '').toLowerCase();
        name = info.name || info.given_name || email;
        sub = info.sub || '';
      } else if (idToken) {
        const tokenRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
        );
        if (!tokenRes.ok) {
          return res.status(401).json({ ok: false, error: 'אימות Google ID Token נכשל' });
        }
        const info = await tokenRes.json();
        email = String(info.email || '').toLowerCase();
        name = info.name || info.given_name || email;
        sub = info.sub || '';
      } else {
        return res.status(400).json({ ok: false, error: 'חסר אסימון התחברות של Google' });
      }

      if (!email) {
        return res.status(400).json({ ok: false, error: 'לא התקבלה כתובת אימייל מחשבון Google' });
      }

      const idx = await getTeacherIndex();
      let teacherId = idx.byEmail?.[email];

      if (!teacherId) {
        let baseId = sanitizeTeacherId(preferredUsername || email.split('@')[0] || 'teacher');
        if (!baseId || baseId.length < 2) baseId = 'teacher';
        teacherId = baseId;
        let existing = await r2GetJson(`teachers/${teacherId}/account.json`);
        if (existing && existing.email !== email) {
          teacherId = `${baseId}-${Math.floor(100 + Math.random() * 900)}`;
        }
      }

      const accountKey = `teachers/${teacherId}/account.json`;
      let account = await r2GetJson(accountKey);
      if (!account) {
        account = {
          teacherId,
          displayName: name || teacherId,
          email,
          googleSub: sub,
          createdAt: new Date().toISOString(),
        };
        await r2PutJson(accountKey, account);
        await updateTeacherIndex(email, teacherId);
      }

      const dataKey = `teachers/${teacherId}/data.json`;
      let teacherData = await r2GetJson(dataKey);
      if (!teacherData && initialData) {
        teacherData = {
          students: Array.isArray(initialData.students) ? initialData.students : [],
          haftarotMap: initialData.haftarotMap || {},
          updatedAt: new Date().toISOString(),
        };
        await r2PutJson(dataKey, teacherData);
      }

      const token = createTeacherToken(account.teacherId, account.email);
      return res.status(200).json({
        ok: true,
        teacher: {
          teacherId: account.teacherId,
          displayName: account.displayName,
          email: account.email,
        },
        token,
        data: teacherData,
        r2Configured: isR2Configured(),
      });
    }

    return res.status(400).json({ ok: false, error: `Unknown auth action: ${action}` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
