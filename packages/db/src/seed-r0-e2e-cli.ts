import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createDatabase } from './client';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_NON_PRODUCTION_SEED !== '1') {
  throw new Error('Refusing to seed: set ALLOW_NON_PRODUCTION_SEED=1 outside production only');
}

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.R0_E2E_PASSWORD;
if (!databaseUrl || !password) throw new Error('DATABASE_URL and R0_E2E_PASSWORD are required');

const db = createDatabase(databaseUrl);
const scrypt = promisify(scryptCallback);
const organizationId = '00000000-0000-4000-8000-000000000001';
const requestorId = '00000000-0000-4000-8000-000000000002';
const approverId = '00000000-0000-4000-8000-000000000003';

try {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64) as Buffer;
  const passwordHash = `scrypt$${salt}$${derived.toString('base64url')}`;
  await db.transaction(async (tx) => {
    await tx.execute('INSERT IGNORE INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'R0 E2E test organization']);
    await tx.execute('INSERT IGNORE INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP()), (?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'non-production-placeholder', `e2e-requestor-${randomUUID()}`, approverId, 'non-production-placeholder', `e2e-approver-${randomUUID()}`]);
    await tx.execute('INSERT IGNORE INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()), (?, ?, ?, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [randomUUID(), requestorId, organizationId, approverId, randomUUID(), approverId, organizationId]);
    await tx.execute('INSERT INTO local_account (id, person_id, username, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP()), (?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)', [randomUUID(), requestorId, 'r0-e2e-requestor', passwordHash, randomUUID(), approverId, 'r0-e2e-approver', passwordHash]);
  });
  console.log('R0 E2E seed completed');
} finally {
  await db.close();
}
