import { describe, expect, it } from 'vitest';
import { ApprovalService } from './approval-service';
import type { WorkflowRepository } from './request-service';
import type { ApprovalStep, AuditEvent } from '@backoffice/contracts';

describe('ApprovalService', () => {
  it('rejects an approval by a delegate when the delegate is the requestor', async () => {
    const service = new ApprovalService({
      transaction: async (work) => work({ getRequestForUpdate: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }) } as never),
      getRequestForUpdate: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getSteps: async () => [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }],
      saveDecision: async () => undefined,
      saveOutbox: async () => undefined,
      saveRequest: async () => undefined,
      saveStep: async () => undefined,
      appendAudit: async () => undefined
    }, { findActiveFor: async () => ({ delegatorPersonId: 'manager-a', delegatePersonId: 'person-a', moduleCode: 'maintenance' }) }, () => 'decision-1');

    await expect(service.decideRequest({ requestId: 'request-1', actorPersonId: 'person-a', decision: 'APPROVE' })).rejects.toThrow('CONFLICT_OF_INTEREST');
  });

  it('marks the pending approval step decided before emitting the outbox event', async () => {
    const savedSteps: ApprovalStep[] = [];
    const repository: WorkflowRepository = {
      transaction: async (work) => work(repository),
      getRequest: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getRequestForUpdate: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getSteps: async () => [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }],
      saveRequest: async () => undefined, saveDecision: async () => undefined, saveOutbox: async () => undefined,
      saveStep: async (step) => { savedSteps.push(step); },
      appendAudit: async () => undefined
    };
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => 'decision-1');

    await service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision: 'APPROVE' });

    expect(savedSteps).toEqual([{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'APPROVED' }]);
  });

  it('reads the pending request inside the decision transaction', async () => {
    const request = { id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' as const };
    const step = { id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' as const };
    const transactionRepository: WorkflowRepository = {
      transaction: async (work) => work(transactionRepository),
      getRequest: async () => { throw new Error('must use locked request read'); },
      getRequestForUpdate: async () => request,
      getSteps: async () => [step],
      saveRequest: async () => undefined,
      saveStep: async () => undefined,
      saveDecision: async () => undefined,
      saveOutbox: async () => undefined,
      appendAudit: async () => undefined
    };
    const repository: WorkflowRepository = {
      ...transactionRepository,
      transaction: async (work) => work(transactionRepository),
      getRequestForUpdate: async () => { throw new Error('must read through transaction'); }
    };
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => 'decision-1');

    await expect(service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision: 'APPROVE' })).resolves.toMatchObject({ approvalStepId: 'step-1' });
  });

  it.each([
    ['APPROVE', undefined, 'APPROVED'],
    ['REJECT', 'contains private detail', 'REJECTED'],
    ['RETURN', 'contains private detail', 'RETURNED']
  ] as const)('records %s without the decision reason', async (decision, reason, status) => {
    const auditEvents: AuditEvent[] = [];
    const repository: WorkflowRepository = {
      transaction: async (work) => work(repository),
      getRequest: async () => ({ id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getRequestForUpdate: async () => ({ id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getSteps: async () => [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }],
      saveRequest: async () => undefined,
      saveDecision: async () => undefined,
      saveOutbox: async () => undefined,
      saveStep: async () => undefined,
      appendAudit: async (event) => { auditEvents.push(event); }
    };
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => 'decision-1');

    await service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision, reason });

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ actorPersonId: 'manager-a', action: 'workflow.request.decided', targetType: 'request', targetId: 'request-1', result: decision });
    expect(JSON.parse(auditEvents[0].metadata)).toEqual({ moduleCode: 'maintenance', requestReference: 'REQ-request-1', status, organizationId: 'unit-a' });
    expect(auditEvents[0].metadata).not.toContain('contains private detail');
  });

  it('keeps a request in review and notifies the next approver after an intermediate approval', async () => {
    const repository = new DecisionWorkflowRepository({
      request: { id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' },
      steps: [
        { id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' },
        { id: 'step-2', requestId: 'request-1', sequence: 2, assigneeSnapshot: { personId: 'manager-b', organizationId: 'unit-a' }, status: 'PENDING' }
      ]
    });
    const ids = ['decision-1', 'workflow-event-1', 'notification-event-1', 'audit-event-1'];
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => ids.shift()!);

    await service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision: 'APPROVE' });

    expect(repository.request.status).toBe('IN_REVIEW');
    expect(repository.steps).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'step-1', status: 'APPROVED' }), expect.objectContaining({ id: 'step-2', status: 'PENDING' })]));
    expect(repository.outbox).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'notification.in_app',
      payload: { recipientPersonId: 'manager-b', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' }
    })]));
  });

  it.each([
    ['APPROVE', undefined, 'APPROVED', 'คำขอของคุณได้รับอนุมัติ'],
    ['REJECT', 'ไม่ตรงตามเงื่อนไข', 'REJECTED', 'คำขอของคุณไม่ผ่านการอนุมัติ'],
    ['RETURN', 'กรุณาแก้ไข', 'RETURNED', 'คำขอของคุณถูกส่งกลับ']
  ] as const)('notifies the requestor when %s reaches a final state', async (decision, reason, status, subject) => {
    const repository = new DecisionWorkflowRepository({
      request: { id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' },
      steps: [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }]
    });
    const ids = ['decision-1', 'workflow-event-1', 'notification-event-1', 'audit-event-1'];
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => ids.shift()!);

    await service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision, reason });

    expect(repository.request.status).toBe(status);
    expect(repository.outbox).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'notification.in_app',
      payload: { recipientPersonId: 'person-a', requestId: 'request-1', subject }
    })]));
    expect(repository.outbox.find((event) => event.type === 'notification.in_app')?.payload).not.toHaveProperty('reason');
  });

  it('does not create another decision for a final request', async () => {
    const repository = new DecisionWorkflowRepository({
      request: { id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'APPROVED' },
      steps: [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'APPROVED' }]
    });
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => 'decision-1');

    await expect(service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision: 'APPROVE' })).rejects.toThrow('REQUEST_NOT_PENDING');
    expect(repository.outbox).toEqual([]);
    expect(repository.decisions).toEqual([]);
  });
});

class DecisionWorkflowRepository implements WorkflowRepository {
  request: Omit<import('@backoffice/contracts').SubmittedRequest, 'approvalSteps'>;
  steps: ApprovalStep[];
  readonly outbox: import('@backoffice/contracts').OutboxEvent[] = [];
  readonly decisions: import('@backoffice/contracts').ApprovalDecision[] = [];

  constructor(input: { request: Omit<import('@backoffice/contracts').SubmittedRequest, 'approvalSteps'>; steps: ApprovalStep[] }) {
    this.request = input.request;
    this.steps = input.steps;
  }

  async transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T> { return work(this); }
  async getRequest(): Promise<Omit<import('@backoffice/contracts').SubmittedRequest, 'approvalSteps'>> { return this.request; }
  async getRequestForUpdate(): Promise<Omit<import('@backoffice/contracts').SubmittedRequest, 'approvalSteps'>> { return this.request; }
  async getSteps(): Promise<ApprovalStep[]> { return this.steps; }
  async saveRequest(request: Omit<import('@backoffice/contracts').SubmittedRequest, 'approvalSteps'>): Promise<void> { this.request = request; }
  async saveStep(step: ApprovalStep): Promise<void> { this.steps = this.steps.map((candidate) => candidate.id === step.id ? step : candidate); }
  async saveDecision(decision: import('@backoffice/contracts').ApprovalDecision): Promise<void> { this.decisions.push(decision); }
  async saveOutbox(event: import('@backoffice/contracts').OutboxEvent): Promise<void> { this.outbox.push(event); }
  async appendAudit(): Promise<void> {}
}
