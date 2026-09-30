import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import type { WorkerNotificationDeliveryStore } from './consumers/notification-consumer';

export class DatabaseNotificationStore implements WorkerNotificationDeliveryStore {
  constructor(private readonly database: Database) {}

  async claim(eventId: string, channel: 'email' | 'in_app', recipientPersonId: string): Promise<boolean> {
    const id = randomUUID();
    await this.database.execute('INSERT IGNORE INTO notification (id, outbox_event_id, channel, recipient_person_id, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, eventId, channel, recipientPersonId]);
    const rows = await this.database.query<{ id: string }>('SELECT id FROM notification WHERE id = ? LIMIT 1', [id]);
    return rows.length === 1;
  }
}
