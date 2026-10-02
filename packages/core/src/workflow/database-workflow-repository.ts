import type { ApprovalDecision, ApprovalStep, AuditEvent, OutboxEvent, SubmittedRequest } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { WorkflowRepository } from './request-service';

type StoredRequest = { id: string; reference: string; moduleCode: string; requestorPersonId: string; organizationSnapshot: string; status: SubmittedRequest['status'] };
type StoredStep = { id: string; requestId: string; sequence: string; assigneeSnapshot: string; status: ApprovalStep['status'] };

export class DatabaseWorkflowRepository implements WorkflowRepository {
  constructor(private readonly database: Database) {}
  async transaction<T>(work: (repository: WorkflowRepository) => Promise<T>): Promise<T> { return this.database.transaction((database) => work(new DatabaseWorkflowRepository(database))); }
  async saveRequest(request: Omit<SubmittedRequest, 'approvalSteps'>): Promise<void> { await this.database.execute('INSERT INTO request (id, reference, module_code, requestor_person_id, organization_snapshot, status, created_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status = VALUES(status)', [request.id, request.reference, request.moduleCode, request.requestorPersonId, JSON.stringify(request.organizationSnapshot), request.status]); }
  async saveStep(step: ApprovalStep): Promise<void> { await this.database.execute('INSERT INTO approval_step (id, request_id, sequence, assignee_snapshot, status, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status = VALUES(status)', [step.id, step.requestId, String(step.sequence), JSON.stringify(step.assigneeSnapshot), step.status]); }
  async getRequest(requestId: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null> { const row = (await this.database.query<StoredRequest>('SELECT id, reference, module_code AS moduleCode, requestor_person_id AS requestorPersonId, organization_snapshot AS organizationSnapshot, status FROM request WHERE id = ? LIMIT 1', [requestId]))[0]; return row ? { ...row, organizationSnapshot: JSON.parse(row.organizationSnapshot) } : null; }
  async getRequestForUpdate(requestId: string): Promise<Omit<SubmittedRequest, 'approvalSteps'> | null> { const row = (await this.database.query<StoredRequest>('SELECT id, reference, module_code AS moduleCode, requestor_person_id AS requestorPersonId, organization_snapshot AS organizationSnapshot, status FROM request WHERE id = ? LIMIT 1 FOR UPDATE', [requestId]))[0]; return row ? { ...row, organizationSnapshot: JSON.parse(row.organizationSnapshot) } : null; }
  async getSteps(requestId: string): Promise<ApprovalStep[]> { return (await this.database.query<StoredStep>('SELECT id, request_id AS requestId, sequence, assignee_snapshot AS assigneeSnapshot, status FROM approval_step WHERE request_id = ? ORDER BY sequence', [requestId])).map((row) => ({ ...row, sequence: Number(row.sequence), assigneeSnapshot: JSON.parse(row.assigneeSnapshot) })); }
  async saveDecision(decision: ApprovalDecision): Promise<void> { await this.database.execute('INSERT INTO approval_decision (id, approval_step_id, actor_person_id, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [decision.id, decision.approvalStepId, decision.actorPersonId, decision.decision, decision.reason]); }
  async saveOutbox(event: OutboxEvent): Promise<void> { await this.database.execute('INSERT INTO outbox_event (id, type, idempotency_key, payload, occurred_at, processed_at) VALUES (?, ?, ?, ?, ?, ?)', [event.id, event.type, event.idempotencyKey, JSON.stringify(event.payload), toMariaDbDatetime(event.occurredAt), event.processedAt ? toMariaDbDatetime(event.processedAt) : null]); }
  async appendAudit(event: AuditEvent): Promise<void> { await this.database.execute('INSERT INTO audit_event (id, actor_person_id, action, target_type, target_id, result, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [event.id, event.actorPersonId ?? null, event.action, event.targetType, event.targetId, event.result, event.metadata]); }
}

function toMariaDbDatetime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
