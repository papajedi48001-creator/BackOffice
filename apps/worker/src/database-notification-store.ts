import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import type { NotificationMessage } from '@backoffice/contracts';
import type { WorkerNotificationDeliveryStore } from './consumers/notification-consumer';

export class DatabaseNotificationStore implements WorkerNotificationDeliveryStore {
  constructor(private readonly database: Database) {}

  async claim(message: NotificationMessage): Promise<boolean> {
    const id = randomUUID();
    await this.database.execute('INSERT IGNORE INTO notification (id, outbox_event_id, channel, recipient_person_id, request_id, subject, delivered_at, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP())', [id, message.eventId, message.channel, message.recipientPersonId, message.requestId, message.subject]);
    const rows = await this.database.query<{ id: string }>('SELECT id FROM notification WHERE id = ? LIMIT 1', [id]);
    return rows.length === 1;
  }
}
