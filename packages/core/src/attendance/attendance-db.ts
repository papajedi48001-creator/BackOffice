import { randomUUID } from 'node:crypto';
import type { OutboxEvent } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export { isDuplicateEntry, isMissingReference } from '../mass-casualty/mci-db';

/** One outbox row inside the caller's transaction; a repeated idempotency key is skipped. Payloads carry ids only. */
export async function attendanceOutbox(tx: Pick<Database, 'execute'>, type: string, idempotencyKey: string, payload: OutboxEvent['payload'], createId: () => string = randomUUID): Promise<void> {
  await tx.execute('INSERT IGNORE INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), NULL)', [createId(), type, idempotencyKey, JSON.stringify(payload)]);
}
