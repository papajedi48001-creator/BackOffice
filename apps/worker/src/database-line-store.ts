import { randomUUID } from 'node:crypto';
import type { LineAlertPayload, MciIncidentKind } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { WorkerLineStore } from './consumers/line-alert-consumer.ts';
import type { WorkerMciStore } from './consumers/mci-line-broadcast-consumer.ts';
import type { WorkerLineQueue } from './consumers/notification-consumer.ts';

/** การแจ้งเตือน LINE in the database: the queue (outbox) and the two lookups a push needs. */
export class DatabaseLineStore implements WorkerLineStore, WorkerLineQueue, WorkerMciStore {
  constructor(private readonly database: Database) {}

  async enqueue(eventId: string, payload: LineAlertPayload): Promise<void> {
    await this.database.execute('INSERT IGNORE INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), NULL)', [randomUUID(), 'notification.line', `notification.line:${eventId}`, JSON.stringify(payload)]);
  }

  async routeFor(moduleCode: string): Promise<{ groupId: string } | null> {
    const [row] = await this.database.query<{ groupId: string }>('SELECT r.group_id AS groupId FROM line_module_route r JOIN line_group g ON g.group_id = r.group_id WHERE r.module_code = ? AND g.left_at IS NULL', [moduleCode]);
    return row ?? null;
  }

  async incidentHeading(incidentId: string): Promise<{ title: string; kind: MciIncidentKind } | null> {
    const [row] = await this.database.query<{ title: string; kind: MciIncidentKind }>('SELECT title, kind FROM mci_incident WHERE id = ?', [incidentId]);
    return row ?? null;
  }

  async lineUserIdOf(personId: string): Promise<string | null> {
    const [row] = await this.database.query<{ lineUserId: string }>('SELECT line_user_id AS lineUserId FROM line_account_link WHERE person_id = ?', [personId]);
    return row?.lineUserId ?? null;
  }
}
