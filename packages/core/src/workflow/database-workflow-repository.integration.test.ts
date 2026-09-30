import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { DatabaseWorkflowRepository } from './database-workflow-repository';
import { RequestService } from './request-service';

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
  });
});
