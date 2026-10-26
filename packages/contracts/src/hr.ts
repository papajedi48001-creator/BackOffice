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

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const phoneSchema = z.string().trim().regex(/^[0-9+\- ]{1,32}$/).nullable().optional();

/** Personal and work fields HR edits. An absent field keeps its stored value; null clears it. */
export const updatePersonProfileInputSchema = z.object({
  namePrefix: optionalText(32), firstName: optionalText(120), lastName: optionalText(120),
  gender: genderSchema.nullable().optional(), birthDate: calendarDateSchema.nullable().optional(),
  employmentTypeId: z.string().min(1).nullable().optional(), appointedOn: calendarDateSchema.nullable().optional(),
  positionTitle: optionalText(255), positionLevel: optionalText(120), organizationId: z.string().min(1).optional()
}).strict();
export type UpdatePersonProfileInput = z.infer<typeof updatePersonProfileInputSchema>;

/** Contact fields the person edits for themself. */
export const updatePersonContactInputSchema = z.object({
  phone: phoneSchema, address: optionalText(500),
  emergencyContactName: optionalText(255), emergencyContactRelationship: optionalText(64), emergencyContactPhone: phoneSchema
}).strict();
export type UpdatePersonContactInput = z.infer<typeof updatePersonContactInputSchema>;

export const employmentTypeInputSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/), name: z.string().trim().min(1).max(120),
  isActive: z.boolean(), sortOrder: z.number().int().min(0).max(9999)
});
export type EmploymentTypeInput = z.infer<typeof employmentTypeInputSchema>;
export interface EmploymentType extends EmploymentTypeInput { id: string; }

export type PersonProfileField = keyof UpdatePersonProfileInput | keyof UpdatePersonContactInput;
