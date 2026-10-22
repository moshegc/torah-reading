import { r2GetJson, r2PutJson, r2DeleteObject, readJsonBody } from './_r2.js';
import { sanitizeTeacherId, verifyTeacherToken } from './r2-auth.js';
import { sameRecording as sameItem, copyFileCategory, syncStudentFileCategories } from './_recordings.js';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const extensions = ['aac', 'm4a', 'mp3', 'pdf', 'png', 'jpg', 'jpeg', 'webp'];
const categories = ['shabbat', 'chol', 'haftarah', 'blessings', 'doc'];

class LibraryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function assertOwnedKey(key, teacherId) {
  if (typeof key !== 'string' || !key.startsWith(`media/${teacherId}/`) ||
      /[\\\0]/.test(key) || key.split('/').some((part) => part === '..' || part === '.')) {
    throw new LibraryError('לא ניתן לשנות קובץ שאינו שייך למאגר שלך', 403);
  }
}

function folderName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || ['__proto__', 'prototype', 'constructor'].includes(name)) {
    throw new LibraryError('יש להזין שם תיקייה תקין');
  }
  return name;
}

function recordings(data) {
  return [
    ...Object.values(data.parashaLibrary || {}).flat(),
    ...(data.students || []).flatMap((student) => student.portions || []),
  ];
}

function validateItem(item, teacherId) {
  if (!item || typeof item.id !== 'string' || !item.id.trim() ||
      typeof item.title !== 'string' || !item.title.trim() ||
      typeof item.aliyah !== 'string' || typeof item.viewUrl !== 'string' ||
      !extensions.includes(item.ext) || !categories.includes(item.category) ||
      (item.section !== undefined && !['torah', 'haftarah', 'general'].includes(item.section))) {
    throw new LibraryError('פרטי חומר הלימוד אינם תקינים');
  }
  assertOwnedKey(item.r2Key, teacherId);
}

export function applyLibraryChange(data, change, teacherId) {
  const library = { ...data.parashaLibrary };
  let students = data.students || [];
  let removed = [];
  if (change.action === 'retry-deletions') return data;
  const folder = folderName(change.folder);

  if (change.action === 'add-student-items') {
    if (!students.some((student) => student.id === change.studentId)) {
      throw new LibraryError('התלמיד אינו קיים', 404);
    }
    if (!Array.isArray(change.items) || change.items.length === 0) {
      throw new LibraryError('יש לבחור חומרי לימוד להוספה');
    }
    for (const item of change.items) {
      validateItem(item, teacherId);
      if (recordings(data).some((existing) => existing.id === item.id && existing.r2Key !== item.r2Key)) {
        throw new LibraryError('יש להשתמש בהחלפת קובץ כדי לעדכן חומר לימוד קיים', 409);
      }
    }
    const merge = (items) => [
      ...items,
      ...change.items.filter((item, index, all) =>
        !items.some((existing) => existing.id === item.id) &&
        all.findIndex((other) => other.id === item.id) === index),
    ];
    library[folder] = merge(library[folder] || []);
    students = students.map((student) => student.id === change.studentId
      ? {
          ...student, portions: merge(student.portions || []),
          ...(typeof change.driveFolderUrl === 'string' ? { driveFolderUrl: change.driveFolderUrl } : {}),
        }
      : student);
  } else if (change.action === 'create-folder') {
    if (hasOwn(library, folder)) throw new LibraryError('תיקייה בשם זה כבר קיימת', 409);
    library[folder] = [];
  } else {
    if (!hasOwn(library, folder)) throw new LibraryError('התיקייה אינה קיימת', 404);
    const items = library[folder];
    if (change.action === 'rename-folder') {
      const name = folderName(change.name);
      if (name !== folder && hasOwn(library, name)) throw new LibraryError('תיקייה בשם זה כבר קיימת', 409);
      if (name !== folder) {
        library[name] = items;
        delete library[folder];
      }
    } else if (change.action === 'move-item' || change.action === 'rename-item') {
      const target = items.find((item) => item.id === change.itemId);
      if (!target) throw new LibraryError('חומר הלימוד אינו קיים בתיקייה', 404);
      if (change.action === 'move-item') {
        const destination = folderName(change.destination);
        if (!hasOwn(library, destination)) throw new LibraryError('התיקייה אינה קיימת', 404);
        if (destination !== folder) {
          if (library[destination].some((item) => sameItem(item, target))) {
            throw new LibraryError('חומר הלימוד כבר קיים בתיקיית היעד', 409);
          }
          library[destination] = [...library[destination], target];
          library[folder] = items.filter((item) => item.id !== target.id);
        }
      } else {
        const name = typeof change.name === 'string' ? change.name.trim() : '';
        if (!name) throw new LibraryError('יש להזין שם לחומר הלימוד');
        const rename = (item) => sameItem(item, target) ? { ...item, aliyah: name } : item;
        for (const name of Object.keys(library)) library[name] = library[name].map(rename);
        students = students.map((student) => ({
          ...student, portions: (student.portions || []).map(rename),
        }));
      }
    } else if (change.action === 'set-item-section') {
      const target = items.find((item) => item.id === change.itemId);
      if (!target) throw new LibraryError('חומר הלימוד אינו קיים בתיקייה', 404);
      if (!['torah', 'haftarah', 'general'].includes(change.section)) {
        throw new LibraryError('יש לבחור סוג חומר לימוד תקין');
      }
      const category = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(target.ext) ? 'doc'
        : change.section === 'general' ? 'blessings' : change.section === 'haftarah' ? 'haftarah'
        : target.category === 'chol' ? 'chol' : 'shabbat';
      const source = { ...target, section: change.section, category };
      const update = (item) => sameItem(item, target) ? copyFileCategory(item, source) : item;
      for (const name of Object.keys(library)) library[name] = library[name].map(update);
      students = students.map((student) => ({
        ...student, portions: (student.portions || []).map(update),
      }));
    } else if (change.action === 'add-item') {
      validateItem(change.item, teacherId);
      const existing = items.find((item) => item.id === change.item.id);
      if (existing && existing.r2Key !== change.item.r2Key) {
        throw new LibraryError('יש להשתמש בהחלפת קובץ כדי לעדכן חומר לימוד קיים', 409);
      }
      library[folder] = [...items.filter((item) => item.id !== change.item.id), change.item];
    } else if (change.action === 'delete-folder') {
      removed = items;
      delete library[folder];
    } else if (change.action === 'delete-item' || change.action === 'replace-item') {
      const target = items.find((item) => item.id === change.itemId);
      if (!target) throw new LibraryError('חומר הלימוד אינו קיים בתיקייה', 404);
      removed = [target];
      if (change.action === 'replace-item') {
        removed = recordings(data).filter((item) => sameItem(item, target));
        validateItem(change.item, teacherId);
        const replace = (item) => sameItem(item, target)
          ? { ...change.item, id: item.id, visible: item.visible } : item;
        for (const name of Object.keys(library)) library[name] = library[name].map(replace);
        students = students.map((student) => ({
          ...student,
          portions: (student.portions || []).map(replace),
        }));
      } else {
        library[folder] = items.filter((item) => item.id !== change.itemId);
      }
    } else {
      throw new LibraryError('פעולה לא נתמכת');
    }
  }

  if (change.action === 'delete-folder' || change.action === 'delete-item') {
    const retained = Object.values(library).flat();
    const unreferenced = removed.filter((item) => !retained.some((other) => sameItem(item, other)));
    removed = [
      ...removed,
      ...students.flatMap((student) => student.portions || [])
        .filter((item) => unreferenced.some((other) => sameItem(item, other))),
    ];
    students = students.map((student) => ({
      ...student,
      portions: (student.portions || []).filter((item) => !unreferenced.some((other) => sameItem(item, other))),
    }));
  }

  const next = syncStudentFileCategories({ ...data, students, parashaLibrary: library, updatedAt: new Date().toISOString() });
  const retainedKeys = new Set(recordings(next).map((item) => item.r2Key).filter(Boolean));
  next.pendingMediaDeletes = [...new Set(removed.map((item) => item.r2Key).filter((key) => key && !retainedKeys.has(key)))];
  for (const key of next.pendingMediaDeletes) assertOwnedKey(key, teacherId);
  return next;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  let currentData;
  try {
    const token = req.headers?.authorization?.replace(/^Bearer /, '') || '';
    const verified = verifyTeacherToken(token);
    if (!verified?.teacherId) return res.status(401).json({ ok: false, error: 'יש להתחבר מחדש לחשבון המורה' });
    const teacherId = sanitizeTeacherId(verified.teacherId);
    if (!teacherId) return res.status(401).json({ ok: false, error: 'יש להתחבר מחדש לחשבון המורה' });
    const change = await readJsonBody(req);
    if (!change || typeof change !== 'object' || typeof change.action !== 'string') {
      throw new LibraryError('פעולה לא תקינה');
    }
    const dataKey = `teachers/${teacherId}/data.json`;
    const data = await r2GetJson(dataKey);
    currentData = data;
    if (!data) return res.status(404).json({ ok: false, error: 'נתוני המורה לא נמצאו' });
    if (data.pendingMediaDeletes?.length && change.action !== 'retry-deletions') {
      return res.status(409).json({ ok: false, error: 'יש להשלים את מחיקת הקבצים הקודמת לפני שינוי נוסף', data });
    }
    const next = applyLibraryChange(data, change, teacherId);
    if (change.action !== 'retry-deletions') await r2PutJson(dataKey, next);

    if (next.pendingMediaDeletes?.length) {
      try {
        const retainedKeys = new Set(recordings(next).map((item) => item.r2Key).filter(Boolean));
        for (const key of next.pendingMediaDeletes) {
          assertOwnedKey(key, teacherId);
          if (!retainedKeys.has(key)) await r2DeleteObject(key);
        }
        const completed = { ...next, pendingMediaDeletes: [], updatedAt: new Date().toISOString() };
        await r2PutJson(dataKey, completed);
        return res.status(200).json({ ok: true, data: completed });
      } catch (error) {
        console.error('Library file cleanup failed:', error);
        return res.status(500).json({
          ok: false,
          error: 'השינויים נשמרו, אך מחיקת הקבצים לא הושלמה. לחץ על "נסה שוב למחוק".',
          data: next,
        });
      }
    }
    return res.status(200).json({ ok: true, data: next });
  } catch (error) {
    if (error instanceof LibraryError) return res.status(error.status).json({
      ok: false, error: error.message, ...(currentData ? { data: currentData } : {}),
    });
    console.error('Library change failed:', error);
    return res.status(500).json({ ok: false, error: 'השינוי לא נשמר. נסה שוב.' });
  }
}
