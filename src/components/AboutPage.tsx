import { ArrowRight, Github, Info, Mail } from 'lucide-react';

function aboutUrl(showAbout: boolean): string {
  const url = new URL(window.location.href);
  if (showAbout) {
    url.searchParams.set('about', '1');
  } else {
    url.searchParams.delete('about');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function AboutLink() {
  return (
    <a
      href={aboutUrl(true)}
      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-indigo-200 hover:bg-white/10 hover:text-white transition"
    >
      <Info className="w-4 h-4" />
      אודות
    </a>
  );
}

const linkClass = 'text-indigo-700 underline underline-offset-2 hover:text-indigo-900';

export function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" dir="rtl">
      <header className="bg-slate-900 text-white px-5 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <h1 className="text-xl font-extrabold">אודות האפליקציה</h1>
          <a href={aboutUrl(false)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm hover:bg-white/10">
            <ArrowRight className="w-4 h-4" />
            חזרה לאפליקציה
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-5 space-y-5">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-lg font-bold">קריאה בתורה והפטרה</h2>
          <p className="text-sm text-slate-600">כלי למורים ולתלמידים להכנה לקריאה בתורה ובהפטרה ולמעקב אחר ההתקדמות בלימוד.</p>
          <p className="text-sm">פיתוח: <b dir="ltr">Moshe Goren</b></p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="mailto:mosheg81@gmail.com" className={`${linkClass} inline-flex items-center gap-1.5`}>
              <Mail className="w-4 h-4" />
              <span dir="ltr">mosheg81@gmail.com</span>
            </a>
            <a href="https://github.com/moshegc/torah-reading" target="_blank" rel="noreferrer" className={`${linkClass} inline-flex items-center gap-1.5`}>
              <Github className="w-4 h-4" />
              קוד המקור ב-GitHub
            </a>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-sm leading-relaxed">
          <h2 className="text-lg font-bold">מקורות מידע ורישיונות</h2>
          <div className="space-y-2">
            <h3 className="font-bold text-base">
              <a href="https://www.hebcal.com/" target="_blank" rel="noreferrer" className={linkClass}>Hebcal</a>
            </h3>
            <p>חישובי תאריכים עבריים ופרשות השבוע מבוססים על Hebcal. נתוני הקריאה ומספרי הפסוקים הופקו בעזרת ספריית Hebcal Leyning.</p>
            <ul className="list-disc ps-5 space-y-2">
              <li>
                <a href="https://github.com/hebcal/hebcal-es6" target="_blank" rel="noreferrer" className={linkClass}><bdi>@hebcal/core</bdi></a>
                {' — '}Michael J. Radwin ותורמי Hebcal. רישיון{' '}
                <a href="/licenses/hebcal-core.txt" target="_blank" rel="noreferrer" className={linkClass}>GPL-2.0-or-later</a>.
              </li>
              <li>
                <a href="https://github.com/hebcal/hebcal-leyning" target="_blank" rel="noreferrer" className={linkClass}><bdi>@hebcal/leyning</bdi></a>
                {' — '}Copyright (c) 2020, hebcal. All rights reserved. רישיון{' '}
                <a href="/licenses/hebcal-leyning.txt" target="_blank" rel="noreferrer" className={linkClass}>BSD-2-Clause</a>.
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-base">
              <a href="https://www.sefaria.org/" target="_blank" rel="noreferrer" className={linkClass}>ספריא / Sefaria</a>
            </h3>
            <p>טקסט הפסוקים נטען באמצעות ה-API של ספריא. המהדורה העברית היא ״מקרא על פי המסורה״ (Miqra according to the Masorah), בעריכת Dovi ותורמי ויקיטקסט.</p>
            <p>
              <a href="https://he.wikisource.org/wiki/משתמש:Dovi/מקרא_על_פי_המסורה" target="_blank" rel="noreferrer" className={linkClass}>מקור המהדורה ופרטי התורמים</a>
              {' · '}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className={linkClass}>CC BY-SA 4.0</a>
            </p>
            <p>התאמות לתצוגה באפליקציה: הסרת עיצוב והערות, אפשרות להסרת ניקוד וטעמים, והתאמת תצוגת כתיב וקרי. הטקסט המותאם כפוף לאותו רישיון שיתוף זהה.</p>
            <p>
              לכל מהדורה בספריא רישיון משלה; פרטי המקור זמינים גם דרך הקישור לספריא בתצוגת הפסוקים.{' '}
              <a href="https://developers.sefaria.org/docs/usage-of-our-name-and-logo" target="_blank" rel="noreferrer" className={linkClass}>מידע על זכויות ושימוש בנתוני ספריא</a>.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-base">
              <a href="https://github.com/streamonkey/ebur128_wasm" target="_blank" rel="noreferrer" className={linkClass}>ebur128-wasm</a>
            </h3>
            <p>מדידת עוצמת ההקלטות לפי EBU R128 מתבצעת במכשיר בעזרת ebur128-wasm מאת Wilhelm Bartel / StreamOnKey, המבוססת על ספריית ebur128 בשפת Rust מאת Sebastian Dröge ותורמים.</p>
            <p>
              רישיון <a href="/licenses/ebur128-wasm.txt" target="_blank" rel="noreferrer" className={linkClass}>Apache-2.0</a>.
              {' '}<a href="https://github.com/sdroege/ebur128" target="_blank" rel="noreferrer" className={linkClass}>קוד המקור של ebur128</a>.
              {' '}<a href="/licenses/ebur128.txt" target="_blank" rel="noreferrer" className={linkClass}>רישיון MIT — Jan Kokemüller, Sebastian Dröge</a>.
            </p>
          </div>
          <p className="text-slate-500">האפליקציה היא מיזם עצמאי ואינה מפותחת או מאושרת על ידי Hebcal או ספריא.</p>
        </section>
      </main>
    </div>
  );
}
