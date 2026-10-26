import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** HR's travel settings and every-trip view: a hospital-wide `travel.manage` role with the HR data-owner assignment. */
export function canManageTravel(subject: AccessSubject): boolean {
  return authorization.canActHospitalWide(subject, 'travel.manage', 'hr');
}
