import { z } from 'zod';

export const createPersonInputSchema = z.object({
  nationalId: z.string().regex(/^\d{13}$/)
});

export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

export interface Person {
  id: string;
  nationalIdMasked: string;
  createdAt: string;
}

export const assignEmploymentInputSchema = z.object({
  personId: z.string().uuid(),
  organizationId: z.string().uuid(),
  managerPersonId: z.string().uuid().nullable().optional(),
  effectiveFrom: z.coerce.date(),
  effectiveUntil: z.coerce.date().nullable().optional()
});

export type AssignEmploymentInput = z.infer<typeof assignEmploymentInputSchema>;

export interface EmploymentAssignment {
  id: string;
  personId: string;
  organizationId: string;
  managerPersonId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export const organizationUnitTypeSchema = z.enum(['SECTION', 'DIVISION', 'HOSPITAL']);
export type OrganizationUnitType = z.infer<typeof organizationUnitTypeSchema>;

export const commandChainTargetSchema = z.union([organizationUnitTypeSchema, z.literal('NEAREST_HEAD')]);
export type CommandChainTarget = z.infer<typeof commandChainTargetSchema>;

export const assignOrganizationHeadInputSchema = z.object({
  organizationId: z.string().min(1),
  personId: z.string().min(1),
  effectiveFrom: z.coerce.date()
});
export type AssignOrganizationHeadInput = z.infer<typeof assignOrganizationHeadInputSchema>;

export const setOrganizationUnitTypeInputSchema = z.object({
  organizationId: z.string().min(1),
  unitType: organizationUnitTypeSchema.nullable()
});
export type SetOrganizationUnitTypeInput = z.infer<typeof setOrganizationUnitTypeInputSchema>;

/** A กลุ่มงาน sits under the hospital; a งาน sits under a กลุ่มงาน. */
export const createOrganizationUnitInputSchema = z.object({
  name: z.string().trim().min(1).max(255), unitType: z.enum(['DIVISION', 'SECTION']), parentId: z.string().min(1).nullable().optional()
}).strict();
export type CreateOrganizationUnitInput = z.infer<typeof createOrganizationUnitInputSchema>;
/** Renames a unit; a งาน may also move to another กลุ่มงาน. */
export const updateOrganizationUnitInputSchema = z.object({ name: z.string().trim().min(1).max(255), parentId: z.string().min(1).optional() }).strict();
export type UpdateOrganizationUnitInput = z.infer<typeof updateOrganizationUnitInputSchema>;

export const genderSchema = z.enum(['MALE', 'FEMALE']);
export type Gender = z.infer<typeof genderSchema>;

const genderByPrefix: Record<string, Gender> = { 'นาย': 'MALE', 'นพ.': 'MALE', 'ทพ.': 'MALE', 'ภก.': 'MALE', 'นาง': 'FEMALE', 'นางสาว': 'FEMALE', 'พญ.': 'FEMALE', 'ทญ.': 'FEMALE', 'ภญ.': 'FEMALE' };

/** The gender a name prefix implies, or null when the prefix (such as ดร.) does not tell. */
export function genderForPrefix(prefix: string | null): Gender | null {
  return prefix === null ? null : genderByPrefix[prefix.trim()] ?? null;
}

/** A `YYYY-MM-DD` day that exists on the calendar, so 2026-02-30 is rejected instead of rolling over. */
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'INVALID_DATE');

/** A birth date no later than today in Bangkok. */
const birthDateSchema = calendarDateSchema.refine((value) => value <= new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10), 'BIRTH_DATE_IN_FUTURE');

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const phoneSchema = z.string().trim().regex(/^[0-9+\- ]{1,32}$/).nullable().optional();

/** Personal and work fields HR edits. An absent field keeps its stored value; null clears it. */
export const updatePersonProfileInputSchema = z.object({
  namePrefix: optionalText(32), firstName: optionalText(120), lastName: optionalText(120),
  gender: genderSchema.nullable().optional(), birthDate: birthDateSchema.nullable().optional(),
  employmentTypeId: z.string().min(1).nullable().optional(), appointedOn: calendarDateSchema.nullable().optional(),
  positionTitle: optionalText(255), positionLevel: optionalText(120), organizationId: z.string().min(1).nullable().optional()
}).strict();
export type UpdatePersonProfileInput = z.infer<typeof updatePersonProfileInputSchema>;

/** ข้อมูลส่วนตัว the person edits for themself; work fields stay with HR. */
export const updateOwnPersonalInputSchema = updatePersonProfileInputSchema.pick({ namePrefix: true, firstName: true, lastName: true, gender: true, birthDate: true }).strict();
export type UpdateOwnPersonalInput = z.infer<typeof updateOwnPersonalInputSchema>;

/** Contact fields the person edits for themself. */
export const updatePersonContactInputSchema = z.object({
  phone: phoneSchema, address: optionalText(500),
  emergencyContactName: optionalText(255), emergencyContactRelationship: optionalText(64), emergencyContactPhone: phoneSchema
}).strict();
export type UpdatePersonContactInput = z.infer<typeof updatePersonContactInputSchema>;

/** สถานภาพ on the ก.พ.7: โสด, สมรส, หย่า, แยกกันอยู่, หม้าย. */
export const maritalStatusSchema = z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'SEPARATED', 'WIDOWED']);
export type MaritalStatus = z.infer<typeof maritalStatusSchema>;

/** ข้อมูลส่วนตัวและครอบครัว as laid out on the ก.พ.7. The person and HR edit it; an absent field keeps its value, null clears it. */
export const updatePersonFamilyInputSchema = z.object({
  maritalStatus: maritalStatusSchema.nullable().optional(), religion: optionalText(64), birthplace: optionalText(255),
  fatherName: optionalText(255), motherName: optionalText(255), motherMaidenName: optionalText(255),
  spouseName: optionalText(255), spouseMaidenName: optionalText(255), childrenCount: z.number().int().min(0).max(30).nullable().optional()
}).strict();
export type UpdatePersonFamilyInput = z.infer<typeof updatePersonFamilyInputSchema>;

/** กบข. on the ก.พ.7: สมัคร or ไม่สมัคร. */
export const gpfStatusSchema = z.enum(['MEMBER', 'NOT_MEMBER']);
export type GpfStatus = z.infer<typeof gpfStatusSchema>;

/** ข้อมูลการปฏิบัติราชการ on the ก.พ.7. These record official orders, so only HR edits them. */
export const updateCivilServiceInputSchema = z.object({
  positionNumber: optionalText(32), salary: z.number().min(0).max(9_999_999).multipleOf(0.01).nullable().optional(), parentAgency: optionalText(255),
  gpfStatus: gpfStatusSchema.nullable().optional(), firstAppointedOn: calendarDateSchema.nullable().optional(), reappointedOn: calendarDateSchema.nullable().optional(),
  transferredInOn: calendarDateSchema.nullable().optional(), transferredOutOn: calendarDateSchema.nullable().optional(), joinedUnitOn: calendarDateSchema.nullable().optional(),
  currentLevelSince: calendarDateSchema.nullable().optional(), qualification: optionalText(255), qualificationMajor: optionalText(255), specialAllowance: optionalText(255)
}).strict();
export type UpdateCivilServiceInput = z.infer<typeof updateCivilServiceInputSchema>;

/** วันเกษียณอายุ: 1 ต.ค. after the fiscal year in which the person turns 60 (born 2 ต.ค. or later retires a year on). */
export function retirementDate(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  const lateInYear = month > 10 || (month === 10 && day >= 2);
  return `${year + 60 + (lateInYear ? 1 : 0)}-10-01`;
}

/** One row of ข้อมูลการศึกษา. */
export const educationEntrySchema = z.object({
  graduatedOn: calendarDateSchema.nullable().optional(), degree: z.string().trim().min(1).max(255), major: optionalText(255), institution: optionalText(255), country: optionalText(120)
}).strict();
export type EducationEntry = z.infer<typeof educationEntrySchema>;
/** The whole ข้อมูลการศึกษา list, in order; saving replaces the list. The person and HR edit it. */
export const updateEducationInputSchema = z.object({ entries: z.array(educationEntrySchema).max(20) }).strict();
export type UpdateEducationInput = z.infer<typeof updateEducationInputSchema>;

/** The ก.พ.7 file: a PDF printed from the ministry system, up to 10 MB. */
export const MAX_KP7_FILE_BYTES = 10 * 1024 * 1024;

export const employmentTypeInputSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/), name: z.string().trim().min(1).max(120),
  isActive: z.boolean(), sortOrder: z.number().int().min(0).max(9999)
});
export type EmploymentTypeInput = z.infer<typeof employmentTypeInputSchema>;
export interface EmploymentType extends EmploymentTypeInput { id: string; }

export type PersonProfileField = keyof UpdatePersonProfileInput | keyof UpdatePersonContactInput;
