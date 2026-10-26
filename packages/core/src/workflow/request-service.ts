import { randomUUID } from 'node:crypto';
import { cancelRequestInputSchema, notificationEventPayloadSchema, resubmitRequestInputSchema, submitRequestInputSchema, type ApprovalDecision, type ApprovalStep, type ApproverSnapshot, type AuditEvent, type CommandChainTarget, type OutboxEvent, type RequestCancellation, type SubmittedRequest } from '@backoffice/contracts';
import { AuditService } from '../audit/audit-service';
import { notificationTarget } from './module-notification';

export interface WorkflowRepository {
  transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T>;
  saveRequest(request: Omit<SubmittedRequest, 'approvalSteps'>): Promise<void>;
  saveStep(step: ApprovalStep): Promise<void>;
  getRequest(requestId: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null>;
  getRequestForUpdate(requestId: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null>;
  getSteps(requestId: string): Promise<ApprovalStep[]>;
  saveDecision(decision: ApprovalDecision): Promise<void>;
  saveCancellation(cancellation: RequestCancellation): Promise<void>;
  saveOutbox(event: OutboxEvent): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
  /** ตำแหน่ง named in a decision notice; optional so a store without people still works. */
  getPositionTitle?(personId: string): Promise<string | null>;
}

export interface ApproverResolver { resolve(input: { moduleCode: string; requestorPersonId: string; organizationId: string; target?: CommandChainTarget }): Promise<ApproverSnapshot[]>; }

export class RequestService {
  constructor(private readonly repository: WorkflowRepository, private readonly approvers: ApproverResolver, private readonly createId: () => string = randomUUID) {}

  /** `options.approvers` fixes the approval steps instead of resolving them, as ขอยกเลิกวันลา does. */
  async submitRequest(input: Parameters<typeof submitRequestInputSchema.parse>[0], options: { approvers?: ApproverSnapshot[] } = {}): Promise<SubmittedRequest> {
    const validInput = submitRequestInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const requestId = this.createId();
      const snapshots = options.approvers ?? await this.approvers.resolve({ moduleCode: validInput.moduleCode, requestorPersonId: validInput.requestorPersonId, organizationId: validInput.organizationSnapshot.organizationId, ...(validInput.target ? { target: validInput.target } : {}) });
      if (snapshots.length === 0) throw new Error('NO_APPROVER');
      const request = { id: requestId, reference: `REQ-${requestId}`, moduleCode: validInput.moduleCode, requestorPersonId: validInput.requestorPersonId, organizationSnapshot: validInput.organizationSnapshot, status: 'IN_REVIEW' as const };
      const approvalSteps: ApprovalStep[] = snapshots.map((assigneeSnapshot, index) => ({ id: this.createId(), requestId, sequence: index + 1, assigneeSnapshot, status: 'PENDING' }));
      await repository.saveRequest(request);
      for (const step of approvalSteps) await repository.saveStep(step);
      await repository.saveOutbox({ id: this.createId(), type: 'workflow.request.submitted', idempotencyKey: `workflow.request.submitted:${requestId}`, payload: { requestId, moduleCode: request.moduleCode }, occurredAt: new Date().toISOString(), processedAt: null });
      const firstStep = approvalSteps[0]!;
      await repository.saveOutbox({ id: this.createId(), type: 'notification.in_app', idempotencyKey: `notification.in_app:request-submitted:${requestId}:step:${firstStep.id}`, payload: notificationEventPayloadSchema.parse({ ...notificationTarget(request.moduleCode, requestId), recipientPersonId: firstStep.assigneeSnapshot.personId, requestId, subject: 'มีคำขอรอพิจารณา' }), occurredAt: new Date().toISOString(), processedAt: null });
      await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: request.requestorPersonId, action: 'workflow.request.submitted', targetType: 'request', targetId: request.id, result: 'SUCCESS', metadata: { moduleCode: request.moduleCode, requestReference: request.reference, status: request.status, organizationId: request.organizationSnapshot.organizationId } });
      return { ...request, approvalSteps };
    });
  }

  /** `options.actorAuthorized` means the calling module already checked the actor may act for the requestor, as a หัวหน้าคณะ does for a trip. */
  async cancelRequest(input: Parameters<typeof cancelRequestInputSchema.parse>[0], options: { actorAuthorized?: boolean } = {}): Promise<Omit<SubmittedRequest, 'approvalSteps'>> {
    const parsed = cancelRequestInputSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.some((issue) => issue.path[0] === 'reason') ? 'REASON_REQUIRED' : 'INVALID_INPUT');
    const validInput = parsed.data;
    return this.repository.transaction(async (repository) => {
      const request = await repository.getRequestForUpdate(validInput.requestId);
      if (!request) throw new Error('REQUEST_NOT_FOUND');
      if (!options.actorAuthorized && request.requestorPersonId !== validInput.actorPersonId) throw new Error('NOT_REQUESTOR');
      if (request.status !== 'IN_REVIEW' && request.status !== 'RETURNED') throw new Error('REQUEST_NOT_CANCELLABLE');
      const cancelled = { ...request, status: 'CANCELLED' as const };
      const pendingSteps = (await repository.getSteps(request.id)).sort((left, right) => left.sequence - right.sequence).filter((step) => step.status === 'PENDING');
      await repository.saveRequest(cancelled);
      for (const step of pendingSteps) await repository.saveStep({ ...step, status: 'CANCELLED' });
      await repository.saveCancellation({ id: this.createId(), requestId: request.id, actorPersonId: validInput.actorPersonId, reason: validInput.reason });
      await repository.saveOutbox({ id: this.createId(), type: 'workflow.request.cancelled', idempotencyKey: `workflow.request.cancelled:${request.id}`, payload: { requestId: request.id, moduleCode: request.moduleCode }, occurredAt: new Date().toISOString(), processedAt: null });
      const pendingApprover = request.status === 'IN_REVIEW' ? pendingSteps[0]?.assigneeSnapshot.personId : undefined;
      if (pendingApprover) await repository.saveOutbox({ id: this.createId(), type: 'notification.in_app', idempotencyKey: `notification.in_app:request-cancelled:${request.id}:recipient:${pendingApprover}`, payload: notificationEventPayloadSchema.parse({ ...notificationTarget(request.moduleCode, request.id), recipientPersonId: pendingApprover, requestId: request.id, subject: 'คำขอถูกยกเลิก' }), occurredAt: new Date().toISOString(), processedAt: null });
      await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: validInput.actorPersonId, action: 'workflow.request.cancelled', targetType: 'request', targetId: request.id, result: 'SUCCESS', metadata: { moduleCode: request.moduleCode, requestReference: request.reference, status: cancelled.status, organizationId: request.organizationSnapshot.organizationId } });
      return cancelled;
    });
  }

  async resubmitRequest(input: Parameters<typeof resubmitRequestInputSchema.parse>[0], options: { actorAuthorized?: boolean } = {}): Promise<SubmittedRequest> {
    const validInput = resubmitRequestInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const request = await repository.getRequestForUpdate(validInput.requestId);
      if (!request) throw new Error('REQUEST_NOT_FOUND');
      if (!options.actorAuthorized && request.requestorPersonId !== validInput.actorPersonId) throw new Error('NOT_REQUESTOR');
      if (request.status !== 'RETURNED') throw new Error('REQUEST_NOT_RETURNED');
      const snapshots = await this.approvers.resolve({ moduleCode: request.moduleCode, requestorPersonId: request.requestorPersonId, organizationId: request.organizationSnapshot.organizationId, ...(validInput.target ? { target: validInput.target } : {}) });
      if (snapshots.length === 0) throw new Error('NO_APPROVER');
      const existingSteps = (await repository.getSteps(request.id)).sort((left, right) => left.sequence - right.sequence);
      const lastSequence = existingSteps.reduce((highest, step) => Math.max(highest, step.sequence), 0);
      const newSteps: ApprovalStep[] = snapshots.map((assigneeSnapshot, index) => ({ id: this.createId(), requestId: request.id, sequence: lastSequence + index + 1, assigneeSnapshot, status: 'PENDING' }));
      const resubmitted = { ...request, status: 'IN_REVIEW' as const };
      await repository.saveRequest(resubmitted);
      for (const step of newSteps) await repository.saveStep(step);
      const firstStep = newSteps[0]!;
      await repository.saveOutbox({ id: this.createId(), type: 'workflow.request.resubmitted', idempotencyKey: `workflow.request.resubmitted:${request.id}:step:${firstStep.id}`, payload: { requestId: request.id, moduleCode: request.moduleCode }, occurredAt: new Date().toISOString(), processedAt: null });
      await repository.saveOutbox({ id: this.createId(), type: 'notification.in_app', idempotencyKey: `notification.in_app:request-resubmitted:${request.id}:step:${firstStep.id}`, payload: notificationEventPayloadSchema.parse({ ...notificationTarget(request.moduleCode, request.id), recipientPersonId: firstStep.assigneeSnapshot.personId, requestId: request.id, subject: 'มีคำขอรอพิจารณา' }), occurredAt: new Date().toISOString(), processedAt: null });
      await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: validInput.actorPersonId, action: 'workflow.request.resubmitted', targetType: 'request', targetId: request.id, result: 'SUCCESS', metadata: { moduleCode: request.moduleCode, requestReference: request.reference, status: resubmitted.status, organizationId: request.organizationSnapshot.organizationId } });
      return { ...resubmitted, approvalSteps: [...existingSteps, ...newSteps] };
    });
  }

  async getPendingApprover(requestId: string): Promise<ApproverSnapshot | null> {
    const step = (await this.repository.getSteps(requestId)).sort((left, right) => left.sequence - right.sequence).find((candidate) => candidate.status === 'PENDING');
    return step?.assigneeSnapshot ?? null;
  }
}
