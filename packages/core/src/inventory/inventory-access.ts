import { INVENTORY_MODULE, type InventoryActor, type Permission } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

/** The store belongs to the whole hospital, so only roles granted without a unit count. */
export function canInventory(authorizer: AuthorizationService, actor: InventoryActor, permission: Permission): boolean {
  return authorizer.canActHospitalWide({ authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] }, permission, INVENTORY_MODULE);
}

export function requireInventoryPermission(authorizer: AuthorizationService, actor: InventoryActor, permission: Permission): void {
  if (!canInventory(authorizer, actor, permission)) throw new Error('FORBIDDEN');
}
