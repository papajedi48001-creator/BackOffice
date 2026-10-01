import { randomUUID } from 'node:crypto';
import { submitRequestInputSchema, type ApprovalDecision, type ApprovalStep, type ApproverSnapshot, type AuditEvent, type OutboxEvent, type SubmittedRequest } from '@backoffice/contracts';
import { AuditService } from '../audit/audit-service';

export interface WorkflowRepository {
  transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T>;
  saveRequest(request: Omit<SubmittedRequest, 'approvalSteps'>): Promise<void>;
  saveStep(step: ApprovalStep): Promise<void>;
  getRequest(requestId: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null>;
  getSteps(requestId: string): Promise<ApprovalStep[]>;
  saveDecision(decision: ApprovalDecision): Promise<void>;
  saveOutbox(event: OutboxEvent): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}

export interface ApproverResolver { resolve(input: { moduleCode: string; requestorPersonId: string; organizationId: string }): Promise<ApproverSnapshot[]>; }

export class RequestService {
  constructor(private readonly repository: WorkflowRepository, private readonly approvers: ApproverResolver, private readonly createId: () => string = randomUUID) {}

  async submitRequest(input: Parameters<typeof submitRequestInputSchema.parse>[0]): Promise<SubmittedRequest> {
    const validInput = submitRequestInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const requestId = this.createId();
      const snapshots = await this.approvers.resolve({ moduleCode: validInput.moduleCode, requestorPersonId: validInput.requestorPersonId, organizationId: validInput.organizationSnapshot.organizationId });
      if (snapshots.length === 0) throw new Error('NO_APPROVER');
      const request = { id: requestId, reference: `REQ-${requestId}`, moduleCode: validInput.moduleCode, requestorPersonId: validInput.requestorPersonId, organizationSnapshot: validInput.organizationSnapshot, status: 'IN_REVIEW' as const };
      const approvalSteps: ApprovalStep[] = snapshots.map((assigneeSnapshot, index) => ({ id: this.createId(), requestId, sequence: index + 1, assigneeSnapshot, status: 'PENDING' }));
      await repository.saveRequest(request);
      for (const step of approvalSteps) await repository.saveStep(step);
      await repository.saveOutbox({ id: this.createId(), type: 'workflow.request.submitted', idempotencyKey: `workflow.request.submitted:${requestId}`, payload: { requestId, moduleCode: request.moduleCode }, occurredAt: new Date().toISOString(), processedAt: null });
      await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: request.requestorPersonId, action: 'workflow.request.submitted', targetType: 'request', targetId: request.id, result: 'SUCCESS', metadata: { moduleCode: request.moduleCode, requestReference: request.reference, status: request.status, organizationId: request.organizationSnapshot.organizationId } });
      return { ...request, approvalSteps };
    });
  }

  async getPendingApprover(requestId: string): Promise<ApproverSnapshot | null> {
    const step = (await this.repository.getSteps(requestId)).sort((left, right) => left.sequence - right.sequence).find((candidate) => candidate.status === 'PENDING');
    return step?.assigneeSnapshot ?? null;
  }
}
