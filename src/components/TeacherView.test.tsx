import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherView } from './TeacherView';

afterEach(() => vi.unstubAllGlobals());

function renderHeader(syncStatus: 'saved' | 'saving' | 'error' = 'saved', pendingDeletionCount = 0) {
  vi.stubGlobal('window', { location: { href: 'https://example.com/?teacher=test' } });
  const html = renderToStaticMarkup(
    <TeacherView
      teacherId="test"
      teacherToken="test-token"
      students={[]}
      haftarotMap={{ 'בראשית': 31 }}
      onChangeLibrary={async () => true}
      pendingDeletionCount={pendingDeletionCount}
      onSetDefaultHaftarahTradition={vi.fn()}
      syncStatus={syncStatus}
      syncErrorMessage={null}
      lastSyncedAt={null}
      onForceSync={async () => true}
      onLogout={vi.fn()}
      onSetHaftarahLength={vi.fn()}
      onUpdateStudent={vi.fn()}
      onAddStudent={vi.fn()}
      onDeleteStudent={vi.fn()}
      onPreviewStudent={vi.fn()}
    />
  );
  return html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1];
}

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
