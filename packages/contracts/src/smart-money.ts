import { z } from 'zod';

/** Smart Money: the module code used by the registry, the gate and the manager role. */
export const MONEY_MODULE = 'smart-money';

/** หน้า Smart Money a เจ้าหน้าที่ may be given. Rounds 2–6 add `nhso`, `fdh`, `disability`, `ttm`, `herb`. */
export const moneyPageSchema = z.enum(['dental', 'nhso', 'fdh', 'disability', 'ttm', 'herb']);
export type MoneyPage = z.infer<typeof moneyPageSchema>;

/** One เจ้าหน้าที่ Smart Money and the pages they may open (at least one). */
export const moneyMemberInputSchema = z.object({ personId: z.string().uuid(), pages: z.array(moneyPageSchema).min(1).max(moneyPageSchema.options.length) }).strict();
export type MoneyMemberInput = z.infer<typeof moneyMemberInputSchema>;

/** ลูกหนี้ทันตกรรม: แยกตาม สิทธิการรักษา (`pttype`) or ผังบัญชี (`paccount`); ช่วงเวลา รายวัน or รายเดือน. */
export const dentalGroupSchema = z.enum(['pttype', 'paccount']);
export type DentalGroup = z.infer<typeof dentalGroupSchema>;
export const dentalPeriodSchema = z.enum(['day', 'month']);
export type DentalPeriod = z.infer<typeof dentalPeriodSchema>;

/** Shown for a visit whose สิทธิ has no ผังบัญชี (ลูกหนี้ทันตกรรม); here so client components can use it without `@backoffice/core`. */
export const NO_PACCOUNT = '(ไม่ระบุผังบัญชี)';

/** One cell of a sheet read in the browser: text up to 1,000 characters, a number, true/false, or blank. */
const nhsoCellSchema = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);

/** เงินโอน สปสช.: one report file as the browser read it (first sheet, rows of cells); the server checks it like the legacy parser. */
export const nhsoUploadSchema = z.object({ fileName: z.string().trim().min(1).max(255), aoa: z.array(z.array(nhsoCellSchema).max(80)).max(20000) }).strict();
export type NhsoUpload = z.infer<typeof nhsoUploadSchema>;
export type NhsoCell = z.infer<typeof nhsoCellSchema>;

/** ติดตามกองทุนย่อย FDH: REP (การเบิก) or STM (statement). */
export const fdhKindSchema = z.enum(['rep', 'stm']);
export type FdhKind = z.infer<typeof fdhKindSchema>;
/** ลบเอกสาร FDH: one document (with `docNo`) or every document of a kind; sent in the body so เลขที่เอกสาร stays out of URLs. */
export const fdhRemoveSchema = z.object({ kind: fdhKindSchema, docNo: z.string().regex(/^[A-Za-z0-9_]{1,100}$/).optional() }).strict();
export type FdhRemove = z.infer<typeof fdhRemoveSchema>;

/** One REP or STM workbook as the browser read it (a REP `Detail` row runs to about 120 cells): the sheets used, by name, as rows of cells; the server parses it like the legacy parsers. */
export const fdhUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sheets: z.record(z.string().max(100), z.array(z.array(nhsoCellSchema).max(200)).max(30000)).refine((sheets) => Object.keys(sheets).length <= 6, { message: 'too_many_sheets' })
}).strict();
export type FdhUpload = z.infer<typeof fdhUploadSchema>;

/** Point ฟื้นฟูผู้พิการ (กองทุนฟื้นฟูสมรรถภาพ): one part of a file as the browser read it (the header row and at most 1,500 data rows); one `uploadId` per file. */
export const dpUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  uploadId: z.string().uuid(),
  rows: z.array(z.array(nhsoCellSchema).max(80)).max(1501)
}).strict();
export type DpUpload = z.infer<typeof dpUploadSchema>;
/** ลบข้อมูล Point ฟื้นฟูผู้พิการ of one ปีงบ (พ.ศ.). */
export const dpRemoveSchema = z.object({ fy: z.number().int().min(2500).max(2700) }).strict();
export type DpRemove = z.infer<typeof dpRemoveSchema>;
/** Monitor IMC: one part of the ทะเบียนคนไข้ IMC CSV or the REP individual xlsx (its header rows, then at most 1,500 data rows); one `uploadId` per file. */
export const imcUploadSchema = z.object({
  kind: z.enum(['register', 'rep']),
  fileName: z.string().trim().min(1).max(255),
  uploadId: z.string().uuid(),
  rows: z.array(z.array(nhsoCellSchema).max(80)).max(1502)
}).strict();
export type ImcUpload = z.infer<typeof imcUploadSchema>;

// monitor แพทย์แผนไทย labels (here so client components can show them; the rules live in core `ttm-rules`).
/** กลุ่มสิทธิ in the order of the กลุ่มงาน daily report. */
export const TTM_RIGHT_GROUPS = {
  ofc: 'สิทธิข้าราชการ',
  lgo: 'สิทธิ อปท.ท้องถิ่น',
  uc: 'บัตรทอง (UC)',
  cash: 'ชำระเงินเอง',
  sss: 'ประกันสังคม',
  receipt: 'เบิกได้ (ออกใบเสร็จ)',
  other: 'สิทธิอื่น ๆ'
} as const;
export type TtmRightGroup = keyof typeof TTM_RIGHT_GROUPS;

/** หมวดค่าใช้จ่าย: the charge lines of a แพทย์แผนไทย visit that count; any other line is not counted. */
export const TTM_CATEGORIES = { massage: 'ค่านวด/ประคบ/อบ/หัตถการ', herb: 'ค่ายาสมุนไพร', opd_fee: 'ค่าบริการผู้ป่วยนอก' } as const;
export type TtmCategory = keyof typeof TTM_CATEGORIES;

/** รายบริการ: massage lines split by kind, plus ยาสมุนไพร and the OPD fee. */
export const TTM_KINDS = {
  thai_massage: 'นวด',
  compress: 'ประคบ',
  steam: 'อบสมุนไพร',
  knee: 'พอกเข่า/พอกยา',
  postpartum: 'ดูแลหลังคลอด',
  other_proc: 'หัตถการอื่น ๆ',
  herb: 'จ่ายยาสมุนไพร',
  opd_fee: 'ค่าบริการผู้ป่วยนอก'
} as const;
export type TtmKind = keyof typeof TTM_KINDS;
export type TtmProcedureKind = Exclude<TtmKind, 'herb' | 'opd_fee'>;
