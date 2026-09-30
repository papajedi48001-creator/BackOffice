import { describe, expect, it } from 'vitest';
import { ApprovalService } from './approval-service';

describe('ApprovalService', () => {
  it('rejects an approval by a delegate when the delegate is the requestor', async () => {
    const service = new ApprovalService({
      transaction: async (work) => work({} as never),
      getRequest: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getSteps: async () => [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }],
      saveDecision: async () => undefined,
      saveOutbox: async () => undefined,
      saveRequest: async () => undefined,
      saveStep: async () => undefined
    }, { findActiveFor: async () => ({ delegatorPersonId: 'manager-a', delegatePersonId: 'person-a', moduleCode: 'maintenance' }) }, () => 'decision-1');

    await expect(service.decideRequest({ requestId: 'request-1', actorPersonId: 'person-a', decision: 'APPROVE' })).rejects.toThrow('CONFLICT_OF_INTEREST');
  });

  it('marks the pending approval step decided before emitting the outbox event', async () => {
    const savedSteps: Array<{ status: string }> = [];
    const repository: any = {
      transaction: async (work: any) => work(repository),
      getRequest: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getSteps: async () => [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }],
      saveRequest: async () => undefined, saveDecision: async () => undefined, saveOutbox: async () => undefined,
      saveStep: async (step: { status: string }) => { savedSteps.push(step); }
    };
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => 'decision-1');

    await service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision: 'APPROVE' });

    expect(savedSteps).toEqual([{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'APPROVED' }]);
  });
});
