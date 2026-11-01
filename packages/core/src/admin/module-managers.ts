import { testerModuleCodes, type AccessSubject, type GrantableRole, type ModuleMode, type TesterRole } from '@backoffice/contracts';
import { isAdmin } from '../access/authorization-service';

/**
 * ผู้จัดการโมดูล: the existing hospital-wide role that runs each module. A ผู้ดูแลระบบ passes every one of these checks anyway
 * (see `isAdmin`). Modules missing here (คำขอ, การแจ้งเตือน, สิทธิ์และการตรวจสอบ) have no manager of their own.
 */
export const moduleManagerRoles: Readonly<Record<string, Exclude<GrantableRole, 'admin'>>> = {
  hr: 'hr-manager',
  leave: 'leave-manager',
  'official-travel': 'travel-manager',
  'room-booking': 'room-manager',
  inventory: 'inventory-officer',
  fleet: 'fleet-manager'
};

/**
 * ผู้ทดสอบ: one `<module-code>-tester` role per live module (not `admin`). It grants no permission, so a tester has the module's
 * ordinary user access only; it just lets them through a module in DEVELOPMENT mode.
 */
export const moduleTesterRoles: Readonly<Record<string, TesterRole>> = Object.fromEntries(testerModuleCodes.map((code) => [code, `${code}-tester` as TesterRole]));

/** Modules that cannot be switched off: the admin module itself, or nobody could switch anything back on. */
export const lockedModules: readonly string[] = ['admin'];

/** Roles whose permissions are data-owner gated: they only take effect for a hospital-wide HR เจ้าของข้อมูล. */
export function needsHrDataOwner(roleName: string): boolean {
  return roleName === 'hr-manager' || roleName === 'leave-manager' || roleName === 'travel-manager';
}

/** Module codes a role manages, for labels; `admin` manages all of them. */
export function modulesManagedBy(roleName: string): string[] {
  return Object.entries(moduleManagerRoles).filter(([, role]) => role === roleName).map(([code]) => code);
}

/** Module codes a tester role opens in development mode. */
export function modulesTestedBy(roleName: string): string[] {
  return Object.entries(moduleTesterRoles).filter(([, role]) => role === roleName).map(([code]) => code);
}

/**
 * Whether this person may see and use a module in its current mode. ON: yes (pages still check their own access). OFF: nobody.
 * DEVELOPMENT: ผู้ดูแลระบบ, and hospital-wide holders of the module's ผู้จัดการ or ผู้ทดสอบ role. The admin module is always open.
 */
export function canUseModule(subject: AccessSubject, moduleCode: string, mode: ModuleMode): boolean {
  if (lockedModules.includes(moduleCode) || mode === 'ON') return true;
  if (mode === 'OFF') return false;
  if (isAdmin(subject)) return true;
  const roles = [moduleManagerRoles[moduleCode], moduleTesterRoles[moduleCode]].filter(Boolean);
  return Boolean(subject.authenticated && subject.personId) && subject.roles.some((role) => roles.includes(role.name as never) && (role.organizationId === null || role.organizationId === undefined));
}
