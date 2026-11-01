import type { GrantableRole } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';

const roleKeys: Record<GrantableRole, MessageKey> = {
  admin: 'adminRoleAdmin', 'hr-manager': 'adminRoleHrManager', 'leave-manager': 'adminRoleLeaveManager', 'travel-manager': 'adminRoleTravelManager',
  'room-manager': 'adminRoleRoomManager', 'inventory-officer': 'adminRoleInventoryOfficer', 'fleet-manager': 'adminRoleFleetManager'
};

/** Grantable roles in the order the forms list them: ผู้ดูแลระบบ first, then each module's ผู้จัดการ. */
export const grantableRoles = Object.keys(roleKeys) as GrantableRole[];

export function roleLabel(role: string): string {
  return role in roleKeys ? t(roleKeys[role as GrantableRole]) : role;
}

/** HR, leave and travel manager roles only take effect for a hospital-wide HR เจ้าของข้อมูล. Mirrors `needsHrDataOwner` in core. */
export function roleNeedsHrDataOwner(role: string): boolean {
  return role === 'hr-manager' || role === 'leave-manager' || role === 'travel-manager';
}

const errorKeys: Record<string, MessageKey> = { LAST_ADMIN: 'adminErrorLAST_ADMIN', MODULE_LOCKED: 'adminErrorMODULE_LOCKED', PERSON_NOT_ACTIVE: 'adminErrorPERSON_NOT_ACTIVE', NOT_FOUND: 'adminErrorNOT_FOUND', forbidden: 'adminErrorFORBIDDEN' };

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
