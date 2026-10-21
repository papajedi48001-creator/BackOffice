import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { loadDashboardSummary } from './dashboard-summary';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('loadDashboardSummary against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const me = randomUUID();
  const other = randomUUID();
  const laterStep = randomUUID();
  const earlierStep = randomUUID();
  const organizationId = randomUUID();
  const organizationName = `กลุ่มงานทดสอบ ${organizationId.slice(0, 6)}`;

  const insertPerson = (id: string, displayName: string | null) => database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), displayName]);
  async function insertRequest(status: string, steps: Array<[string, string, string]>): Promise<string> {
    const requestId = randomUUID();
    await database.execute('INSERT INTO request (id, reference, module_code, requestor_person_id, organization_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [requestId, `REQ-${requestId}`, 'workflow', other, '{}', status]);
    for (const [sequence, assignee, stepStatus] of steps) await database.execute('INSERT INTO approval_step (id, request_id, sequence, assignee_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), requestId, sequence, JSON.stringify({ personId: assignee }), stepStatus]);
    return requestId;
  }
  async function insertNotification(channel: string, read: boolean): Promise<void> {
    const eventId = randomUUID();
    await database.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [eventId, `notification.${channel}`, eventId, '{}']);
    await database.execute('INSERT INTO notification (id, outbox_event_id, channel, recipient_person_id, subject, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), eventId, channel, me, 'ทดสอบ', read ? new Date() : null]);
  }

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(me, 'คุณทดสอบ');
    await insertPerson(other, null);
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, organizationName]);
    await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, effective_from, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP() - INTERVAL 1 DAY, UTC_TIMESTAMP())', [randomUUID(), me, organizationId]);
    await insertRequest('IN_REVIEW', [['1', me, 'PENDING']]);
    await insertRequest('IN_REVIEW', [['1', other, 'PENDING'], ['2', me, 'PENDING']]);
    await insertRequest('APPROVED', [['1', me, 'PENDING']]);
    await insertRequest('IN_REVIEW', [['2', other, 'APPROVED'], ['10', me, 'PENDING']]);
    await insertPerson(laterStep, null);
    await insertPerson(earlierStep, null);
    await insertRequest('IN_REVIEW', [['2', earlierStep, 'PENDING'], ['10', laterStep, 'PENDING']]);
    await insertNotification('in_app', false);
    await insertNotification('in_app', false);
    await insertNotification('in_app', true);
    await insertNotification('email', false);
  });

  afterAll(async () => { await database.close(); });

  it('counts only requests waiting on this person and their unread in-app notifications', async () => {
    await expect(loadDashboardSummary(database, me)).resolves.toEqual({ displayName: 'คุณทดสอบ', organizationName, pendingApprovals: 2, unreadNotifications: 2 });
  });

  it('orders steps by number, so step 2 waits before step 10', async () => {
    expect((await loadDashboardSummary(database, earlierStep)).pendingApprovals).toBe(1);
    expect((await loadDashboardSummary(database, laterStep)).pendingApprovals).toBe(0);
  });

  it('returns empty values for an unknown person', async () => {
    await expect(loadDashboardSummary(database, randomUUID())).resolves.toEqual({ displayName: null, organizationName: null, pendingApprovals: 0, unreadNotifications: 0 });
  });
});
