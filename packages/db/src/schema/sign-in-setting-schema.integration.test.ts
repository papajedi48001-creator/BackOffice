import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('sign_in_setting (migration 0037)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const personId = randomUUID();

  beforeAll(async () => {
    await runMigrations(db);
    await db.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [personId, 'ciphertext', randomUUID(), 'ทดสอบ']);
  });

  afterAll(async () => {
    await db.execute('DELETE FROM person WHERE id = ?', [personId]);
    await db.close();
  });

  it('round-trips a row and refuses an unknown actor; the rows are rolled back so real settings are untouched', async () => {
    const rolledBack = new Error('ROLLBACK');
    await expect(db.transaction(async (tx) => {
      await tx.execute('DELETE FROM sign_in_setting WHERE method = ?', ['THAID']);
      await tx.execute('INSERT INTO sign_in_setting (method, enabled, settings_json, secret_ciphertext, updated_by_person_id, updated_at) VALUES (?, 1, ?, ?, ?, UTC_TIMESTAMP())', ['THAID', '{"clientId":"c"}', 'sealed', personId]);
      const rows = await tx.query<{ enabled: number; settingsJson: string; secret: string | null }>('SELECT enabled, settings_json AS settingsJson, secret_ciphertext AS secret FROM sign_in_setting WHERE method = ?', ['THAID']);
      expect(rows).toEqual([{ enabled: 1, settingsJson: '{"clientId":"c"}', secret: 'sealed' }]);
      await expect(tx.execute('INSERT INTO sign_in_setting (method, enabled, settings_json, updated_by_person_id, updated_at) VALUES (?, 0, ?, ?, UTC_TIMESTAMP())', ['PROVIDER_ID', '{}', randomUUID()])).rejects.toThrow();
      throw rolledBack;
    })).rejects.toBe(rolledBack);
  });
});
