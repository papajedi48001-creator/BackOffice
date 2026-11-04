import type { AccessSubject } from '@backoffice/contracts';

/** บุคลากรทั่วไป: baseline rights only, no assigned role. Chosen by a person with several roles who wants to work without them. */
export const EMPLOYEE_ROLE = 'employee';

type Role = AccessSubject['roles'][number];

export interface ActiveRoleResolution {
  /** The role the session works in: a held role name, `employee`, or null while a choice is still needed. */
  activeRole: string | null;
  /** Distinct role names the person may choose between. */
  roleChoices: string[];
  roleSelectionRequired: boolean;
  /** The assignments that take effect: only those of the active role. */
  roles: Role[];
}

/** Each held role name once, sorted; one name assigned for several units is a single choice. */
export function roleChoices(roles: readonly Role[]): string[] {
  return [...new Set(roles.map((role) => role.name))].sort();
}

/**
 * Applies the session's stored choice. 0 roles: บุคลากรทั่วไป. 1 role: selected automatically. 2+ roles: the stored choice
 * when it is still held (or `employee`), else no role at all until the person picks again.
 */
export function resolveActiveRole(roles: readonly Role[], stored: string | null | undefined): ActiveRoleResolution {
  const choices = roleChoices(roles);
  if (choices.length === 0) return { activeRole: EMPLOYEE_ROLE, roleChoices: choices, roleSelectionRequired: false, roles: [] };
  const activeRole = choices.length === 1 ? choices[0]! : stored === EMPLOYEE_ROLE || (stored && choices.includes(stored)) ? stored : null;
  if (!activeRole) return { activeRole: null, roleChoices: choices, roleSelectionRequired: true, roles: [] };
  return { activeRole, roleChoices: choices, roleSelectionRequired: false, roles: roles.filter((role) => role.name === activeRole) };
}

/** Whether `role` may be saved as this person's active role. */
export function canChooseRole(roles: readonly Role[], role: string): boolean {
  return role === EMPLOYEE_ROLE || roleChoices(roles).includes(role);
}
