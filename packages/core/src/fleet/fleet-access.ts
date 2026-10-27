import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** หัวหน้าหมวดยานพาหนะ: a hospital-wide `fleet.manage` role. Not data-owner gated. */
export function canManageFleet(subject: AccessSubject): boolean {
  return authorization.organizationScope(subject, 'fleet.manage') === 'all';
}
