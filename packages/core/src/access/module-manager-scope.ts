import { permissionModules, type AccessSubject, type GrantableRole, type Permission } from '@backoffice/contracts';

/**
 * ผู้จัดการโมดูล: the hospital-wide role that runs each module. A ผู้ดูแลระบบ passes every one of these checks anyway
 * (see `isAdmin`). Modules missing here (คำขอ, การแจ้งเตือน, สิทธิ์และการตรวจสอบ) have no manager of their own.
 */
export const moduleManagerRoles: Readonly<Record<string, Exclude<GrantableRole, 'admin'>>> = {
  hr: 'hr-manager',
  leave: 'leave-manager',
  'official-travel': 'travel-manager',
  'room-booking': 'room-manager',
  inventory: 'inventory-officer',
  fleet: 'fleet-manager',
  'mass-casualty': 'mci-manager',
  attendance: 'attendance-manager',
  'lab-inventory': 'lab-manager'
};

/** Modules this signed-in person manages: a hospital-wide (unscoped) assignment of the module's manager role. */
export function managedModules(subject: AccessSubject): string[] {
  if (!subject.authenticated || !subject.personId) return [];
  const held = new Set(subject.roles.filter((role) => role.organizationId === null || role.organizationId === undefined).map((role) => role.name));
  return Object.entries(moduleManagerRoles).filter(([, role]) => held.has(role)).map(([code]) => code);
}

export function managesModule(subject: AccessSubject, moduleCode: string): boolean {
  return managedModules(subject).includes(moduleCode);
}

/**
 * Whether the subject is ผู้จัดการ of the module `permission` belongs to, and so is treated as ผู้ดูแลระบบ for it.
 * A cross-module permission (`data.export`) counts only with the module of the data (`moduleCode`).
 */
export function managesPermission(subject: AccessSubject, permission: Permission, moduleCode?: string): boolean {
  const module = permissionModules[permission] ?? moduleCode;
  return module !== undefined && managesModule(subject, module);
}
