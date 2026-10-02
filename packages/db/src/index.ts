export { createDatabase, type Database } from './client.ts';
export { runMigrations } from './migrate.ts';

export async function seedPerson(db: import('./client.ts').Database, input: { personId: string; nationalIdCiphertext: string; nationalIdLookup: string }): Promise<void> {
  await db.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [input.personId, input.nationalIdCiphertext, input.nationalIdLookup]);
}

export async function linkIdentity(db: import('./client.ts').Database, input: { personId: string; issuer: string; subject: string }): Promise<void> {
  await db.execute('INSERT INTO identity_link (id, person_id, issuer, subject, created_at) VALUES (UUID(), ?, ?, ?, UTC_TIMESTAMP())', [input.personId, input.issuer, input.subject]);
}

export * from './schema/core.ts';
export * from './schema/hr.ts';
export * from './schema/access.ts';
export * from './schema/workflow.ts';
export * from './schema/audit.ts';
export * from './schema/files.ts';
export * from './schema/outbox.ts';
