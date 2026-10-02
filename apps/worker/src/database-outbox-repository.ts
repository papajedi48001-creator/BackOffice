import type { Database } from '@backoffice/db';
import type { OutboxEvent } from '@backoffice/contracts';
import type { WorkerOutboxRepository } from './consumers/outbox-consumer';

export class DatabaseOutboxRepository implements WorkerOutboxRepository {
  constructor(private readonly database: Database) {}

  async pending(): Promise<OutboxEvent[]> {
    const rows = await this.database.query<{ id: string; type: string; idempotencyKey: string; payload: string; occurredAt: string; processedAt: string | null }>('SELECT id, type, idempotency_key AS idempotencyKey, payload, occurred_at AS occurredAt, processed_at AS processedAt FROM outbox_event WHERE processed_at IS NULL AND type IN (?, ?) ORDER BY occurred_at LIMIT 50', ['notification.email', 'notification.in_app']);
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as Record<string, unknown> }));
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.database.execute('UPDATE outbox_event SET processed_at = UTC_TIMESTAMP() WHERE id = ? AND processed_at IS NULL', [eventId]);
  }
}
