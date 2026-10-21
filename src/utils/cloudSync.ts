import { StudentProfile, DEFAULT_GAS_WEBAPP_URL } from '../data/driveCatalog';

export const STORAGE_KEY_GAS_URL = 'torah_trainer_gas_webapp_url';

export interface CloudAppData {
  students: StudentProfile[];
  haftarotMap: Record<string, number>;
  updatedAt: string;
}

export function getEffectiveGasUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery = urlParams.get('gas');
  if (fromQuery && fromQuery.startsWith('https://script.google.com/')) {
    return fromQuery.trim();
  }
  const fromStorage = localStorage.getItem(STORAGE_KEY_GAS_URL);
  if (fromStorage && fromStorage.trim()) {
    return fromStorage.trim();
  }
  return DEFAULT_GAS_WEBAPP_URL.trim();
}

/**
 * Reads torah-app-data.json from the teacher's Google Drive folder via the Google Apps Script Web App
 */
export async function fetchCloudAppData(gasUrl: string): Promise<{
  initialized: boolean;
  data: CloudAppData | null;
}> {
  const cleanUrl = gasUrl.trim();
  if (!cleanUrl) {
    throw new Error('Missing Google Apps Script Web App URL');
  }
  const sep = cleanUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${cleanUrl}${sep}action=getData&t=${Date.now()}`, {
    method: 'GET',
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Apps Script returned error');
  }
  return {
    initialized: Boolean(json.initialized),
    data: json.data || null,
  };
}

/**
 * Writes torah-app-data.json into the teacher's Google Drive folder via the Google Apps Script Web App.
 * Uses text/plain;charset=utf-8 so the browser sends a simple POST request without CORS OPTIONS preflight.
 */
export async function saveCloudAppData(
  gasUrl: string,
  payload: { students: StudentProfile[]; haftarotMap: Record<string, number> }
): Promise<{ updatedAt: string; fileId?: string }> {
  const cleanUrl = gasUrl.trim();
  if (!cleanUrl) {
    throw new Error('Missing Google Apps Script Web App URL');
  }
  const bodyObj = {
    action: 'saveData',
    data: {
      students: payload.students,
      haftarotMap: payload.haftarotMap,
      updatedAt: new Date().toISOString(),
    },
  };

  const res = await fetch(cleanUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Failed to save to Drive');
  }
  return {
    updatedAt: json.updatedAt || new Date().toISOString(),
    fileId: json.fileId,
  };
}

/**
 * Uploads a local audio recording file directly into the teacher's Google Drive folder via the Apps Script
 */
export async function uploadAudioToDrive(
  gasUrl: string,
  params: {
    folderId?: string;
    fileName: string;
    mimeType: string;
    base64Data: string;
  }
): Promise<{ id: string; name: string; viewUrl: string }> {
  const cleanUrl = gasUrl.trim();
  if (!cleanUrl) {
    throw new Error('Missing Google Apps Script Web App URL');
  }
  const res = await fetch(cleanUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'uploadAudio',
      ...params,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Audio upload to Drive failed');
  }
  return {
    id: json.id,
    name: json.name,
    viewUrl: json.viewUrl,
  };
}

export const GOOGLE_APPS_SCRIPT_CODE = `const ROOT_FOLDER_ID = '0B6cVWsWs-t94Y2xzWnJaWlF0ZXc';
const DATA_FILENAME = 'torah-app-data.json';

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getOrCreateDataFile(folder) {
  const files = folder.getFilesByName(DATA_FILENAME);
  return files.hasNext() ? files.next() : null;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.action === 'listFolder' && params.folderId) {
      const targetFolder = DriveApp.getFolderById(params.folderId);
      const filesIter = targetFolder.getFiles();
      const items = [];
      while (filesIter.hasNext()) {
        const f = filesIter.next();
        items.push({
          id: f.getId(),
          name: f.getName(),
          mimeType: f.getMimeType(),
          size: f.getSize(),
          viewUrl: f.getUrl(),
        });
      }
      return jsonResponse({ ok: true, items: items });
    }

    const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const file = getOrCreateDataFile(folder);
    if (!file) {
      return jsonResponse({ ok: true, initialized: false, data: null });
    }
    const content = file.getBlob().getDataAsString('UTF-8');
    return jsonResponse({
      ok: true,
      initialized: true,
      data: JSON.parse(content),
      fileId: file.getId(),
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'saveData';
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);

    if (action === 'saveData') {
      const payloadStr = JSON.stringify(body.data, null, 2);
      const existing = getOrCreateDataFile(rootFolder);
      const file = existing
        ? existing.setContent(payloadStr)
        : rootFolder.createFile(DATA_FILENAME, payloadStr, MimeType.PLAIN_TEXT);
      return jsonResponse({
        ok: true,
        fileId: file.getId(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (action === 'uploadAudio') {
      const folderId = body.folderId || ROOT_FOLDER_ID;
      const targetFolder = DriveApp.getFolderById(folderId);
      const decoded = Utilities.base64Decode(body.base64Data);
      const blob = Utilities.newBlob(decoded, body.mimeType || 'audio/mp4', body.fileName || 'recording.m4a');
      const createdFile = targetFolder.createFile(blob);
      try {
        createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (_) {}
      return jsonResponse({
        ok: true,
        id: createdFile.getId(),
        name: createdFile.getName(),
        viewUrl: createdFile.getUrl(),
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}`;

