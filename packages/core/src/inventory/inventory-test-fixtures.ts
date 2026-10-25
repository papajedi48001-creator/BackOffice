import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import type { InventoryActor } from '@backoffice/contracts';
import { DatabaseInventoryRepository } from './database-inventory-repository';
import { InventoryReceiptService } from './receipt-service';

// Shared by the MariaDB suites only; not exported from the package.
/** The opening balance is one per database, so every suite brings it to CERTIFIED the same way. */
export async function ensureCertifiedOpening(database: Database, officer: InventoryActor, supervisor: InventoryActor, line: { itemId: string; unitKind: 'ISSUE'; quantity: number; unitPrice: number }): Promise<void> {
  const service = new InventoryReceiptService(new DatabaseInventoryRepository(database));
  let opening = await service.openOpening(officer);
  if (opening.status === 'DRAFT') {
    await service.saveOpeningLines(officer, { lines: [line] });
    opening = await service.submitOpening(officer);
  }
  if (opening.status === 'SUBMITTED') await service.decideOpening(supervisor, { decision: 'CERTIFY' });
}

export async function seedInventoryPeople(database: Database): Promise<{ officer: InventoryActor; supervisor: InventoryActor }> {
  const officerId = randomUUID();
  const supervisorId = randomUUID();
  for (const [id, name] of [[officerId, 'เจ้าหน้าที่พัสดุ ทดสอบ'], [supervisorId, 'หัวหน้างานพัสดุ ทดสอบ']] as const) {
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), name]);
  }
  for (const [personId, roleName] of [[officerId, 'inventory-officer'], [supervisorId, 'inventory-supervisor']] as const) {
    await database.execute('INSERT IGNORE INTO role (id, name, created_at) VALUES (UUID(), ?, UTC_TIMESTAMP())', [roleName]);
    await database.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) SELECT UUID(), ?, id, NULL, UTC_TIMESTAMP() FROM role WHERE name = ?', [personId, roleName]);
  }
  return { officer: { personId: officerId, roles: [{ name: 'inventory-officer', organizationId: null }] }, supervisor: { personId: supervisorId, roles: [{ name: 'inventory-supervisor', organizationId: null }] } };
}
