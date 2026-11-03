import { createDatabase, readRuntimeValue } from '@backoffice/db';
import { LineAlertConsumer } from './consumers/line-alert-consumer.ts';
import { NotificationConsumer } from './consumers/notification-consumer.ts';
import { OutboxConsumer, toFailureCode } from './consumers/outbox-consumer.ts';
import { DatabaseLineStore } from './database-line-store.ts';
import { DatabaseNotificationStore } from './database-notification-store.ts';
import { createLineClient } from './line-client.ts';
import { DatabaseOutboxRepository } from './database-outbox-repository.ts';
import { createWorkerRuntime } from './worker-runtime.ts';
import { waitForDatabaseUrl } from './database-config.ts';

const databaseUrl = await waitForDatabaseUrl();

const database = createDatabase(databaseUrl);
// การแจ้งเตือน LINE: without LINE_CHANNEL_ACCESS_TOKEN alerts are still queued but nothing is pushed (docs/runbooks/line-alert.md).
const lineStore = new DatabaseLineStore(database);
const lineAlerts = new LineAlertConsumer(lineStore, createLineClient(readRuntimeValue('LINE_CHANNEL_ACCESS_TOKEN')), readRuntimeValue('BACKOFFICE_PUBLIC_URL') ?? null);
const notifications = new NotificationConsumer(
  new DatabaseNotificationStore(database),
  { deliverEmail: async () => { throw new Error('EMAIL_NOT_CONFIGURED'); } },
  { deliverInApp: async () => undefined },
  lineStore,
  lineAlerts
);
const consumer = new OutboxConsumer(new DatabaseOutboxRepository(database), notifications);
const runtime = createWorkerRuntime({
  publishBatch: () => consumer.publishOutboxBatch(),
  intervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? '5000'),
  onError: (error) => console.error('backoffice.worker.batch_failed', { code: toFailureCode(error) })
});

runtime.start();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    runtime.stop();
    void database.close().finally(() => process.exit(0));
  });
}
