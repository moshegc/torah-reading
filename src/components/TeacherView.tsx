import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Share2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Play,
  Plus,
  Trash2,
  ExternalLink,
  AlertTriangle,
  BookOpen,
  LayoutGrid,
  Table as TableIcon,
  CalendarRange,
  X,
  FolderPlus,
  Volume2,
  Link as LinkIcon,
  Loader2,
  Calendar,
  ScrollText,
  Cloud,
  CloudUpload,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  StudentProfile,
  RecordingItem,
  PARASHA_META_LIST,
  ROOT_DRIVE_FOLDER_URL,
  STUDENT_TRACKER_SHEET_URL,
} from '../data/driveCatalog';
import {
  calculateStudentStats,
  formatDateIL,
  parseFlexibleDate,
  lookupParashaVerses,
  lookupHaftarahVerses,
  parseDriveUrl,
  classifyFileTitle,
} from '../utils/trackerCalculations';
import {
  uploadAudioToDrive,
  GOOGLE_APPS_SCRIPT_CODE,
} from '../utils/cloudSync';
import type { DriveSyncStatus } from '../App';
import { AudioPlayerBar } from './AudioPlayerBar';
import { barMitzvaFromGregorian, barMitzvaFromHebrew, type BarMitzvaInfo } from '../utils/barMitzvaParsha';

interface TeacherViewProps {
  students: StudentProfile[];
  haftarotMap: Record<string, number>;
  gasUrl: string;
  syncStatus: DriveSyncStatus;
  syncErrorMessage: string | null;
  lastSyncedAt: string | null;
  onSaveGasUrl: (url: string) => Promise<boolean>;
  onForceSync: () => Promise<boolean>;
  onSetHaftarahLength: (name: string, verses: number) => void;
  onDeleteHaftarahLength: (name: string) => void;
  onUpdateStudent: (updated: StudentProfile) => void;
  onAddStudent: (created: StudentProfile) => void;
  onDeleteStudent: (studentId: string) => void;
  onPreviewStudent: (student: StudentProfile) => void;
}

const SPECIAL_HAFTAROT = [
  'מחר חודש',
  'שמות א',
  'שמות ס',
  'שובה',
  'חזון',
  'ראש חודש',
  'שבת חנוכה',
  'פרשת שקלים',
  'פרשת זכור',
  'פרשת פרה',
  'פרשת החודש',
  'שבת הגדול',
];

function startOfWeekSunday(dt: Date): Date {
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(dt: Date, days: number): Date {
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export const TeacherView: React.FC<TeacherViewProps> = ({
  students,
  haftarotMap,
  gasUrl,
  syncStatus,
  syncErrorMessage,
  lastSyncedAt,
  onSaveGasUrl,
  onForceSync,
  onSetHaftarahLength,
  onDeleteHaftarahLength,
  onUpdateStudent,
  onAddStudent,
  onDeleteStudent,
  onPreviewStudent,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'gantt'>('cards');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [managingStudentId, setManagingStudentId] = useState<string | null>(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showHaftarotModal, setShowHaftarotModal] = useState(false);
  const [showDriveSyncModal, setShowDriveSyncModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewRecording, setPreviewRecording] = useState<RecordingItem | null>(null);

  // Google Apps Script Setup Modal State
  const [gasUrlInput, setGasUrlInput] = useState(gasUrl);
  const [copiedGasScript, setCopiedGasScript] = useState(false);
  const [isTestingGas, setIsTestingGas] = useState(false);
  const [gasTestMessage, setGasTestMessage] = useState<string | null>(null);

  // Haftarah Table Modal Form State
  const [newHaftarahEntryName, setNewHaftarahEntryName] = useState('');
  const [newHaftarahEntryVerses, setNewHaftarahEntryVerses] = useState(22);

  // Add Student Form State
  const [newName, setNewName] = useState('');
  const [newParasha, setNewParasha] = useState('בראשית');
  const [newHaftarah, setNewHaftarah] = useState('בראשית');
  const [newBarMitzvahDate, setNewBarMitzvahDate] = useState('2027-01-01');
  const [newParashaVerses, setNewParashaVerses] = useState(146);
  const [newSkippedVerses, setNewSkippedVerses] = useState(0);
  const [newHaftarahVerses, setNewHaftarahVerses] = useState(23);
  const [newFolderUrl, setNewFolderUrl] = useState('');

  // Bar mitzva calculator (inside Add Student modal)
  const [dobMode, setDobMode] = useState<'gregorian' | 'hebrew'>('gregorian');
  const [dobGregorian, setDobGregorian] = useState('');
  const [dobAfterSunset, setDobAfterSunset] = useState(false);
  const [dobHebDay, setDobHebDay] = useState(1);
  const [dobHebMonth, setDobHebMonth] = useState(7);
  const [dobHebYear, setDobHebYear] = useState(5780);
  const [bmCalcResult, setBmCalcResult] = useState<BarMitzvaInfo | null>(null);
  const [bmCalcError, setBmCalcError] = useState<string | null>(null);

  const calculateBarMitzva = () => {
    setBmCalcError(null);
    try {
      let info: BarMitzvaInfo;
      if (dobMode === 'gregorian') {
        const [y, m, d] = dobGregorian.split('-').map(Number);
        if (!y || !m || !d) {
          setBmCalcError('יש להזין תאריך לידה');
          return;
        }
        info = barMitzvaFromGregorian(new Date(y, m - 1, d), dobAfterSunset);
      } else {
        info = barMitzvaFromHebrew({ day: dobHebDay, month: dobHebMonth, year: dobHebYear });
      }
      setBmCalcResult(info);
      const first = info.parshaHe[0];
      if (first) {
        setNewParasha(first);
        setNewHaftarah(first);
        setNewParashaVerses(lookupParashaVerses(first));
        setNewHaftarahVerses(lookupHaftarahVerses(first, haftarotMap));
      }
      const s = info.shabbatDate;
      setNewBarMitzvahDate(
        `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
      );
    } catch {
      setBmCalcResult(null);
      setBmCalcError('תאריך לא תקין');
    }
  };
  // Manage Student Portions Modal State
  const [folderUrlInput, setFolderUrlInput] = useState('');
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [folderLoadMsg, setFolderLoadMsg] = useState<string | null>(null);

  const [singleLinkInput, setSingleLinkInput] = useState('');
  const [singleAliyahLabel, setSingleAliyahLabel] = useState('עליית ראשון');
  const [singleCategory, setSingleCategory] = useState<'shabbat' | 'chol' | 'haftarah' | 'doc'>('shabbat');
  const [singleExt, setSingleExt] = useState<'aac' | 'm4a' | 'mp3' | 'pdf'>('aac');
  const [localDataUrl, setLocalDataUrl] = useState<string | undefined>(undefined);
  const [localFileName, setLocalFileName] = useState('');
  const [localMimeType, setLocalMimeType] = useState('audio/aac');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  const managingStudent = useMemo(
    () => students.find((s) => s.id === managingStudentId) || null,
    [students, managingStudentId]
  );

  // Live preview of computed start date & stats inside the "Add New Student" modal
  const newStudentPreviewStats = useMemo(
    () =>
      calculateStudentStats({
        id: 'preview',
        name: newName,
        parasha: newParasha,
        haftarah: newHaftarah,
        barMitzvahDate: newBarMitzvahDate,
        parashaVerses: Number(newParashaVerses) || 0,
        skippedVerses: Number(newSkippedVerses) || 0,
        learnedParashaVerses: 0,
        haftarahVerses: Number(newHaftarahVerses) || 0,
        learnedHaftarahVerses: 0,
        portions: [],
      }),
    [newName, newParasha, newHaftarah, newBarMitzvahDate, newParashaVerses, newSkippedVerses, newHaftarahVerses]
  );

  const openManageModal = (student: StudentProfile) => {
    setManagingStudentId(student.id);
    setFolderUrlInput(student.driveFolderUrl || '');
    setFolderLoadMsg(null);
    setSingleLinkInput('');
    setLocalDataUrl(undefined);
    setLocalFileName('');
  };

  const buildStudentShareUrl = (student: StudentProfile) => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?student=${encodeURIComponent(student.id)}`;
  };

  const handleCopyStudentLink = (student: StudentProfile) => {
    const url = buildStudentShareUrl(student);
    navigator.clipboard.writeText(url);
    setCopiedId(student.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleWhatsAppShare = (student: StudentProfile) => {
    const url = buildStudentShareUrl(student);
    const text = `שלום ${student.name}! הנה הקישור האישי שלך לתרגול קריאה בתורה והפטרה לבר המצווה (פרשת ${student.parasha}):\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const confirmAndDeleteStudent = (student: StudentProfile) => {
    if (window.confirm(`האם להסיר את התלמיד "${student.name}" מרשימת המעקב?`)) {
      onDeleteStudent(student.id);
    }
  };

  const fetchFilesFromDriveFolder = async (folderUrl: string): Promise<RecordingItem[]> => {
    const parsed = parseDriveUrl(folderUrl);
    if (!parsed || !parsed.isFolder) {
      throw new Error('נא להדביק קישור תקין לתיקיית Google Drive');
    }
    const params = new URLSearchParams({ folderId: parsed.id });
    if (parsed.resourceKey) params.set('resourceKey', parsed.resourceKey);

    const res = await fetch(`/api/drive-sync?${params.toString()}`);
    if (!res.ok) throw new Error('לא ניתן לקרוא את התיקייה מ-Drive (ודא שהיא משותפת לצפייה)');
    const data = await res.json();
    if (!Array.isArray(data.items)) return [];

    return data.items
      .filter((item: any) => item.mimeType !== 'application/vnd.google-apps.folder')
      .map((item: any) => {
        const { aliyah, category, ext } = classifyFileTitle(String(item.name));
        return {
          id: item.id,
          title: String(item.name).trim(),
          aliyah,
          category,
          ext,
          resourceKey: item.resourceKey || null,
          visible: true,
          viewUrl: `https://drive.google.com/file/d/${item.id}/view?usp=drivesdk${
            item.resourceKey ? `&resourcekey=${item.resourceKey}` : ''
          }`,
        };
      });
  };

  const handleLoadFolderIntoStudent = async () => {
    if (!managingStudent || !folderUrlInput.trim()) return;
    setIsLoadingFolder(true);
    setFolderLoadMsg(null);
    try {
      const items = await fetchFilesFromDriveFolder(folderUrlInput);
      if (items.length === 0) {
        setFolderLoadMsg('לא נמצאו קבצים בתיקייה זו.');
      } else {
        const existingIds = new Set((managingStudent.portions || []).map((p) => p.id));
        const merged = [
          ...(managingStudent.portions || []),
          ...items.filter((i) => !existingIds.has(i.id)),
        ];
        onUpdateStudent({
          ...managingStudent,
          driveFolderUrl: folderUrlInput.trim(),
          portions: merged,
        });
        setFolderLoadMsg(`נטענו ${items.length} קבצים מהתיקייה! סמן למטה אילו מהם יהיו גלויים לתלמיד.`);
      }
    } catch (err: any) {
      setFolderLoadMsg(err?.message || 'שגיאה בטעינת התיקייה');
    } finally {
      setIsLoadingFolder(false);
    }
  };

  const handleAddSinglePortion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingStudent) return;

    const parsed = parseDriveUrl(singleLinkInput);
    if (!parsed && !localDataUrl) return;

    const title =
      localFileName || `${managingStudent.parasha} - ${singleAliyahLabel}.${singleExt}`;

    // If teacher selected a local file AND Google Apps Script is connected, upload straight to Google Drive!
    if (!parsed && localDataUrl && gasUrl) {
      setIsUploadingAudio(true);
      try {
        const targetFolderParsed = managingStudent.driveFolderUrl
          ? parseDriveUrl(managingStudent.driveFolderUrl)
          : null;
        const base64Data = localDataUrl.includes(',')
          ? localDataUrl.split(',')[1]
          : localDataUrl;
        const uploaded = await uploadAudioToDrive(gasUrl, {
          fileName: title,
          mimeType: localMimeType,
          base64Data,
          folderId: targetFolderParsed?.isFolder ? targetFolderParsed.id : undefined,
        });
        if (uploaded.id) {
          const drivePortion: RecordingItem = {
            id: uploaded.id,
            title: uploaded.name || title,
            aliyah: singleAliyahLabel.trim() || 'עלייה',
            category: singleCategory,
            ext: singleExt,
            resourceKey: null,
            visible: true,
            viewUrl:
              uploaded.viewUrl ||
              `https://drive.google.com/file/d/${uploaded.id}/view?usp=drivesdk`,
          };
          onUpdateStudent({
            ...managingStudent,
            portions: [...(managingStudent.portions || []), drivePortion],
          });
          setSingleLinkInput('');
          setLocalDataUrl(undefined);
          setLocalFileName('');
          return;
        }
      } finally {
        setIsUploadingAudio(false);
      }
    }

    const id = parsed ? parsed.id : `local-${Date.now()}`;
    const rk = parsed ? parsed.resourceKey : null;

    const newPortion: RecordingItem = {
      id,
      title,
      aliyah: singleAliyahLabel.trim() || 'עלייה',
      category: singleCategory,
      ext: singleExt,
      resourceKey: rk,
      visible: true,
      viewUrl: parsed
        ? `https://drive.google.com/file/d/${id}/view?usp=drivesdk${rk ? `&resourcekey=${rk}` : ''}`
        : '#',
      customAudioDataUrl: localDataUrl,
    };

    onUpdateStudent({
      ...managingStudent,
      portions: [...(managingStudent.portions || []), newPortion],
    });

    setSingleLinkInput('');
    setLocalDataUrl(undefined);
    setLocalFileName('');
  };

  const handleLocalFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalFileName(file.name);
    setLocalMimeType(file.type || 'audio/aac');
    const { aliyah, category, ext } = classifyFileTitle(file.name);
    setSingleAliyahLabel(aliyah);
    if (category === 'shabbat' || category === 'chol' || category === 'haftarah' || category === 'doc') {
      setSingleCategory(category);
    }
    if (['aac', 'm4a', 'mp3', 'pdf'].includes(ext)) {
      setSingleExt(ext as any);
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLocalDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const togglePortionVisibility = (student: StudentProfile, portionId: string) => {
    const updatedPortions = (student.portions || []).map((p) =>
      p.id === portionId ? { ...p, visible: p.visible === false ? true : false } : p
    );
    onUpdateStudent({ ...student, portions: updatedPortions });
  };

  const removePortionFromStudent = (student: StudentProfile, portionId: string) => {
    onUpdateStudent({
      ...student,
      portions: (student.portions || []).filter((p) => p.id !== portionId),
    });
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const slug =
      newName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u0590-\u05fe]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Math.floor(100 + Math.random() * 900);

    let initialPortions: RecordingItem[] = [];
    if (newFolderUrl.trim()) {
      try {
        initialPortions = await fetchFilesFromDriveFolder(newFolderUrl);
      } catch {
        // Can also load later in manage modal
      }
    }

    const created: StudentProfile = {
      id: slug,
      name: newName.trim(),
      parasha: newParasha,
      haftarah: newHaftarah || newParasha,
      barMitzvahDate: newBarMitzvahDate,
      parashaVerses: Number(newParashaVerses) || 0,
      skippedVerses: Number(newSkippedVerses) || 0,
      learnedParashaVerses: 0,
      haftarahVerses: Number(newHaftarahVerses) || 0,
      learnedHaftarahVerses: 0,
      driveFolderUrl: newFolderUrl.trim() || undefined,
      portions: initialPortions,
    };

    if ((newHaftarah || newParasha).trim()) {
      onSetHaftarahLength((newHaftarah || newParasha).trim(), Number(newHaftarahVerses) || 0);
    }

    onAddStudent(created);
    setNewName('');
    setNewFolderUrl('');
    setShowAddStudentModal(false);
    openManageModal(created);
  };

  // Compute Weekly Gantt Data
  const ganttData = useMemo(() => {
    const today = startOfWeekSunday(new Date());

    const enriched = students
      .map((student) => {
        const stats = calculateStudentStats(student);
        const bmDate = parseFlexibleDate(student.barMitzvahDate) || today;
        // Parse DD/MM/YYYY from stats.estimatedStartDate
        const parts = stats.estimatedStartDate.split('/');
        const startDate =
          parts.length === 3
            ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
            : addDays(bmDate, -stats.totalStudyWeeks * 7);

        return {
          student,
          stats,
          startWeek: startOfWeekSunday(startDate),
          endWeek: startOfWeekSunday(bmDate),
        };
      })
      .sort((a, b) => a.endWeek.getTime() - b.endWeek.getTime());

    let minDate = addDays(today, -4 * 7);
    let maxDate = addDays(today, 26 * 7);

    for (const item of enriched) {
      if (item.startWeek < minDate) {
        minDate = item.startWeek;
      }
      if (item.endWeek > maxDate) {
        maxDate = item.endWeek;
      }
    }

    const earliestCap = addDays(today, -16 * 7);
    if (minDate < earliestCap) {
      minDate = earliestCap;
    }

    const weeks: Date[] = [];
    let cur = new Date(minDate);
    while (cur <= maxDate && weeks.length < 80) {
      weeks.push(new Date(cur));
      cur = addDays(cur, 7);
    }

    return { today, weeks, rows: enriched };
  }, [students]);

  return (
    <div className="min-h-screen bg-slate-100 pb-36" dir="rtl">
      {/* Top Teacher Header */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center font-bold shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold">
                ניהול תלמידים – קריאה בתורה
              </h1>
              <p className="text-xs text-slate-400">
                מעקב פסוקים, תאריכי התחלה, תרשים גאנט שבועי וניהול הקלטות לכל תלמיד
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Google Drive Cloud Save Button / Status */}
            <button
              type="button"
              onClick={() => {
                setGasUrlInput(gasUrl);
                setGasTestMessage(null);
                setShowDriveSyncModal(true);
              }}
              className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-1.5 transition ${
                syncStatus === 'saved'
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                  : syncStatus === 'saving'
                  ? 'bg-indigo-950 border-indigo-700 text-indigo-300'
                  : syncStatus === 'error'
                  ? 'bg-rose-950 border-rose-700 text-rose-300 hover:bg-rose-900'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
              }`}
              title="הגדרת שמירה אוטומטית ב-Google Drive (באמצעות Google Apps Script)"
            >
              {syncStatus === 'saving' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>שומר ב-Drive...</span>
                </>
              ) : syncStatus === 'saved' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>נשמר ב-Drive</span>
                </>
              ) : syncStatus === 'error' ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>שגיאת סנכרון Drive</span>
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4 text-amber-300" />
                  <span>חבר שמירה ל-Drive</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowHaftarotModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition"
            >
              <ScrollText className="w-4 h-4 text-indigo-400" />
              <span>אורכי הפטרות ({Object.keys(haftarotMap).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddStudentModal(true)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>תלמיד חדש</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="bg-white border border-slate-200 p-1 rounded-xl flex flex-wrap items-center gap-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
              viewMode === 'cards'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>כרטיסים</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('gantt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
              viewMode === 'gantt'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>גאנט שבועי</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
              viewMode === 'table'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>טבלת מעקב מלאה</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <a
            href={ROOT_DRIVE_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 font-semibold flex items-center gap-1"
          >
            <span>תיקיית Drive ראשית</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
          <a
            href={STUDENT_TRACKER_SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 font-semibold flex items-center gap-1"
          >
            <span>גיליון מעקב ב-Sheets</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-3">
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map((student) => {
              const stats = calculateStudentStats(student);
              const isEditing = editingStudentId === student.id;
              const isHighPace = stats.versesPerLesson > 5;
              const isLowSpareWeeks = stats.spareWeeks <= 2 && stats.remainingVerses > 0;
              const visibleCount = (student.portions || []).filter(
                (p) => p.visible !== false
              ).length;

              return (
                <div
                  key={student.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h2 className="font-extrabold text-lg text-slate-900">
                          {student.name}
                        </h2>
                        <div className="text-xs font-semibold text-indigo-700 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>פרשת {student.parasha}</span>
                          <span>•</span>
                          <span>הפטרה: {student.haftarah}</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-1.5 shrink-0">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-100">
                          {stats.weeksToBarMitzvah} שבועות
                        </span>
                        <button
                          type="button"
                          onClick={() => confirmAndDeleteStudent(student)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title={`מחק את התלמיד ${student.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Prominent Computed Start Date & Bar Mitzvah Date Banner */}
                    <div className="grid grid-cols-2 gap-2 bg-indigo-50/50 border border-indigo-100 rounded-xl p-2.5 mb-3 text-xs">
                      <div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          <span>התחלה משוערת:</span>
                        </div>
                        <div className="font-extrabold text-indigo-950 text-sm mt-0.5">
                          {stats.estimatedStartDate}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {stats.totalStudyWeeks} שבועות ({stats.totalStudyMonths} חודשים)
                        </div>
                      </div>

                      <div className="border-r border-indigo-100 pr-2.5">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          <span>תאריך בר מצווה:</span>
                        </div>
                        <div className="font-extrabold text-slate-900 text-sm mt-0.5">
                          {formatDateIL(student.barMitzvahDate)}
                        </div>
                        <div className="text-[10px] text-indigo-700 font-semibold">
                          עוד {stats.weeksToBarMitzvah} שבועות
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-700">
                          סה"כ למדנו: {stats.totalLearned} / {stats.totalVerses} פסוקים
                        </span>
                        <span className="text-slate-500 font-semibold">
                          נשארו {stats.remainingVerses} ({stats.progressPercent}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all"
                          style={{ width: `${stats.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Tracking Sheet Stats */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center mb-3">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isHighPace ? 'bg-rose-100 text-rose-900' : ''
                        }`}
                      >
                        <div className="text-[11px] text-slate-500">פסוקים לשיעור</div>
                        <div className="font-extrabold text-sm flex items-center justify-center gap-1">
                          <span>{stats.versesPerLesson}</span>
                          {isHighPace && (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                        </div>
                      </div>

                      <div className="p-1.5 rounded-lg">
                        <div className="text-[11px] text-slate-500">שיעורים ללימוד</div>
                        <div className="font-extrabold text-sm text-slate-800">
                          {stats.lessonsNeeded}
                        </div>
                      </div>

                      <div
                        className={`p-1.5 rounded-lg ${
                          isLowSpareWeeks ? 'bg-amber-100 text-amber-900' : ''
                        }`}
                      >
                        <div className="text-[11px] text-slate-500">שבועות עודפים</div>
                        <div className="font-extrabold text-sm flex items-center justify-center gap-1">
                          <span>{stats.spareWeeks}</span>
                          {isLowSpareWeeks && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Inputs */}
                    <div className="space-y-2 text-xs bg-slate-50/70 rounded-xl p-2.5 border border-slate-200/70">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">
                          פסוקי פרשה שלמדנו ({student.parashaVerses - student.skippedVerses} לקריאה):
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateStudent({
                                ...student,
                                learnedParashaVerses: Math.max(
                                  0,
                                  student.learnedParashaVerses - 1
                                ),
                              })
                            }
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={student.learnedParashaVerses}
                            onChange={(e) =>
                              onUpdateStudent({
                                ...student,
                                learnedParashaVerses: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                            className="w-14 text-center font-bold bg-white border border-slate-200 rounded-lg py-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateStudent({
                                ...student,
                                learnedParashaVerses: student.learnedParashaVerses + 1,
                              })
                            }
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateStudent({
                                ...student,
                                learnedParashaVerses: student.learnedParashaVerses + 5,
                              })
                            }
                            className="px-2 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100"
                          >
                            +5
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">
                          פסוקי הפטרה שלמדנו (מתוך {student.haftarahVerses}):
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateStudent({
                                ...student,
                                learnedHaftarahVerses: Math.max(
                                  0,
                                  student.learnedHaftarahVerses - 1
                                ),
                              })
                            }
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={student.learnedHaftarahVerses}
                            onChange={(e) =>
                              onUpdateStudent({
                                ...student,
                                learnedHaftarahVerses: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                            className="w-14 text-center font-bold bg-white border border-slate-200 rounded-lg py-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateStudent({
                                ...student,
                                learnedHaftarahVerses: student.learnedHaftarahVerses + 1,
                              })
                            }
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateStudent({
                                ...student,
                                learnedHaftarahVerses: student.learnedHaftarahVerses + 5,
                              })
                            }
                            className="px-2 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100"
                          >
                            +5
                          </button>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          דילוג: <strong>{student.skippedVerses}</strong> מתוך {student.parashaVerses} פס׳
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingStudentId(isEditing ? null : student.id)
                          }
                          className="text-indigo-600 font-bold hover:underline"
                        >
                          {isEditing ? 'סגור עריכה' : 'ערוך פרטים'}
                        </button>
                      </div>

                      {isEditing && (
                        <div className="pt-2 mt-2 border-t border-slate-200 grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              פרשה
                            </label>
                            <select
                              value={student.parasha}
                              onChange={(e) => {
                                const p = e.target.value;
                                onUpdateStudent({
                                  ...student,
                                  parasha: p,
                                  parashaVerses: lookupParashaVerses(p),
                                });
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold"
                            >
                              {PARASHA_META_LIST.map((pm) => (
                                <option key={pm.name} value={pm.name}>
                                  {pm.name} ({pm.verses} פס׳)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              הפטרה
                            </label>
                            <input
                              type="text"
                              value={student.haftarah}
                              onChange={(e) => {
                                const h = e.target.value;
                                onUpdateStudent({
                                  ...student,
                                  haftarah: h,
                                  haftarahVerses: lookupHaftarahVerses(h, haftarotMap),
                                });
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              פסוקים בהפטרה
                            </label>
                            <input
                              type="number"
                              value={student.haftarahVerses}
                              onChange={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                onUpdateStudent({
                                  ...student,
                                  haftarahVerses: v,
                                });
                                if (student.haftarah.trim()) {
                                  onSetHaftarahLength(student.haftarah.trim(), v);
                                }
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              תאריך בר מצווה
                            </label>
                            <input
                              type="date"
                              value={student.barMitzvahDate}
                              onChange={(e) =>
                                onUpdateStudent({
                                  ...student,
                                  barMitzvahDate: e.target.value,
                                })
                              }
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              פסוקים שנדלג (מתוך {student.parashaVerses})
                            </label>
                            <input
                              type="number"
                              value={student.skippedVerses}
                              onChange={(e) =>
                                onUpdateStudent({
                                  ...student,
                                  skippedVerses: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openManageModal(student)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>
                        הקלטות ({visibleCount}/{(student.portions || []).length})
                      </span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onPreviewStudent(student)}
                        className="p-2 rounded-xl text-slate-600 hover:bg-slate-200/70 transition"
                        title="צפה במסך התלמיד"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyStudentLink(student)}
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 text-xs font-semibold flex items-center gap-1"
                        title="העתק קישור אישי לתלמיד"
                      >
                        {copiedId === student.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">הועתק!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>קישור</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleWhatsAppShare(student)}
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        title="שלח קישור לתלמיד בוואטסאפ"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* WEEKLY GANTT VIEW */}
        {viewMode === 'gantt' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base">
                  תרשים גאנט שבועי – תלמידים פעילים ותקופות לימוד
                </h2>
                <p className="text-xs text-slate-500">
                  מציג לכל תלמיד את טווח השבועות מתאריך ההתחלה המשוער ועד תאריך בר המצווה, כולל עומס תלמידים בכל שבוע
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-400 inline-block" />
                  <span>שבועות שעברו</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-indigo-600 inline-block" />
                  <span>שבועות לימוד פעילים</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                  <span>שבועות עודפים / חזרה</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-400 inline-block" />
                  <span>שבוע בר מצווה</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="sticky right-0 z-20 bg-slate-900 p-3 text-right min-w-[210px] border-l border-slate-700">
                      תלמיד / פרשה / תאריכים
                    </th>
                    {ganttData.weeks.map((wk) => {
                      const isCurrentWeek = wk.getTime() === ganttData.today.getTime();
                      const d = String(wk.getDate()).padStart(2, '0');
                      const m = String(wk.getMonth() + 1).padStart(2, '0');
                      return (
                        <th
                          key={wk.toISOString()}
                          className={`p-1.5 text-center font-mono text-[10px] min-w-[42px] border-l border-slate-800 ${
                            isCurrentWeek
                              ? 'bg-amber-500 text-slate-950 font-extrabold'
                              : ''
                          }`}
                          title={`שבוע המתחיל ב-${formatDateIL(wk)}`}
                        >
                          <div>{d}/{m}</div>
                          {isCurrentWeek && (
                            <div className="text-[9px] leading-tight">השבוע</div>
                          )}
                        </th>
                      );
                    })}
                  </tr>

                  {/* Weekly Active Students Load Row */}
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <td className="sticky right-0 z-20 bg-slate-100 px-3 py-2 border-l border-slate-200">
                      סה"כ תלמידים פעילים בשבוע
                    </td>
                    {ganttData.weeks.map((wk) => {
                      const t = wk.getTime();
                      const activeCount = ganttData.rows.filter(
                        (r) => t >= r.startWeek.getTime() && t <= r.endWeek.getTime()
                      ).length;
                      const isCurrentWeek = t === ganttData.today.getTime();
                      return (
                        <td
                          key={wk.toISOString()}
                          className={`p-1 text-center border-l border-slate-200 ${
                            isCurrentWeek ? 'bg-amber-50 font-extrabold text-amber-900' : ''
                          }`}
                        >
                          {activeCount > 0 ? (
                            <span
                              className={`inline-block w-5 h-5 leading-5 rounded-full text-[10px] ${
                                activeCount >= 5
                                  ? 'bg-rose-100 text-rose-800'
                                  : activeCount >= 3
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {activeCount}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {ganttData.rows.map(({ student, stats, startWeek, endWeek }) => {
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80">
                        <td className="sticky right-0 z-10 bg-white px-3 py-2.5 border-l border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-slate-900">
                              {student.name}
                            </span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                              {student.parasha}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
                            <span>
                              התחלה: <strong>{stats.estimatedStartDate}</strong>
                            </span>
                            <span>
                              בר מצווה: <strong>{formatDateIL(student.barMitzvahDate)}</strong>
                            </span>
                          </div>
                        </td>

                        {ganttData.weeks.map((wk) => {
                          const t = wk.getTime();
                          const todayTime = ganttData.today.getTime();
                          const isCurrentWeek = t === todayTime;
                          const inWindow =
                            t >= startWeek.getTime() && t <= endWeek.getTime();
                          const isBmWeek = t === endWeek.getTime();
                          const isPast = t < todayTime;

                          const weeksBeforeBm = Math.round(
                            (endWeek.getTime() - t) / (7 * 24 * 3600 * 1000)
                          );
                          const isBufferWeek =
                            !isPast &&
                            !isBmWeek &&
                            stats.spareWeeks > 0 &&
                            weeksBeforeBm <= stats.spareWeeks;

                          let barClass = '';
                          if (inWindow) {
                            if (isBmWeek) {
                              barClass = 'bg-amber-400 text-slate-950 font-extrabold';
                            } else if (isPast) {
                              barClass = 'bg-slate-400/80 text-white';
                            } else if (isBufferWeek) {
                              barClass = 'bg-emerald-500 text-white';
                            } else {
                              barClass = 'bg-indigo-600 text-white';
                            }
                          }

                          return (
                            <td
                              key={wk.toISOString()}
                              className={`p-1 text-center border-l border-slate-100 ${
                                isCurrentWeek ? 'bg-amber-50/70' : ''
                              }`}
                            >
                              {inWindow && (
                                <div
                                  className={`h-6 rounded-md flex items-center justify-center text-[10px] shadow-2xs ${barClass}`}
                                  title={`${student.name} (${student.parasha}) - שבוע ${formatDateIL(wk)}`}
                                >
                                  {isBmWeek ? '★' : ''}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FULL SPREADSHEET TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white font-bold">
                  <th className="p-3 whitespace-nowrap">שם התלמיד</th>
                  <th className="p-3 whitespace-nowrap">פרשה</th>
                  <th className="p-3 whitespace-nowrap">הפטרה</th>
                  <th className="p-3 whitespace-nowrap bg-indigo-950">התחלה משוערת</th>
                  <th className="p-3 whitespace-nowrap">תאריך בר מצווה</th>
                  <th className="p-3 whitespace-nowrap">פס׳ בפרשה</th>
                  <th className="p-3 whitespace-nowrap">פס׳ שנדלג</th>
                  <th className="p-3 whitespace-nowrap">למדנו (פרשה)</th>
                  <th className="p-3 whitespace-nowrap">פס׳ בהפטרה</th>
                  <th className="p-3 whitespace-nowrap">למדנו (הפטרה)</th>
                  <th className="p-3 whitespace-nowrap bg-slate-700">סה"כ פסוקים</th>
                  <th className="p-3 whitespace-nowrap bg-slate-700">סה"כ למדנו</th>
                  <th className="p-3 whitespace-nowrap bg-slate-700">פס׳ שנשארו</th>
                  <th className="p-3 whitespace-nowrap">פס׳ לשיעור</th>
                  <th className="p-3 whitespace-nowrap">שבועות לבר מצווה</th>
                  <th className="p-3 whitespace-nowrap">שיעורים ללימוד</th>
                  <th className="p-3 whitespace-nowrap">שבועות עודפים</th>
                  <th className="p-3 whitespace-nowrap">שבועות כולל</th>
                  <th className="p-3 whitespace-nowrap">חודשי לימוד</th>
                  <th className="p-3 whitespace-nowrap">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((student) => {
                  const st = calculateStudentStats(student);
                  const visCount = (student.portions || []).filter(
                    (p) => p.visible !== false
                  ).length;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                        {student.name}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">{student.parasha}</td>
                      <td className="p-2.5 whitespace-nowrap">{student.haftarah}</td>
                      <td className="p-2.5 text-center font-extrabold text-indigo-800 bg-indigo-50/40 whitespace-nowrap">
                        {st.estimatedStartDate}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {formatDateIL(student.barMitzvahDate)}
                      </td>
                      <td className="p-2.5 text-center">{student.parashaVerses}</td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          value={student.skippedVerses}
                          onChange={(e) =>
                            onUpdateStudent({
                              ...student,
                              skippedVerses: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-14 text-center border border-slate-200 rounded px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          value={student.learnedParashaVerses}
                          onChange={(e) =>
                            onUpdateStudent({
                              ...student,
                              learnedParashaVerses: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                          className="w-14 text-center font-bold border border-indigo-200 bg-indigo-50/40 rounded px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2.5 text-center">{student.haftarahVerses}</td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          value={student.learnedHaftarahVerses}
                          onChange={(e) =>
                            onUpdateStudent({
                              ...student,
                              learnedHaftarahVerses: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                          className="w-14 text-center font-bold border border-indigo-200 bg-indigo-50/40 rounded px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2.5 text-center font-bold bg-slate-50">
                        {st.totalVerses}
                      </td>
                      <td className="p-2.5 text-center font-bold text-emerald-700 bg-slate-50">
                        {st.totalLearned}
                      </td>
                      <td className="p-2.5 text-center font-bold text-indigo-700 bg-slate-50">
                        {st.remainingVerses}
                      </td>
                      <td
                        className={`p-2.5 text-center font-extrabold ${
                          st.versesPerLesson > 5 ? 'bg-rose-100 text-rose-800' : ''
                        }`}
                      >
                        {st.versesPerLesson}
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        {st.weeksToBarMitzvah}
                      </td>
                      <td className="p-2.5 text-center">{st.lessonsNeeded}</td>
                      <td
                        className={`p-2.5 text-center font-extrabold ${
                          st.spareWeeks <= 2 && st.remainingVerses > 0
                            ? 'bg-rose-100 text-rose-800'
                            : ''
                        }`}
                      >
                        {st.spareWeeks}
                      </td>
                      <td className="p-2.5 text-center">{st.totalStudyWeeks}</td>
                      <td className="p-2.5 text-center">{st.totalStudyMonths}</td>
                      <td className="p-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openManageModal(student)}
                            className="px-2 py-1 rounded bg-indigo-600 text-white font-bold"
                          >
                            הקלטות ({visCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyStudentLink(student)}
                            className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100"
                          >
                            {copiedId === student.id ? 'הועתק' : 'קישור'}
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmAndDeleteStudent(student)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="מחק תלמיד"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* MODAL 1: LINK & MANAGE PORTIONS FOR A STUDENT */}
      {managingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg">
                  ניהול הקלטות – {managingStudent.name} (פרשת {managingStudent.parasha})
                </h3>
                <p className="text-xs text-slate-300">
                  קשר תיקיית Drive או קבצים בודדים ובחר אילו עליות יהיו גלויות לתלמיד
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingStudentId(null)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Option A: Link a Google Drive Folder */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-indigo-600" />
                  <span>קישור תיקיית פרשה מ-Google Drive (מייבא את כל הקבצים בתיקייה):</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderUrlInput}
                    onChange={(e) => setFolderUrlInput(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={handleLoadFolderIntoStudent}
                    disabled={isLoadingFolder || !folderUrlInput.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    {isLoadingFolder ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderPlus className="w-3.5 h-3.5" />
                    )}
                    <span>טען קבצים מהתיקייה</span>
                  </button>
                </div>
                {folderLoadMsg && (
                  <p className="text-xs text-indigo-700 font-semibold mt-2">
                    {folderLoadMsg}
                  </p>
                )}
              </div>

              {/* Option B: Add a Specific Drive File Link or Upload Audio File */}
              <form
                onSubmit={handleAddSinglePortion}
                className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4 text-emerald-600" />
                  <span>
                    או הוסף קובץ הקלטה בודד (קישור ל-Drive או העלאת קובץ ישירות ל-Drive שלך):
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    list="aliyah-names"
                    value={singleAliyahLabel}
                    onChange={(e) => setSingleAliyahLabel(e.target.value)}
                    placeholder="שם העלייה (למשל: ראשון / הפטרה)"
                    className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  />
                  <datalist id="aliyah-names">
                    <option value="עליית ראשון" />
                    <option value="עליית שני" />
                    <option value="עליית שלישי" />
                    <option value="עליית רביעי" />
                    <option value="עליית חמישי" />
                    <option value="עליית שישי" />
                    <option value="עליית שביעי" />
                    <option value="מפטיר" />
                    <option value="הפטרה" />
                    <option value="כהן (חול/מנחה)" />
                    <option value="לוי (חול/מנחה)" />
                    <option value="ישראל (חול/מנחה)" />
                  </datalist>

                  <select
                    value={singleCategory}
                    onChange={(e) => setSingleCategory(e.target.value as any)}
                    className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs"
                  >
                    <option value="shabbat">קריאה בתורה (שבת)</option>
                    <option value="chol">קריאה בתורה (חול/מנחה)</option>
                    <option value="haftarah">הפטרה</option>
                    <option value="doc">דף עזר (PDF/תמונה)</option>
                  </select>

                  <select
                    value={singleExt}
                    onChange={(e) => setSingleExt(e.target.value as any)}
                    className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs"
                  >
                    <option value="aac">סיומת .aac</option>
                    <option value="m4a">סיומת .m4a</option>
                    <option value="mp3">סיומת .mp3</option>
                    <option value="pdf">קובץ .pdf</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={singleLinkInput}
                    onChange={(e) => setSingleLinkInput(e.target.value)}
                    placeholder="הדבק קישור לקובץ ב-Google Drive..."
                    className="flex-1 min-w-[200px] bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs"
                    dir="ltr"
                  />
                  <label className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer">
                    <span>{localFileName ? `קובץ: ${localFileName}` : 'או בחר קובץ מהמכשיר'}</span>
                    <input
                      type="file"
                      accept="audio/*,.aac,.m4a,.mp3,.pdf"
                      onChange={handleLocalFilePick}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isUploadingAudio || (!singleLinkInput.trim() && !localDataUrl)}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1"
                  >
                    {isUploadingAudio ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>מעלה ל-Drive...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>הוסף</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Current Portions List for this Student */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-800 text-sm">
                    הקלטות משויכות ל{managingStudent.name} ({(managingStudent.portions || []).length})
                  </h4>
                  {(managingStudent.portions || []).length > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateStudent({
                            ...managingStudent,
                            portions: managingStudent.portions.map((p) => ({
                              ...p,
                              visible: true,
                            })),
                          })
                        }
                        className="font-semibold text-indigo-600 hover:underline"
                      >
                        הצג הכל לתלמיד
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateStudent({
                            ...managingStudent,
                            portions: managingStudent.portions.map((p) => ({
                              ...p,
                              visible: false,
                            })),
                          })
                        }
                        className="font-semibold text-slate-500 hover:underline"
                      >
                        הסתר הכל
                      </button>
                    </div>
                  )}
                </div>

                {(managingStudent.portions || []).length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-500">
                    עדיין לא קושרו הקלטות לתלמיד זה. הדבק למעלה קישור לתיקיית הפרשה ב-Drive או קישור לקובץ בודד.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {managingStudent.portions.map((rec) => {
                      const isVisible = rec.visible !== false;
                      const isPlayingThis = previewRecording?.id === rec.id;

                      return (
                        <div
                          key={rec.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                            isVisible
                              ? 'bg-indigo-50/60 border-indigo-300'
                              : 'bg-white border-slate-200 opacity-70'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                togglePortionVisibility(managingStudent, rec.id)
                              }
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition ${
                                isVisible
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {isVisible ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>גלוי לתלמיד</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>מוסתר</span>
                                </>
                              )}
                            </button>

                            <div className="min-w-0">
                              <div className="font-bold text-sm text-slate-900 truncate">
                                {rec.aliyah}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {rec.title}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {rec.category !== 'doc' && (
                              <button
                                type="button"
                                onClick={() => setPreviewRecording(rec)}
                                className={`p-2 rounded-xl text-xs font-semibold ${
                                  isPlayingThis
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                                title="השמע לבדיקה"
                              >
                                {isPlayingThis ? (
                                  <Volume2 className="w-4 h-4 animate-pulse" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current" />
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                removePortionFromStudent(managingStudent, rec.id)
                              }
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="הסר מרשימת התלמיד"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleCopyStudentLink(managingStudent)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>
                  {copiedId === managingStudent.id
                    ? 'הקישור המעודכן הועתק!'
                    : 'העתק קישור אישי לתלמיד'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setManagingStudentId(null)}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW STUDENT */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
          <form
            onSubmit={handleCreateStudent}
            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-lg">הוספת תלמיד חדש</h3>
              <button
                type="button"
                onClick={() => setShowAddStudentModal(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  שם התלמיד *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="לדוגמה: דניאל כהן"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
                />
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">חישוב פרשת בר מצווה לפי תאריך לידה</span>
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setDobMode('gregorian')}
                      className={`px-2 py-0.5 rounded-lg border ${dobMode === 'gregorian' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                    >
                      לועזי
                    </button>
                    <button
                      type="button"
                      onClick={() => setDobMode('hebrew')}
                      className={`px-2 py-0.5 rounded-lg border ${dobMode === 'hebrew' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
                    >
                      עברי
                    </button>
                  </div>
                </div>

                {dobMode === 'gregorian' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dobGregorian}
                      onChange={(e) => setDobGregorian(e.target.value)}
                      className="border border-slate-300 rounded-xl px-3 py-1.5 text-sm"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={dobAfterSunset}
                        onChange={(e) => setDobAfterSunset(e.target.checked)}
                      />
                      נולד אחרי השקיעה
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={dobHebDay}
                      onChange={(e) => setDobHebDay(Number(e.target.value) || 1)}
                      className="w-16 border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
                    />
                    <select
                      value={dobHebMonth}
                      onChange={(e) => setDobHebMonth(Number(e.target.value))}
                      className="border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
                    >
                      {([
                        [7, 'תשרי'], [8, 'חשוון'], [9, 'כסלו'], [10, 'טבת'], [11, 'שבט'],
                        [12, 'אדר (אדר א׳)'], [13, 'אדר ב׳'], [1, 'ניסן'], [2, 'אייר'],
                        [3, 'סיוון'], [4, 'תמוז'], [5, 'אב'], [6, 'אלול'],
                      ] as [number, string][]).map(([n, label]) => (
                        <option key={n} value={n}>{label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={5000}
                      max={6000}
                      value={dobHebYear}
                      onChange={(e) => setDobHebYear(Number(e.target.value) || 5780)}
                      className="w-24 border border-slate-300 rounded-xl px-2 py-1.5 text-sm"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={calculateBarMitzva}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                >
                  חשב והחל
                </button>
                {bmCalcError && <p className="text-[11px] text-red-600">{bmCalcError}</p>}
                {bmCalcResult && (
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    יום ההולדת ה-13: {bmCalcResult.barMitzvaHDate.render('he')} (
                    {formatDateIL(bmCalcResult.barMitzvaDate)}).<br />
                    שבת הקריאה: {formatDateIL(bmCalcResult.shabbatDate)} – פרשת{' '}
                    <strong>{bmCalcResult.parshaHe.join(' - ')}</strong>
                    {bmCalcResult.parshaHe.length > 1 && ' (פרשה כפולה – נבחרה הראשונה, ניתן לשנות)'}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    פרשת בר המצווה
                  </label>
                  <select
                    value={newParasha}
                    onChange={(e) => {
                      const p = e.target.value;
                      setNewParasha(p);
                      setNewHaftarah(p);
                      setNewParashaVerses(lookupParashaVerses(p));
                      setNewHaftarahVerses(lookupHaftarahVerses(p, haftarotMap));
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  >
                    {PARASHA_META_LIST.map((pm) => (
                      <option key={pm.name} value={pm.name}>
                        {pm.name} ({pm.verses} פס׳)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    הפטרה
                  </label>
                  <input
                    type="text"
                    list="haftarot-options"
                    value={newHaftarah}
                    onChange={(e) => {
                      setNewHaftarah(e.target.value);
                      setNewHaftarahVerses(lookupHaftarahVerses(e.target.value, haftarotMap));
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  />
                  <datalist id="haftarot-options">
                    {Object.keys(haftarotMap).map((h) => (
                      <option key={h} value={h} />
                    ))}
                    {SPECIAL_HAFTAROT.filter((h) => !(h in haftarotMap)).map((h) => (
                      <option key={h} value={h} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    תאריך בר מצווה
                  </label>
                  <input
                    type="date"
                    required
                    value={newBarMitzvahDate}
                    onChange={(e) => setNewBarMitzvahDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    פסוקים שנדלג בפרשה
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newSkippedVerses}
                    onChange={(e) => setNewSkippedVerses(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    פסוקים בפרשה
                  </label>
                  <input
                    type="number"
                    value={newParashaVerses}
                    onChange={(e) => setNewParashaVerses(Number(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                    פסוקים בהפטרה
                  </label>
                  <input
                    type="number"
                    value={newHaftarahVerses}
                    onChange={(e) => setNewHaftarahVerses(Number(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-bold"
                  />
                </div>
              </div>

              {/* Computed Start Date Preview inside Add Modal */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-600">תאריך התחלה משוער מחושב: </span>
                  <strong className="text-indigo-950 text-sm">
                    {newStudentPreviewStats.estimatedStartDate}
                  </strong>
                </div>
                <span className="text-indigo-700 font-semibold">
                  סה"כ {newStudentPreviewStats.totalVerses} פס׳ ({newStudentPreviewStats.totalStudyWeeks} שבועות)
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  קישור לתיקיית הפרשה ב-Google Drive (אופציונלי – ניתן להוסיף גם אחר כך)
                </label>
                <input
                  type="text"
                  value={newFolderUrl}
                  onChange={(e) => setNewFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddStudentModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                ביטול
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                הוסף תלמיד
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: MANAGE HAFTARAH LENGTHS TABLE */}
      {showHaftarotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg">טבלת אורכי הפטרות (מספר פסוקים)</h3>
                <p className="text-xs text-slate-300">
                  הוסף או עדכן את מספר הפסוקים של כל הפטרה לחישוב אוטומטי
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHaftarotModal(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Add / Update Haftarah Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newHaftarahEntryName.trim()) return;
                  onSetHaftarahLength(
                    newHaftarahEntryName.trim(),
                    Math.max(0, Number(newHaftarahEntryVerses) || 0)
                  );
                  setNewHaftarahEntryName('');
                }}
                className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-end gap-2"
              >
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    שם ההפטרה / הפרשה
                  </label>
                  <input
                    type="text"
                    required
                    list="all-parashot-haftarot"
                    value={newHaftarahEntryName}
                    onChange={(e) => setNewHaftarahEntryName(e.target.value)}
                    placeholder="למשל: נח / שמות א / מחר חודש"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  />
                  <datalist id="all-parashot-haftarot">
                    {PARASHA_META_LIST.map((pm) => (
                      <option key={pm.name} value={pm.name} />
                    ))}
                    {SPECIAL_HAFTAROT.map((sh) => (
                      <option key={sh} value={sh} />
                    ))}
                  </datalist>
                </div>

                <div className="w-28">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    מספר פסוקים
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newHaftarahEntryVerses}
                    onChange={(e) =>
                      setNewHaftarahEntryVerses(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-center"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 h-[34px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>שמור</span>
                </button>
              </form>

              {/* Existing Haftarot List */}
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                {Object.entries(haftarotMap).map(([name, verses]) => (
                  <div
                    key={name}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-bold text-slate-900">{name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={verses}
                        onChange={(e) =>
                          onSetHaftarahLength(
                            name,
                            Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                        className="w-16 text-center font-bold border border-slate-200 rounded-lg py-1"
                      />
                      <span className="text-slate-500">פסוקים</span>
                      <button
                        type="button"
                        onClick={() => onDeleteHaftarahLength(name)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        title="מחק מהטבלה"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHaftarotModal(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: GOOGLE DRIVE CLOUD SYNC SETUP (GOOGLE APPS SCRIPT WEB APP) */}
      {showDriveSyncModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CloudUpload className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-lg">
                    שמירה אוטומטית ב-Google Drive (Apps Script)
                  </h3>
                  <p className="text-xs text-slate-300">
                    שומר את כל נתוני התלמידים, ההתקדמות וההפטרות בקובץ <code className="text-indigo-300">torah-app-data.json</code> בתיקיית ה-Drive שלך
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDriveSyncModal(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs text-slate-700">
              {/* Step-by-step instructions */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 space-y-2">
                <div className="font-extrabold text-indigo-950 text-sm mb-1">
                  איך לחבר את האפליקציה ל-Google Drive ב-2 דקות (חד-פעמי):
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 leading-relaxed">
                  <li>
                    לחץ על הכפתור למטה <strong>"העתק קוד Google Apps Script"</strong>.
                  </li>
                  <li>
                    פתח את{' '}
                    <a
                      href="https://script.google.com/home/start"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 font-bold underline"
                    >
                      script.google.com
                    </a>{' '}
                    ולחץ על <strong>New project (פרויקט חדש)</strong>.
                  </li>
                  <li>
                    מחק את הקוד הקיים, הדבק את הקוד שהעתקת ולחץ על סמל השמירה (💾).
                  </li>
                  <li>
                    לחץ למעלה על <strong>Deploy &rarr; New deployment</strong>, בחר סוג{' '}
                    <strong>Web app</strong>, הגדר:
                    <ul className="list-disc list-inside mr-4 mt-1 text-slate-600">
                      <li>
                        <strong>Execute as:</strong> Me (אני)
                      </li>
                      <li>
                        <strong>Who has access:</strong> Anyone (כל אחד)
                      </li>
                    </ul>
                  </li>
                  <li>
                    אשר הרשאות (Authorize) והעתק את כתובת ה-<strong>Web app URL</strong> (מסתיים ב-<code>/exec</code>) אל השדה למטה:
                  </li>
                </ol>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
                      setCopiedGasScript(true);
                      setTimeout(() => setCopiedGasScript(false), 3000);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-2xs transition"
                  >
                    {copiedGasScript ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>הקוד הועתק ללוח!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>העתק קוד Google Apps Script</span>
                      </>
                    )}
                  </button>

                  <a
                    href="https://script.google.com/home/start"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold flex items-center gap-1 hover:bg-indigo-50"
                  >
                    <span>פתח את Google Apps Script</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Web App URL Input */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-800 text-xs">
                  כתובת ה-Web App URL מ-Google Apps Script:
                </label>
                <input
                  type="url"
                  value={gasUrlInput}
                  onChange={(e) => setGasUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono"
                  dir="ltr"
                />
              </div>

              {gasTestMessage && (
                <div
                  className={`p-3 rounded-xl font-bold ${
                    gasTestMessage.includes('בהצלחה')
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {gasTestMessage}
                </div>
              )}

              {syncErrorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                  {syncErrorMessage}
                </div>
              )}

              {lastSyncedAt && (
                <div className="text-[11px] text-slate-500">
                  סנכרון אחרון ל-Drive:{' '}
                  <strong>{new Date(lastSyncedAt).toLocaleString('he-IL')}</strong>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              {gasUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsTestingGas(true);
                    setGasTestMessage(null);
                    const ok = await onForceSync();
                    setIsTestingGas(false);
                    setGasTestMessage(
                      ok
                        ? 'הנתונים נשמרו ב-Google Drive בהצלחה! (קובץ torah-app-data.json עודכן)'
                        : 'שגיאה בשמירה ל-Drive – בדוק שהכתובת מסתיימת ב-/exec ושהגישה מוגדרת ל-Anyone'
                    );
                  }}
                  disabled={isTestingGas}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-100"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingGas ? 'animate-spin' : ''}`} />
                  <span>סנכרן עכשיו</span>
                </button>
              )}

              <div className="flex items-center gap-2 mr-auto">
                <button
                  type="button"
                  onClick={() => setShowDriveSyncModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200"
                >
                  סגור
                </button>
                <button
                  type="button"
                  disabled={isTestingGas}
                  onClick={async () => {
                    setIsTestingGas(true);
                    setGasTestMessage(null);
                    const ok = await onSaveGasUrl(gasUrlInput);
                    setIsTestingGas(false);
                    if (!gasUrlInput.trim()) {
                      setShowDriveSyncModal(false);
                      return;
                    }
                    setGasTestMessage(
                      ok
                        ? 'חובר ונשמר ב-Google Drive בהצלחה! מעכשיו כל שינוי יישמר אוטומטית.'
                        : 'לא הצלחנו לשמור בכתובת הזו. ודא שהכתובת מסתיימת ב-/exec ושהרשאת הגישה היא Anyone.'
                    );
                  }}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {isTestingGas && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>שמור וסנכרן ל-Drive</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AudioPlayerBar
        recording={previewRecording}
        parashaName={managingStudent?.parasha}
        haftarahName={managingStudent?.haftarah}
        studentPortions={managingStudent?.portions}
      />
    </div>
  );
};
