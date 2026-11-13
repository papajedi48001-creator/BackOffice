import { testerModuleCodes, type GrantableRole, type TesterModuleCode, type TesterRole } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';

type ManagerRole = Exclude<GrantableRole, TesterRole>;
const roleKeys: Record<ManagerRole, MessageKey> = {
  admin: 'adminRoleAdmin', 'hr-manager': 'adminRoleHrManager', 'leave-manager': 'adminRoleLeaveManager', 'travel-manager': 'adminRoleTravelManager',
  'room-manager': 'adminRoleRoomManager', 'inventory-officer': 'adminRoleInventoryOfficer', 'fleet-manager': 'adminRoleFleetManager',
  'mci-manager': 'adminRoleMciManager', 'attendance-manager': 'adminRoleAttendanceManager', 'attendance-auditor': 'adminRoleAttendanceAuditor', 'lab-manager': 'adminRoleLabManager', 'money-manager': 'adminRoleMoneyManager'
};

/** Module names for the ผู้ทดสอบ labels; the same keys as the module registry. */
const testedModuleKeys: Record<TesterModuleCode, MessageKey> = {
  requests: 'requests', notifications: 'notifications', hr: 'moduleHr', access: 'moduleAccess', 'room-booking': 'moduleRoomBooking',
  leave: 'moduleLeave', 'official-travel': 'moduleTravel', inventory: 'moduleInventory', fleet: 'moduleFleet', 'mass-casualty': 'moduleMassCasualty', attendance: 'moduleAttendance', 'lab-inventory': 'moduleLabInventory', 'smart-money': 'moduleSmartMoney'
};

/** ผู้ดูแลระบบ and each module's ผู้จัดการ, in the order the forms list them. */
export const managerRoles = Object.keys(roleKeys) as ManagerRole[];
/** Each module's ผู้ทดสอบ role (`<module>-tester`), in registry order, listed after the managers. */
export const testerRoles = testerModuleCodes.map((code) => `${code}-tester` as TesterRole);
export const grantableRoles: GrantableRole[] = [...managerRoles, ...testerRoles];

export function isTesterRole(role: string): role is TesterRole {
  return (testerRoles as string[]).includes(role);
}

export function roleLabel(role: string): string {
  if (isTesterRole(role)) return `${t('adminRoleTester')}${t(testedModuleKeys[role.slice(0, -'-tester'.length) as TesterModuleCode])}`;
  return role in roleKeys ? t(roleKeys[role as ManagerRole]) : role;
}

/** HR, leave and travel manager roles only take effect for a hospital-wide HR เจ้าของข้อมูล. Mirrors `needsHrDataOwner` in core. */
export function roleNeedsHrDataOwner(role: string): boolean {
  return role === 'hr-manager' || role === 'leave-manager' || role === 'travel-manager';
}

const errorKeys: Record<string, MessageKey> = { LAST_ADMIN: 'adminErrorLAST_ADMIN', MODULE_LOCKED: 'adminErrorMODULE_LOCKED', PERSON_NOT_ACTIVE: 'adminErrorPERSON_NOT_ACTIVE', NOT_FOUND: 'adminErrorNOT_FOUND', forbidden: 'adminErrorFORBIDDEN', LINE_REFUSED: 'adminErrorLINE_REFUSED', LINE_NOT_CONFIGURED: 'adminErrorLINE_NOT_CONFIGURED', invalid_input: 'adminErrorINVALID_INPUT', ALREADY_LINKED: 'adminErrorALREADY_LINKED' };

export function adminErrorMessage(code: string | null): string {
  return t(code && errorKeys[code] ? errorKeys[code] : 'adminErrorGENERIC');
}

/** Sends one admin change; `error` is a Thai message, never the server's raw text. */
export async function sendAdmin(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<{ error: string | null }> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.ok) return { error: null };
    const result = (await response.json().catch(() => ({}))) as { error?: unknown };
    return { error: adminErrorMessage(typeof result.error === 'string' ? result.error : null) };
  } catch { return { error: adminErrorMessage(null) }; }
}
