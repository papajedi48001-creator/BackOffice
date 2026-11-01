import type { GrantableRole } from '@backoffice/contracts';

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
