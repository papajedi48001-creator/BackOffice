import { randomUUID } from 'node:crypto';
import { createDatabase, runMigrations } from '@backoffice/db';
import { DatabaseOutboxRepository } from './database-outbox-repository';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DatabaseOutboxRepository against MariaDB', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

  beforeAll(async () => { await runMigrations(db); });
  afterAll(async () => { await db.close(); });

  it('backs off a failing event and stops selecting it once dead-lettered', async () => {
    const id = randomUUID();
    // Oldest first, so other suites' pending events in the shared database never push it past the batch limit.
    await db.execute("INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at) VALUES (?, 'notification.in_app', ?, '{not json', '2000-01-01 00:00:00')", [id, `retry-test:${id}`]);
    const repository = new DatabaseOutboxRepository(db, { maxAttempts: 3 });
    expect((await repository.pending()).find((event) => event.id === id)?.payload).toEqual({});

    const waits: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await repository.markFailed(id, 'INVALID_NOTIFICATION_EVENT');
      const row = (await db.query<{ attempts: number; wait: number; dead: number }>('SELECT attempts, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), next_attempt_at) AS wait, dead_lettered_at IS NOT NULL AS dead FROM outbox_event WHERE id = ?', [id]))[0]!;
      waits.push(Number(row.wait));
      if (attempt >= 2) expect([Number(row.attempts), Number(row.dead)]).toEqual([3, 1]);
    }

    expect(waits.slice(0, 3).map((wait) => Math.round(wait / 30))).toEqual([1, 2, 4]);
    expect((await repository.pending()).some((event) => event.id === id)).toBe(false);
  });
});
