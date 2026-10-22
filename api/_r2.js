// Cloudflare R2 Storage Client (S3-compatible Signature V4)
// Automatically falls back to local `.r2-local/` disk storage during local development
// if R2_ACCOUNT_ID is not yet set in environment variables.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const LOCAL_R2_DIR = path.resolve(process.cwd(), '.r2-local');

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );
}

function getR2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (process.env.R2_BUCKET_NAME || '').trim();
  const publicUrl = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeS3Key(key) {
  return key
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
}

/**
 * Signs an HTTP request to Cloudflare R2 using AWS Signature Version 4
 */
function signR2Request({ method, key, query = {}, headers = {}, payloadHash = 'UNSIGNED-PAYLOAD' }) {
  const { accountId, accessKeyId, secretAccessKey, bucket, endpoint } = getR2Config();
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${encodeRfc3986(bucket)}/${encodeS3Key(key)}`;

  const sortedQueryKeys = Object.keys(query).sort();
  const canonicalQueryString = sortedQueryKeys
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(String(query[k] ?? ''))}`)
    .join('&');

  const allHeaders = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])
    ),
  };

  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${allHeaders[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `${endpoint}${canonicalUri}${
    canonicalQueryString ? `?${canonicalQueryString}` : ''
  }`;

  return {
    url,
    headers: {
      ...allHeaders,
      Authorization: authorization,
    },
  };
}

// Local disk fallback helpers when R2 env vars are not set
async function localFilePath(key) {
  const safeKey = key.replace(/\.\./g, '_').replace(/^\/+/, '');
  const fullPath = path.join(LOCAL_R2_DIR, safeKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  return fullPath;
}

export async function r2GetJson(key) {
  if (!isR2Configured()) {
    try {
      const fp = await localFilePath(key);
      const raw = await fs.readFile(fp, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  const signed = signR2Request({ method: 'GET', key });
  const res = await fetch(signed.url, { method: 'GET', headers: signed.headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 GET ${key} failed (${res.status}): ${text}`);
  }
  return await res.json();
}

export async function r2PutJson(key, data) {
  const bodyStr = JSON.stringify(data, null, 2);
  const bodyBuf = Buffer.from(bodyStr, 'utf8');

  if (!isR2Configured()) {
    const fp = await localFilePath(key);
    await fs.writeFile(fp, bodyBuf);
    return { key, storage: 'local-fallback' };
  }

  const payloadHash = sha256Hex(bodyBuf);
  const signed = signR2Request({
    method: 'PUT',
    key,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(bodyBuf.byteLength),
    },
    payloadHash,
  });

  const res = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: bodyBuf,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 PUT ${key} failed (${res.status}): ${text}`);
  }
  return { key, storage: 'r2' };
}

export async function r2PutBuffer(key, buffer, contentType = 'application/octet-stream') {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (!isR2Configured()) {
    const fp = await localFilePath(key);
    await fs.writeFile(fp, buf);
    await fs.writeFile(`${fp}.meta.json`, JSON.stringify({ contentType, size: buf.byteLength }));
    return {
      key,
      size: buf.byteLength,
      url: getPublicMediaUrl(key),
      storage: 'local-fallback',
    };
  }

  const payloadHash = sha256Hex(buf);
  const signed = signR2Request({
    method: 'PUT',
    key,
    headers: {
      'content-type': contentType,
      'content-length': String(buf.byteLength),
    },
    payloadHash,
  });

  const res = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: buf,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 PUT media ${key} failed (${res.status}): ${text}`);
  }

  return {
    key,
    size: buf.byteLength,
    url: getPublicMediaUrl(key),
    storage: 'r2',
  };
}

export async function r2GetObjectStream(key, rangeHeader) {
  if (!isR2Configured()) {
    try {
      const fp = await localFilePath(key);
      const stat = await fs.stat(fp);
      let contentType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await fs.readFile(`${fp}.meta.json`, 'utf8'));
        if (meta.contentType) contentType = meta.contentType;
      } catch {
        // infer from ext
      }
      const fullBuf = await fs.readFile(fp);
      if (rangeHeader) {
        const match = String(rangeHeader).match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
          const chunk = fullBuf.subarray(start, end + 1);
          return {
            status: 206,
            headers: {
              'content-type': contentType,
              'content-length': String(chunk.byteLength),
              'content-range': `bytes ${start}-${end}/${stat.size}`,
              'accept-ranges': 'bytes',
            },
            buffer: chunk,
          };
        }
      }
      return {
        status: 200,
        headers: {
          'content-type': contentType,
          'content-length': String(stat.size),
          'accept-ranges': 'bytes',
        },
        buffer: fullBuf,
      };
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  const extraHeaders = {};
  if (rangeHeader) {
    extraHeaders['range'] = rangeHeader;
  }
  const signed = signR2Request({
    method: 'GET',
    key,
    headers: extraHeaders,
  });

  const res = await fetch(signed.url, {
    method: 'GET',
    headers: signed.headers,
  });

  if (res.status === 404) return null;
  if (!res.ok && res.status !== 206) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 GET media ${key} failed (${res.status}): ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const headers = {
    'content-type': res.headers.get('content-type') || 'application/octet-stream',
    'accept-ranges': 'bytes',
  };
  const cl = res.headers.get('content-length');
  if (cl) headers['content-length'] = cl;
  const cr = res.headers.get('content-range');
  if (cr) headers['content-range'] = cr;

  return {
    status: res.status,
    headers,
    buffer: Buffer.from(arrayBuffer),
  };
}

export function getPublicMediaUrl(key) {
  const { publicUrl } = getR2Config();
  if (publicUrl && isR2Configured()) {
    return `${publicUrl}/${encodeS3Key(key)}`;
  }
  return `/api/r2-media?key=${encodeURIComponent(key)}`;
}

/**
 * Helper to read JSON body in both Vercel and local Vite middleware
 */
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8'));
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}
