import { describe, expect, it } from 'vitest';
import { RequestService, type WorkflowRepository } from './request-service';
import type { ApprovalDecision, ApprovalStep, AuditEvent, OutboxEvent, SubmittedRequest } from '@backoffice/contracts';

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
});

class MemoryWorkflowRepository implements WorkflowRepository {
  readonly requests = new Map<string, Omit<SubmittedRequest, 'approvalSteps'>>();
  readonly steps = new Map<string, ApprovalStep[]>();
  readonly decisions: ApprovalDecision[] = [];
  readonly outbox: OutboxEvent[] = [];
  readonly auditEvents: AuditEvent[] = [];
  async transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T> { return work(this); }
  async saveRequest(request: Omit<SubmittedRequest, 'approvalSteps'>): Promise<void> { this.requests.set(request.id, request); }
  async saveStep(step: ApprovalStep): Promise<void> { this.steps.set(step.requestId, [...(this.steps.get(step.requestId) ?? []), step]); }
  async getRequest(id: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null> { return this.requests.get(id) ?? null; }
  async getSteps(requestId: string): Promise<ApprovalStep[]> { return this.steps.get(requestId) ?? []; }
  async saveDecision(decision: ApprovalDecision): Promise<void> { this.decisions.push(decision); }
  async saveOutbox(event: OutboxEvent): Promise<void> { this.outbox.push(event); }
  async appendAudit(event: AuditEvent): Promise<void> { this.auditEvents.push(event); }
}
