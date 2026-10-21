/**
 * Google Apps Script – Backend for Torah Reading App
 *
 * הוראות התקנה (דקה אחת):
 * 1. היכנס לכתובת: https://script.google.com ולחץ על "פרויקט חדש" (New Project)
 *    (לחלופין, מתוך גיליון "מעקב תלמידים" לחץ על תוספים -> Apps Script).
 * 2. מחק את הקוד הקיים והדבק את כל הקוד שבקובץ זה.
 * 3. לחץ למעלה על "פריסה" (Deploy) -> "פריסה חדשה" (New deployment).
 * 4. בחר סוג: "אפליקציית אינטרנט" (Web app).
 * 5. הגדר:
 *    - הפעלה בתור (Execute as): "אני" (Me)
 *    - למי יש גישה (Who has access): "כולם" (Anyone)
 * 6. לחץ על "פריסה" (Deploy), אשר הרשאות, והעתק את כתובת ה-URL של אפליקציית האינטרנט (מסתיים ב-/exec).
 */

const ROOT_FOLDER_ID = '0B6cVWsWs-t94Y2xzWnJaWlF0ZXc';
const DATA_FILENAME = 'torah-app-data.json';

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getOrCreateDataFile(folder) {
  const files = folder.getFilesByName(DATA_FILENAME);
  if (files.hasNext()) {
    return files.next();
  }
  return null;
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || 'getData';

    // Optional: list files inside a specific Parasha folder directly via DriveApp
    if (action === 'listFolder' && params.folderId) {
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

    // Default: read torah-app-data.json from the root folder
    const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const file = getOrCreateDataFile(folder);
    if (!file) {
      return jsonResponse({ ok: true, initialized: false, data: null });
    }

    const content = file.getBlob().getDataAsString('UTF-8');
    const parsed = JSON.parse(content);
    return jsonResponse({
      ok: true,
      initialized: true,
      data: parsed,
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

    // 1. Save students & haftarot catalog to torah-app-data.json in Drive
    if (action === 'saveData') {
      const payloadStr = JSON.stringify(body.data, null, 2);
      const existing = getOrCreateDataFile(rootFolder);
      let file;
      if (existing) {
        existing.setContent(payloadStr);
        file = existing;
      } else {
        file = rootFolder.createFile(DATA_FILENAME, payloadStr, MimeType.PLAIN_TEXT);
      }
      return jsonResponse({
        ok: true,
        fileId: file.getId(),
        updatedAt: new Date().toISOString(),
      });
    }

    // 2. Upload a new audio recording directly into Drive folder
    if (action === 'uploadAudio') {
      const folderId = body.folderId || ROOT_FOLDER_ID;
      const targetFolder = DriveApp.getFolderById(folderId);
      const fileName = body.fileName || 'recording.m4a';
      const mimeType = body.mimeType || 'audio/mp4';
      const base64Data = body.base64Data; // raw base64 without data:... prefix

      const decoded = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decoded, mimeType, fileName);
      const createdFile = targetFolder.createFile(blob);

      try {
        createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (_) {
        // Folder already inherits link sharing
      }

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
}

