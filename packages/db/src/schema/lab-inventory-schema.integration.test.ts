import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('lab inventory schema (migration 0034)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const itemId = randomUUID();
  const lotIds = [randomUUID(), randomUUID()];
  const count = async (sql: string) => Number((await db.query<{ total: number }>(sql))[0]!.total);

  beforeAll(async () => {
    await runMigrations(db);
    await db.execute("INSERT INTO lab_item (id, code, name, receive_unit, use_unit, units_per_receive, expiry_warn_days, is_active, created_at, updated_at) VALUES (?, ?, 'ทดสอบ', 'กล่อง', 'ขวด', 10, 90, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [itemId, `T-${itemId.slice(0, 8)}`]);
  });

  afterAll(async () => {
    await db.execute('DELETE FROM lab_lot_balance WHERE lot_id IN (?, ?)', lotIds);
    await db.execute('DELETE FROM lab_lot WHERE item_id = ?', [itemId]);
    await db.execute('DELETE FROM lab_item WHERE id = ?', [itemId]);
    await db.close();
  });

  it('seeds one main store, six sections each with a store, five usage types and a draft opening', async () => {
    expect(await count("SELECT COUNT(*) AS total FROM lab_store WHERE kind = 'MAIN'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS total FROM lab_section WHERE id LIKE '00000000-0000-4000-b000-%'")).toBe(6);
    expect(await count("SELECT COUNT(*) AS total FROM lab_store s JOIN lab_section c ON c.id = s.section_id WHERE s.kind = 'SECTION' AND c.id LIKE '00000000-0000-4000-b000-%'")).toBe(6);
    expect(await count("SELECT COUNT(*) AS total FROM lab_usage_type WHERE id LIKE '00000000-0000-4000-b000-%'")).toBe(5);
    // The migration seeds DRAFT; core suites move it later on a shared database, so only the row's presence is checked here.
    expect(['DRAFT', 'SUBMITTED', 'CERTIFIED']).toContain((await db.query<{ v: string }>("SELECT setting_value AS v FROM lab_setting WHERE setting_key = 'opening_status'"))[0]?.v);
    expect(readFileSync(new URL('../../migrations/0034_lab_inventory.sql', import.meta.url), 'utf8')).toMatch(/'opening_status',\s*'DRAFT'/);
  });

  it('merges lots with the same item, lot number, missing expiry and cost', async () => {
    const insert = (lotId: string) => db.execute("INSERT INTO lab_lot (id, item_id, lot_no, expiry_date, unit_cost, source, created_at) VALUES (?, ?, 'L1', NULL, 12.5000, 'OPENING', UTC_TIMESTAMP())", [lotId, itemId]);
    await insert(lotIds[0]!);
    await expect(insert(lotIds[1]!)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('refuses a negative balance', async () => {
    const mainStore = (await db.query<{ id: string }>("SELECT id FROM lab_store WHERE kind = 'MAIN'"))[0]!.id;
    await expect(db.execute('INSERT INTO lab_lot_balance (lot_id, store_id, quantity) VALUES (?, ?, -1)', [lotIds[0], mainStore])).rejects.toThrow();
  });
});
