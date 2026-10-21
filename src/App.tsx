import React, { useState, useRef, useEffect } from 'react';
import { PARASHA_CATALOG, STUDENTS, ROOT_DRIVE_FOLDER_ID, ROOT_DRIVE_FOLDER_URL, STUDENT_TRACKER_SHEET_URL, ParashaFolder, RecordingItem } from './data/driveCatalog';
import { PitchShiftEngine } from './audio/PitchShiftEngine';

export default function App() {
  const engineRef = useRef<PitchShiftEngine>(new PitchShiftEngine());
  const [selectedParasha, setSelectedParasha] = useState<ParashaFolder>(PARASHA_CATALOG[4]); // שמות
  const [selectedRecording, setSelectedRecording] = useState<RecordingItem>(PARASHA_CATALOG[4].recordings[0]);
  const [pitchSemitones, setPitchSemitones] = useState<number>(4);
  const [tempo, setTempo] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(8.25);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('מוכן להשמעה (מצב הדגמת טעמים או טעינת קובץ)');

  useEffect(() => {
    const engine = engineRef.current;
    engine.onProgress((cur, dur) => {
      setCurrentTime(cur);
      setDuration(dur);
    });
  }, []);

  const handlePitchChange = (val: number) => {
    setPitchSemitones(val);
    engineRef.current.setPitchSemitones(val);
  };

  const handleTempoChange = (val: number) => {
    setTempo(val);
    engineRef.current.setTempo(val);
  };

  const handlePlayDemoOrTrack = async (rec: RecordingItem) => {
    setSelectedRecording(rec);
    if (apiKey.trim()) {
      try {
        setStatusMsg('טוען הקלטה מ-Google Drive...');
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${rec.id}?alt=media&key=${apiKey.trim()}`);
        if (!res.ok) throw new Error('Drive API fetch failed');
        const buf = await res.arrayBuffer();
        const dur = await engineRef.current.loadArrayBuffer(buf);
        setDuration(dur);
        engineRef.current.setPitchSemitones(pitchSemitones);
        engineRef.current.setTempo(tempo);
        engineRef.current.play();
        setIsPlaying(true);
        setStatusMsg(`מנגן מ-Drive: ${rec.title}`);
        return;
      } catch {
        setStatusMsg('שגיאת הרשאה/CORS מ-Drive — מנגן הדגמת טעמים מובנית');
      }
    }
    const dur = engineRef.current.generateCantillationDemo(rec.title.length);
    setDuration(dur);
    engineRef.current.setPitchSemitones(pitchSemitones);
    engineRef.current.setTempo(tempo);
    engineRef.current.play();
    setIsPlaying(true);
    setStatusMsg(`מנגן: ${rec.title} (${pitchSemitones > 0 ? '+' : ''}${pitchSemitones} חצאי טון)`);
  };

  const handleLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const dur = await engineRef.current.loadArrayBuffer(buf);
    setDuration(dur);
    engineRef.current.setPitchSemitones(pitchSemitones);
    engineRef.current.setTempo(tempo);
    engineRef.current.play();
    setIsPlaying(true);
    setStatusMsg(`מנגן קובץ מקומי: ${file.name}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <header className="max-w-6xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">קריאה בתורה לבר מצווה – נגן והתאמת סולם (Pitch Shift)</h1>
          <p className="text-sm text-slate-600">מחובר למבנה תיקיית הדרייב "קריאה בתורה" ({ROOT_DRIVE_FOLDER_ID}) ולמעקב התלמידים</p>
        </div>
        <div className="flex gap-3">
          <a href={ROOT_DRIVE_FOLDER_URL} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-sm font-medium">תיקיית קריאה בתורה ב-Drive</a>
          <a href={STUDENT_TRACKER_SHEET_URL} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 text-sm font-medium">גיליון מעקב תלמידים</a>
        </div>
      </header>
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-lg mb-3">תלמידים פעילים ופרשות</h2>
          <div className="space-y-2 mb-6">
            {STUDENTS.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  const found = PARASHA_CATALOG.find((p) => p.name === s.parasha);
                  if (found) {
                    setSelectedParasha(found);
                    setSelectedRecording(found.recordings[0]);
                  }
                  handlePitchChange(s.defaultSemitones);
                }}
                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-indigo-400 flex justify-between items-center"
              >
                <span><strong>{s.name}</strong> – {s.parasha}</span>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">+{s.defaultSemitones} חצאי טון</span>
              </button>
            ))}
          </div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">טעינת קובץ הקלטה מקומי (.m4a / .aac / .mp3)</label>
          <input type="file" accept="audio/*" onChange={handleLocalFile} className="w-full text-sm mb-4" />
          <label className="block text-xs font-semibold text-slate-500 mb-1">Google Drive API Key (אופציונלי להזרמה ישירה)</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full px-3 py-2 border rounded-xl text-sm" />
        </section>

        <section className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{selectedParasha.name} – {selectedRecording.aliyah}</h2>
              <p className="text-sm text-slate-500">{statusMsg}</p>
            </div>
            <a href={selectedRecording.viewUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline">פתח קובץ מקורי ב-Drive</a>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">שינוי סולם מוזיקלי בזמן אמת (ללא שינוי מהירות):</span>
              <span className="text-lg font-bold text-indigo-700">{pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} חצאי טון</span>
            </div>
            <input
              type="range"
              min={-6}
              max={12}
              step={0.5}
              value={pitchSemitones}
              onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
              className="w-full mb-4"
            />
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">מהירות הקראה (Tempo):</span>
              <span className="font-bold">{Math.round(tempo * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.3}
              step={0.05}
              value={tempo}
              onChange={(e) => handleTempoChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selectedParasha.recordings.map((rec) => (
              <button
                key={rec.id}
                onClick={() => handlePlayDemoOrTrack(rec)}
                className={`p-3 rounded-xl border text-right flex justify-between items-center ${selectedRecording.id === rec.id ? 'border-indigo-600 bg-indigo-50/60' : 'border-slate-200'}`}
              >
                <div>
                  <div className="font-semibold">{rec.aliyah}</div>
                  <div className="text-xs text-slate-500">{rec.title}</div>
                </div>
                <span className="text-xs font-mono uppercase px-2 py-1 bg-white rounded border">{rec.ext}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
