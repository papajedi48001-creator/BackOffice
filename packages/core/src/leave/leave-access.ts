import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** HR's leave maintenance and every-ใบลา views: a hospital-wide `leave.manage` role with the HR data-owner assignment. */
export function canManageLeave(subject: AccessSubject): boolean {
  return authorization.canActHospitalWide(subject, 'leave.manage', 'hr');
}
