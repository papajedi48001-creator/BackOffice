import { describe, expect, it } from 'vitest';
import { RequestService, type WorkflowRepository } from './request-service';
import type { ApprovalDecision, ApprovalStep, AuditEvent, OutboxEvent, RequestCancellation, SubmittedRequest } from '@backoffice/contracts';

describe('RequestService', () => {
  it('keeps the approver snapshot when the requestor changes employment after submission', async () => {
    const repository = new MemoryWorkflowRepository();
    let currentApprover = 'manager-unit-a';
    const service = new RequestService(repository, { resolve: async () => [{ personId: currentApprover, organizationId: 'unit-a' }] }, () => 'request-1');

    const request = await service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });
    currentApprover = 'manager-unit-b';

    expect(await service.getPendingApprover(request.id)).toEqual(request.approvalSteps[0].assigneeSnapshot);
    expect(await service.getPendingApprover(request.id)).toEqual({ personId: 'manager-unit-a', organizationId: 'unit-a' });
  });

  it('records submitted request evidence for the requestor', async () => {
    const repository = new MemoryWorkflowRepository();
    const service = new RequestService(repository, { resolve: async () => [{ personId: 'manager-a', organizationId: 'unit-a' }] }, () => 'request-1');

    await service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });

    expect(repository.auditEvents).toHaveLength(1);
    expect(repository.auditEvents[0]).toMatchObject({ actorPersonId: 'person-a', action: 'workflow.request.submitted', targetType: 'request', targetId: 'request-1', result: 'SUCCESS' });
    expect(JSON.parse(repository.auditEvents[0].metadata)).toEqual({ moduleCode: 'maintenance', requestReference: 'REQ-request-1', status: 'IN_REVIEW', organizationId: 'unit-a' });
  });

  it('notifies the first approver with a safe request event after submission', async () => {
    const repository = new MemoryWorkflowRepository();
    const ids = ['request-1', 'step-1', 'step-2', 'workflow-event-1', 'notification-event-1', 'audit-event-1'];
    const service = new RequestService(repository, { resolve: async () => [
      { personId: 'manager-a', organizationId: 'unit-a' },
      { personId: 'manager-b', organizationId: 'unit-a' }
    ] }, () => ids.shift()!);

    await service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });

    expect(repository.outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'workflow.request.submitted' }),
      expect.objectContaining({
        type: 'notification.in_app',
        idempotencyKey: 'notification.in_app:request-submitted:request-1:step:step-1',
        payload: { recipientPersonId: 'manager-a', requestId: 'request-1', moduleCode: 'requests', subject: 'มีคำขอรอพิจารณา' }
      })
    ]));
    expect(repository.outbox.find((event) => event.type === 'notification.in_app')?.payload).not.toHaveProperty('reason');
    expect(repository.outbox.find((event) => event.type === 'notification.in_app')?.payload).not.toHaveProperty('organizationSnapshot');
  });

  describe('cancelRequest', () => {
    const reason = 'ไม่ต้องการใช้บริการแล้ว';
    async function submitted(status: SubmittedRequest['status'] = 'IN_REVIEW') {
      const repository = new MemoryWorkflowRepository();
      let next = 0;
      const service = new RequestService(repository, { resolve: async () => [{ personId: 'manager-a', organizationId: 'unit-a' }, { personId: 'manager-b', organizationId: 'unit-a' }] }, () => `id-${++next}`);
      const request = await service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });
      if (status !== 'IN_REVIEW') {
        await repository.saveRequest({ ...repository.requests.get(request.id)!, status });
        if (status === 'RETURNED') await repository.saveStep({ ...request.approvalSteps[0], status: 'RETURNED' });
      }
      repository.outbox.length = 0;
      repository.auditEvents.length = 0;
      return { repository, service, request };
    }

    it('cancels an in-review request, closes pending steps and notifies the pending approver', async () => {
      const { repository, service, request } = await submitted();

      const cancelled = await service.cancelRequest({ requestId: request.id, actorPersonId: 'person-a', reason });

      expect(cancelled.status).toBe('CANCELLED');
      expect(repository.requests.get(request.id)?.status).toBe('CANCELLED');
      expect(repository.steps.get(request.id)?.map((step) => step.status)).toEqual(['CANCELLED', 'CANCELLED']);
      expect(repository.cancellations).toEqual([expect.objectContaining({ requestId: request.id, actorPersonId: 'person-a', reason })]);
      expect(repository.outbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'workflow.request.cancelled', idempotencyKey: `workflow.request.cancelled:${request.id}`, payload: { requestId: request.id, moduleCode: 'maintenance' } }),
        expect.objectContaining({ type: 'notification.in_app', idempotencyKey: `notification.in_app:request-cancelled:${request.id}:recipient:manager-a`, payload: { recipientPersonId: 'manager-a', requestId: request.id, moduleCode: 'requests', subject: 'คำขอถูกยกเลิก' } })
      ]));
      expect(repository.outbox).toHaveLength(2);
      expect(repository.auditEvents).toEqual([expect.objectContaining({ actorPersonId: 'person-a', action: 'workflow.request.cancelled', targetId: request.id, result: 'SUCCESS' })]);
      expect(JSON.stringify(repository.outbox)).not.toContain(reason);
      expect(JSON.stringify(repository.auditEvents)).not.toContain(reason);
    });

    it('cancels a returned request without notifying anyone', async () => {
      const { repository, service, request } = await submitted('RETURNED');

      await service.cancelRequest({ requestId: request.id, actorPersonId: 'person-a', reason });

      expect(repository.requests.get(request.id)?.status).toBe('CANCELLED');
      expect(repository.steps.get(request.id)?.map((step) => step.status)).toEqual(['RETURNED', 'CANCELLED']);
      expect(repository.outbox.map((event) => event.type)).toEqual(['workflow.request.cancelled']);
      expect(JSON.stringify(repository.outbox)).not.toContain(reason);
      expect(JSON.stringify(repository.auditEvents)).not.toContain(reason);
    });

    it('refuses someone who is not the requestor', async () => {
      const { repository, service, request } = await submitted();
      await expect(service.cancelRequest({ requestId: request.id, actorPersonId: 'manager-a', reason })).rejects.toThrow('NOT_REQUESTOR');
      expect(repository.requests.get(request.id)?.status).toBe('IN_REVIEW');
    });

    it('refuses an unknown request', async () => {
      const { service } = await submitted();
      await expect(service.cancelRequest({ requestId: 'missing', actorPersonId: 'person-a', reason })).rejects.toThrow('REQUEST_NOT_FOUND');
    });

    it('refuses to cancel an approved request', async () => {
      const { repository, service, request } = await submitted('APPROVED');
      await expect(service.cancelRequest({ requestId: request.id, actorPersonId: 'person-a', reason })).rejects.toThrow('REQUEST_NOT_CANCELLABLE');
      expect(repository.cancellations).toHaveLength(0);
    });

    it('requires a reason', async () => {
      const { repository, service, request } = await submitted();
      await expect(service.cancelRequest({ requestId: request.id, actorPersonId: 'person-a', reason: '   ' })).rejects.toThrow('REASON_REQUIRED');
      expect(repository.cancellations).toHaveLength(0);
    });
  });

  describe('resubmitRequest', () => {
    async function returned(resolve: () => Promise<{ personId: string; organizationId: string }[]>) {
      const repository = new MemoryWorkflowRepository();
      let next = 0;
      const service = new RequestService(repository, { resolve }, () => `id-${++next}`);
      await repository.saveRequest({ id: 'request-1', reference: 'REQ-request-1', moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, status: 'RETURNED' });
      await repository.saveStep({ id: 'step-1', requestId: 'request-1', sequence: 1, assigneeSnapshot: { personId: 'manager-a', organizationId: 'unit-a' }, status: 'RETURNED' });
      await repository.saveStep({ id: 'step-2', requestId: 'request-1', sequence: 2, assigneeSnapshot: { personId: 'manager-b', organizationId: 'unit-a' }, status: 'CANCELLED' });
      return { repository, service };
    }

    it('adds a new pending step after the old ones and notifies the new approver', async () => {
      const resolverCalls: unknown[] = [];
      const { repository, service } = await returned(async (...args: unknown[]) => { resolverCalls.push(args[0]); return [{ personId: 'manager-c', organizationId: 'unit-a' }]; });

      const request = await service.resubmitRequest({ requestId: 'request-1', actorPersonId: 'person-a' });

      expect(resolverCalls).toEqual([{ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationId: 'unit-a' }]);
      expect(request.status).toBe('IN_REVIEW');
      expect(repository.requests.get('request-1')?.status).toBe('IN_REVIEW');
      expect(request.approvalSteps.map((step) => [step.sequence, step.status])).toEqual([[1, 'RETURNED'], [2, 'CANCELLED'], [3, 'PENDING']]);
      const newStep = request.approvalSteps[2]!;
      expect(newStep.assigneeSnapshot).toEqual({ personId: 'manager-c', organizationId: 'unit-a' });
      expect(repository.steps.get('request-1')?.find((step) => step.id === newStep.id)?.status).toBe('PENDING');
      expect(repository.outbox).toEqual([
        expect.objectContaining({ type: 'workflow.request.resubmitted', payload: { requestId: 'request-1', moduleCode: 'maintenance' } }),
        expect.objectContaining({ type: 'notification.in_app', idempotencyKey: `notification.in_app:request-resubmitted:request-1:step:${newStep.id}`, payload: { recipientPersonId: 'manager-c', requestId: 'request-1', moduleCode: 'requests', subject: 'มีคำขอรอพิจารณา' } })
      ]);
      expect(repository.auditEvents).toEqual([expect.objectContaining({ actorPersonId: 'person-a', action: 'workflow.request.resubmitted', targetId: 'request-1', result: 'SUCCESS' })]);
    });

    it('stays returned when no approver can be found', async () => {
      const { repository, service } = await returned(async () => []);
      await expect(service.resubmitRequest({ requestId: 'request-1', actorPersonId: 'person-a' })).rejects.toThrow('NO_APPROVER');
      expect(repository.requests.get('request-1')?.status).toBe('RETURNED');
      expect(repository.steps.get('request-1')).toHaveLength(2);
    });

    it('refuses a request that was not returned', async () => {
      const { repository, service } = await returned(async () => [{ personId: 'manager-c', organizationId: 'unit-a' }]);
      await repository.saveRequest({ ...repository.requests.get('request-1')!, status: 'IN_REVIEW' });
      await expect(service.resubmitRequest({ requestId: 'request-1', actorPersonId: 'person-a' })).rejects.toThrow('REQUEST_NOT_RETURNED');
    });

    it('refuses someone who is not the requestor', async () => {
      const { service } = await returned(async () => [{ personId: 'manager-c', organizationId: 'unit-a' }]);
      await expect(service.resubmitRequest({ requestId: 'request-1', actorPersonId: 'manager-a' })).rejects.toThrow('NOT_REQUESTOR');
    });

    it('refuses an unknown request', async () => {
      const { service } = await returned(async () => [{ personId: 'manager-c', organizationId: 'unit-a' }]);
      await expect(service.resubmitRequest({ requestId: 'missing', actorPersonId: 'person-a' })).rejects.toThrow('REQUEST_NOT_FOUND');
    });
  });
  describe('module routing', () => {
    it('passes the target to the approver resolver', async () => {
      const seen: unknown[] = [];
      const service = new RequestService(new MemoryWorkflowRepository(), { resolve: async (input) => { seen.push(input); return [{ personId: 'manager-a', organizationId: 'unit-a' }]; } });

      await service.submitRequest({ moduleCode: 'leave', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' }, target: 'DIVISION' });

      expect(seen).toEqual([{ moduleCode: 'leave', requestorPersonId: 'person-a', organizationId: 'unit-a', target: 'DIVISION' }]);
    });

    it('uses fixed approvers when given', async () => {
      let resolverCalls = 0;
      const service = new RequestService(new MemoryWorkflowRepository(), { resolve: async () => { resolverCalls += 1; return [{ personId: 'manager-a', organizationId: 'unit-a' }]; } });

      const request = await service.submitRequest({ moduleCode: 'leave', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } }, { approvers: [{ personId: 'director-a', organizationId: 'hospital' }] });

      expect(resolverCalls).toBe(0);
      expect(request.approvalSteps.map((step) => step.assigneeSnapshot)).toEqual([{ personId: 'director-a', organizationId: 'hospital' }]);
    });

    it('labels leave notifications with the leave module', async () => {
      const repository = new MemoryWorkflowRepository();
      const service = new RequestService(repository, { resolve: async () => [{ personId: 'manager-a', organizationId: 'unit-a' }] }, (() => { let next = 0; return () => `id-${++next}`; })());

      const request = await service.submitRequest({ moduleCode: 'leave', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });

      expect(repository.outbox.find((event) => event.type === 'notification.in_app')?.payload).toMatchObject({ moduleCode: 'leave', targetPath: `/leave/requests/${request.id}` });
    });

    it('keeps other requests on the requests module', async () => {
      const repository = new MemoryWorkflowRepository();
      const service = new RequestService(repository, { resolve: async () => [{ personId: 'manager-a', organizationId: 'unit-a' }] }, (() => { let next = 0; return () => `id-${++next}`; })());

      await service.submitRequest({ moduleCode: 'maintenance', requestorPersonId: 'person-a', organizationSnapshot: { organizationId: 'unit-a' } });

      const payload = repository.outbox.find((event) => event.type === 'notification.in_app')?.payload;
      expect(payload).toMatchObject({ moduleCode: 'requests' });
      expect(payload).not.toHaveProperty('targetPath');
    });
  });
});

class MemoryWorkflowRepository implements WorkflowRepository {
  readonly requests = new Map<string, Omit<SubmittedRequest, 'approvalSteps'>>();
  readonly steps = new Map<string, ApprovalStep[]>();
  readonly decisions: ApprovalDecision[] = [];
  readonly outbox: OutboxEvent[] = [];
  readonly auditEvents: AuditEvent[] = [];
  readonly cancellations: RequestCancellation[] = [];
  async transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T> { return work(this); }
  async saveRequest(request: Omit<SubmittedRequest, 'approvalSteps'>): Promise<void> { this.requests.set(request.id, request); }
  async saveStep(step: ApprovalStep): Promise<void> {
    const steps = this.steps.get(step.requestId) ?? [];
    const index = steps.findIndex((candidate) => candidate.id === step.id);
    this.steps.set(step.requestId, index === -1 ? [...steps, step] : steps.map((candidate) => candidate.id === step.id ? step : candidate));
  }
  async getRequest(id: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null> { return this.requests.get(id) ?? null; }
  async getRequestForUpdate(id: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null> { return this.getRequest(id); }
  async getSteps(requestId: string): Promise<ApprovalStep[]> { return this.steps.get(requestId) ?? []; }
  async saveDecision(decision: ApprovalDecision): Promise<void> { this.decisions.push(decision); }
  async saveCancellation(cancellation: RequestCancellation): Promise<void> { this.cancellations.push(cancellation); }
  async saveOutbox(event: OutboxEvent): Promise<void> { this.outbox.push(event); }
  async appendAudit(event: AuditEvent): Promise<void> { this.auditEvents.push(event); }
}
