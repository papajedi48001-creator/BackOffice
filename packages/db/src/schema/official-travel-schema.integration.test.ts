import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('official travel schema (migration 0013)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

  beforeAll(async () => {
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('seeds the three travel types in sort order, all approved at hospital level', async () => {
    const rows = await db.query<{ code: string; name: string; target: string }>('SELECT code, name, approval_target AS target FROM official_travel_type ORDER BY sort_order');
    expect(rows.map((row) => [row.code, row.name])).toEqual([['IN_PROVINCE', 'ในจังหวัด'], ['OUT_OF_PROVINCE', 'ต่างจังหวัด'], ['ABROAD', 'ต่างประเทศ']]);
    expect(rows.every((row) => row.target === 'HOSPITAL')).toBe(true);
  });

  it('keeps the seeds unchanged when migrations run again', async () => {
    await runMigrations(db);
    const [types] = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM official_travel_type');
    expect(Number(types?.count)).toBe(3);
  });
});
