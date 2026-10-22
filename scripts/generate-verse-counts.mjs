/**
 * Generates src/data/verseCounts.ts
 *
 * Data sources:
 *  - @hebcal/leyning: aliyot, maftir, weekday (Mon/Thu) readings, haftarot (Ashkenazi + Sephardi),
 *    joint parashot and holiday readings.
 *  - @hebcal/leyning's numverses.json: number of verses per chapter for the Torah and Prophets books,
 *    used to convert every `chapter:verse` range into absolute verse indices (so ranges can be
 *    merged/unioned at runtime without double counting overlapping readings).
 *  - src/data/sefariaParashaRefs.ts: Hebrew names of the (single) parashot.
 *
 * Usage:  npm run generate:verse-counts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parshiot } from '@hebcal/core';
import * as L from '@hebcal/leyning';
import numverses from '@hebcal/leyning/dist/esm/numverses.json';
import holidayReadings from '@hebcal/leyning/dist/esm/holiday-readings.json';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = resolve(root, 'src/data/verseCounts.ts');
const REFS_TS = resolve(root, 'src/data/sefariaParashaRefs.ts');

const BOOK_BY_NUM = ['', 'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];

// ---- chapter length helpers -------------------------------------------------

/** offsets[book][chapter] = number of verses in all chapters before `chapter` */
const offsets = {};
for (const [book, lens] of Object.entries(numverses)) {
  const off = [0, 0];
  for (let c = 1; c < lens.length; c++) off[c + 1] = off[c] + lens[c];
  offsets[book] = off;
}

function absIndex(book, cv) {
  const [c, v] = cv.split(':').map(Number);
  const lens = numverses[book];
  if (!lens) throw new Error(`Unknown book ${book}`);
  if (!Number.isInteger(c) || !Number.isInteger(v) || c < 1 || c >= lens.length || v < 1 || v > lens[c]) {
    throw new Error(`Invalid verse ${book} ${cv}`);
  }
  return offsets[book][c] + v;
}

function segment(book, b, e) {
  const start = absIndex(book, b);
  const end = absIndex(book, e);
  if (end < start) throw new Error(`Reversed range ${book} ${b}-${e}`);
  return { ref: `${book} ${b}-${e}`, book, start, end, count: end - start + 1 };
}

function checkV(seg, v, label) {
  if (v !== undefined && v !== seg.count) {
    throw new Error(`Verse count mismatch for ${label} ${seg.ref}: computed ${seg.count}, hebcal ${v}`);
  }
}

/** Number of distinct verses covered by a list of segments (union, no double counting) */
function unionCount(segments) {
  const byBook = new Map();
  for (const s of segments) {
    if (!byBook.has(s.book)) byBook.set(s.book, []);
    byBook.get(s.book).push([s.start, s.end]);
  }
  let total = 0;
  for (const ranges of byBook.values()) {
    ranges.sort((a, b) => a[0] - b[0]);
    let [cs, ce] = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const [s, e] = ranges[i];
      if (s <= ce + 1) ce = Math.max(ce, e);
      else {
        total += ce - cs + 1;
        [cs, ce] = [s, e];
      }
    }
    total += ce - cs + 1;
  }
  return total;
}

/** Removes nikud and cantillation marks (the app's catalog uses unvocalized Hebrew names) */
const stripNikud = (s) => s.replace(/[\u0591-\u05C7]/g, '');

function missingHebrew(key) {
  console.warn('No Hebrew name from hebcal for ' + key + ' - using English name');
  return key;
}

const asArray = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);

function haftarahSegments(haft) {
  return asArray(haft).map((h) => {
    const seg = segment(h.k, h.b, h.e);
    checkV(seg, h.v, 'haftarah');
    return seg;
  });
}

// ---- Hebrew names of single parashot (from the app's own refs file) -----------

const refsSrc = readFileSync(REFS_TS, 'utf8');
const heNameByOrder = new Map();
for (const m of refsSrc.matchAll(/order:\s*(\d+),\s*heName:\s*'([^']+)'/g)) {
  heNameByOrder.set(Number(m[1]), m[2]);
}
if (heNameByOrder.size !== 54) throw new Error(`Expected 54 parashot in refs file, found ${heNameByOrder.size}`);

// ---- parashot -----------------------------------------------------------------

const SINGLE_PARASHOT = parshiot;

const JOINT_PARASHOT = [
  ['Vayakhel', 'Pekudei'],
  ['Tazria', 'Metzora'],
  ['Achrei Mot', 'Kedoshim'],
  ['Behar', 'Bechukotai'],
  ['Chukat', 'Balak'],
  ['Matot', 'Masei'],
  ['Nitzavim', 'Vayeilech'],
];

function buildAliyot(map, book, label) {
  const out = {};
  let maftir = null;
  for (const [key, val] of Object.entries(map)) {
    const seg = segment(typeof val.k === 'string' ? val.k : book, val.b ?? val[0], val.e ?? val[1]);
    checkV(seg, val.v, label);
    if (key === 'M') maftir = seg;
    else out[key] = seg;
  }
  return { aliyot: out, maftir };
}

function buildRawAliyot(rec, book) {
  // raw aliyot.json shape: { "1": [begin, end, note?], ... }
  const out = {};
  let maftir = null;
  for (const [key, val] of Object.entries(rec)) {
    const seg = segment(book, val[0], val[1]);
    if (key === 'M') maftir = seg;
    else out[key] = seg;
  }
  return { aliyot: out, maftir };
}

function buildParasha(names) {
  const meta = L.lookupParsha(names.length === 1 ? names[0] : names);
  const book = BOOK_BY_NUM[meta.book];
  const { aliyot, maftir } = buildRawAliyot(meta.fullkriyah, book);
  const weekday = meta.weekday ? Object.values(buildRawAliyot(meta.weekday, book).aliyot) : [];
  const haftarah = haftarahSegments(meta.haft);
  const haftarahSephardi = meta.seph ? haftarahSegments(meta.seph) : haftarah;
  const nums = asArray(meta.num);
  const joint = nums.length > 1;
  const heName = nums.map((n) => heNameByOrder.get(n)).join('-');
  const enName = names.join('-');
  const torah = [...Object.values(aliyot), ...(maftir ? [maftir] : [])];
  return {
    id: enName,
    kind: joint ? 'joint' : 'parasha',
    enName,
    heName,
    parashaOrder: nums,
    israel: true,
    diaspora: true,
    aliyot,
    maftir,
    weekday,
    haftarah,
    haftarahSephardi,
    torahCount: unionCount(torah),
    haftarahCount: unionCount(haftarah),
    haftarahSephardiCount: unionCount(haftarahSephardi),
  };
}

// ---- holidays -----------------------------------------------------------------

// Fast-day readings and non-holiday occasions are intentionally out of scope.
const EXCLUDED_HOLIDAY_KEYS =
  /^(Fast Day|Asara B'Tevet|Ta'anit Esther|Tzom |Erev |Tish'a B'Av|Yom HaAtzma'ut|Shushan Purim|Yom Kippur \(Mincha, )/;
// Per-month Rosh Chodesh keys have the same reading as the generic 'Rosh Chodesh' key.
const MONTHLY_ROSH_CHODESH_KEYS = /^Rosh Chodesh .+/;
// Keys that only modify an ordinary parsha reading (handled separately in a later phase).
const PARASHA_VARIANT_KEYS = /^(Pinchas occurring|Kedoshim following|Masei on|Matot-Masei on|Ki Teitzei with)/;
const SPECIAL_SHABBAT_KEYS = /^Shabbat (HaChodesh|HaGadol|Parah|Shekalim|Shuva|Zachor|Rosh Chodesh|Machar Chodesh)/;

// hebcal only flags Israel-only readings; the diaspora-only ones (second days of Yom Tov, Shmini Atzeret,
// and the diaspora Pesach Chol ha-Moed day keys) are listed here based on getLeyningKeyForEvent().
const DIASPORA_ONLY_KEYS = new Set([
  'Sukkot II', 'Pesach II', 'Pesach VIII', 'Pesach VIII (on Shabbat)', 'Shavuot I', 'Shavuot II',
  'Shavuot II (on Shabbat)', 'Shmini Atzeret', 'Shmini Atzeret (on Shabbat)',
  'Pesach Chol ha-Moed Day 1', 'Pesach Chol ha-Moed Day 2', 'Pesach Chol ha-Moed Day 3',
  'Pesach Chol ha-Moed Day 4', 'Pesach Chol ha-Moed Day 2 on Sunday', 'Pesach Chol ha-Moed Day 3 on Monday',
]);
const ISRAEL_ONLY_KEYS = /^(Shavuot|Pesach (II|III|IV|V|VI) \(CH''M\))$/;

function buildHoliday(key, cholHaMoedDay, idSuffix = '', nameSuffix = { en: '', he: '' }) {
  const israelOnly = ISRAEL_ONLY_KEYS.test(key);
  const lg = L.getLeyningForHolidayKey(key, cholHaMoedDay, israelOnly);
  if (!lg) return null;
  const lgHe = L.getLeyningForHolidayKey(key, cholHaMoedDay, israelOnly, 'he-x-NoNikud');

  const { aliyot, maftir } = buildAliyot(lg.fullkriyah ?? {}, undefined, key);
  const haftarah = haftarahSegments(lg.haft);
  const haftarahSephardi = lg.seph ? haftarahSegments(lg.seph) : haftarah;
  const torah = [...Object.values(aliyot), ...(maftir ? [maftir] : [])];
  let alt = undefined;
  if (lg.alt) {
    const a = buildAliyot(lg.alt, undefined, `${key} (alt)`);
    alt = a.aliyot;
  }
  const hasAliyot = Object.keys(aliyot).length > 0;
  return {
    id: key + idSuffix,
    // Readings without their own aliyot only replace the maftir/haftarah of the regular parasha
    kind: SPECIAL_SHABBAT_KEYS.test(key) || !hasAliyot ? 'special-shabbat' : 'holiday',
    enName: lg.name.en + nameSuffix.en,
    heName: stripNikud(lgHe?.name.he ?? lg.name.he ?? missingHebrew(key)) + nameSuffix.he,
    israel: !DIASPORA_ONLY_KEYS.has(key),
    diaspora: !israelOnly,
    aliyot,
    ...(alt ? { altAliyot: alt } : {}),
    maftir,
    weekday: [],
    haftarah,
    haftarahSephardi,
    torahCount: torah.length ? unionCount(torah) : 0,
    haftarahCount: haftarah.length ? unionCount(haftarah) : 0,
    haftarahSephardiCount: haftarahSephardi.length ? unionCount(haftarahSephardi) : 0,
  };
}
function holidayKeys() {
  // lookupFestival is the only public enumerator of keys, so probe the json via the same module
  return Object.keys(holidayReadings).filter((k) => !EXCLUDED_HOLIDAY_KEYS.test(k) && !PARASHA_VARIANT_KEYS.test(k) && !MONTHLY_ROSH_CHODESH_KEYS.test(k));
}

// ---- serialization ------------------------------------------------------------

const segStr = (s) =>
  `{ ref: ${JSON.stringify(s.ref)}, book: ${JSON.stringify(s.book)}, start: ${s.start}, end: ${s.end}, count: ${s.count} }`;
const segListStr = (list, indent) =>
  list.length === 0 ? '[]' : `[\n${list.map((s) => `${indent}  ${segStr(s)},`).join('\n')}\n${indent}]`;
const aliyotStr = (rec, indent) => {
  const keys = Object.keys(rec);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${indent}  ${JSON.stringify(k)}: ${segStr(rec[k])},`).join('\n')}\n${indent}}`;
};

function entryStr(e) {
  const i = '    ';
  const lines = [
    `    id: ${JSON.stringify(e.id)},`,
    `    kind: ${JSON.stringify(e.kind)},`,
    `    enName: ${JSON.stringify(e.enName)},`,
    `    heName: ${JSON.stringify(e.heName)},`,
  ];
  if (e.parashaOrder) lines.push(`    parashaOrder: ${JSON.stringify(e.parashaOrder)},`);
  lines.push(
    `    israel: ${e.israel},`,
    `    diaspora: ${e.diaspora},`,
    `    aliyot: ${aliyotStr(e.aliyot, i)},`
  );
  if (e.altAliyot) lines.push(`    altAliyot: ${aliyotStr(e.altAliyot, i)},`);
  lines.push(
    `    maftir: ${e.maftir ? segStr(e.maftir) : 'null'},`,
    `    weekday: ${segListStr(e.weekday, i)},`,
    `    haftarah: ${segListStr(e.haftarah, i)},`,
    `    haftarahSephardi: ${segListStr(e.haftarahSephardi, i)},`,
    `    torahCount: ${e.torahCount},`,
    `    haftarahCount: ${e.haftarahCount},`,
    `    haftarahSephardiCount: ${e.haftarahSephardiCount},`
  );
  return `  {\n${lines.join('\n')}\n  },`;
}

// ---- main ---------------------------------------------------------------------

const entries = [];
for (const name of SINGLE_PARASHOT) entries.push(buildParasha([name]));
for (const pair of JOINT_PARASHOT) entries.push(buildParasha(pair));
for (const key of holidayKeys()) {
  if (key === 'Sukkot Shabbat Chol ha-Moed') {
    // The maftir depends on which day of Chol ha-Moed the Shabbat falls on
    for (let day = 1; day <= 5; day++) {
      entries.push(buildHoliday(key, day, ' (Day ' + day + ')', { en: ' (Day ' + day + ')', he: ' (\u05d9\u05d5\u05dd ' + 'אבגדה'[day - 1] + '׳)' }));
    }
    continue;
  }
  const e = buildHoliday(key, undefined);
  if (e) entries.push(e);
}

const header = `/* eslint-disable */
// AUTO-GENERATED by scripts/generate-verse-counts.mjs - DO NOT EDIT BY HAND.
// Run \`npm run generate:verse-counts\` to regenerate.
//
// Verse ranges are stored as absolute verse indices within each book (1 = first verse of the book),
// so any set of readings can be merged without double counting overlaps (e.g. 7th aliyah + maftir,
// or Monday/Thursday reading + 1st aliyah). See src/utils/verseCounts.ts.

/** A contiguous passage in a single book. \`start\`/\`end\` are absolute verse indices within \`book\`. */
export interface VerseSegment {
  /** Sefaria-style reference, e.g. "Genesis 1:1-2:3" */
  ref: string;
  book: string;
  start: number;
  end: number;
  count: number;
}

export type VerseReadingKind = 'parasha' | 'joint' | 'holiday' | 'special-shabbat';

export interface VerseReadingData {
  /** Stable id: hebcal parsha name (e.g. "Bereshit", "Vayakhel-Pekudei") or holiday reading key */
  id: string;
  kind: VerseReadingKind;
  enName: string;
  /** Hebrew name without nikud */
  heName: string;
  /** Parasha order number(s) 1..54 (two entries for a joint parasha) */
  parashaOrder?: number[];
  /** Is this reading used on the Israel / diaspora schedule */
  israel: boolean;
  diaspora: boolean;
  /** Shabbat/Yom Tov aliyot keyed "1".."7" (maftir is separate) */
  aliyot: Record<string, VerseSegment>;
  /** Alternative division of aliyot (e.g. Chanukah) */
  altAliyot?: Record<string, VerseSegment>;
  maftir: VerseSegment | null;
  /** Monday/Thursday (and Shabbat Mincha) reading: 3 aliyot */
  weekday: VerseSegment[];
  /** Ashkenazi haftarah (one or more segments) */
  haftarah: VerseSegment[];
  /** Sephardi haftarah; same as \`haftarah\` when there is no difference */
  haftarahSephardi: VerseSegment[];
  /** Distinct Torah verses in all aliyot + maftir */
  torahCount: number;
  haftarahCount: number;
  haftarahSephardiCount: number;
}

export const VERSE_READINGS: VerseReadingData[] = [
`;

writeFileSync(OUT, `${header}${entries.map(entryStr).join('\n')}\n];\n`);
console.log(`Wrote ${entries.length} readings to ${OUT}`);
