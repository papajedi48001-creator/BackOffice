import { describe, expect, it } from 'vitest';
import { RequestService, type WorkflowRepository } from './request-service';

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
});

class MemoryWorkflowRepository implements WorkflowRepository {
  readonly requests = new Map<string, any>();
  readonly steps = new Map<string, any[]>();
  readonly decisions: any[] = [];
  readonly outbox: any[] = [];
  async transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T> { return work(this); }
  async saveRequest(request: any): Promise<void> { this.requests.set(request.id, request); }
  async saveStep(step: any): Promise<void> { this.steps.set(step.requestId, [...(this.steps.get(step.requestId) ?? []), step]); }
  async getRequest(id: string): Promise<any | null> { return this.requests.get(id) ?? null; }
  async getSteps(requestId: string): Promise<any[]> { return this.steps.get(requestId) ?? []; }
  async saveDecision(decision: any): Promise<void> { this.decisions.push(decision); }
  async saveOutbox(event: any): Promise<void> { this.outbox.push(event); }
}
