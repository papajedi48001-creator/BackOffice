import type { Permission } from '@backoffice/contracts';

const permissionsByRole: Record<string, readonly Permission[]> = {
  'hr-reader': ['hr.person.read'],
  'hr-manager': ['hr.person.read', 'hr.person.manage', 'hr.organization.manage', 'hr.person.private.read', 'leave.manage', 'travel.manage'],
  'data-exporter': ['data.export'],
  'room-manager': ['room.manage'],
  'room-booking-approver': ['room.booking.decide'],
  'inventory-officer': ['inventory.item.manage', 'inventory.stock.receive', 'inventory.stock.read'],
  'inventory-supervisor': ['inventory.opening.certify', 'inventory.stock.read'],
  'fleet-manager': ['fleet.manage']
};

export function roleGrantsPermission(roleName: string, permission: Permission): boolean {
  return permissionsByRole[roleName]?.includes(permission) ?? false;
}

export function requiresDataOwner(permission: Permission): boolean {
  return permission === 'hr.person.manage' || permission === 'hr.organization.manage' || permission === 'hr.person.private.read' || permission === 'leave.manage' || permission === 'travel.manage';
}
