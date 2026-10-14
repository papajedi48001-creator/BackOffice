import type { Database } from '@backoffice/db';
import type { OutboxEvent } from '@backoffice/contracts';
import type { WorkerOutboxRepository } from './consumers/outbox-consumer';

export class DatabaseOutboxRepository implements WorkerOutboxRepository {
  private readonly maxAttempts: number;

  constructor(private readonly database: Database, options: { maxAttempts?: number } = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  async pending(): Promise<OutboxEvent[]> {
    const rows = await this.database.query<{ id: string; type: string; idempotencyKey: string; payload: string; occurredAt: string; processedAt: string | null }>('SELECT id, type, idempotency_key AS idempotencyKey, payload, occurred_at AS occurredAt, processed_at AS processedAt FROM outbox_event WHERE processed_at IS NULL AND dead_lettered_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP()) AND type IN (?, ?) ORDER BY occurred_at LIMIT 50', ['notification.email', 'notification.in_app']);
    return rows.map((row) => ({ ...row, payload: parsePayload(row.payload) }));
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.database.execute('UPDATE outbox_event SET processed_at = UTC_TIMESTAMP() WHERE id = ? AND processed_at IS NULL', [eventId]);
  }

  async markFailed(eventId: string, code: string): Promise<void> {
    // MariaDB applies SET assignments left to right, so every expression reads the previous attempts value until it is incremented last.
    await this.database.execute('UPDATE outbox_event SET last_error = ?, next_attempt_at = UTC_TIMESTAMP() + INTERVAL LEAST(30 * POW(2, attempts), 3600) SECOND, dead_lettered_at = IF(attempts + 1 >= ?, UTC_TIMESTAMP(), NULL), attempts = attempts + 1 WHERE id = ? AND processed_at IS NULL AND dead_lettered_at IS NULL', [code, this.maxAttempts, eventId]);
  }
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
