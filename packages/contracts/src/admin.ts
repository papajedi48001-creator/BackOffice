import { z } from 'zod';

/**
 * Roles the ผู้ดูแลระบบ may grant from the admin module: `admin` itself and each module's ผู้จัดการ role.
 * Which module each manager role belongs to lives in `@backoffice/core` (module-managers.ts).
 */
export const grantableRoleSchema = z.enum(['admin', 'hr-manager', 'leave-manager', 'travel-manager', 'room-manager', 'inventory-officer', 'fleet-manager']);
export type GrantableRole = z.infer<typeof grantableRoleSchema>;

export const adminGrantInputSchema = z.object({ personId: z.string().uuid(), roleName: grantableRoleSchema }).strict();
export type AdminGrantInput = z.infer<typeof adminGrantInputSchema>;

/** One role for the person named in the path. */
export const adminRoleInputSchema = z.object({ roleName: grantableRoleSchema }).strict();

/** The whole set of admin and manager roles one person should hold; roles left out are revoked. */
export const adminPersonRolesInputSchema = z.object({ roleNames: z.array(grantableRoleSchema).max(20) }).strict();

export const adminModuleToggleInputSchema = z.object({ enabled: z.boolean() }).strict();

export const moduleCodeSchema = z.string().regex(/^[a-z][a-z-]{1,63}$/);
