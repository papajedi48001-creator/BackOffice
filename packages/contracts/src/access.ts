import { z } from 'zod';

export const permissionSchema = z.enum(['hr.person.read', 'hr.person.manage', 'hr.organization.manage', 'hr.person.private.read', 'data.export', 'room.manage', 'room.booking.decide', 'inventory.item.manage', 'inventory.stock.receive', 'inventory.stock.read', 'inventory.opening.certify', 'leave.manage', 'travel.manage', 'fleet.manage']);
export type Permission = z.infer<typeof permissionSchema>;

export const accessSubjectSchema = z.object({
  authenticated: z.boolean(),
  personId: z.string().min(1).nullable().optional(),
  roles: z.array(z.object({ name: z.string().min(1), organizationId: z.string().min(1).nullable().optional() })),
  dataOwnerModules: z.array(z.string().min(1)),
  /** Modules this person owns for the whole hospital, not just one unit. */
  hospitalWideDataOwnerModules: z.array(z.string().min(1)).optional()
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
