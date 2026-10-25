import type { InventoryActor, Permission } from '@backoffice/contracts';
import { AuthorizationService, canInventory, DatabaseInventoryCatalogRepository, DatabaseInventoryRepository, InventoryCatalogService, InventoryQueries, InventoryReceiptService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';

export function inventoryDatabase(): Database {
  const database = getSharedDatabase();
  if (!database) throw new Error('SERVICE_UNAVAILABLE');
  return database;
}

export const catalogService = () => new InventoryCatalogService(new DatabaseInventoryCatalogRepository(inventoryDatabase()));
export const receiptService = () => new InventoryReceiptService(new DatabaseInventoryRepository(inventoryDatabase()));
export const inventoryQueries = () => new InventoryQueries(inventoryDatabase());

/** Read-only routes check here; writes are checked again inside the services. */
export function requireAnyInventoryPermission(actor: InventoryActor, ...permissions: Permission[]): void {
  const authorizer = new AuthorizationService();
  if (!permissions.some((permission) => canInventory(authorizer, actor, permission))) throw new Error('FORBIDDEN');
}
