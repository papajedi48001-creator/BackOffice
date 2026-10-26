import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService, LeaveQueries, RoomBookingQueries, canManageLeave, hasRequestActivity, listPendingApprovals } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { t, type MessageKey } from '@backoffice/i18n';
import type { NavigationItem } from '../components/app-shell';
import { matchModule } from './module-theme';
import { canInventory } from './inventory-access';

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
  /** Work waiting for this person, shown on the tile and the menu item. */
  badge?(db: Database, subject: AccessSubject): Promise<number>;
  /** Hides the tile and menu item when there is nothing to show yet; like visible, never a security check. */
  available?(db: Database, subject: AccessSubject): Promise<boolean>;
  /** Sub-pages under href, in section-bar order. A module with sections is visible when any section is. */
  sections?: readonly ModuleSection[];
}

const everyone = () => true;
const hasRole = (...names: string[]) => (subject: AccessSubject) => subject.roles.some((role) => names.includes(role.name));
const authorization = new AuthorizationService();
const withSections = (entry: Omit<ModuleEntry, 'visible'>, sections: readonly ModuleSection[]): ModuleEntry => ({ ...entry, sections, visible: (subject) => sections.some((section) => section.visible(subject)) });
const planned = (code: string, href: string, labelKey: MessageKey, descriptionKey: MessageKey, icon: ModuleIconName): ModuleEntry => ({ code, href, labelKey, descriptionKey, icon, group: 'services', status: 'planned', visible: everyone });

export const moduleRegistry: readonly ModuleEntry[] = [
  {
    code: 'requests', href: '/requests', labelKey: 'requests', descriptionKey: 'moduleRequestsDescription', icon: 'requests', group: 'mine', status: 'live', visible: everyone,
    // Every module's approvals wait here, so a ใบลา for the director counts on both คำขอ and การลา.
    badge: async (db, subject) => subject.personId ? (await listPendingApprovals(db, subject.personId)).length : 0,
    available: async (db, subject) => subject.personId ? hasRequestActivity(db, subject.personId) : false
  },
  {
    code: 'notifications', href: '/notifications', labelKey: 'notifications', descriptionKey: 'moduleNotificationsDescription', icon: 'bell', group: 'mine', status: 'live', visible: everyone,
    badge: async (db, subject) => subject.personId ? Number((await db.query<{ total: number }>('SELECT COUNT(*) AS total FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [subject.personId, 'in_app']))[0]?.total ?? 0) : 0
  },
  withSections({ code: 'hr', href: '/hr', labelKey: 'moduleHr', descriptionKey: 'moduleHrDescription', icon: 'people', group: 'people', status: 'live' }, [
    { href: '/hr/people', labelKey: 'people', visible: hasRole('hr-reader', 'hr-manager') },
    { href: '/hr/organizations', labelKey: 'organizations', visible: hasRole('hr-reader', 'hr-manager') },
    { href: '/hr/imports', labelKey: 'hrImport', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') },
    { href: '/hr/employment-types', labelKey: 'hrEmploymentTypes', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') },
    // Last, so HR staff still land on the people list; everyone else lands here.
    { href: '/hr/me', labelKey: 'hrMyProfile', visible: everyone }
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
  {
    ...withSections({ code: 'leave', href: '/leave', labelKey: 'moduleLeave', descriptionKey: 'moduleLeaveDescription', icon: 'leave', group: 'mine', status: 'live' }, [
      { href: '/leave/mine', labelKey: 'leaveMine', visible: everyone },
      { href: '/leave/new', labelKey: 'leaveNew', visible: everyone },
      // Approvers are unit heads and ผู้แทน, not a role, so the link stays cheap and the page shows its own empty state.
      { href: '/leave/approvals', labelKey: 'leaveApprovals', visible: everyone },
      { href: '/leave/calendar', labelKey: 'leaveCalendar', visible: everyone },
      { href: '/leave/all', labelKey: 'leaveAll', visible: canManageLeave },
      { href: '/leave/settings', labelKey: 'leaveSettings', visible: canManageLeave },
      { href: '/leave/holidays', labelKey: 'leaveHolidays', visible: canManageLeave },
      { href: '/leave/balances', labelKey: 'leaveBalances', visible: canManageLeave }
    ]),
    badge: async (db, subject) => subject.personId ? new LeaveQueries(db).pendingCount(subject.personId) : 0
  },
  planned('maintenance', '/maintenance', 'moduleMaintenance', 'moduleMaintenanceDescription', 'wrench'),
  withSections({ code: 'inventory', href: '/inventory', labelKey: 'moduleInventory', descriptionKey: 'moduleInventoryDescription', icon: 'package', group: 'services', status: 'live' }, [
    { href: '/inventory/stock', labelKey: 'inventoryStock', visible: (subject) => canInventory(subject, 'inventory.stock.read') },
    { href: '/inventory/receipts', labelKey: 'inventoryReceipts', visible: (subject) => canInventory(subject, 'inventory.stock.receive') },
    { href: '/inventory/opening', labelKey: 'inventoryOpening', visible: (subject) => canInventory(subject, 'inventory.stock.receive', 'inventory.opening.certify') },
    { href: '/inventory/items', labelKey: 'inventoryItems', visible: (subject) => canInventory(subject, 'inventory.item.manage') },
    { href: '/inventory/vendors', labelKey: 'inventoryVendors', visible: (subject) => canInventory(subject, 'inventory.item.manage') }
  ]),
  planned('fleet', '/fleet', 'moduleFleet', 'moduleFleetDescription', 'car'),
  planned('attendance', '/attendance', 'moduleAttendance', 'moduleAttendanceDescription', 'clock'),
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

/** Drops modules whose availability check says there is nothing to show; a check that fails keeps the module. */
export async function availableModules(modules: ModuleEntry[], db: Database, subject: AccessSubject): Promise<ModuleEntry[]> {
  const shown = await Promise.all(modules.map((entry) => entry.available ? entry.available(db, subject).catch(() => true) : true));
  return modules.filter((_, index) => shown[index]);
}

export function navigationFrom(modules: ModuleEntry[], badges: Record<string, number | undefined> = {}): NavigationItem[] {
  return [{ href: '/dashboard', label: 'dashboard', module: 'home' }, ...modules.filter((entry) => entry.status === 'live').map((entry) => ({ href: entry.href, label: entry.labelKey, module: entry.code, ...(badges[entry.code] === undefined ? {} : { badge: badges[entry.code] }) }))];
}

export function navigationFor(subject: AccessSubject): NavigationItem[] {
  return navigationFrom(visibleModules(subject));
}

/** Module a page belongs to, used for its colour. */
export function moduleCodeForPath(pathname: string): string {
  return matchModule(pathname, moduleRegistry.filter((entry) => entry.status === 'live').map((entry) => ({ href: entry.href, module: entry.code })));
}

// Label shown in the central inbox, e.g. "[จองห้องประชุม]". Notifications from before module codes existed came from requests.
export function moduleLabel(code: string | null): string {
  const entry = moduleRegistry.find((candidate) => candidate.code === (code ?? 'requests'));
  return entry ? t(entry.labelKey) : t('appName');
}
