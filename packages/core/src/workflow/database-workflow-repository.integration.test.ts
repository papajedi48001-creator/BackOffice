import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { DatabaseWorkflowRepository } from './database-workflow-repository';
import { RequestService } from './request-service';
import { ApprovalService } from './approval-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DatabaseWorkflowRepository', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;

  afterAll(async () => database.close());
  it('persists the request, approver snapshot, and submitted outbox event in one workflow transaction', async () => {
    await runMigrations(database);
    const organizationId = randomUUID();
    const requestorId = randomUUID();
    const approverId = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'Integration unit']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP()), (?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'ciphertext-a', randomUUID(), approverId, 'ciphertext-b', randomUUID()]);
    const service = new RequestService(new DatabaseWorkflowRepository(database), { resolve: async () => [{ personId: approverId, organizationId }] });

    const request = await service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: requestorId, organizationSnapshot: { organizationId } });

    expect(await service.getPendingApprover(request.id)).toEqual({ personId: approverId, organizationId });
    expect(await database.query<{ type: string }>('SELECT type FROM outbox_event WHERE idempotency_key = ?', [`workflow.request.submitted:${request.id}`])).toEqual([{ type: 'workflow.request.submitted' }]);
    expect(await database.query<{ action: string; result: string; actorPersonId: string; metadata: string }>('SELECT action, result, actor_person_id AS actorPersonId, metadata FROM audit_event WHERE target_id = ?', [request.id])).toEqual([expect.objectContaining({ action: 'workflow.request.submitted', result: 'SUCCESS', actorPersonId: requestorId, metadata: expect.stringContaining('REQ-') })]);

    await new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null }).decideRequest({ requestId: request.id, actorPersonId: approverId, decision: 'APPROVE' });

    const decisionAuditEvents = await database.query<{ action: string; result: string; actorPersonId: string; metadata: string }>('SELECT action, result, actor_person_id AS actorPersonId, metadata FROM audit_event WHERE target_id = ?', [request.id]);
    expect(decisionAuditEvents).toHaveLength(2);
    expect(decisionAuditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'workflow.request.submitted', result: 'SUCCESS', actorPersonId: requestorId }),
      expect.objectContaining({ action: 'workflow.request.decided', result: 'APPROVE', actorPersonId: approverId, metadata: expect.stringContaining('APPROVED') })
    ]));
  });

  it('rolls back workflow writes when audit persistence rejects', async () => {
    await runMigrations(database);
    const organizationId = randomUUID();
    const requestorId = randomUUID();
    const approverId = randomUUID();
    const requestId = randomUUID();
    const duplicateAuditId = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'Rollback unit']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP()), (?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'ciphertext-c', randomUUID(), approverId, 'ciphertext-d', randomUUID()]);
    await database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [duplicateAuditId, requestorId, 'existing.event', 'request', randomUUID(), 'SUCCESS', '{}']);
    const ids = [requestId, randomUUID(), randomUUID(), duplicateAuditId];
    const service = new RequestService(new DatabaseWorkflowRepository(database), { resolve: async () => [{ personId: approverId, organizationId }] }, () => ids.shift()!);

    await expect(service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: requestorId, organizationSnapshot: { organizationId } })).rejects.toThrow();

    expect(await database.query('SELECT id FROM request WHERE id = ?', [requestId])).toEqual([]);
    expect(await database.query('SELECT id FROM approval_step WHERE request_id = ?', [requestId])).toEqual([]);
    expect(await database.query('SELECT id FROM outbox_event WHERE idempotency_key = ?', [`workflow.request.submitted:${requestId}`])).toEqual([]);
    expect(await database.query<{ id: string }>('SELECT id FROM audit_event WHERE id = ?', [duplicateAuditId])).toEqual([{ id: duplicateAuditId }]);
  });

  it('records only one decision and audit event when concurrent approvals target one request', async () => {
    await runMigrations(database);
    const organizationId = randomUUID();
    const requestorId = randomUUID();
    const approverId = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'Concurrency unit']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP()), (?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'ciphertext-e', randomUUID(), approverId, 'ciphertext-f', randomUUID()]);
    const request = await new RequestService(new DatabaseWorkflowRepository(database), { resolve: async () => [{ personId: approverId, organizationId }] }).submitRequest({ moduleCode: 'maintenance', requestorPersonId: requestorId, organizationSnapshot: { organizationId } });
    const service = new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null });

    const outcomes = await Promise.allSettled([
      service.decideRequest({ requestId: request.id, actorPersonId: approverId, decision: 'APPROVE' }),
      service.decideRequest({ requestId: request.id, actorPersonId: approverId, decision: 'APPROVE' })
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await database.query('SELECT id FROM approval_decision WHERE approval_step_id = ?', [request.approvalSteps[0].id])).toHaveLength(1);
    expect(await database.query('SELECT id FROM audit_event WHERE target_id = ? AND action = ?', [request.id, 'workflow.request.decided'])).toHaveLength(1);
  });
  it('lets only one of a concurrent cancellation and approval win', async () => {
    await runMigrations(database);
    const organizationId = randomUUID();
    const requestorId = randomUUID();
    const approverId = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'Cancellation race unit']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP()), (?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'ciphertext-race-a', randomUUID(), approverId, 'ciphertext-race-b', randomUUID()]);
    const requests = new RequestService(new DatabaseWorkflowRepository(database), { resolve: async () => [{ personId: approverId, organizationId }] });
    const request = await requests.submitRequest({ moduleCode: 'maintenance', requestorPersonId: requestorId, organizationSnapshot: { organizationId } });

    const outcomes = await Promise.allSettled([
      requests.cancelRequest({ requestId: request.id, actorPersonId: requestorId, reason: 'ไม่ต้องการแล้ว' }),
      new ApprovalService(new DatabaseWorkflowRepository(database), { findActiveFor: async () => null }).decideRequest({ requestId: request.id, actorPersonId: approverId, decision: 'APPROVE' })
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    // The loser must fail on the status check, not on a lock or snapshot error (MariaDB 11.8 raises ER_CHECKREAD
    // when a consistent read runs before the row lock).
    const loser = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(['REQUEST_NOT_CANCELLABLE', 'REQUEST_NOT_PENDING']).toContain((loser?.reason as Error).message);
    const [row] = await database.query<{ status: string }>('SELECT status FROM request WHERE id = ?', [request.id]);
    const cancellations = await database.query('SELECT id FROM request_cancellation WHERE request_id = ?', [request.id]);
    const decisions = await database.query('SELECT decision.id FROM approval_decision decision JOIN approval_step step ON step.id = decision.approval_step_id WHERE step.request_id = ?', [request.id]);
    expect(['CANCELLED', 'APPROVED']).toContain(row?.status);
    expect(cancellations.length + decisions.length).toBe(1);
    await database.execute('UPDATE outbox_event SET processed_at = UTC_TIMESTAMP() WHERE processed_at IS NULL AND JSON_VALUE(payload, \'$.requestId\') = ?', [request.id]);
  });

  it('orders steps by number and stores cancellation reasons', async () => {
    await runMigrations(database);
    const organizationId = randomUUID();
    const requestorId = randomUUID();
    await database.execute('INSERT INTO organization (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [organizationId, 'Ordering unit']);
    await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [requestorId, 'ciphertext', randomUUID()]);
    const repository = new DatabaseWorkflowRepository(database);
    const requestId = randomUUID();
    await repository.saveRequest({ id: requestId, reference: `REQ-${requestId}`, moduleCode: 'workflow', requestorPersonId: requestorId, organizationSnapshot: { organizationId }, status: 'IN_REVIEW' });
    for (const sequence of [7, 10, 1, 3, 2, 9, 4, 8, 6, 5]) await repository.saveStep({ id: randomUUID(), requestId, sequence, assigneeSnapshot: { personId: requestorId, organizationId }, status: 'PENDING' });

    expect((await repository.getSteps(requestId)).map((step) => step.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    await repository.saveCancellation({ id: randomUUID(), requestId, actorPersonId: requestorId, reason: 'ไม่ต้องใช้แล้ว' });
    expect(await database.query<{ reason: string }>('SELECT reason FROM request_cancellation WHERE request_id = ?', [requestId])).toEqual([{ reason: 'ไม่ต้องใช้แล้ว' }]);
  });
});
