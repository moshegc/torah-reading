// Vercel Serverless Function: Transfers audio/PDF/image files directly from a teacher's
// Google Drive (via Google Picker OAuth token OR shared Drive link/folder) into Cloudflare R2.

import { r2PutBuffer, readJsonBody, getPublicMediaUrl } from './_r2.js';
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

const EXT_BY_MIME = {
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function sanitizeSegment(str) {
  return String(str || 'item')
    .trim()
    .replace(/[^a-zA-Z0-9\u0590-\u05fe_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

function parseFilenameFromContentDisposition(cd) {
  if (!cd) return null;
  const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // ignore
    }
  }
  const match = cd.match(/filename="?([^";]+)"?/i);
  return match ? match[1].trim() : null;
}

async function downloadFileFromDrive({ id, resourceKey, oauthToken, fallbackName, fallbackExt }) {
  let buffer = null;
  let fileName = fallbackName || '';
  let mimeType = '';

  // 1. If OAuth token from Google Drive Picker is provided, use Google Drive API v3 (works for private files too!)
  if (oauthToken) {
    if (!fileName) {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          id
        )}?fields=id,name,mimeType,size&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${oauthToken}` },
        }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta.name) fileName = meta.name;
        if (meta.mimeType) mimeType = meta.mimeType;
      }
    }

    const mediaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        id
      )}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${oauthToken}` },
      }
    );
    if (mediaRes.ok) {
      const ab = await mediaRes.arrayBuffer();
      buffer = Buffer.from(ab);
      if (!mimeType) {
        mimeType = mediaRes.headers.get('content-type') || '';
      }
    }
  }

  // 2. Fallback to public Google Drive download URL if no oauthToken or if Drive API failed
  if (!buffer) {
    const rkParam = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : '';
    const driveUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(
      id
    )}${rkParam}`;
    const res = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(
        `לא ניתן להוריד את הקובץ מ-Google Drive (סטטוס ${res.status}). ודא שהקובץ משותף לצפייה או השתמש בכפתור הבחירה מ-Drive.`
      );
    }

    const cdName = parseFilenameFromContentDisposition(res.headers.get('content-disposition'));
    if (!fileName && cdName) {
      fileName = cdName;
    }
    if (!mimeType) {
      mimeType = res.headers.get('content-type') || '';
    }
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
  }

  const extMatch = (fileName || '').match(/\.([a-zA-Z0-9]+)$/);
  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const ext = (
    extMatch
      ? extMatch[1].toLowerCase()
      : EXT_BY_MIME[cleanMime] || fallbackExt || 'aac'
  ).replace(/^\./, '');

  const finalContentType = MIME_BY_EXT[ext] || cleanMime || 'audio/aac';
  if (!fileName) {
    fileName = `recording-${id.slice(0, 8)}.${ext}`;
  } else if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
    fileName = `${fileName}.${ext}`;
  }

  return {
    buffer,
    fileName,
    ext,
    contentType: finalContentType,
  };
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
    const authHeader = req.headers?.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearerToken || body.token || '';
    const verified = verifyTeacherToken(token);

    const teacherId = sanitizeTeacherId(verified?.teacherId || body.teacherId || 'default');
    const studentId = sanitizeSegment(body.studentId || 'general');
    const oauthToken = body.oauthToken || '';

    let filesToTransfer = [];

    // Case 1: Folder transfer (list files in Drive folder first)
    if (body.folderId) {
      const folderId = String(body.folderId).trim();
      const resourceKey = body.resourceKey || null;

      if (oauthToken) {
        const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`
        )}&fields=files(id,name,mimeType,size,resourceKey)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const listRes = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${oauthToken}` },
        });
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (Array.isArray(listJson.files)) {
            filesToTransfer = listJson.files;
          }
        }
      }

      if (filesToTransfer.length === 0) {
        const rkParam = resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}` : '';
        const folderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(
          folderId
        )}${rkParam}`;
        const upstream = await fetch(folderUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (!upstream.ok) {
          return res.status(upstream.status).json({
            ok: false,
            error: `לא ניתן לקרוא את התיקייה מ-Google Drive (סטטוס ${upstream.status}). ודא שהיא משותפת לצפייה.`,
          });
        }
        const htmlText = await upstream.text();
        const items = extractIvdItems(htmlText, folderId);
        filesToTransfer = items.filter(
          (item) => item.mimeType !== 'application/vnd.google-apps.folder'
        );
      }
    } else if (Array.isArray(body.files) && body.files.length > 0) {
      // Case 2: Explicit list of files (e.g., from Google Drive Picker)
      filesToTransfer = body.files;
    } else if (body.fileId) {
      // Case 3: Single Drive file ID/link
      filesToTransfer = [
        {
          id: body.fileId,
          resourceKey: body.resourceKey || null,
          name: body.fileName || '',
          ext: body.ext || '',
        },
      ];
    }

    if (filesToTransfer.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'לא נמצאו קבצים להעברה מ-Google Drive',
      });
    }

    const transferredItems = [];
    const errors = [];

    for (const item of filesToTransfer) {
      try {
        const downloaded = await downloadFileFromDrive({
          id: item.id,
          resourceKey: item.resourceKey,
          oauthToken,
          fallbackName: item.name,
          fallbackExt: item.ext,
        });

        const safeFileId = sanitizeSegment(item.id);
        const r2Key = `media/${teacherId}/${studentId}/drive-${safeFileId}.${downloaded.ext}`;
        const saved = await r2PutBuffer(r2Key, downloaded.buffer, downloaded.contentType);
        const streamUrl = getPublicMediaUrl(r2Key);

        transferredItems.push({
          id: `r2-${safeFileId}`,
          driveId: item.id,
          name: downloaded.fileName,
          ext: downloaded.ext,
          r2Key,
          r2Url: streamUrl,
          viewUrl: streamUrl,
          size: saved.size,
          storage: saved.storage,
        });
      } catch (err) {
        errors.push({
          id: item.id,
          name: item.name,
          error: String(err?.message || err),
        });
      }
    }

    if (transferredItems.length === 0 && errors.length > 0) {
      return res.status(400).json({
        ok: false,
        error: errors[0].error,
        errors,
      });
    }

    return res.status(200).json({
      ok: true,
      items: transferredItems,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
