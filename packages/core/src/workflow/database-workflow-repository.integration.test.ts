import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { DatabaseWorkflowRepository } from './database-workflow-repository';
import { RequestService } from './request-service';
import { ApprovalService } from './approval-service';

const database = createDatabase(process.env.DATABASE_URL ?? 'mysql://backoffice:local-development-only@127.0.0.1:3307/backoffice');

afterAll(async () => database.close());

describe('DatabaseWorkflowRepository', () => {
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
});
