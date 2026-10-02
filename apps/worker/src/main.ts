import { readFileSync } from 'node:fs';
import { createDatabase } from '@backoffice/db';
import { NotificationConsumer } from './consumers/notification-consumer.ts';
import { OutboxConsumer } from './consumers/outbox-consumer.ts';
import { DatabaseNotificationStore } from './database-notification-store.ts';
import { DatabaseOutboxRepository } from './database-outbox-repository.ts';
import { createWorkerRuntime } from './worker-runtime.ts';

function runtimeValue(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  const file = process.env[`${name}_FILE`]?.trim();
  return file ? readFileSync(file, 'utf8').trim() : undefined;
}

const databaseUrl = runtimeValue('DATABASE_URL');
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const database = createDatabase(databaseUrl);
const notifications = new NotificationConsumer(
  new DatabaseNotificationStore(database),
  { deliverEmail: async () => { throw new Error('EMAIL_NOT_CONFIGURED'); } },
  { deliverInApp: async () => undefined }
);
const consumer = new OutboxConsumer(new DatabaseOutboxRepository(database), notifications);
const runtime = createWorkerRuntime({ publishBatch: () => consumer.publishOutboxBatch(), intervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? '5000') });

runtime.start();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    runtime.stop();
    void database.close().finally(() => process.exit(0));
  });
}
