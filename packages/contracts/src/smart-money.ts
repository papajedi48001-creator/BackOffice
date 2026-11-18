import { z } from 'zod';

/** Smart Money: the module code used by the registry, the gate and the manager role. */
export const MONEY_MODULE = 'smart-money';

/** หน้า Smart Money a เจ้าหน้าที่ may be given. Rounds 2–4 add `nhso`, `fdh`, `disability`. */
export const moneyPageSchema = z.enum(['dental', 'nhso', 'fdh']);
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

/** One REP or STM workbook as the browser read it: the sheets used, by name, as rows of cells; the server parses it like the legacy parsers. */
export const fdhUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sheets: z.record(z.string().max(100), z.array(z.array(nhsoCellSchema).max(80)).max(30000)).refine((sheets) => Object.keys(sheets).length <= 6, { message: 'too_many_sheets' })
}).strict();
export type FdhUpload = z.infer<typeof fdhUploadSchema>;
