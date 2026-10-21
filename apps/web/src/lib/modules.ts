import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import type { MessageKey } from '@backoffice/i18n';
import type { NavigationItem } from '../components/app-shell';

export type ModuleGroup = 'mine' | 'people' | 'services' | 'governance';
export type ModuleIconName = 'requests' | 'bell' | 'people' | 'org' | 'upload' | 'shield' | 'delegate' | 'audit' | 'wrench' | 'package' | 'room' | 'car' | 'clock' | 'leave' | 'asset' | 'monitor' | 'target' | 'heart';

/** One tile on the main page and, when live, one sidebar item. Module threads add their entry here; see docs/integration/modules.md. */
export interface ModuleEntry {
  code: string;
  href: string;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  icon: ModuleIconName;
  group: ModuleGroup;
  status: 'live' | 'planned';
  /** Hides the tile and menu item only; pages and APIs still check access themselves. */
  visible(subject: AccessSubject): boolean;
  /** Work waiting for this person, shown on the tile. */
  badge?(db: Database, subject: AccessSubject): Promise<number>;
}

const everyone = () => true;
const hasRole = (...names: string[]) => (subject: AccessSubject) => subject.roles.some((role) => names.includes(role.name));
const authorization = new AuthorizationService();
const planned = (code: string, href: string, labelKey: MessageKey, descriptionKey: MessageKey, icon: ModuleIconName): ModuleEntry => ({ code, href, labelKey, descriptionKey, icon, group: 'services', status: 'planned', visible: everyone });

export const moduleRegistry: readonly ModuleEntry[] = [
  { code: 'requests', href: '/requests', labelKey: 'requests', descriptionKey: 'moduleRequestsDescription', icon: 'requests', group: 'mine', status: 'live', visible: everyone },
  { code: 'notifications', href: '/notifications', labelKey: 'notifications', descriptionKey: 'moduleNotificationsDescription', icon: 'bell', group: 'mine', status: 'live', visible: everyone },
  { code: 'hr-people', href: '/hr/people', labelKey: 'people', descriptionKey: 'modulePeopleDescription', icon: 'people', group: 'people', status: 'live', visible: hasRole('hr-reader', 'hr-manager') },
  { code: 'hr-organizations', href: '/hr/organizations', labelKey: 'organizations', descriptionKey: 'moduleOrganizationsDescription', icon: 'org', group: 'people', status: 'live', visible: hasRole('hr-reader', 'hr-manager') },
  { code: 'hr-import', href: '/hr/imports', labelKey: 'hrImport', descriptionKey: 'moduleHrImportDescription', icon: 'upload', group: 'people', status: 'live', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') },
  { code: 'access-roles', href: '/access/roles', labelKey: 'roles', descriptionKey: 'moduleRolesDescription', icon: 'shield', group: 'governance', status: 'live', visible: hasRole('hr-manager') },
  { code: 'access-delegations', href: '/access/delegations', labelKey: 'delegations', descriptionKey: 'moduleDelegationsDescription', icon: 'delegate', group: 'governance', status: 'live', visible: hasRole('hr-manager') },
  { code: 'audit', href: '/audit', labelKey: 'audit', descriptionKey: 'moduleAuditDescription', icon: 'audit', group: 'governance', status: 'live', visible: everyone },
  planned('room-booking', '/rooms', 'moduleRoomBooking', 'moduleRoomBookingDescription', 'room'),
  planned('maintenance', '/maintenance', 'moduleMaintenance', 'moduleMaintenanceDescription', 'wrench'),
  planned('inventory', '/inventory', 'moduleInventory', 'moduleInventoryDescription', 'package'),
  planned('fleet', '/fleet', 'moduleFleet', 'moduleFleetDescription', 'car'),
  planned('attendance', '/attendance', 'moduleAttendance', 'moduleAttendanceDescription', 'clock'),
  planned('leave', '/leave', 'moduleLeave', 'moduleLeaveDescription', 'leave'),
  planned('asset-register', '/assets', 'moduleAssetRegister', 'moduleAssetRegisterDescription', 'asset'),
  planned('computer-center', '/it', 'moduleComputerCenter', 'moduleComputerCenterDescription', 'monitor'),
  planned('planning', '/planning', 'modulePlanning', 'modulePlanningDescription', 'target'),
  planned('donor-registry', '/donors', 'moduleDonorRegistry', 'moduleDonorRegistryDescription', 'heart')
];

export function visibleModules(subject: AccessSubject): ModuleEntry[] {
  return moduleRegistry.filter((entry) => entry.status === 'planned' || entry.visible(subject));
}

export function navigationFor(subject: AccessSubject): NavigationItem[] {
  return [{ href: '/dashboard', label: 'dashboard' }, ...visibleModules(subject).filter((entry) => entry.status === 'live').map((entry) => ({ href: entry.href, label: entry.labelKey }))];
}
