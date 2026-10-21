import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService, RoomBookingQueries } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { t, type MessageKey } from '@backoffice/i18n';
import type { NavigationItem } from '../components/app-shell';

export type ModuleGroup = 'mine' | 'people' | 'services' | 'governance';
export type ModuleIconName = 'requests' | 'bell' | 'people' | 'org' | 'upload' | 'shield' | 'delegate' | 'audit' | 'wrench' | 'package' | 'room' | 'car' | 'clock' | 'leave' | 'asset' | 'monitor' | 'target' | 'heart';

/** One page inside a module, shown in the module's section bar rather than on the main page. */
export interface ModuleSection {
  href: string;
  labelKey: MessageKey;
  /** Hides the link only; the page checks access itself. */
  visible(subject: AccessSubject): boolean;
}

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
  /** Sub-pages under href, in section-bar order. A module with sections is visible when any section is. */
  sections?: readonly ModuleSection[];
}

const everyone = () => true;
const hasRole = (...names: string[]) => (subject: AccessSubject) => subject.roles.some((role) => names.includes(role.name));
const authorization = new AuthorizationService();
const withSections = (entry: Omit<ModuleEntry, 'visible'>, sections: readonly ModuleSection[]): ModuleEntry => ({ ...entry, sections, visible: (subject) => sections.some((section) => section.visible(subject)) });
const planned = (code: string, href: string, labelKey: MessageKey, descriptionKey: MessageKey, icon: ModuleIconName): ModuleEntry => ({ code, href, labelKey, descriptionKey, icon, group: 'services', status: 'planned', visible: everyone });

export const moduleRegistry: readonly ModuleEntry[] = [
  { code: 'requests', href: '/requests', labelKey: 'requests', descriptionKey: 'moduleRequestsDescription', icon: 'requests', group: 'mine', status: 'live', visible: everyone },
  { code: 'notifications', href: '/notifications', labelKey: 'notifications', descriptionKey: 'moduleNotificationsDescription', icon: 'bell', group: 'mine', status: 'live', visible: everyone },
  withSections({ code: 'hr', href: '/hr', labelKey: 'moduleHr', descriptionKey: 'moduleHrDescription', icon: 'people', group: 'people', status: 'live' }, [
    { href: '/hr/people', labelKey: 'people', visible: hasRole('hr-reader', 'hr-manager') },
    { href: '/hr/organizations', labelKey: 'organizations', visible: hasRole('hr-reader', 'hr-manager') },
    { href: '/hr/imports', labelKey: 'hrImport', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') }
  ]),
  withSections({ code: 'access', href: '/access', labelKey: 'moduleAccess', descriptionKey: 'moduleAccessDescription', icon: 'shield', group: 'governance', status: 'live' }, [
    { href: '/access/roles', labelKey: 'roles', visible: hasRole('hr-manager') },
    { href: '/access/delegations', labelKey: 'delegations', visible: hasRole('hr-manager') },
    { href: '/access/audit', labelKey: 'audit', visible: everyone }
  ]),
  {
    code: 'room-booking', href: '/rooms', labelKey: 'moduleRoomBooking', descriptionKey: 'moduleRoomBookingDescription', icon: 'room', group: 'services', status: 'live', visible: everyone,
    // Bookings waiting for this approver; anyone without the approver role gets 0 without a query.
    badge: async (db, subject) => subject.personId ? (await new RoomBookingQueries(db).pendingForApprover({ personId: subject.personId, roles: subject.roles })).length : 0
  },
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

export function moduleSections(code: string, subject: AccessSubject): ModuleSection[] {
  return (moduleRegistry.find((entry) => entry.code === code)?.sections ?? []).filter((section) => section.visible(subject));
}

export function navigationFor(subject: AccessSubject): NavigationItem[] {
  return [{ href: '/dashboard', label: 'dashboard' }, ...visibleModules(subject).filter((entry) => entry.status === 'live').map((entry) => ({ href: entry.href, label: entry.labelKey }))];
}

// Label shown in the central inbox, e.g. "[จองห้องประชุม]". Notifications from before module codes existed came from requests.
export function moduleLabel(code: string | null): string {
  const entry = moduleRegistry.find((candidate) => candidate.code === (code ?? 'requests'));
  return entry ? t(entry.labelKey) : t('appName');
}
