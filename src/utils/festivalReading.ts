import { HDate, HebrewCalendar, Sedra } from '@hebcal/core';
import { getLeyningKeyForEvent } from '@hebcal/leyning';
import { FESTIVAL_OPTIONS, PARASHA_OPTIONS } from '../data/parashaOptions';
import { SPECIAL_SHABBAT_OPTIONS } from './readingPlan';

function parseLocalDate(date: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const localDate = new Date(Number(year), Number(month) - 1, Number(day));
  if (localDate.getFullYear() !== Number(year) || localDate.getMonth() !== Number(month) - 1 ||
      localDate.getDate() !== Number(day)) return undefined;
  return localDate;
}

function getFestivalKeyForDate(date: string): string | undefined {
  const localDate = parseLocalDate(date);
  if (!localDate) return undefined;
  const events = HebrewCalendar.getHolidaysOnDate(new HDate(localDate), true) ?? [];
  for (const event of events) {
    let key = getLeyningKeyForEvent(event, true);
    if (key === 'Sukkot Shabbat Chol ha-Moed' && typeof event.cholHaMoedDay === 'number') {
      key += ` (Day ${event.cholHaMoedDay})`;
    }
    if (key?.startsWith('Rosh Chodesh ') && localDate.getDay() !== 6) {
      key = 'Rosh Chodesh';
    }
    if (FESTIVAL_OPTIONS.some((reading) => reading.readingId === key) ||
        SPECIAL_SHABBAT_OPTIONS.some((reading) => reading.id === key &&
          (key.startsWith('Chanukah Day ') || key === 'Shabbat Rosh Chodesh Chanukah'))) return key;
  }
  return undefined;
}

/** Suggest an Israel-calendar festival reading for the selected local date. */
export function getFestivalReadingForDate(date: string) {
  const key = getFestivalKeyForDate(date);
  return FESTIVAL_OPTIONS.find((reading) => reading.readingId === key);
}

export function getFestivalSpecialForDate(date: string) {
  const key = getFestivalKeyForDate(date);
  return SPECIAL_SHABBAT_OPTIONS.find((reading) => reading.id === key);
}

export function getShabbatParashaForDate(date: string) {
  const localDate = parseLocalDate(date);
  if (!localDate || localDate.getDay() !== 6) return undefined;
  const hdate = new HDate(localDate);
  const result = new Sedra(hdate.getFullYear(), true).lookup(hdate);
  if (result.chag) return undefined;
  return PARASHA_OPTIONS.find((option) => option.readingId === result.parsha.join('-'));
}
