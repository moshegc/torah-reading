import { HDate, getSedra, months, parshiot } from '@hebcal/core';
import { PARASHA_META_LIST } from '../data/torahReference';
import { findParashaOption } from '../data/parashaOptions';
import { getFestivalReadingForDate, getFestivalSpecialForDate, getShabbatParashaForDate } from './festivalReading';

export interface ReadingDateChoice {
  date: string;
  name: string;
  specialId?: string;
  specialName?: string;
}

export function localDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Reading choices only when a festival occurs between the birthday and the first Shabbat. */
export function getBarMitzvaReadingChoices(info: BarMitzvaInfo): { festival: ReadingDateChoice; shabbat: ReadingDateChoice } | null {
  let festival: ReadingDateChoice | undefined;
  const firstShabbat = new HDate(info.barMitzvaHDate.onOrAfter(6));
  for (let day = info.barMitzvaHDate.abs(); day <= firstShabbat.abs(); day++) {
    const date = localDateISO(new HDate(day).greg());
    const reading = getFestivalReadingForDate(date);
    if (reading) {
      festival = { date, name: reading.name };
      break;
    }
    const special = getFestivalSpecialForDate(date);
    const parasha = special && getShabbatParashaForDate(date);
    if (special && parasha) {
      festival = { date, name: parasha.name, specialId: special.id, specialName: special.label };
      break;
    }
  }
  if (!festival) return null;
  const date = localDateISO(firstShabbat.greg());
  const holiday = getFestivalReadingForDate(date);
  if (holiday) return { festival, shabbat: { date, name: holiday.name } };
  const parasha = getShabbatParashaForDate(date);
  if (parasha) {
    const special = getFestivalSpecialForDate(date);
    return {
      festival,
      shabbat: { date, name: parasha.name, specialId: special?.id, specialName: special?.label },
    };
  }
  throw new Error('No reading found for the first Shabbat');
}

export interface BarMitzvaInfo {
  /** Hebrew date of birth used for the calculation */
  birthHDate: HDate;
  /** Hebrew date of the 13th birthday (bar mitzva date) */
  barMitzvaHDate: HDate;
  /** Gregorian date of the 13th birthday */
  barMitzvaDate: Date;
  /** The Shabbat on or after the bar mitzva date that has a regular parsha */
  shabbatHDate: HDate;
  shabbatDate: Date;
  /** Parsha name(s) in English transliteration, e.g. ["Vayera"] or ["Vayakhel","Pekudei"] */
  parsha: string[];
  /** Parsha name(s) in Hebrew (spelled as in PARASHA_META_LIST) */
  parshaHe: string[];
}

export interface HebrewDateInput {
  day: number;
  /** Month number as in @hebcal/core `months` (1 = Nisan ... 7 = Tishrei, 12 = Adar / Adar I, 13 = Adar II) or a month name string */
  month: number | string;
  year: number;
}

const BAR_MITZVA_AGE = 13;

/**
 * Hebrew date of the bar mitzva for the given Hebrew birth date.
 * Handles Adar / leap-year rules:
 *  - Born in Adar (non-leap) -> Adar II if the bar mitzva year is leap
 *  - Born in Adar I (leap)   -> Adar I if leap year, otherwise Adar
 *  - Born in Adar II (leap)  -> Adar (or Adar II if leap)
 * and 30 Cheshvan / 30 Kislev / 30 Shevat... fall back to the last day available.
 */
export function getBarMitzvaHDate(birth: HDate): HDate {
  const year = birth.getFullYear() + BAR_MITZVA_AGE;
  const leapTarget = HDate.isLeapYear(year);
  const leapBirth = HDate.isLeapYear(birth.getFullYear());
  let month = birth.getMonth();

  if (month === months.ADAR_II || (month === months.ADAR_I && !leapBirth)) {
    month = leapTarget ? months.ADAR_II : months.ADAR_I;
  }

  const dim = HDate.daysInMonth(month, year);
  return new HDate(Math.min(birth.getDate(), dim), month, year);
}

/** Find the Shabbat on or after `date` which has a regular parsha. */
function findParshaShabbat(date: HDate): { hd: HDate; parsha: string[]; parshaHe: string[] } {
  let sat = new HDate(date.onOrAfter(6));
  for (let i = 0; i < 4; i++) {
    const sedra = getSedra(sat.getFullYear(), true);
    const res = sedra.lookup(sat);
    if (!res.chag) {
      return { hd: sat, parsha: res.parsha, parshaHe: res.parsha.map((p) => hebrewParshaName(p)) };
    }
    sat = new HDate(sat.abs() + 7);
  }
  throw new Error('No parsha found');
}

/** Find the next date the selected reading occurs in the Israel calendar, including today. */
export function nextParashaReadingDate(name: string, from: Date = new Date()): Date | null {
  const option = findParashaOption(name);
  if (!option) return null;

  const today = new HDate(from);
  const startYear = today.getFullYear();
  const names = option.order.map((order) => parshiot[order - 1]);
  // Singles and doubles are distinct reading plans. Some doubles recur only after several years.
  for (let year = startYear; year <= startYear + 19; year++) {
    const reading = option.readingId === 'Vezot Haberakhah'
      ? new HDate(22, months.TISHREI, year) // Simchat Torah in Israel, not a regular Shabbat reading.
      : getSedra(year, true).find(names);
    if (reading && reading.abs() >= today.abs()) return reading.greg();
  }
  return null;
}

function hebrewParshaName(name: string): string {
  // hebcal's parshiot and PARASHA_META_LIST share the same canonical order, which
  // lets us use the spelling of the app's own catalog.
  const idx = parshiot.indexOf(name);
  return idx >= 0 && PARASHA_META_LIST[idx] ? PARASHA_META_LIST[idx].name : name;
}

function build(birth: HDate, boy = true): BarMitzvaInfo {
  void boy;
  const bm = getBarMitzvaHDate(birth);
  const { hd, parsha, parshaHe } = findParshaShabbat(bm);
  return {
    birthHDate: birth,
    barMitzvaHDate: bm,
    barMitzvaDate: bm.greg(),
    shabbatHDate: hd,
    shabbatDate: hd.greg(),
    parsha,
    parshaHe,
  };
}

/**
 * Calculate from a Gregorian date of birth.
 * @param afterSunset true if the child was born after nightfall (Hebrew day starts at sunset, so the Hebrew date is the next day)
 */
export function barMitzvaFromGregorian(dob: Date, afterSunset = false): BarMitzvaInfo {
  const d = new Date(dob.getFullYear(), dob.getMonth(), dob.getDate());
  const hd = new HDate(d);
  return build(afterSunset ? hd.next() : hd);
}

/** Calculate from a Hebrew date of birth. */
export function barMitzvaFromHebrew(input: HebrewDateInput): BarMitzvaInfo {
  const date = new HDate(input.day, input.month as number, input.year);
  if (!Number.isInteger(input.day) || !Number.isInteger(input.year) ||
      input.year < 5000 || input.year > 6000 ||
      date.getDate() !== input.day || date.getFullYear() !== input.year ||
      (typeof input.month === 'number' && date.getMonth() !== input.month) ||
      (input.month === months.ADAR_II && !HDate.isLeapYear(input.year))) {
    throw new Error('Invalid Hebrew birth date');
  }
  return build(date);
}
