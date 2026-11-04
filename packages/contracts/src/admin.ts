import { z } from 'zod';

/** Live modules that can have ผู้ทดสอบ: every live module but `admin`, in registry order. Each gets a `<code>-tester` role. */
export const testerModuleCodes = ['requests', 'notifications', 'hr', 'access', 'room-booking', 'leave', 'official-travel', 'inventory', 'fleet'] as const;
export type TesterModuleCode = (typeof testerModuleCodes)[number];
export type TesterRole = `${TesterModuleCode}-tester`;
const testerRoles = testerModuleCodes.map((code) => `${code}-tester` as TesterRole) as [TesterRole, ...TesterRole[]];

/**
 * Roles the ผู้ดูแลระบบ may grant from the admin module: `admin` itself, each module's ผู้จัดการ role and each module's ผู้ทดสอบ role.
 * Which module each manager role belongs to lives in `@backoffice/core` (module-managers.ts).
 */
export const grantableRoleSchema = z.enum(['admin', 'hr-manager', 'leave-manager', 'travel-manager', 'room-manager', 'inventory-officer', 'fleet-manager', ...testerRoles]);
export type GrantableRole = z.infer<typeof grantableRoleSchema>;

export const adminGrantInputSchema = z.object({ personId: z.string().uuid(), roleName: grantableRoleSchema }).strict();
export type AdminGrantInput = z.infer<typeof adminGrantInputSchema>;

/** One role for the person named in the path. */
export const adminRoleInputSchema = z.object({ roleName: grantableRoleSchema }).strict();

/** The whole set of admin and manager roles one person should hold; roles left out are revoked. */
export const adminPersonRolesInputSchema = z.object({ roleNames: z.array(grantableRoleSchema).max(20) }).strict();

/** โหมดโมดูล: เปิด, ปิด or พัฒนา (only ผู้ดูแลระบบ, the module's ผู้จัดการ and ผู้ทดสอบ see it). */
export const moduleModeSchema = z.enum(['ON', 'OFF', 'DEVELOPMENT']);
export type ModuleMode = z.infer<typeof moduleModeSchema>;

export const adminModuleModeInputSchema = z.object({ mode: moduleModeSchema }).strict();

export const moduleCodeSchema = z.string().regex(/^[a-z][a-z-]{1,63}$/);

const sqlIdentifier = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
/** ตั้งค่าการเชื่อมต่อ HOSxP. A blank password keeps the stored one; the password is never sent back. */
export const hosxpSettingsInputSchema = z.object({
  host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9.-]+$/),
  port: z.number().int().min(1).max(65535),
  database: sqlIdentifier,
  user: z.string().trim().min(1).max(64),
  password: z.string().max(256),
  dateColumn: sqlIdentifier,
  nameColumn: sqlIdentifier
}).strict();
export type HosxpSettingsInputBody = z.infer<typeof hosxpSettingsInputSchema>;
