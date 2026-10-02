import { randomUUID } from 'node:crypto';
import { auditInputSchema, type AuditEvent, type AuditInput } from '@backoffice/contracts';
import { redactAuditMetadata } from './redact';

export interface AuditRepository { append(event: AuditEvent): Promise<void>; }

export class AuditService {
  constructor(private readonly repository: AuditRepository, private readonly createId: () => string = randomUUID) {}

  async recordAudit(input: AuditInput): Promise<void> {
    const validInput = auditInputSchema.parse(input);
    await this.repository.append({ ...validInput, id: this.createId(), metadata: JSON.stringify(redactAuditMetadata(validInput.metadata)), createdAt: new Date().toISOString() });
  }
}
