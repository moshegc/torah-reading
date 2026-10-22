import React, { useEffect, useRef, useState } from 'react';
import { CloudUpload, FileText, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { LibraryChange, RecordingItem } from '../types';
import { PARASHA_OPTIONS } from '../data/parashaOptions';
import { uploadLocalFileToR2 } from '../utils/cloudSync';
import { classifyFileTitle, getMediaStreamUrl } from '../utils/trackerCalculations';

interface TeacherLibraryManagerProps {
  teacherId: string;
  teacherToken: string;
  library: Record<string, RecordingItem[]>;
  pendingDeletionCount: number;
  operationError: string | null;
  onChange: (change: LibraryChange) => Promise<boolean>;
  onClose: () => void;
}

const MIME_BY_EXT: Record<RecordingItem['ext'], string> = {
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function isRecordingExtension(ext: string | undefined): ext is RecordingItem['ext'] {
  return ext !== undefined && Object.prototype.hasOwnProperty.call(MIME_BY_EXT, ext);
}

function fileExtension(file: File): RecordingItem['ext'] | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return isRecordingExtension(ext) ? ext : null;
}

function readFileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('לא ניתן לקרוא את הקובץ'));
    };
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
    reader.onabort = () => reject(new Error('קריאת הקובץ בוטלה'));
    reader.readAsDataURL(file);
  });
}

export const TeacherLibraryManager: React.FC<TeacherLibraryManagerProps> = ({
  teacherId,
  teacherToken,
  library,
  pendingDeletionCount,
  operationError,
  onChange,
  onClose,
}) => {
  const [folder, setFolder] = useState(() => Object.keys(library)[0] ?? '');
  const [newFolder, setNewFolder] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedChange, setFailedChange] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadedItem, setUploadedItem] = useState<RecordingItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderOptions = Object.keys(library);
  const items = library[folder] ?? [];
  const replacement = items.find((item) => item.id === replacementId);
  const disabled = busy || pendingDeletionCount > 0;

  useEffect(() => {
    if (!Object.prototype.hasOwnProperty.call(library, folder)) {
      setFolder(Object.keys(library)[0] ?? '');
      setReplacementId(null);
    }
  }, [library, folder]);

  const resetUpload = () => {
    setFile(null);
    setTitle('');
    setUploadedItem(null);
    setReplacementId(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const runAction = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setFailedChange(false);
    setNotice(null);
    try {
      await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השינוי במאגר לא נשמר');
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (change: LibraryChange, message: string): Promise<boolean> => {
    if (!await onChange(change)) {
      setFailedChange(true);
      return false;
    }
    setNotice(message);
    return true;
  };

  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newFolder.trim();
    if (!name || folderOptions.includes(name)) {
      setError(name ? 'תיקייה בשם זה כבר קיימת' : 'יש להזין שם תיקייה');
      setFailedChange(false);
      return;
    }
    await runAction(async () => {
      if (await mutate({ action: 'create-folder', folder: name }, 'התיקייה נשמרה בהצלחה!')) {
        resetUpload();
        setFolder(name);
        setNewFolder('');
      }
    });
  };

  const deleteFolder = async () => {
    if (!window.confirm(`למחוק לצמיתות את התיקייה "${folder}" ואת ${items.length} הפריטים שבה? הקבצים והשיוכים לתלמידים יימחקו ולא ניתן לשחזרם. קבצים המשמשים גם תיקיות אחרות יישמרו.`)) return;
    await runAction(async () => {
      if (await mutate({ action: 'delete-folder', folder }, 'התיקייה והקבצים שאינם משותפים נמחקו.')) resetUpload();
    });
  };

  const deleteItem = async (item: RecordingItem) => {
    if (!window.confirm(`למחוק לצמיתות את "${item.title}"? הקובץ והשיוכים לתלמידים יימחקו ולא ניתן לשחזרם. אם הפריט קיים גם בתיקייה אחרת, הוא יוסר מתיקייה זו בלבד.`)) return;
    await runAction(async () => {
      if (await mutate({ action: 'delete-item', folder, itemId: item.id }, 'חומר הלימוד נמחק מהתיקייה.')) {
        if (replacementId === item.id) resetUpload();
      }
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !title.trim() || !folderOptions.includes(folder)) {
      setError('יש לבחור תיקייה וקובץ ולהזין שם לחומר הלימוד');
      setFailedChange(false);
      return;
    }
    const ext = fileExtension(file);
    if (!ext || file.size === 0) {
      setError('יש לבחור קובץ לא ריק מסוג AAC, M4A, MP3, PDF, PNG, JPG, JPEG או WEBP');
      setFailedChange(false);
      return;
    }
    const target = replacement ?? items.find((item) => item.title.trim() === title.trim());
    if (target && !window.confirm(`להחליף את "${target.title}" בקובץ החדש? הקובץ הישן יימחק לצמיתות, וכל שיוכי התלמידים יעודכנו תוך שמירת הגדרות הנראות שלהם.`)) return;

    await runAction(async () => {
      let item = uploadedItem;
      if (!item) {
        const uploaded = await uploadLocalFileToR2({
          teacherId,
          token: teacherToken,
          studentId: 'library',
          fileName: file.name,
          mimeType: file.type || MIME_BY_EXT[ext],
          ext,
          base64Data: await readFileData(file),
        });
        item = {
          id: uploaded.id,
          title: file.name,
          aliyah: title.trim(),
          category: classifyFileTitle(file.name).category,
          ext,
          r2Key: uploaded.r2Key,
          r2Url: uploaded.r2Url,
          viewUrl: uploaded.viewUrl,
          visible: true,
        };
        setUploadedItem(item);
      }
      const isDocument = !MIME_BY_EXT[ext].startsWith('audio/');
      const savedItem: RecordingItem = {
        ...item,
        title: title.trim(),
        aliyah: title.trim(),
        category: isDocument ? 'doc'
          : target && target.category !== 'doc' ? target.category
          : folder === 'כללי' ? 'blessings' : classifyFileTitle(title).category,
      };
      const change: LibraryChange = target
        ? { action: 'replace-item', folder, itemId: target.id, item: savedItem }
        : { action: 'add-item', folder, item: savedItem };
      if (await mutate(change, target ? 'חומר הלימוד הוחלף בהצלחה!' : 'חומר הלימוד נשמר בהצלחה!')) resetUpload();
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
      <div role="dialog" aria-modal="true" aria-labelledby="library-title" className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 id="library-title" className="font-extrabold text-lg">מאגר חומרי לימוד</h3>
          <button type="button" aria-label="סגור" onClick={onClose} disabled={busy} className="p-1.5 rounded-full bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-slate-600">
            נהל תיקיות, הקלטות, מסמכים ותמונות במאגר שלך. חומרי כללי ותמונות זמינים לתלמידים; חומרי פרשה ניתנים לשיוך בניהול ההקלטות.
          </p>
          {pendingDeletionCount > 0 && (
            <div role="alert" className="p-3 rounded-xl bg-amber-50 text-amber-900 text-sm space-y-2">
              <p>מחיקת {pendingDeletionCount} קבצים טרם הושלמה. יש להשלים אותה לפני שינוי נוסף במאגר.</p>
              <button type="button" disabled={busy} onClick={() => runAction(async () => {
                if (await mutate({ action: 'retry-deletions' }, 'מחיקת הקבצים הושלמה.')) resetUpload();
              })} className="font-bold underline">נסה שוב למחוק</button>
            </div>
          )}
          <form onSubmit={createFolder} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="library-new-folder" className="block text-xs font-bold text-slate-700 mb-1">תיקייה חדשה</label>
              <input id="library-new-folder" list="library-folder-suggestions" required value={newFolder} onChange={(event) => setNewFolder(event.target.value)} disabled={disabled} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
              <datalist id="library-folder-suggestions">
                {['כללי', 'תמונות', ...PARASHA_OPTIONS.map((option) => option.name)].filter((name) => !folderOptions.includes(name)).map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            <button type="submit" disabled={disabled} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold flex items-center gap-1"><Plus className="w-4 h-4" />צור תיקייה</button>
          </form>
          {folderOptions.length > 0 ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="library-folder" className="block text-xs font-bold text-slate-700 mb-1">תיקייה במאגר</label>
                <select id="library-folder" value={folder} onChange={(event) => { setFolder(event.target.value); resetUpload(); setNotice(null); }} disabled={disabled} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm">
                  {folderOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <button type="button" onClick={deleteFolder} disabled={disabled || !folder} className="px-3 py-2 rounded-xl text-rose-700 bg-rose-50 text-sm font-bold">מחק תיקייה</button>
            </div>
          ) : <p className="text-sm text-slate-500">אין תיקיות במאגר. צור תיקייה כדי להוסיף חומרי לימוד.</p>}

          {items.length > 0 && (
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
              {items.map((item) => (
                <li key={item.id} className="p-3 flex items-center justify-between gap-2">
                  <a href={getMediaStreamUrl(item)} target="_blank" rel="noreferrer" className="min-w-0 flex items-center gap-2 text-sm text-slate-800">
                    <FileText className="w-4 h-4 shrink-0" /><span className="truncate">{item.title}</span><span className="text-xs text-slate-400 uppercase">{item.ext}</span>
                  </a>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" aria-label={`החלף ${item.title}`} disabled={disabled} onClick={() => { resetUpload(); setReplacementId(item.id); setTitle(item.title); setNotice(null); fileInput.current?.focus(); }} className="text-indigo-700 p-1 text-xs font-bold flex items-center gap-1"><RefreshCw className="w-4 h-4" /><span>החלף</span></button>
                    <button type="button" aria-label={`מחק ${item.title}`} disabled={disabled} onClick={() => deleteItem(item)} className="text-rose-700 p-1 text-xs font-bold flex items-center gap-1"><Trash2 className="w-4 h-4" /><span>מחק</span></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {folder && (
            <form onSubmit={submit} className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-slate-800 text-sm">{replacement ? `החלפת קובץ: ${replacement.title}` : 'הוספת חומר לימוד'}</h4>
                {replacement && <button type="button" disabled={disabled} onClick={resetUpload} className="text-xs text-slate-500 underline">בטל החלפה</button>}
              </div>
              <div>
                <label htmlFor="library-upload-file" className="block text-xs font-bold text-slate-700 mb-1">קובץ הקלטה, מסמך או תמונה</label>
                <input ref={fileInput} id="library-upload-file" type="file" required accept=".aac,.m4a,.mp3,.pdf,.png,.jpg,.jpeg,.webp" disabled={disabled} onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setNotice(null);
                  setFailedChange(false);
                  setUploadedItem(null);
                  if (selected && (!fileExtension(selected) || selected.size === 0)) {
                    setFile(null);
                    setError('יש לבחור קובץ לא ריק מסוג AAC, M4A, MP3, PDF, PNG, JPG, JPEG או WEBP');
                    return;
                  }
                  setError(null);
                  setFile(selected);
                  setTitle(replacement?.title ?? selected?.name.replace(/\.[^.]+$/, '') ?? '');
                }} className="w-full text-sm" />
              </div>
              <div>
                <label htmlFor="library-upload-name" className="block text-xs font-bold text-slate-700 mb-1">שם חומר הלימוד</label>
                <input id="library-upload-name" type="text" required value={title} onChange={(event) => setTitle(event.target.value)} disabled={disabled} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={disabled || !file} className="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                {busy ? 'שומר...' : replacement ? 'החלף ושמור' : 'העלה ושמור'}
              </button>
            </form>
          )}
          {(error || failedChange) && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-sm">{error ?? operationError ?? 'השינוי לא הושלם. נסה שוב.'}</p>}
          {notice && <p role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">{notice}</p>}
        </div>
      </div>
    </div>
  );
};
