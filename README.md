# קריאה בתורה לבר מצווה – Vite + Web Audio Pitch-Shifting App

אפליקציית Vite (React + TypeScript) לניווט נוח בהקלטות הקריאה בתורה מתוך תיקיית Google Drive (`קריאה בתורה`) ושינוי הסולם המוזיקלי (Pitch Shift) בזמן אמת ללא שינוי מהירות ההקראה, כדי להתאים לקולם הגבוה יותר של נערי בר-מצווה.

## הפעלה מקומית
```bash
npm install
npm run dev
```

## חיבור להקלטות ב-Google Drive
1. **טעינה ישירה מ-Google Drive API**: הזינו מפתח `Google Drive API Key` בהגדרות האפליקציה (או בקובץ `.env` תחת `VITE_GOOGLE_DRIVE_API_KEY`) וודאו שתיקיית `קריאה בתורה` (`0B6cVWsWs-t94Y2xzWnJaWlF0ZXc`) משותפת לצפייה ("כל מי שיש לו את הקישור").
2. **פרוקסי מובנה ב-Vite (`vite.config.ts`)**: הפרויקט כולל הגדרת Proxy ב-`vite.config.ts` עבור `/drive-stream` ו-`/googleapis-drive` כדי למנוע חסימות CORS בדפדפן בעת פענוח קובצי `.m4a` ו-`.aac` ב-Web Audio API.
3. **ניגון קבצים מקומיים**: ניתן לגרור או לבחור קובצי `.m4a`, `.aac`, `.mp3` שהורדו מהדרייב ישירות אל הנגן.
