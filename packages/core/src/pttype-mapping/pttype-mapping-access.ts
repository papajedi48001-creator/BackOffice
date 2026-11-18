import type { AccessSubject } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** ผู้ดูแลระบบ or ผู้จัดการโมดูล Mapping สิทธิ (`pttype-mapping.manage`): the only people who see the module or change a mapping. */
export function canManagePttypeMapping(subject: AccessSubject): boolean {
  return authorization.organizationScope(subject, 'pttype-mapping.manage') === 'all';
}
