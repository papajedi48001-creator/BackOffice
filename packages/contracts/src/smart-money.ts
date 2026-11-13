import { z } from 'zod';

/** Smart Money: the module code used by the registry, the gate and the manager role. */
export const MONEY_MODULE = 'smart-money';

/** หน้า Smart Money a เจ้าหน้าที่ may be given. Rounds 2–4 add `nhso`, `fdh`, `disability`. */
export const moneyPageSchema = z.enum(['dental']);
export type MoneyPage = z.infer<typeof moneyPageSchema>;

/** One เจ้าหน้าที่ Smart Money and the pages they may open (at least one). */
export const moneyMemberInputSchema = z.object({ personId: z.string().uuid(), pages: z.array(moneyPageSchema).min(1).max(4) }).strict();
export type MoneyMemberInput = z.infer<typeof moneyMemberInputSchema>;

/** ลูกหนี้ทันตกรรม: แยกตาม สิทธิการรักษา (`pttype`) or ผังบัญชี (`paccount`); ช่วงเวลา รายวัน or รายเดือน. */
export const dentalGroupSchema = z.enum(['pttype', 'paccount']);
export type DentalGroup = z.infer<typeof dentalGroupSchema>;
export const dentalPeriodSchema = z.enum(['day', 'month']);
export type DentalPeriod = z.infer<typeof dentalPeriodSchema>;
