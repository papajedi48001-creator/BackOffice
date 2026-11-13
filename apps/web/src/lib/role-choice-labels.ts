import { t, type MessageKey } from '@backoffice/i18n';
import { isTesterRole, roleLabel } from './admin-labels';

/** บุคลากรทั่วไป; the same code as `EMPLOYEE_ROLE` in core (kept literal so client bundles do not pull in core). */
const EMPLOYEE_ROLE = 'employee';

const extraNames: Record<string, MessageKey> = { [EMPLOYEE_ROLE]: 'roleEmployee', manager: 'roleManagerTier', 'hr-reader': 'roleHrReader', 'data-exporter': 'roleDataExporter', 'room-booking-approver': 'roleRoomBookingApprover', 'inventory-supervisor': 'roleInventorySupervisor' };
const descriptions: Record<string, MessageKey> = {
  [EMPLOYEE_ROLE]: 'roleDescEmployee', admin: 'roleDescAdmin', manager: 'roleDescManagerTier', 'hr-manager': 'roleDescHrManager', 'hr-reader': 'roleDescHrReader', 'leave-manager': 'roleDescLeaveManager', 'travel-manager': 'roleDescTravelManager',
  'room-manager': 'roleDescRoomManager', 'room-booking-approver': 'roleDescRoomBookingApprover', 'inventory-officer': 'roleDescInventoryOfficer', 'inventory-supervisor': 'roleDescInventorySupervisor', 'fleet-manager': 'roleDescFleetManager', 'mci-manager': 'roleDescMciManager', 'attendance-manager': 'roleDescAttendanceManager', 'attendance-scheduler': 'roleDescAttendanceScheduler', 'attendance-auditor': 'roleDescAttendanceAuditor', 'data-exporter': 'roleDescDataExporter', 'lab-manager': 'roleDescLabManager', 'money-manager': 'roleDescMoneyManager'
};

/** Thai name of a บทบาท, `employee` (บุคลากรทั่วไป) included. */
export function roleChoiceName(role: string): string {
  return role in extraNames ? t(extraNames[role]!) : roleLabel(role);
}

/** One line on what the บทบาท lets the person do; empty for an unknown role. */
export function roleChoiceDescription(role: string): string {
  if (isTesterRole(role)) return t('roleDescTester');
  return role in descriptions ? t(descriptions[role]!) : '';
}
