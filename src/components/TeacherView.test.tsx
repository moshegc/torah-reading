import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherView } from './TeacherView';
import type { StudentProfile } from '../types';

afterEach(() => vi.unstubAllGlobals());

function renderView(syncStatus: 'saved' | 'saving' | 'error' = 'saved', pendingDeletionCount = 0, students: StudentProfile[] = []) {
  vi.stubGlobal('window', { location: { href: 'https://example.com/?teacher=test' } });
  return renderToStaticMarkup(
    <TeacherView
      teacherId="test"
      teacherToken="test-token"
      students={students}
      onChangeLibrary={async () => true}
      pendingDeletionCount={pendingDeletionCount}
      onSetDefaultHaftarahTradition={vi.fn()}
      syncStatus={syncStatus}
      syncErrorMessage={null}
      lastSyncedAt={null}
      onForceSync={async () => true}
      onLogout={vi.fn()}
      onUpdateStudent={vi.fn()}
      onAddStudent={vi.fn()}
      onPreviewStudent={vi.fn()}
    />
  );
}

function renderHeader(syncStatus: 'saved' | 'saving' | 'error' = 'saved', pendingDeletionCount = 0) {
  return renderView(syncStatus, pendingDeletionCount).match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1];
}

describe('student archive', () => {
  it('shows legacy and explicitly active students but hides archived students from the default cards', () => {
    const student: StudentProfile = {
      id: 'legacy', name: 'Legacy student', parasha: 'Test', haftarah: 'Test',
      barMitzvahDate: '2027-04-01', parashaVerses: 100, skippedVerses: 0,
      learnedParashaVerses: 10, haftarahVerses: 30, learnedHaftarahVerses: 5, portions: [],
    };
    const html = renderView('saved', 0, [
      student,
      { ...student, id: 'active', name: 'Active student', archived: false },
      { ...student, id: 'archived', name: 'Archived student', archived: true },
    ]);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)![1];
    expect(main).toContain('Legacy student');
    expect(main).toContain('Active student');
    expect(main).not.toContain('Archived student');
    expect(main).toContain('העבר את התלמיד Legacy student לארכיון');
    expect(main).not.toContain('מחק');
    expect(html).toContain('ארכיון (1)');
  });
});

describe('student start date', () => {
  it('shows the selected study start on the student card instead of the suggestion', () => {
    const html = renderView('saved', 0, [{
      id: 'test', name: 'Test student', parasha: 'בראשית', haftarah: 'בראשית',
      barMitzvahDate: '2027-06-15', studyStartDate: '2026-11-07',
      parashaVerses: 100, skippedVerses: 0, learnedParashaVerses: 0,
      haftarahVerses: 20, learnedHaftarahVerses: 0, portions: [],
    }]);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)![1];
    expect(main).toContain('תחילת לימוד:');
    expect(main).toContain('07/11/2026');
    expect(main).not.toContain('15/10/2026');
  });
});

describe('teacher header', () => {
  it('groups primary actions and account links into two ordered RTL rows', () => {
    const header = renderHeader();
    const primary = header.match(/aria-label="פעולות מורה"[^>]*>([\s\S]*?)<\/div>/)![1];
    expect(primary).toContain('תלמיד חדש');
    expect(primary).toContain('העלאת תוכן');
    expect(primary).toContain('<select');
    expect(primary.indexOf('תלמיד חדש')).toBeLessThan(primary.indexOf('העלאת תוכן'));
    expect(primary.indexOf('העלאת תוכן')).toBeLessThan(primary.indexOf('<select'));
    expect(primary).toContain('נשמר');
    expect(primary.indexOf('</select>')).toBeLessThan(primary.indexOf('נשמר'));
    expect(primary).not.toContain('יציאה');
    expect(primary).not.toContain('אודות');
    const secondary = header.match(/aria-label="חשבון ומידע"[^>]*>([\s\S]*?)<\/div>/)![1];
    expect(secondary).toContain('יציאה');
    expect(secondary).toContain('אודות');
    expect(secondary.indexOf('יציאה')).toBeLessThan(secondary.indexOf('אודות'));
    expect(header).toMatch(/aria-label="חשבון ומידע" class="w-full flex items-center justify-between gap-2"/);
    expect(secondary).not.toContain('נשמר');
    expect(header).not.toContain('אורכי הפטרות');
    expect(header).not.toContain('טבלת');
    expect(header).toContain('נשמר');
  });

  it('retains save errors, settings access and pending deletion notices', () => {
    const header = renderHeader('error', 2);
    expect(header).toContain('שגיאה בשמירה');
    expect(header).toContain('סטטוס שמירה והגדרות Google Picker');
    expect(header).toContain('(2 ממתינים למחיקה)');
  });

  it('disables uploads while saving', () => {
    const header = renderHeader('saving');
    expect(header).toContain('שומר...');
    expect(header).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?העלאת תוכן/);
  });
});
