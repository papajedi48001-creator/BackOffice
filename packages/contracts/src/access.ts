import { z } from 'zod';

export const permissionSchema = z.enum(['hr.person.read', 'hr.person.manage', 'hr.organization.manage', 'hr.person.private.read', 'data.export', 'room.manage', 'room.booking.decide', 'inventory.item.manage', 'inventory.stock.receive', 'inventory.stock.read', 'inventory.opening.certify', 'leave.manage', 'travel.manage', 'fleet.manage']);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * The module each permission belongs to. A ผู้จัดการโมดูล acts as ผู้ดูแลระบบ for the permissions of the modules they manage.
 * `null`: cross-module (`data.export`), which belongs to the module of the data being exported.
 */
export const permissionModules: Readonly<Record<Permission, string | null>> = {
  'hr.person.read': 'hr',
  'hr.person.manage': 'hr',
  'hr.organization.manage': 'hr',
  'hr.person.private.read': 'hr',
  'data.export': null,
  'room.manage': 'room-booking',
  'room.booking.decide': 'room-booking',
  'inventory.item.manage': 'inventory',
  'inventory.stock.receive': 'inventory',
  'inventory.stock.read': 'inventory',
  'inventory.opening.certify': 'inventory',
  'leave.manage': 'leave',
  'travel.manage': 'official-travel',
  'fleet.manage': 'fleet'
};

export const accessSubjectSchema = z.object({
  authenticated: z.boolean(),
  personId: z.string().min(1).nullable().optional(),
  roles: z.array(z.object({ name: z.string().min(1), organizationId: z.string().min(1).nullable().optional() })),
  dataOwnerModules: z.array(z.string().min(1)),
  /** Modules this person owns for the whole hospital, not just one unit. */
  hospitalWideDataOwnerModules: z.array(z.string().min(1)).optional(),
  /** The role a signed-in session works in (`employee` = บุคลากรทั่วไป); `roles` then holds only its assignments. */
  activeRole: z.string().min(1).nullable().optional(),
  /** Distinct role names the person holds and may switch between. */
  roleChoices: z.array(z.string().min(1)).optional(),
  /** True while a person with several roles has not chosen one yet; `roles` is empty until then. */
  roleSelectionRequired: z.boolean().optional()
});

export type AccessSubject = z.infer<typeof accessSubjectSchema>;

export const accessResourceSchema = z.object({
  moduleCode: z.string().min(1),
  organizationId: z.string().min(1)
});

export type AccessResource = z.infer<typeof accessResourceSchema>;

export interface AuthorizationDecision {
  allowed: boolean;
  reason: 'allowed' | 'unauthenticated' | 'permission_denied' | 'organization_scope_denied' | 'data_owner_required';
}
