import type { Permission } from '@backoffice/contracts';

const permissionsByRole: Record<string, readonly Permission[]> = {
  'hr-reader': ['hr.person.read'],
  'hr-manager': ['hr.person.read', 'hr.person.manage', 'hr.organization.manage'],
  'data-exporter': ['data.export'],
  'room-manager': ['room.manage'],
  'room-booking-approver': ['room.booking.decide']
};

export function roleGrantsPermission(roleName: string, permission: Permission): boolean {
  return permissionsByRole[roleName]?.includes(permission) ?? false;
}

export function requiresDataOwner(permission: Permission): boolean {
  return permission === 'hr.person.manage' || permission === 'hr.organization.manage';
}
