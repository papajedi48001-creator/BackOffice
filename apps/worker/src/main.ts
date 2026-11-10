import { connectionSecretBoxFrom, HolidaySyncService, HosxpSettingsService, readHosxpHolidays } from '@backoffice/core/holidays';
import { createDatabase, readRuntimeValue } from '@backoffice/db';
import { LineAlertConsumer } from './consumers/line-alert-consumer.ts';
import { MciLineBroadcastConsumer } from './consumers/mci-line-broadcast-consumer.ts';
import { NotificationConsumer } from './consumers/notification-consumer.ts';
import { OutboxConsumer, toFailureCode } from './consumers/outbox-consumer.ts';
import { DatabaseLineStore } from './database-line-store.ts';
import { DatabaseNotificationStore } from './database-notification-store.ts';
import { createLineClient } from './line-client.ts';
import { DatabaseOutboxRepository } from './database-outbox-repository.ts';
import { createWorkerRuntime } from './worker-runtime.ts';
import { waitForDatabaseUrl } from './database-config.ts';
import { createHolidaySyncJob } from './holiday-sync-job.ts';

const databaseUrl = await waitForDatabaseUrl();

const database = createDatabase(databaseUrl);
// การแจ้งเตือน LINE: without LINE_CHANNEL_ACCESS_TOKEN alerts are still queued but nothing is pushed (docs/runbooks/line-alert.md).
const lineStore = new DatabaseLineStore(database);
const lineClient = createLineClient(readRuntimeValue('LINE_CHANNEL_ACCESS_TOKEN'));
const publicUrl = readRuntimeValue('BACKOFFICE_PUBLIC_URL') ?? null;
const lineAlerts = new LineAlertConsumer(lineStore, lineClient, publicUrl);
const mciBroadcasts = new MciLineBroadcastConsumer(lineStore, lineClient, publicUrl);
const notifications = new NotificationConsumer(
  new DatabaseNotificationStore(database),
  { deliverEmail: async () => { throw new Error('EMAIL_NOT_CONFIGURED'); } },
  { deliverInApp: async () => undefined },
  lineStore,
  lineAlerts,
  mciBroadcasts
);
const consumer = new OutboxConsumer(new DatabaseOutboxRepository(database), notifications);
const runtime = createWorkerRuntime({
  publishBatch: () => consumer.publishOutboxBatch(),
  intervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? '5000'),
  onError: (error) => console.error('backoffice.worker.batch_failed', { code: toFailureCode(error) })
});

runtime.start();
// วันหยุดจาก HOSxP: read-only, daily; settings from ตั้งค่าการเชื่อมต่อ, else HOSXP_DATABASE_URL. Nothing happens until one is set.
const hosxpSettings = new HosxpSettingsService(database, connectionSecretBoxFrom(readRuntimeValue('CONNECTION_SECRET_KEY')), readRuntimeValue);
const holidaySync = new HolidaySyncService(database, () => hosxpSettings.resolve(), readHosxpHolidays);
const holidayJob = createHolidaySyncJob({
  sync: (actor) => holidaySync.sync(actor),
  intervalMs: Number(process.env.HOLIDAY_SYNC_INTERVAL_MS ?? String(24 * 60 * 60 * 1000)),
  initialDelayMs: 60_000,
  log: (event, detail) => console.info(event, detail)
});
holidayJob.start();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    runtime.stop();
    holidayJob.stop();
    void database.close().finally(() => process.exit(0));
  });
}
