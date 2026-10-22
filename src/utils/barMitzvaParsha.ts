import { HDate, Sedra, months, parshiot } from '@hebcal/core';
import { PARASHA_META_LIST } from '../data/torahReference';

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

/** Find the Shabbat on or after `date` which has a regular parsha (skips Yom Tov Shabbatot). */
function findParshaShabbat(date: HDate): { hd: HDate; parsha: string[]; parshaHe: string[] } {
  let sat = new HDate(date.onOrAfter(6));
  for (let i = 0; i < 4; i++) {
    const sedra = new Sedra(sat.getFullYear(), true) // Israel calendar;
    const res = sedra.lookup(sat);
    if (!res.chag) {
      return { hd: sat, parsha: res.parsha, parshaHe: res.parsha.map((p) => hebrewParshaName(p)) };
    }
    sat = new HDate(sat.abs() + 7);
  }
  throw new Error('No parsha found');
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
  return build(new HDate(input.day, input.month as number, input.year));
}


