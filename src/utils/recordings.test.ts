import { describe, expect, it } from 'vitest';
import type { RecordingItem } from '../types';
import { getRecordingSection, isDocument, sortRecordings, withRecordingSection } from './recordings';
import { decodeStudentShareToken, encodeStudentShareToken } from './trackerCalculations';

const recording: RecordingItem = {
  id: 'recording', title: 'original.mp3', aliyah: 'עליית ראשון', category: 'shabbat',
  ext: 'mp3', viewUrl: '/audio', visible: false,
};

describe('student recording sections', () => {
  it.each([
    ['shabbat', 'torah'], ['chol', 'torah'], ['haftarah', 'haftarah'],
    ['blessings', 'general'], ['doc', 'torah'],
  ] as const)('keeps the legacy %s designation as %s', (category, section) => {
    expect(getRecordingSection({ ...recording, category })).toBe(section);
  });

  it.each(['torah', 'haftarah', 'general'] as const)('supports %s audio and documents independently of their folders', (section) => {
    const audio = withRecordingSection(recording, section);
    const doc = withRecordingSection({ ...recording, category: 'doc', ext: 'pdf' }, section);
    expect(getRecordingSection(audio)).toBe(section);
    expect(getRecordingSection(doc)).toBe(section);
    expect(doc.category).toBe('doc');
    expect(isDocument(doc)).toBe(true);
    expect(isDocument(audio)).toBe(false);
    expect(audio).toMatchObject({ id: recording.id, visible: false, title: recording.title });
    expect(recording).not.toHaveProperty('section');
  });

  it('preserves weekday Torah classification and normalizes an audio section change', () => {
    expect(withRecordingSection({ ...recording, category: 'chol' }, 'torah').category).toBe('chol');
    expect(withRecordingSection(recording, 'general').category).toBe('blessings');
    expect(withRecordingSection(recording, 'haftarah').category).toBe('haftarah');
    expect(withRecordingSection({ ...recording, category: 'haftarah' }, 'torah').category).toBe('shabbat');
  });

  it('preserves explicit sections in legacy share tokens', () => {
    const token = encodeStudentShareToken({
      id: 'student', name: 'Student', parasha: 'בראשית', haftarah: '', barMitzvahDate: '2027-01-01',
      parashaVerses: 146, skippedVerses: 0, learnedParashaVerses: 0, haftarahVerses: 0, learnedHaftarahVerses: 0,
      portions: [{ ...withRecordingSection({ ...recording, ext: 'pdf' }, 'haftarah'), visible: true }],
    });
    expect(decodeStudentShareToken(token)?.portions?.[0]).toMatchObject({ section: 'haftarah', category: 'doc' });
  });
});

describe('aliyah order', () => {
  it('orders all seven aliyot and maftir by portion label, never filename', () => {
    const labels = ['עליית ראשון', 'עליית שני', 'עליית שלישי', 'עליית רביעי', 'עליית חמישי', 'עליית שישי', 'עליית שביעי', 'מפטיר'];
    const items = labels.map((aliyah, index) => ({ ...recording, id: String(index), aliyah, title: `${8 - index}.mp3` })).reverse();
    const before = [...items];
    expect(sortRecordings(items).map((item) => item.aliyah)).toEqual(labels);
    expect(items).toEqual(before);
  });

  it('keeps custom and duplicate labels stable after known Torah portions', () => {
    const labels = ['Custom B', 'עליית שני', 'עליית ראשון', 'עליית שני', 'Custom A'];
    const items = labels.map((aliyah, index) => ({ ...recording, id: String(index), aliyah }));
    expect(sortRecordings(items).map((item) => item.id)).toEqual(['2', '1', '3', '0', '4']);
  });

  it('supports English and numbered labels and weekday portions', () => {
    expect(sortRecordings(['Third', 'First', 'Second', '7', '4', '6', '5'].map((aliyah) => ({ ...recording, aliyah }))).map((item) => item.aliyah))
      .toEqual(['First', 'Second', 'Third', '4', '5', '6', '7']);
    expect(sortRecordings(['ישראל (חול/מנחה)', 'כהן (חול/מנחה)', 'לוי (חול/מנחה)'].map((aliyah) => ({ ...recording, category: 'chol', aliyah }))).map((item) => item.aliyah))
      .toEqual(['כהן (חול/מנחה)', 'לוי (חול/מנחה)', 'ישראל (חול/מנחה)']);
  });
});
