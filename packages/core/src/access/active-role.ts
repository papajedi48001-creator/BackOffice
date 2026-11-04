import type { AccessSubject } from '@backoffice/contracts';

/** บุคลากรทั่วไป: baseline rights only, no assigned role. Chosen by a person with roles who wants to work without them. */
export const EMPLOYEE_ROLE = 'employee';
/** ผู้ดูแลระบบ: works with every held role. */
export const ADMIN_TIER = 'admin';
/** ผู้จัดการ: works with every held role except admin (module managers, approvers, testers, unit-scoped roles). */
export const MANAGER_TIER = 'manager';

type Role = AccessSubject['roles'][number];

export interface ActiveRoleResolution {
  /** The tier the session works in: `admin`, `manager`, `employee`, or null while a choice is still needed. */
  activeRole: string | null;
  /** The tiers the person may choose between (`employee` is always open on top of these). */
  roleChoices: string[];
  roleSelectionRequired: boolean;
  /** The assignments that take effect under the active tier. */
  roles: Role[];
}

/** The tiers a person holds: ผู้ดูแลระบบ with the admin role, ผู้จัดการ with any other role. */
export function roleChoices(roles: readonly Role[]): string[] {
  const tiers: string[] = [];
  if (roles.some((role) => role.name === 'admin')) tiers.push(ADMIN_TIER);
  if (roles.some((role) => role.name !== 'admin')) tiers.push(MANAGER_TIER);
  return tiers;
}

function rolesOfTier(roles: readonly Role[], tier: string): Role[] {
  if (tier === ADMIN_TIER) return [...roles];
  if (tier === MANAGER_TIER) return roles.filter((role) => role.name !== 'admin');
  return [];
}

/**
 * Applies the session's stored choice. No roles: บุคลากรทั่วไป. One tier: selected automatically. Both tiers: the stored
 * tier when still held (or `employee`), else no role at all until the person picks again — a choice saved before the
 * tiers existed (a role name) counts as stale.
 */
export function resolveActiveRole(roles: readonly Role[], stored: string | null | undefined): ActiveRoleResolution {
  const choices = roleChoices(roles);
  if (choices.length === 0) return { activeRole: EMPLOYEE_ROLE, roleChoices: choices, roleSelectionRequired: false, roles: [] };
  const activeRole = choices.length === 1 && stored !== EMPLOYEE_ROLE ? choices[0]! : stored === EMPLOYEE_ROLE || (stored && choices.includes(stored)) ? stored : null;
  if (!activeRole) return { activeRole: null, roleChoices: choices, roleSelectionRequired: true, roles: [] };
  return { activeRole, roleChoices: choices, roleSelectionRequired: false, roles: rolesOfTier(roles, activeRole) };
}

/** Whether `role` may be saved as this person's active tier. */
export function canChooseRole(roles: readonly Role[], role: string): boolean {
  return role === EMPLOYEE_ROLE || roleChoices(roles).includes(role);
}
