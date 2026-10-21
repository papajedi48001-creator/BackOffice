import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { RequestHistory } from './request-history';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('RequestHistory', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

  afterAll(async () => database.close());

  it('loads the requestor, steps in number order and every decision with real names', async () => {
    await runMigrations(database);
    const organizationId = randomUUID();
    const requestorId = randomUUID();
    const codedApproverId = randomUUID();
    const namelessApproverId = randomUUID();
    const requestId = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'งานการพยาบาล']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'ciphertext-history-a', randomUUID(), 'นางสาวมาลี ดีงาม']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, employee_code, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [codedApproverId, 'ciphertext-history-b', randomUUID(), `E001-${requestId.slice(0, 8)}`]);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [namelessApproverId, 'ciphertext-history-c', randomUUID()]);
    await database.execute('INSERT INTO request (id, reference, module_code, requestor_person_id, organization_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [requestId, `REQ-${requestId}`, 'maintenance', requestorId, JSON.stringify({ organizationId }), 'CANCELLED']);
    const stepIds: string[] = [];
    for (const sequence of [7, 10, 1, 3, 2, 9, 4, 8, 6, 5]) {
      const stepId = randomUUID();
      stepIds[sequence] = stepId;
      await database.execute('INSERT INTO approval_step (id, request_id, sequence, assignee_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [stepId, requestId, String(sequence), JSON.stringify({ personId: codedApproverId, organizationId }), sequence === 1 ? 'RETURNED' : 'CANCELLED']);
    }
    await database.execute('INSERT INTO approval_decision (id, approval_step_id, actor_person_id, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), stepIds[2], namelessApproverId, 'REJECT', 'ซ้ำ', '2026-10-21 03:00:00']);
    await database.execute('INSERT INTO approval_decision (id, approval_step_id, actor_person_id, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), stepIds[1], codedApproverId, 'RETURN', 'แนบใบเสนอราคา', '2026-10-21 01:00:00']);
    await database.execute('INSERT INTO request_cancellation (id, request_id, actor_person_id, reason, created_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), requestId, requestorId, 'ไม่ต้องการแล้ว', '2026-10-21 02:00:00']);

    const history = await new RequestHistory(database).load(requestId);

    expect(history?.requestorName).toBe('นางสาวมาลี ดีงาม');
    expect(history?.organizationName).toBe('งานการพยาบาล');
    expect(history?.steps.map((step) => step.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(history?.steps[0]).toEqual({ sequence: 1, assigneePersonId: codedApproverId, status: 'RETURNED' });
    expect(history?.entries).toEqual([
      { at: '2026-10-21T01:00:00Z', actorName: `E001-${requestId.slice(0, 8)}`, kind: 'RETURN', reason: 'แนบใบเสนอราคา' },
      { at: '2026-10-21T02:00:00Z', actorName: 'นางสาวมาลี ดีงาม', kind: 'CANCEL', reason: 'ไม่ต้องการแล้ว' },
      { at: '2026-10-21T03:00:00Z', actorName: 'ไม่ระบุ', kind: 'REJECT', reason: 'ซ้ำ' }
    ]);
  });

  it('returns null for an unknown request', async () => {
    await runMigrations(database);
    expect(await new RequestHistory(database).load(randomUUID())).toBeNull();
  });
});
