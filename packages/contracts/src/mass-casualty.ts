import { z } from 'zod';

/** ระบบอุบัติเหตุหมู่: the module code used by the registry, the gate, notices and LINE routing. */
export const MCI_MODULE = 'mass-casualty';

/** บทบาทสั่งการ in one เหตุ: ผู้บัญชาการเหตุ, หัวหน้าจุด, ผู้บันทึก, เจ้าหน้าที่. */
export const mciCommandRoleSchema = z.enum(['COMMANDER', 'ZONE_LEAD', 'RECORDER', 'STAFF']);
export type MciCommandRole = z.infer<typeof mciCommandRoleSchema>;

/** เหตุจริง or ซ้อมแผน. */
export const mciIncidentKindSchema = z.enum(['REAL', 'DRILL']);
export type MciIncidentKind = z.infer<typeof mciIncidentKindSchema>;
export type MciIncidentStatus = 'OPEN' | 'CLOSED';

export const mciGenderSchema = z.enum(['MALE', 'FEMALE', 'UNKNOWN']);
export type MciGender = z.infer<typeof mciGenderSchema>;

const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const name = (max: number) => z.string().trim().min(1).max(max);

export const mciOpenIncidentInputSchema = z.object({
  title: name(200),
  kind: mciIncidentKindSchema,
  location: text(300).default(''),
  occurredAt: z.string().datetime(),
  notify: z.object({ mode: z.enum(['ALL', 'PROFESSIONS', 'NONE']), professionIds: z.array(id).max(50).default([]) }).strict()
}).strict();
export type MciOpenIncidentInput = z.input<typeof mciOpenIncidentInputSchema>;

export const mciCheckInInputSchema = z.object({ professionId: id }).strict();
export type MciCheckInInput = z.infer<typeof mciCheckInInputSchema>;

export const mciResponderUpdateInputSchema = z.object({ zoneId: id.nullable(), commandRole: mciCommandRoleSchema }).strict();
export type MciResponderUpdateInput = z.infer<typeof mciResponderUpdateInputSchema>;

const identity = {
  firstName: text(120).default(''),
  lastName: text(120).default(''),
  gender: mciGenderSchema.default('UNKNOWN'),
  ageEstimate: z.number().int().min(0).max(130).nullable().default(null),
  hn: text(20).default('')
};

/** A new ผู้ป่วยในเหตุ: only the colour and the zone are needed; the name can follow later. */
export const mciNewPatientInputSchema = z.object({ triageLevelId: id, zoneId: id, ...identity }).strict();
export type MciNewPatientInput = z.input<typeof mciNewPatientInputSchema>;

export const mciPatientInputSchema = z.object({
  triageLevelId: id, statusId: id, zoneId: id,
  destinationHospital: text(200).default(''),
  ...identity,
  publicHidden: z.boolean().default(false)
}).strict();
export type MciPatientInput = z.input<typeof mciPatientInputSchema>;

const sortOrder = z.number().int().min(0).max(999);
export const mciZoneInputSchema = z.object({ name: name(60), sortOrder, isActive: z.boolean() }).strict();
export const mciTriageLevelInputSchema = z.object({ name: name(40), description: text(120).default(''), colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), sortOrder, isActive: z.boolean() }).strict();
export const mciStatusInputSchema = z.object({ name: name(60), sortOrder, isActive: z.boolean() }).strict();
export const mciProfessionInputSchema = z.object({ name: name(80), sortOrder, isActive: z.boolean(), positionIds: z.array(id).max(200).default([]) }).strict();
export const mciRulesInputSchema = z.object({ rules: z.array(z.object({ professionId: id, zoneId: id.nullable() }).strict()).max(100) }).strict();
export const mciContactInputSchema = z.object({ publicContactPhone: text(40) }).strict();
export type MciZoneInput = z.infer<typeof mciZoneInputSchema>;
export type MciTriageLevelInput = z.input<typeof mciTriageLevelInputSchema>;
export type MciStatusInput = z.infer<typeof mciStatusInputSchema>;
export type MciProfessionInput = z.input<typeof mciProfessionInputSchema>;
export type MciRulesInput = z.infer<typeof mciRulesInputSchema>;
export type MciContactInput = z.infer<typeof mciContactInputSchema>;

/** The `mci.line.broadcast` outbox payload: ids only; the worker reads the title from the database. */
export const mciLineBroadcastPayloadSchema = z.object({ incidentId: id, event: z.enum(['OPENED', 'CLOSED']) }).strict();
export type MciLineBroadcastPayload = z.infer<typeof mciLineBroadcastPayloadSchema>;
