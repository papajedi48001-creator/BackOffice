import { createDatabase } from './client';

// Needs a MariaDB account; skipped without DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('read-only transactions', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  afterAll(async () => { await database.close(); });

  it('allows reads inside a readOnly transaction', async () => {
    const rows = await database.transaction((tx) => tx.query<{ one: number }>('SELECT 1 AS one'), { readOnly: true });
    expect(rows).toEqual([{ one: 1 }]);
  });

  it('refuses an UPDATE inside a readOnly transaction', async () => {
    await database.execute('CREATE TABLE IF NOT EXISTS bo_read_only_probe_u (id INT)');
    try {
      await expect(database.transaction((tx) => tx.execute('INSERT INTO bo_read_only_probe_u VALUES (1)'), { readOnly: true })).rejects.toMatchObject({ code: 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION' });
      // The next ordinary transaction on the pool may write again.
      await database.transaction((tx) => tx.execute('INSERT INTO bo_read_only_probe_u VALUES (2)'));
      expect(await database.query('SELECT id FROM bo_read_only_probe_u')).toEqual([{ id: 2 }]);
    } finally { await database.execute('DROP TABLE IF EXISTS bo_read_only_probe_u'); }
  });
});
