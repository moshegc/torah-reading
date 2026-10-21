export interface RecordingItem {
  id: string;
  title: string;
  aliyah: string;
  category: 'shabbat' | 'chol' | 'haftarah' | 'blessings';
  ext: 'm4a' | 'aac' | 'mp3';
  viewUrl: string;
  demoPattern?: number[];
}

export interface ParashaFolder {
  id: string;
  name: string;
  book: 'בראשית' | 'שמות' | 'ויקרא' | 'במדבר' | 'דברים' | 'מועדים וברכות';
  folderUrl: string;
  recordings: RecordingItem[];
}

export interface StudentProfile {
  id: string;
  name: string;
  parasha: string;
  haftarah: string;
  barMitzvahDate: string;
  totalVerses: number;
  learnedVerses: number;
  defaultSemitones: number;
}

export const ROOT_DRIVE_FOLDER_ID = '0B6cVWsWs-t94Y2xzWnJaWlF0ZXc';
export const ROOT_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/0B6cVWsWs-t94Y2xzWnJaWlF0ZXc?resourcekey=0-74NHOzXbUQNLQVKYpF9CNQ';
export const STUDENT_TRACKER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PiuEGpkxS66oqIyhltwVuVJ480ygBVuQviqkbbIoDZE/edit?usp=drivesdk';

export const STUDENTS: StudentProfile[] = [
  { id: 'talia', name: 'טליה', parasha: 'חיי שרה', haftarah: 'חיי שרה', barMitzvahDate: '07/11/2026', totalVerses: 137, learnedVerses: 137, defaultSemitones: 4 },
  { id: 'itai', name: 'איתי נקלר (ויינברג)', parasha: 'תולדות', haftarah: 'תולדות', barMitzvahDate: '07/11/2026', totalVerses: 21, learnedVerses: 13, defaultSemitones: 3 },
  { id: 'mila', name: 'מילה בן-ארי', parasha: 'ויצא', haftarah: 'ויצא', barMitzvahDate: '21/11/2026', totalVerses: 76, learnedVerses: 69, defaultSemitones: 4 },
  { id: 'boaz', name: 'בועז תומסיס', parasha: 'שמות', haftarah: 'שמות א', barMitzvahDate: '02/01/2027', totalVerses: 40, learnedVerses: 11, defaultSemitones: 3 },
  { id: 'brown', name: 'בראון', parasha: 'משפטים', haftarah: 'מחר חודש', barMitzvahDate: '06/02/2027', totalVerses: 100, learnedVerses: 72, defaultSemitones: 4 },
  { id: 'gelbert', name: 'גלברט', parasha: 'תזריע', haftarah: 'תזריע', barMitzvahDate: '10/04/2027', totalVerses: 89, learnedVerses: 0, defaultSemitones: 5 },
  { id: 'maayan', name: 'מעיין שפילר', parasha: 'בהעלותך', haftarah: 'בהעלותך', barMitzvahDate: '19/06/2027', totalVerses: 43, learnedVerses: 0, defaultSemitones: 4 }
];

export const PARASHA_CATALOG: ParashaFolder[] = [
  {
    id: '0B6cVWsWs-t94Y2xzWnJaWlF0ZXc',
    name: 'ברכות וטעמי המקרא',
    book: 'מועדים וברכות',
    folderUrl: ROOT_DRIVE_FOLDER_URL,
    recordings: [
      { id: '0B6cVWsWs-t94X0JBNXV1TmxTaDQ', title: 'ברכות התורה.aac', aliyah: 'ברכות התורה', category: 'blessings', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94X0JBNXV1TmxTaDQ/view?usp=drivesdk&resourcekey=0-5f1ErdBd65p6uQq5HvzzEg' },
      { id: '0B6cVWsWs-t94UVVGYXN2RkJPQVk', title: 'טעמים סימנים.aac', aliyah: 'טעמי המקרא (סימנים)', category: 'blessings', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94UVVGYXN2RkJPQVk/view?usp=drivesdk&resourcekey=0-Hovzjl6uhFezqzfth_05BA' },
      { id: '0B6cVWsWs-t94TkJCSGN4cmhuWVk', title: 'טעמים - הפטרה.aac', aliyah: 'טעמי ההפטרה', category: 'haftarah', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94TkJCSGN4cmhuWVk/view?usp=drivesdk&resourcekey=0-0ycSFGx3oKMW-UlMwq9jew' },
      { id: '0B6cVWsWs-t94WXFvbEdZM2hiVkk', title: 'ברכת הפטרה.aac', aliyah: 'ברכה לפני ההפטרה', category: 'blessings', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94WXFvbEdZM2hiVkk/view?usp=drivesdk&resourcekey=0-tHwbf1uiFz9d8VfWokCJpQ' },
      { id: '0B6cVWsWs-t94RDlPLV9uYkU5UVk', title: 'ברכות אחרי ההפטרה.aac', aliyah: 'ברכות אחרי ההפטרה', category: 'blessings', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94RDlPLV9uYkU5UVk/view?usp=drivesdk&resourcekey=0-66cOSIS76Y_MzJuTWqdUcA' }
    ]
  },
  {
    id: '1PLrV10rRVrtBIA5MCooWyiEMCwwdPA-W',
    name: 'חיי שרה',
    book: 'בראשית',
    folderUrl: 'https://drive.google.com/drive/folders/1PLrV10rRVrtBIA5MCooWyiEMCwwdPA-W',
    recordings: [
      { id: '1LW3UZKaXTEg0gXLcSdWDqH53TW-X-A4x', title: '1-חיי שרה - ראשון.aac', aliyah: 'ראשון', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1LW3UZKaXTEg0gXLcSdWDqH53TW-X-A4x/view?usp=drivesdk' },
      { id: '1-tt0P2SwKEJ4h4KYuKZ3CnsoVXIYGnWT', title: '2-חיי שרה - שני.aac', aliyah: 'שני', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1-tt0P2SwKEJ4h4KYuKZ3CnsoVXIYGnWT/view?usp=drivesdk' },
      { id: '10H_ccVPwYI_vMxf0TRMWEh4C03btXh35', title: '3-חיי שרה - שלישי.aac', aliyah: 'שלישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/10H_ccVPwYI_vMxf0TRMWEh4C03btXh35/view?usp=drivesdk' },
      { id: '1eWD05PnIXtrO9DMc0gkds8yQvDoKHn7I', title: '4-חיי שרה - רביעי.aac', aliyah: 'רביעי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1eWD05PnIXtrO9DMc0gkds8yQvDoKHn7I/view?usp=drivesdk' },
      { id: '1rlFEBevZIgHIuInjCxlgy35Wy8CQo94S', title: 'חיי שרה - הפטרה .m4a', aliyah: 'הפטרה', category: 'haftarah', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1rlFEBevZIgHIuInjCxlgy35Wy8CQo94S/view?usp=drivesdk' }
    ]
  },
  {
    id: '0B6cVWsWs-t94cXFCaE1iRmZjQm8',
    name: 'תולדות',
    book: 'בראשית',
    folderUrl: 'https://drive.google.com/drive/folders/0B6cVWsWs-t94cXFCaE1iRmZjQm8?resourcekey=0-8tYiOdvUZl2i8tqYt2NBFg',
    recordings: [
      { id: '0B6cVWsWs-t94MEdURjU0TEE4VW8', title: 'תולדות - ראשון.aac', aliyah: 'ראשון', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94MEdURjU0TEE4VW8/view?usp=drivesdk&resourcekey=0-5PM9swB6RRGXu2s1TDLtJw' },
      { id: '0B6cVWsWs-t94bllGQ2Z1QmpLeEk', title: 'תולדות - שלישי.aac', aliyah: 'שלישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94bllGQ2Z1QmpLeEk/view?usp=drivesdk&resourcekey=0-CWmnyrSbPsqXxKFckzgjcg' },
      { id: '0B6cVWsWs-t94RzV1VzBxQmtBSDQ', title: 'תולדות - חמישי.aac', aliyah: 'חמישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94RzV1VzBxQmtBSDQ/view?usp=drivesdk&resourcekey=0-hknMRXmuCzlLJyrCJPNKMA' },
      { id: '0B6cVWsWs-t94dGk0eFltTjRvRlE', title: 'תולדות - שישי.aac', aliyah: 'שישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94dGk0eFltTjRvRlE/view?usp=drivesdk&resourcekey=0-hgexrDvV2lKMZ_K-A7ZX5Q' },
      { id: '0B6cVWsWs-t94TFZETW5fNTZtV3M', title: 'תולדות - שביעי.aac', aliyah: 'שביעי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/0B6cVWsWs-t94TFZETW5fNTZtV3M/view?usp=drivesdk&resourcekey=0-41PLR4O2hIrev6FhAFlEKg' }
    ]
  },
  {
    id: '1X-cwMo2op6aAcjH-YuD7i4zRZ2h1aP5r',
    name: 'ויצא',
    book: 'בראשית',
    folderUrl: 'https://drive.google.com/drive/folders/1X-cwMo2op6aAcjH-YuD7i4zRZ2h1aP5r',
    recordings: [
      { id: '1UlZzy-yFL_7XSV0QcVTXhNJfDkuAGocl', title: 'ויצא - ראשון.aac', aliyah: 'ראשון', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1UlZzy-yFL_7XSV0QcVTXhNJfDkuAGocl/view?usp=drivesdk' },
      { id: '1lgP8IdGbvLAel3VQjVAMlTPyUc1999Wq', title: 'ויצא - שני.m4a', aliyah: 'שני', category: 'shabbat', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1lgP8IdGbvLAel3VQjVAMlTPyUc1999Wq/view?usp=drivesdk' },
      { id: '1eMtCP38L1_JHbv38oiHTmB3tT8ILUg3s', title: 'ויצא - שלישי.m4a', aliyah: 'שלישי', category: 'shabbat', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1eMtCP38L1_JHbv38oiHTmB3tT8ILUg3s/view?usp=drivesdk' },
      { id: '1-cP8ubkgu7ULySJQZzN7tFkfKkxxCi-t', title: 'ויצא - רביעי.m4a', aliyah: 'רביעי', category: 'shabbat', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1-cP8ubkgu7ULySJQZzN7tFkfKkxxCi-t/view?usp=drivesdk' },
      { id: '1JGP7uJtzbq3am0XHXqZxiEeitANV1j1c', title: 'ויצא - שביעי.m4a', aliyah: 'שביעי', category: 'shabbat', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1JGP7uJtzbq3am0XHXqZxiEeitANV1j1c/view?usp=drivesdk' }
    ]
  },
  {
    id: '1BJfZo9E2T5b4W8sajosOlWhRfAC0u9Vq',
    name: 'שמות',
    book: 'שמות',
    folderUrl: 'https://drive.google.com/drive/folders/1BJfZo9E2T5b4W8sajosOlWhRfAC0u9Vq',
    recordings: [
      { id: '1fEzFpkJ2f6W0bF1ZCHszKekz3np4cdk-', title: 'שמות - כהן.m4a', aliyah: 'כהן (חול/מנחה)', category: 'chol', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1fEzFpkJ2f6W0bF1ZCHszKekz3np4cdk-/view?usp=drivesdk' },
      { id: '1DuSPNNngZEbQ8gVMP00KpS7yGsfe1LWY', title: 'שמות - לוי.m4a', aliyah: 'לוי (חול/מנחה)', category: 'chol', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1DuSPNNngZEbQ8gVMP00KpS7yGsfe1LWY/view?usp=drivesdk' },
      { id: '15fUjiON7mPAKK3xZQRzEFwXvRQCWVBPB', title: 'שמות - ישראל.m4a', aliyah: 'ישראל (חול/מנחה)', category: 'chol', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/15fUjiON7mPAKK3xZQRzEFwXvRQCWVBPB/view?usp=drivesdk' },
      { id: '1_qotEIKp9pINyCECWKbzVNtI94Qcz4at', title: 'שמות - ראשון.aac', aliyah: 'ראשון', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1_qotEIKp9pINyCECWKbzVNtI94Qcz4at/view?usp=drivesdk' },
      { id: '14AAfilTb3yBaBPAkARdaz9uDVZ1SlbHQ', title: 'שמות - שני.aac', aliyah: 'שני', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/14AAfilTb3yBaBPAkARdaz9uDVZ1SlbHQ/view?usp=drivesdk' },
      { id: '1vT2QO6ETREsdlbkiBc4Ckhq5SXkSsCpe', title: 'שמות - שלישי.aac', aliyah: 'שלישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1vT2QO6ETREsdlbkiBc4Ckhq5SXkSsCpe/view?usp=drivesdk' },
      { id: '1LSntcQO1k97wOCfcg5IrMR7vsQYHi-re', title: 'שמות - רביעי.aac', aliyah: 'רביעי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1LSntcQO1k97wOCfcg5IrMR7vsQYHi-re/view?usp=drivesdk' },
      { id: '1wBDeBJ8Ch9ynJx0xYUkwxgD0M1rB3CCX', title: 'שמות - חמישי.aac', aliyah: 'חמישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1wBDeBJ8Ch9ynJx0xYUkwxgD0M1rB3CCX/view?usp=drivesdk' },
      { id: '1F0v9TvEwRAojrz0KMLjVeQxicnz1529Q', title: 'שמות - שישי.aac', aliyah: 'שישי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1F0v9TvEwRAojrz0KMLjVeQxicnz1529Q/view?usp=drivesdk' },
      { id: '1PtL-x8sctjHuh83ODdd6GS4f6-Cje5Yp', title: 'שמות - שביעי.aac', aliyah: 'שביעי', category: 'shabbat', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1PtL-x8sctjHuh83ODdd6GS4f6-Cje5Yp/view?usp=drivesdk' },
      { id: '1L2FcQLm4WcVsFrkyY7FroVa2QYiK4A3h', title: 'שמות - הפטרה.aac', aliyah: 'הפטרה', category: 'haftarah', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1L2FcQLm4WcVsFrkyY7FroVa2QYiK4A3h/view?usp=drivesdk' }
    ]
  },
  {
    id: '1b-AJBOdGQWctrDdHHWMVMd0EMbJLiNzl',
    name: 'משפטים',
    book: 'שמות',
    folderUrl: 'https://drive.google.com/drive/folders/1b-AJBOdGQWctrDdHHWMVMd0EMbJLiNzl',
    recordings: [
      { id: '1b2g7twQh5rxdw8ynweg7VKmb1WZkdZUq', title: 'משפטים - ראשון חול.aac', aliyah: 'ראשון חול (כהן)', category: 'chol', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1b2g7twQh5rxdw8ynweg7VKmb1WZkdZUq/view?usp=drivesdk' },
      { id: '1b3tBgHMfpCsHYimA9KiP1FttgtXZsb3p', title: 'משפטים - שני חול.aac', aliyah: 'שני חול (לוי)', category: 'chol', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1b3tBgHMfpCsHYimA9KiP1FttgtXZsb3p/view?usp=drivesdk' },
      { id: '1b1FkhuTpq7ZFwosMvfLwpaLuUseHolO6', title: 'משפטים - שלישי חול.aac', aliyah: 'שלישי חול (ישראל)', category: 'chol', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1b1FkhuTpq7ZFwosMvfLwpaLuUseHolO6/view?usp=drivesdk' }
    ]
  },
  {
    id: '1cybXh4ljUqb0yI-kh94Ou2etQbySnzTb',
    name: 'תצווה',
    book: 'שמות',
    folderUrl: 'https://drive.google.com/drive/folders/1cybXh4ljUqb0yI-kh94Ou2etQbySnzTb',
    recordings: [
      { id: '1cdUf3mFPylYUx0FiyZeQVz58jJ1sr7Zl', title: 'תצווה - כהן.m4a', aliyah: 'כהן (חול/מנחה)', category: 'chol', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1cdUf3mFPylYUx0FiyZeQVz58jJ1sr7Zl/view?usp=drivesdk' },
      { id: '1tghb-e8D6pvyIFOEdU3BOLeN4wCWjnh6', title: 'תצווה - לוי.m4a', aliyah: 'לוי (חול/מנחה)', category: 'chol', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1tghb-e8D6pvyIFOEdU3BOLeN4wCWjnh6/view?usp=drivesdk' },
      { id: '1yQ8iev_cOFqgOcMMyYNFEQn7D4uLXSbG', title: 'תצווה - ישראל.m4a', aliyah: 'ישראל (חול/מנחה)', category: 'chol', ext: 'm4a', viewUrl: 'https://drive.google.com/file/d/1yQ8iev_cOFqgOcMMyYNFEQn7D4uLXSbG/view?usp=drivesdk' }
    ]
  },
  {
    id: '1CFk7x5P-TNtZojqiMckSlA4w1ll1XpFC',
    name: 'לך לך',
    book: 'בראשית',
    folderUrl: 'https://drive.google.com/drive/folders/1CFk7x5P-TNtZojqiMckSlA4w1ll1XpFC',
    recordings: [
      { id: '1FhVUqlU8Fqv64tszEmRcb5_vdA3eXZgd', title: 'לך לך - שביעי.mp3', aliyah: 'שביעי', category: 'shabbat', ext: 'mp3', viewUrl: 'https://drive.google.com/file/d/1FhVUqlU8Fqv64tszEmRcb5_vdA3eXZgd/view?usp=drivesdk' },
      { id: '1I8J_JUF-Mn3q9nG9VpjLd7b9LiM5A8Xo', title: 'לך לך - הפטרה.aac', aliyah: 'הפטרה', category: 'haftarah', ext: 'aac', viewUrl: 'https://drive.google.com/file/d/1I8J_JUF-Mn3q9nG9VpjLd7b9LiM5A8Xo/view?usp=drivesdk' }
    ]
  }
];
