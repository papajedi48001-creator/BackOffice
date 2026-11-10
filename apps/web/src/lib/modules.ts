import type { AccessSubject, ModuleMode } from '@backoffice/contracts';
import { canCommandMci, loadActor, mciCan, MciQueries, canDecideOwnRequest, AuthorizationService, FleetQueries, canUseModule, isAdmin, LeaveQueries, OfficialTravelQueries, RoomBookingQueries, canManageFleet, canManageLeave, canManageTravel, hasOpenRequestWork, listPendingApprovals } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { t, type MessageKey } from '@backoffice/i18n';
import type { NavigationItem } from '../components/app-shell';
import { matchModule } from './module-theme';
import { canInventory } from './inventory-access';

export type ModuleGroup = 'mine' | 'people' | 'services' | 'governance';
export type ModuleIconName = 'requests' | 'bell' | 'people' | 'org' | 'upload' | 'shield' | 'delegate' | 'audit' | 'wrench' | 'package' | 'room' | 'car' | 'clock' | 'leave' | 'travel' | 'asset' | 'monitor' | 'target' | 'heart' | 'settings';

/** One page inside a module, shown in the module's section bar rather than on the main page. */
export interface ModuleSection {
  href: string;
  labelKey: MessageKey;
  /** Hides the link only; the page checks access itself. */
  visible(subject: AccessSubject): boolean;
  /** Work waiting for this person, shown on the section tab. */
  badge?(db: Database, subject: AccessSubject): Promise<number>;
  /** Hides the link when the person has nothing to do there; like visible, never a security check. */
  available?(db: Database, subject: AccessSubject): Promise<boolean>;
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
  /** The module's main ยื่นคำขอ action, shown as the large icon button at the top of every page of the module. Request modules only; never a data-management action. The target page checks access itself. */
  submitAction?: SubmitAction;
}

export type SubmitIconName = 'leave' | 'travel' | 'car' | 'room';
export interface SubmitAction { href: string; label: MessageKey; icon: SubmitIconName; }

const everyone = () => true;
const unreadNotices = async (db: Database, subject: AccessSubject) => subject.personId ? Number((await db.query<{ total: number }>('SELECT COUNT(*) AS total FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [subject.personId, 'in_app']))[0]?.total ?? 0) : 0;
// A ผู้ดูแลระบบ is ผู้จัดการ of every module, so role-gated sections show for them too.
const hasRole = (...names: string[]) => (subject: AccessSubject) => isAdmin(subject) || subject.roles.some((role) => names.includes(role.name));
const authorization = new AuthorizationService();
const withSections = (entry: Omit<ModuleEntry, 'visible'>, sections: readonly ModuleSection[]): ModuleEntry => ({ ...entry, sections, visible: (subject) => sections.some((section) => section.visible(subject)) });
const planned = (code: string, href: string, labelKey: MessageKey, descriptionKey: MessageKey, icon: ModuleIconName): ModuleEntry => ({ code, href, labelKey, descriptionKey, icon, group: 'services', status: 'planned', visible: everyone });

/** Whether the person holds the permission for at least one หน่วยงาน (or all of them). */
const covers = (subject: AccessSubject, permission: 'room.booking.decide' | 'room.manage') => { const scope = authorization.organizationScope(subject, permission); return scope === 'all' || scope.length > 0; };
/** Room bookings waiting for this approver; anyone without the approver role gets 0 without a query. */
const roomsPending = async (db: Database, subject: AccessSubject) => (subject.personId ? (await new RoomBookingQueries(db).pendingForApprover({ personId: subject.personId, roles: subject.roles, activeRole: subject.activeRole ?? null })).length : 0);
/** ใบ รอจัดรถ, for the หัวหน้าหมวดยานพาหนะ only. */
const fleetWaiting = async (db: Database, subject: AccessSubject) => (subject.personId && canManageFleet(subject) ? new FleetQueries(db).waitingCount() : 0);
/** The person's เที่ยวรถ today that have not left yet; 0 for anyone who does not drive. */
const fleetDriverToday = async (db: Database, subject: AccessSubject) => (subject.personId ? new FleetQueries(db).driverTodayCount(subject.personId) : 0);

/** What the person may do in the open เหตุ, from their own check-in; nothing when no เหตุ is open. Hides links only. */
const mciMay = (action: 'viewPatients' | 'manageResponder') => async (db: Database, subject: AccessSubject) => {
  if (canCommandMci(subject)) return true;
  const incident = await new MciQueries(db).openIncident();
  if (!incident || !subject.personId) return false;
  const actor = await loadActor(db, incident.id, subject.personId);
  return action === 'manageResponder' ? actor?.commandRole === 'ZONE_LEAD' : mciCan(actor, false, action);
};

export const moduleRegistry: readonly ModuleEntry[] = [
  {
    code: 'requests', href: '/requests', labelKey: 'requests', descriptionKey: 'moduleRequestsDescription', icon: 'requests', group: 'mine', status: 'live', visible: everyone,
    // Every module's approvals wait here, so a ใบลา for the director counts on both คำขอ and การลา.
    badge: async (db, subject) => subject.personId ? (await listPendingApprovals(db, subject.personId)).length : 0,
    available: async (db, subject) => subject.personId ? hasOpenRequestWork(db, subject.personId) : false
  },
  {
    code: 'notifications', href: '/notifications', labelKey: 'notifications', descriptionKey: 'moduleNotificationsDescription', icon: 'bell', group: 'mine', status: 'live', visible: everyone,
    badge: unreadNotices,
    // Shown only while something is unread; reading the last one takes the menu away.
    available: async (db, subject) => (await unreadNotices(db, subject)) > 0
  },
  withSections({ code: 'hr', href: '/hr', labelKey: 'moduleHr', descriptionKey: 'moduleHrDescription', icon: 'people', group: 'people', status: 'live' }, [
    { href: '/hr/people', labelKey: 'people', visible: hasRole('hr-reader', 'hr-manager') },
    { href: '/hr/organizations', labelKey: 'organizations', visible: hasRole('hr-reader', 'hr-manager') },
    { href: '/hr/imports', labelKey: 'hrImport', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') },
    { href: '/hr/employment-types', labelKey: 'hrEmploymentTypes', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') },
    { href: '/hr/positions', labelKey: 'hrPositions', visible: (subject) => authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr') },
    // Last, so HR staff still land on the people list; everyone else lands here.
    { href: '/hr/me', labelKey: 'hrMyProfile', visible: everyone }
  ]),
  withSections({ code: 'access', href: '/access', labelKey: 'moduleAccess', descriptionKey: 'moduleAccessDescription', icon: 'shield', group: 'governance', status: 'live' }, [
    { href: '/access/roles', labelKey: 'roles', visible: hasRole('hr-manager') },
    { href: '/access/delegations', labelKey: 'delegations', visible: hasRole('hr-manager') },
    { href: '/access/audit', labelKey: 'audit', visible: everyone },
    { href: '/access/self-approvals', labelKey: 'selfApprovals', visible: isAdmin }
  ]),
  {
    ...withSections({ code: 'room-booking', href: '/rooms', labelKey: 'moduleRoomBooking', descriptionKey: 'moduleRoomBookingDescription', icon: 'room', group: 'services', status: 'live' }, [
      { href: '/rooms/dashboard', labelKey: 'roomDashboard', visible: everyone },
      { href: '/rooms/calendar', labelKey: 'roomWeekCalendar', visible: everyone },
      { href: '/rooms/bookings', labelKey: 'myRoomBookings', visible: everyone },
      { href: '/rooms/approvals', labelKey: 'roomApprovals', visible: (subject) => covers(subject, 'room.booking.decide'), badge: roomsPending },
      { href: '/rooms/manage', labelKey: 'roomManage', visible: (subject) => covers(subject, 'room.manage') }
    ]),
    submitAction: { href: '/rooms/bookings/new', label: 'bookRoom', icon: 'room' },
    badge: roomsPending
  },
  {
    ...withSections({ code: 'leave', href: '/leave', labelKey: 'moduleLeave', descriptionKey: 'moduleLeaveDescription', icon: 'leave', group: 'mine', status: 'live' }, [
      { href: '/leave/mine', labelKey: 'leaveMine', visible: everyone },
      // Approvers are unit heads and ผู้แทน, not a role, so the link stays cheap and the page shows its own empty state.
      { href: '/leave/approvals', labelKey: 'leaveApprovals', visible: everyone, badge: async (db, subject) => subject.personId ? new LeaveQueries(db).pendingCount(subject.personId, { includeOwn: canDecideOwnRequest(subject.activeRole) }) : 0 },
      { href: '/leave/calendar', labelKey: 'leaveCalendar', visible: everyone },
      { href: '/leave/all', labelKey: 'leaveAll', visible: canManageLeave },
      { href: '/leave/settings', labelKey: 'leaveSettings', visible: canManageLeave },
      { href: '/leave/holidays', labelKey: 'leaveHolidays', visible: canManageLeave },
      { href: '/leave/balances', labelKey: 'leaveBalances', visible: canManageLeave }
    ]),
    submitAction: { href: '/leave/new', label: 'leaveNew', icon: 'leave' },
    badge: async (db, subject) => subject.personId ? new LeaveQueries(db).pendingCount(subject.personId, { includeOwn: canDecideOwnRequest(subject.activeRole) }) : 0
  },
  {
    ...withSections({ code: 'official-travel', href: '/travel', labelKey: 'moduleTravel', descriptionKey: 'moduleTravelDescription', icon: 'travel', group: 'mine', status: 'live' }, [
      { href: '/travel/mine', labelKey: 'travelMine', visible: everyone },
      // Approvers are unit heads and ผู้แทน, not a role, as in leave.
      { href: '/travel/approvals', labelKey: 'travelApprovals', visible: everyone, badge: async (db, subject) => subject.personId ? new OfficialTravelQueries(db).pendingCount(subject.personId, { includeOwn: canDecideOwnRequest(subject.activeRole) }) : 0, available: async (db, subject) => subject.personId ? new OfficialTravelQueries(db).canApprove(subject.personId) : false },
      { href: '/travel/all', labelKey: 'travelAll', visible: canManageTravel },
      { href: '/travel/settings', labelKey: 'travelSettings', visible: canManageTravel }
    ]),
    submitAction: { href: '/travel/new', label: 'travelSubmitAction', icon: 'travel' },
    badge: async (db, subject) => subject.personId ? new OfficialTravelQueries(db).pendingCount(subject.personId, { includeOwn: canDecideOwnRequest(subject.activeRole) }) : 0
  },
  planned('maintenance', '/maintenance', 'moduleMaintenance', 'moduleMaintenanceDescription', 'wrench'),
  withSections({ code: 'inventory', href: '/inventory', labelKey: 'moduleInventory', descriptionKey: 'moduleInventoryDescription', icon: 'package', group: 'services', status: 'live' }, [
    { href: '/inventory/stock', labelKey: 'inventoryStock', visible: (subject) => canInventory(subject, 'inventory.stock.read') },
    { href: '/inventory/receipts', labelKey: 'inventoryReceipts', visible: (subject) => canInventory(subject, 'inventory.stock.receive') },
    { href: '/inventory/opening', labelKey: 'inventoryOpening', visible: (subject) => canInventory(subject, 'inventory.stock.receive', 'inventory.opening.certify') },
    { href: '/inventory/items', labelKey: 'inventoryItems', visible: (subject) => canInventory(subject, 'inventory.item.manage') },
    { href: '/inventory/vendors', labelKey: 'inventoryVendors', visible: (subject) => canInventory(subject, 'inventory.item.manage') }
  ]),
  {
    ...withSections({ code: 'fleet', href: '/fleet', labelKey: 'moduleFleet', descriptionKey: 'moduleFleetDescription', icon: 'car', group: 'services', status: 'live' }, [
      { href: '/fleet/dashboard', labelKey: 'fleetDashboard', visible: canManageFleet, badge: fleetWaiting },
      { href: '/fleet/mine', labelKey: 'fleetMine', visible: everyone },
      { href: '/fleet/calendar', labelKey: 'fleetCalendar', visible: everyone },
      // A พนักงานขับรถ is a fleet_driver row, not a role, so the database check decides; the page checks again.
      { href: '/fleet/driving', labelKey: 'fleetDriving', visible: everyone, available: async (db, subject) => (subject.personId ? new FleetQueries(db).isActiveDriver(subject.personId) : false), badge: fleetDriverToday },
      { href: '/fleet/settings', labelKey: 'fleetSettings', visible: canManageFleet }
    ]),
    submitAction: { href: '/fleet/new', label: 'fleetNew', icon: 'car' },
    badge: async (db, subject) => (await fleetWaiting(db, subject)) + (await fleetDriverToday(db, subject))
  },
  // อุบัติเหตุหมู่: /mci itself is the public รายงานตัว page (app/mci), which sends a signed-in person on to ภาพรวม.
  withSections({ code: 'mass-casualty', href: '/mci', labelKey: 'moduleMassCasualty', descriptionKey: 'moduleMassCasualtyDescription', icon: 'heart', group: 'services', status: 'live' }, [
    { href: '/mci/ops', labelKey: 'mciOps', visible: everyone },
    { href: '/mci/patients', labelKey: 'mciPatients', visible: everyone, available: mciMay('viewPatients') },
    { href: '/mci/staff', labelKey: 'mciStaff', visible: everyone, available: mciMay('manageResponder') },
    { href: '/mci/incidents', labelKey: 'mciIncidents', visible: canCommandMci },
    { href: '/mci/settings', labelKey: 'mciSettings', visible: canCommandMci }
  ]),
  // ผู้ดูแลระบบ only. A new admin page is one more section here and one page under app/(app)/admin.
  withSections({ code: 'admin', href: '/admin', labelKey: 'moduleAdmin', descriptionKey: 'moduleAdminDescription', icon: 'settings', group: 'governance', status: 'live' }, [
    { href: '/admin/connections', labelKey: 'adminConnections', visible: isAdmin },
    { href: '/admin/modules', labelKey: 'adminModules', visible: isAdmin },
    { href: '/admin/grants', labelKey: 'adminGrants', visible: isAdmin },
    { href: '/admin/line', labelKey: 'adminLine', visible: isAdmin },
    { href: '/admin/provider-links', labelKey: 'adminProvider', visible: isAdmin },
    { href: '/admin/audit', labelKey: 'adminAudit', visible: isAdmin }
  ]),
  planned('attendance', '/attendance', 'moduleAttendance', 'moduleAttendanceDescription', 'clock'),
  planned('asset-register', '/assets', 'moduleAssetRegister', 'moduleAssetRegisterDescription', 'asset'),
  planned('computer-center', '/it', 'moduleComputerCenter', 'moduleComputerCenterDescription', 'monitor'),
  planned('planning', '/planning', 'modulePlanning', 'modulePlanningDescription', 'target'),
  planned('donor-registry', '/donors', 'moduleDonorRegistry', 'moduleDonorRegistryDescription', 'heart')
];

/** Live modules the person can see, in registry order; planned modules (the "โมดูลที่กำลังพัฒนา" strip) for ผู้ดูแลระบบ only. */
export function visibleModules(subject: AccessSubject): ModuleEntry[] {
  return moduleRegistry.filter((entry) => entry.status === 'planned' ? isAdmin(subject) : entry.visible(subject));
}

/**
 * Drops modules the person may not use in their current mode (ตั้งค่าโปรแกรม): OFF for everyone, DEVELOPMENT for anyone but
 * ผู้ดูแลระบบ, the module's ผู้จัดการ and ผู้ทดสอบ. The admin module always stays. Pages and APIs are refused by the proxy.
 */
export function usableModules(modules: ModuleEntry[], modes: Readonly<Record<string, ModuleMode>>, subject: AccessSubject): ModuleEntry[] {
  return modules.filter((entry) => entry.status === 'planned' || canUseModule(subject, entry.code, modes[entry.code] ?? 'ON'));
}

/** Whether a live module is in DEVELOPMENT mode, for the กำลังพัฒนา marker on its tile and menu item. */
export function inDevelopment(code: string, modes: Readonly<Record<string, ModuleMode>>): boolean {
  return modes[code] === 'DEVELOPMENT';
}

export function moduleSections(code: string, subject: AccessSubject): ModuleSection[] {
  return (moduleRegistry.find((entry) => entry.code === code)?.sections ?? []).filter((section) => section.visible(subject));
}

/** Drops section links whose availability check says the person has nothing to do there; a check that fails keeps the link. */
export async function availableSections(sections: ModuleSection[], db: Database, subject: AccessSubject): Promise<ModuleSection[]> {
  const shown = await Promise.all(sections.map((section) => section.available ? section.available(db, subject).catch(() => true) : true));
  return sections.filter((_, index) => shown[index]);
}

/** Drops modules whose availability check says there is nothing to show; a check that fails keeps the module. */
export async function availableModules(modules: ModuleEntry[], db: Database, subject: AccessSubject): Promise<ModuleEntry[]> {
  const shown = await Promise.all(modules.map((entry) => entry.available ? entry.available(db, subject).catch(() => true) : true));
  return modules.filter((_, index) => shown[index]);
}

export function navigationFrom(modules: ModuleEntry[], badges: Record<string, number | undefined> = {}, modes: Readonly<Record<string, ModuleMode>> = {}): NavigationItem[] {
  return [{ href: '/dashboard', label: 'dashboard', module: 'home' }, ...modules.filter((entry) => entry.status === 'live').map((entry) => ({ href: entry.href, label: entry.labelKey, module: entry.code, ...(badges[entry.code] === undefined ? {} : { badge: badges[entry.code] }), ...(inDevelopment(entry.code, modes) ? { development: true } : {}), ...(entry.submitAction ? { submitAction: entry.submitAction } : {}) }))];
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
