import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { hasRequestActivity, listPendingApprovals } from './request-inbox';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('request inbox against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const approver = randomUUID();
  const requestor = randomUUID();
  const bystander = randomUUID();
  const insertPerson = (id: string, displayName: string | null) => database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), displayName]);
  async function insertRequest(moduleCode: string, status: string, steps: Array<[string, string, string]>): Promise<string> {
    const requestId = randomUUID();
    await database.execute("INSERT INTO request (id, reference, module_code, requestor_person_id, organization_snapshot, status, created_at, submitted_at) VALUES (?, ?, ?, ?, '{}', ?, UTC_TIMESTAMP(), '2026-10-20 03:00:00')", [requestId, `REQ-${requestId}`, moduleCode, requestor, status]);
    for (const [sequence, assignee, stepStatus] of steps) await database.execute('INSERT INTO approval_step (id, request_id, sequence, assignee_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), requestId, sequence, JSON.stringify({ personId: assignee }), stepStatus]);
    return requestId;
  }
  let leaveRequest = '';

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(approver, 'คุณผู้อนุมัติ');
    await insertPerson(requestor, 'คุณผู้ยื่น');
    await insertPerson(bystander, null);
    leaveRequest = await insertRequest('leave', 'IN_REVIEW', [['1', approver, 'PENDING']]);
    await insertRequest('requests', 'IN_REVIEW', [['1', requestor, 'PENDING'], ['2', approver, 'PENDING']]);
    await insertRequest('requests', 'APPROVED', [['1', approver, 'APPROVED']]);
  });

  afterAll(async () => { await database.close(); });

  it('lists only the requests whose current step is this person\'s, with where each one opens', async () => {
    await expect(listPendingApprovals(database, approver)).resolves.toEqual([{ requestId: leaveRequest, reference: `REQ-${leaveRequest}`, moduleCode: 'leave', requestorName: 'คุณผู้ยื่น', submittedAt: '2026-10-20T03:00:00.000Z', href: `/leave/requests/${leaveRequest}` }]);
  });

  it('says whether a person has made or been asked to approve any request', async () => {
    await expect(hasRequestActivity(database, approver)).resolves.toBe(true);
    await expect(hasRequestActivity(database, requestor)).resolves.toBe(true);
    await expect(hasRequestActivity(database, bystander)).resolves.toBe(false);
  });
});
