import React, { useRef, useState } from 'react';
import { CloudUpload, Loader2, X } from 'lucide-react';
import type { RecordingItem } from '../types';
import { PARASHA_OPTIONS } from '../data/parashaOptions';
import { uploadLocalFileToR2 } from '../utils/cloudSync';
import { classifyFileTitle } from '../utils/trackerCalculations';

interface TeacherLibraryUploadProps {
  teacherId: string;
  teacherToken: string;
  folders: string[];
  onSave: (folder: string, item: RecordingItem) => Promise<boolean>;
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

export const TeacherLibraryUpload: React.FC<TeacherLibraryUploadProps> = ({
  teacherId,
  teacherToken,
  folders,
  onSave,
  onClose,
}) => {
  const [folder, setFolder] = useState('כללי');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadedItem, setUploadedItem] = useState<RecordingItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderOptions = [...new Set(['כללי', 'תמונות', ...PARASHA_OPTIONS.map((option) => option.name), ...folders])];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !title.trim()) {
      setError('יש לבחור קובץ ולהזין שם לחומר הלימוד');
      return;
    }
    const ext = fileExtension(file);
    if (!ext || file.size === 0) {
      setError('יש לבחור קובץ לא ריק מסוג AAC, M4A, MP3, PDF, PNG, JPG, JPEG או WEBP');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
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
        category: isDocument ? 'doc' : folder === 'כללי' ? 'blessings' : classifyFileTitle(title).category,
      };
      if (!await onSave(folder, savedItem)) {
        setError('הקובץ הועלה אך שמירתו במאגר נכשלה. נסה שוב כדי לשמור אותו.');
        return;
      }
      setSaved(true);
      setFile(null);
      setTitle('');
      setUploadedItem(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'העלאת הקובץ נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
      <div role="dialog" aria-modal="true" aria-labelledby="library-upload-title" className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 id="library-upload-title" className="font-extrabold text-lg">העלאת חומרי לימוד</h3>
          <button type="button" aria-label="סגור" onClick={onClose} disabled={busy} className="p-1.5 rounded-full bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            הוסף הקלטה, מסמך או תמונה למאגר שלך. חומרי לימוד בתיקיות כללי ותמונות זמינים לתלמידים; חומרי פרשה ניתנים לשיוך לתלמיד בניהול ההקלטות.
          </p>
          <div>
            <label htmlFor="library-upload-folder" className="block text-xs font-bold text-slate-700 mb-1">תיקייה במאגר</label>
            <select id="library-upload-folder" value={folder} onChange={(event) => { setFolder(event.target.value); setSaved(false); }} disabled={busy} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm">
              {folderOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="library-upload-file" className="block text-xs font-bold text-slate-700 mb-1">קובץ הקלטה, מסמך או תמונה</label>
            <input
              ref={fileInput}
              id="library-upload-file"
              type="file"
              required
              accept=".aac,.m4a,.mp3,.pdf,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setSaved(false);
                setUploadedItem(null);
                if (selected && (!fileExtension(selected) || selected.size === 0)) {
                  setFile(null);
                  setTitle('');
                  setError('יש לבחור קובץ לא ריק מסוג AAC, M4A, MP3, PDF, PNG, JPG, JPEG או WEBP');
                  return;
                }
                setError(null);
                setFile(selected);
                setTitle(selected?.name.replace(/\.[^.]+$/, '') ?? '');
              }}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label htmlFor="library-upload-name" className="block text-xs font-bold text-slate-700 mb-1">שם חומר הלימוד</label>
            <input id="library-upload-name" type="text" required value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
          </div>
          {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-sm">{error}</p>}
          {saved && <p role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">חומר הלימוד נשמר בהצלחה!</p>}
          <button type="submit" disabled={busy || !file} className="w-full px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            {busy ? 'שומר...' : 'העלה ושמור'}
          </button>
        </form>
      </div>
    </div>
  );
};
