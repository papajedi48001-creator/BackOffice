import { z } from 'zod';
import { updatePersonProfileInputSchema } from './hr.ts';

/** A Thai national ID: 13 digits whose last is the check digit. Spaces and dashes are ignored. */
export const thaiNationalIdSchema = z.string().transform((value) => value.replace(/[\s-]/g, '')).refine((value) => {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (13 - index), 0);
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}, { message: 'INVALID_NATIONAL_ID' });

export const usernameSchema = z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/);
export const passwordSchema = z.string().min(8).max(128);
const employeeCodeSchema = z.string().trim().min(1).max(32);
/** ปฏิบัติงาน, ลาออก or ย้าย. Only ACTIVE may sign in. */
export const employmentStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED']);
export type EmploymentStatusCode = z.infer<typeof employmentStatusSchema>;

/** A new บุคลากร with their profile and a บัญชีท้องถิ่น. */
export const createPersonWithAccountInputSchema = updatePersonProfileInputSchema.extend({
  nationalId: thaiNationalIdSchema, employeeCode: employeeCodeSchema.nullable().optional(),
  firstName: z.string().trim().min(1).max(120), lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^[0-9+\- ]{1,32}$/).nullable().optional(),
  username: usernameSchema
}).strict();
export type CreatePersonWithAccountInput = z.infer<typeof createPersonWithAccountInputSchema>;

/** The identity fields HR may change. The username and รหัสบุคลากร are not among them: they never change once saved. */
export const updatePersonIdentityInputSchema = z.object({
  employmentStatus: employmentStatusSchema.optional(), nationalId: thaiNationalIdSchema.optional()
}).strict();
export type UpdatePersonIdentityInput = z.infer<typeof updatePersonIdentityInputSchema>;

/** A new บัญชีท้องถิ่น: only the username; the account starts on DEFAULT_RESET_PASSWORD and its owner must change it at the first login. */
export const localAccountInputSchema = z.object({ username: usernameSchema }).strict();
export type LocalAccountInput = z.infer<typeof localAccountInputSchema>;
export const setPasswordInputSchema = z.object({ password: passwordSchema }).strict();
/** The password an account gets when HR or a ผู้ดูแลระบบ resets it. The owner must replace it at the next login. */
export const DEFAULT_RESET_PASSWORD = 'P@ssw0rd#1';
/** A person changing their own password. The current one is not asked for right after a reset, when the change is forced. */
export const changeOwnPasswordInputSchema = z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordSchema }).strict();
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordInputSchema>;
