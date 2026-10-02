import { randomUUID } from 'node:crypto';
import type { AuditInput, OutboxEvent } from '@backoffice/contracts';

export interface ExportRequestInput { actorPersonId: string; reason: string; moduleCode: string; scope: Record<string, unknown>; }
export interface ExportJob { id: string; requestedByPersonId: string; moduleCode: string; status: 'QUEUED'; }
export interface ExportAuthorizer { canExport(input: ExportRequestInput): Promise<boolean>; }
export interface ExportAuditRecorder { recordAudit(event: AuditInput): Promise<void>; }
export interface ExportQueue { enqueue(event: OutboxEvent): Promise<void>; }

export class ExportService {
  constructor(private readonly authorizer: ExportAuthorizer, private readonly audits: ExportAuditRecorder, private readonly queue: ExportQueue, private readonly createId: () => string = randomUUID) {}
  async requestExport(input: ExportRequestInput): Promise<ExportJob> {
    if (!input.reason.trim() || !(await this.authorizer.canExport(input))) throw new Error('FORBIDDEN');
    const job: ExportJob = { id: this.createId(), requestedByPersonId: input.actorPersonId, moduleCode: input.moduleCode, status: 'QUEUED' };
    await this.audits.recordAudit({ actorPersonId: input.actorPersonId, action: 'data.export.requested', targetType: 'export', targetId: job.id, result: 'SUCCESS', metadata: { moduleCode: input.moduleCode, reason: input.reason } });
    await this.queue.enqueue({ id: this.createId(), type: 'data.export.requested', idempotencyKey: `data.export.requested:${job.id}`, payload: { exportJobId: job.id, moduleCode: input.moduleCode }, occurredAt: new Date().toISOString(), processedAt: null });
    return job;
  }
}
