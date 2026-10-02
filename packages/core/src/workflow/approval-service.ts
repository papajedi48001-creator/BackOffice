import { randomUUID } from 'node:crypto';
import { decideRequestInputSchema, notificationEventPayloadSchema, type ApprovalDecision, type Delegation, type OutboxEvent } from '@backoffice/contracts';
import { AuditService } from '../audit/audit-service';
import type { WorkflowRepository } from './request-service';

export interface ActiveDelegationFinder { findActiveFor(delegatorPersonId: string, delegatePersonId: string, moduleCode: string): Promise<Pick<Delegation, 'delegatorPersonId' | 'delegatePersonId' | 'moduleCode'> | null>; }

export class ApprovalService {
  constructor(private readonly repository: Pick<WorkflowRepository, 'transaction' | 'getRequestForUpdate' | 'getSteps' | 'saveRequest' | 'saveStep' | 'saveDecision' | 'saveOutbox' | 'appendAudit'>, private readonly delegations: ActiveDelegationFinder, private readonly createId: () => string = randomUUID) {}

  async decideRequest(input: Parameters<typeof decideRequestInputSchema.parse>[0]): Promise<ApprovalDecision> {
    const decisionInput = decideRequestInputSchema.parse(input);
    if (decisionInput.decision !== 'APPROVE' && !decisionInput.reason) throw new Error('REASON_REQUIRED');
    return this.repository.transaction(async (repository) => {
      const request = await repository.getRequestForUpdate(decisionInput.requestId);
      if (!request || request.status !== 'IN_REVIEW') throw new Error('REQUEST_NOT_PENDING');
      if (request.requestorPersonId === decisionInput.actorPersonId) throw new Error('CONFLICT_OF_INTEREST');
      const steps = (await repository.getSteps(request.id)).sort((left, right) => left.sequence - right.sequence);
      const stepIndex = steps.findIndex((candidate) => candidate.status === 'PENDING');
      const step = stepIndex === -1 ? undefined : steps[stepIndex];
      if (!step) throw new Error('NO_PENDING_APPROVAL');
      const isAssignee = step.assigneeSnapshot.personId === decisionInput.actorPersonId;
      const delegation = isAssignee ? null : await this.delegations.findActiveFor(step.assigneeSnapshot.personId, decisionInput.actorPersonId, request.moduleCode);
      if (!isAssignee && !delegation) throw new Error('APPROVER_REQUIRED');
      const decision: ApprovalDecision = { id: this.createId(), requestId: request.id, approvalStepId: step.id, actorPersonId: decisionInput.actorPersonId, decision: decisionInput.decision, reason: decisionInput.reason ?? null };
      const outbox: OutboxEvent = { id: this.createId(), type: 'workflow.request.decided', idempotencyKey: `workflow.request.decided:${decision.id}`, payload: { requestId: request.id, decision: decision.decision }, occurredAt: new Date().toISOString(), processedAt: null };
      const nextStep = decisionInput.decision === 'APPROVE' ? steps.slice(stepIndex + 1).find((candidate) => candidate.status === 'PENDING') : undefined;
      const status = decisionInput.decision === 'APPROVE' ? (nextStep ? 'IN_REVIEW' : 'APPROVED') : decisionInput.decision === 'REJECT' ? 'REJECTED' : 'RETURNED';
      const stepStatus = decisionInput.decision === 'APPROVE' ? 'APPROVED' : decisionInput.decision === 'REJECT' ? 'REJECTED' : 'RETURNED';
      const recipientPersonId = nextStep?.assigneeSnapshot.personId ?? request.requestorPersonId;
      const subject = nextStep ? 'มีคำขอรอพิจารณา' : decisionInput.decision === 'APPROVE' ? 'คำขอของคุณได้รับอนุมัติ' : decisionInput.decision === 'REJECT' ? 'คำขอของคุณไม่ผ่านการอนุมัติ' : 'คำขอของคุณถูกส่งกลับ';
      await repository.saveStep({ ...step, status: stepStatus });
      await repository.saveDecision(decision);
      await repository.saveRequest({ ...request, status });
      await repository.saveOutbox(outbox);
      await repository.saveOutbox({ id: this.createId(), type: 'notification.in_app', idempotencyKey: `notification.in_app:request-decided:${decision.id}:recipient:${recipientPersonId}`, payload: notificationEventPayloadSchema.parse({ recipientPersonId, requestId: request.id, subject }), occurredAt: new Date().toISOString(), processedAt: null });
      await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: decision.actorPersonId, action: 'workflow.request.decided', targetType: 'request', targetId: request.id, result: decision.decision, metadata: { moduleCode: request.moduleCode, requestReference: request.reference, status, organizationId: request.organizationSnapshot.organizationId } });
      return decision;
    });
  }
}
