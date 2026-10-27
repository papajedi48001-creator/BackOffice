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
      saveRequest: async () => undefined, saveDecision: async () => undefined, saveCancellation: async () => undefined, saveOutbox: async () => undefined,
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
      saveCancellation: async () => undefined,
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
      saveCancellation: async () => undefined,
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
      payload: { recipientPersonId: 'manager-b', requestId: 'request-1', moduleCode: 'requests', subject: 'มีคำขอรอพิจารณา' }
    })]));
    expect(repository.outbox).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'notification.in_app',
      payload: { recipientPersonId: 'person-a', requestId: 'request-1', moduleCode: 'requests', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล' }
    })]));
  });

  it('names a ผู้อนุมัติ when the person who decided has no position on record', async () => {
    const repository = new DecisionWorkflowRepository({
      request: { id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' },
      steps: [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-c', organizationId: 'unit-a' }, status: 'PENDING' }]
    });

    await new ApprovalService(repository, { findActiveFor: async () => null }).decideRequest({ requestId: 'request-1', actorPersonId: 'manager-c', decision: 'APPROVE' });

    expect(repository.outbox.find((event) => event.type === 'notification.in_app')?.payload).toMatchObject({ subject: 'อนุมัติ > ผู้อนุมัติ' });
  });

  it.each([
    ['APPROVE', undefined, 'APPROVED', 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล'],
    ['REJECT', 'ไม่ตรงตามเงื่อนไข', 'REJECTED', 'ไม่อนุมัติ > หัวหน้ากลุ่มการพยาบาล'],
    ['RETURN', 'กรุณาแก้ไข', 'RETURNED', 'ส่งกลับแก้ไข > หัวหน้ากลุ่มการพยาบาล']
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
      payload: { recipientPersonId: 'person-a', requestId: 'request-1', moduleCode: 'requests', subject }
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
  it.each(['REJECT', 'RETURN'] as const)('cancels the later pending steps when a request is %s-ed', async (decision) => {
    const step = (id: string, sequence: number) => ({ id, requestId: 'request-1', sequence, assigneeSnapshot: { personId: `manager-${sequence}`, organizationId: 'unit-a' }, status: 'PENDING' as const });
    const repository = new DecisionWorkflowRepository({ request: { id: 'request-1', reference: 'REQ-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }, steps: [step('step-1', 1), step('step-2', 2), step('step-3', 3)] });

    await new ApprovalService(repository, { findActiveFor: async () => null }).decideRequest({ requestId: 'request-1', actorPersonId: 'manager-1', decision, reason: 'ข้อมูลไม่ครบ' });

    expect(repository.steps.map((candidate) => candidate.status)).toEqual([decision === 'REJECT' ? 'REJECTED' : 'RETURNED', 'CANCELLED', 'CANCELLED']);
  });
  it.each([['RETURN', true], ['REJECT', true], ['APPROVE', false]] as const)('copies a %s notice to whoever else must act on the คำขอ: %s', async (decision, copied) => {
    const repository = new DecisionWorkflowRepository({ request: { id: 'request-1', reference: 'REQ-1', moduleCode: 'official-travel', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }, steps: [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }] });
    repository.followers = ['leader-a'];

    await new ApprovalService(repository, { findActiveFor: async () => null }).decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision, ...(decision === 'APPROVE' ? {} : { reason: 'แก้วันที่' }) });

    const recipients = repository.outbox.filter((event) => event.type === 'notification.in_app').map((event) => (event.payload as { recipientPersonId: string }).recipientPersonId);
    expect(recipients.includes('leader-a')).toBe(copied);
    expect(JSON.stringify(repository.outbox)).not.toContain('แก้วันที่');
  });
  it('notifies the approval watchers only when the final step approves, never on a reject or an earlier step', async () => {
    const step = (id: string, sequence: number) => ({ id, requestId: 'request-1', sequence, assigneeSnapshot: { personId: `manager-${sequence}`, organizationId: 'unit-a' }, status: 'PENDING' as const });
    const run = async (decision: 'APPROVE' | 'REJECT', steps: ApprovalStep[]) => {
      const repository = new DecisionWorkflowRepository({ request: { id: 'request-1', reference: 'REQ-1', moduleCode: 'fleet', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }, steps });
      const asked: string[] = [];
      repository.watchers = [{ personId: 'fleet-1', subject: 'มีใบขอใช้รถรอจัดรถ', targetPath: '/fleet/requests/by-request/request-1' }, { personId: 'manager-1', subject: 'มีใบขอใช้รถรอจัดรถ', targetPath: '/fleet/requests/by-request/request-1' }];
      repository.onWatchers = (request) => asked.push(request.moduleCode);
      await new ApprovalService(repository, { findActiveFor: async () => null }, (() => { let n = 0; return () => `id-${++n}`; })()).decideRequest({ requestId: 'request-1', actorPersonId: 'manager-1', decision, ...(decision === 'APPROVE' ? {} : { reason: 'ไม่เหมาะสม' }) });
      return { repository, asked };
    };

    const final = await run('APPROVE', [step('step-1', 1)]);
    const notices = final.repository.outbox.filter((event) => event.type === 'notification.in_app');
    expect(final.asked).toEqual(['fleet']);
    expect(notices.map((event) => event.idempotencyKey)).toContain('notification.in_app:request-approved:id-1:recipient:fleet-1');
    expect(notices.find((event) => (event.payload as { recipientPersonId: string }).recipientPersonId === 'fleet-1')?.payload).toMatchObject({ moduleCode: 'fleet', targetPath: '/fleet/requests/by-request/request-1', subject: 'มีใบขอใช้รถรอจัดรถ' });
    // The head who just approved is already told by the decision itself, so a watcher equal to the actor gets no second notice.
    expect(notices.some((event) => event.idempotencyKey === 'notification.in_app:request-approved:id-1:recipient:manager-1')).toBe(false);

    const earlier = await run('APPROVE', [step('step-1', 1), step('step-2', 2)]);
    expect(earlier.asked).toEqual([]);
    expect(earlier.repository.outbox.filter((event) => event.idempotencyKey.startsWith('notification.in_app:request-approved:'))).toEqual([]);

    const rejected = await run('REJECT', [step('step-1', 1)]);
    expect(rejected.asked).toEqual([]);
    expect(rejected.repository.outbox.filter((event) => event.idempotencyKey.startsWith('notification.in_app:request-approved:'))).toEqual([]);
  });
  it('labels the decided notification of a leave request with the leave module', async () => {
    const outbox: unknown[] = [];
    const repository: WorkflowRepository = {
      transaction: async (work) => work(repository),
      getRequest: async () => null,
      getRequestForUpdate: async () => ({ id: 'request-1', reference: 'REQ-1', moduleCode: 'leave', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'IN_REVIEW' }),
      getSteps: async () => [{ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'PENDING' }],
      saveRequest: async () => undefined, saveDecision: async () => undefined, saveCancellation: async () => undefined, saveStep: async () => undefined, appendAudit: async () => undefined,
      saveOutbox: async (event) => { outbox.push(event); }
    };
    const service = new ApprovalService(repository, { findActiveFor: async () => null }, () => 'decision-1');

    await service.decideRequest({ requestId: 'request-1', actorPersonId: 'manager-a', decision: 'APPROVE' });

    expect(outbox).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'notification.in_app', payload: expect.objectContaining({ moduleCode: 'leave', targetPath: '/leave/requests/request-1' }) })]));
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
  async saveCancellation(): Promise<void> {}
  async appendAudit(): Promise<void> {}
  async getPositionTitle(personId: string): Promise<string | null> { return personId === 'manager-a' ? 'หัวหน้ากลุ่มการพยาบาล' : null; }
  followers: string[] = [];
  async getFollowers(): Promise<string[]> { return this.followers; }
  watchers: Array<{ personId: string; subject: string; targetPath: string }> = [];
  onWatchers: (request: { id: string; moduleCode: string }) => void = () => undefined;
  async getApprovalWatchers(request: { id: string; moduleCode: string }): Promise<Array<{ personId: string; subject: string; targetPath: string }>> { this.onWatchers(request); return this.watchers; }
}
