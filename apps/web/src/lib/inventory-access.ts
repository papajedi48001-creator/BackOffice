import { INVENTORY_MODULE, type AccessSubject, type Permission } from '@backoffice/contracts';
import { AuthorizationService } from '@backoffice/core';

const authorization = new AuthorizationService();

/** Hides links only; every inventory page and API checks again on the server. */
export function canInventory(subject: AccessSubject, ...permissions: Permission[]): boolean {
  return permissions.some((permission) => authorization.canActHospitalWide(subject, permission, INVENTORY_MODULE));
}
