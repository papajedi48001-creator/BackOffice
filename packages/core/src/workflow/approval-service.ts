import { randomUUID } from 'node:crypto';
import { decideRequestInputSchema, type ApprovalDecision, type Delegation, type OutboxEvent } from '@backoffice/contracts';
import { AuditService } from '../audit/audit-service';
import type { WorkflowRepository } from './request-service';

export interface ActiveDelegationFinder { findActiveFor(delegatorPersonId: string, delegatePersonId: string, moduleCode: string): Promise<Pick<Delegation, 'delegatorPersonId' | 'delegatePersonId' | 'moduleCode'> | null>; }

export class ApprovalService {
  constructor(private readonly repository: Pick<WorkflowRepository, 'transaction' | 'getRequest' | 'getSteps' | 'saveRequest' | 'saveStep' | 'saveDecision' | 'saveOutbox'>, private readonly delegations: ActiveDelegationFinder, private readonly createId: () => string = randomUUID) {}

  async decideRequest(input: Parameters<typeof decideRequestInputSchema.parse>[0]): Promise<ApprovalDecision> {
    const decisionInput = decideRequestInputSchema.parse(input);
    if (decisionInput.decision !== 'APPROVE' && !decisionInput.reason) throw new Error('REASON_REQUIRED');
    const request = await this.repository.getRequest(decisionInput.requestId);
    if (!request || request.status !== 'IN_REVIEW') throw new Error('REQUEST_NOT_PENDING');
    if (request.requestorPersonId === decisionInput.actorPersonId) throw new Error('CONFLICT_OF_INTEREST');
    const step = (await this.repository.getSteps(request.id)).sort((left, right) => left.sequence - right.sequence).find((candidate) => candidate.status === 'PENDING');
    if (!step) throw new Error('NO_PENDING_APPROVAL');
    const isAssignee = step.assigneeSnapshot.personId === decisionInput.actorPersonId;
    const delegation = isAssignee ? null : await this.delegations.findActiveFor(step.assigneeSnapshot.personId, decisionInput.actorPersonId, request.moduleCode);
    if (!isAssignee && !delegation) throw new Error('APPROVER_REQUIRED');
    const decision: ApprovalDecision = { id: this.createId(), requestId: request.id, approvalStepId: step.id, actorPersonId: decisionInput.actorPersonId, decision: decisionInput.decision, reason: decisionInput.reason ?? null };
    const outbox: OutboxEvent = { id: this.createId(), type: 'workflow.request.decided', idempotencyKey: `workflow.request.decided:${decision.id}`, payload: { requestId: request.id, decision: decision.decision }, occurredAt: new Date().toISOString(), processedAt: null };
    const status = decisionInput.decision === 'APPROVE' ? 'APPROVED' : decisionInput.decision === 'REJECT' ? 'REJECTED' : 'RETURNED';
    await this.repository.transaction(async (repository) => {
      await repository.saveStep({ ...step, status });
      await repository.saveDecision(decision);
      await repository.saveRequest({ ...request, status });
      await repository.saveOutbox(outbox);
      await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: decision.actorPersonId, action: 'workflow.request.decided', targetType: 'request', targetId: request.id, result: decision.decision, metadata: { moduleCode: request.moduleCode, requestReference: request.reference, status, organizationId: request.organizationSnapshot.organizationId } });
    });
    return decision;
  }
}
