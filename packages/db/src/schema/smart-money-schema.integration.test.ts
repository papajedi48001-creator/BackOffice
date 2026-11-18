import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('smart money schema (migration 0038)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  beforeAll(async () => { await runMigrations(db); });
  afterAll(async () => { await db.close(); });

  it('creates the member and member-page tables', async () => {
    const tables = await db.query<{ name: string }>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('money_member', 'money_member_page') ORDER BY table_name");
    expect(tables.map((row) => row.name)).toEqual(['money_member', 'money_member_page']);
  });

  it('refuses a page row without a member', async () => {
    await expect(db.execute("INSERT INTO money_member_page (person_id, page) VALUES ('00000000-0000-4000-8000-000000000999', 'dental')")).rejects.toThrow();
  });

  it('keeps one NHSO dataset per หน่วยบริการ and ปีงบ (migration 0041)', async () => {
    const columns = await db.query<{ name: string }>("SELECT column_name AS name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'money_nhso_dataset' AND constraint_name = 'PRIMARY' ORDER BY ordinal_position");
    expect(columns.map((row) => row.name)).toEqual(['hcode', 'fy']);
  });

  it('keeps one FDH document per kind and เลขที่เอกสาร, stored as ciphertext (migration 0042)', async () => {
    const columns = await db.query<{ name: string }>("SELECT column_name AS name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'money_fdh_document' AND constraint_name = 'PRIMARY' ORDER BY ordinal_position");
    expect(columns.map((row) => row.name)).toEqual(['kind', 'doc_no']);
    const plain = await db.query<{ name: string }>("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'money_fdh_document' AND column_name IN ('pid', 'name', 'document_json')");
    expect(plain).toEqual([]);
  });
});
