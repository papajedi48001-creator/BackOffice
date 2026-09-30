import { z } from 'zod';

export const permissionSchema = z.enum(['hr.person.read', 'hr.person.manage']);
export type Permission = z.infer<typeof permissionSchema>;

export const accessSubjectSchema = z.object({
  authenticated: z.boolean(),
  personId: z.string().min(1).nullable().optional(),
  roles: z.array(z.object({ name: z.string().min(1), organizationId: z.string().min(1).nullable().optional() })),
  dataOwnerModules: z.array(z.string().min(1))
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
