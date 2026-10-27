import { randomUUID } from 'node:crypto';
import { supportedAttachmentContentTypeSchema, type Attachment } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { AttachmentRepository } from './attachment-service';
import type { ScanStatus } from './scan-service';

/** ไฟล์แนบส่วนตัว rows. Audit metadata names the file by id only, never by its name. */
export class DatabaseAttachmentRepository implements AttachmentRepository {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async save(attachment: Attachment, scan: ScanStatus): Promise<void> {
    await this.database.transaction(async (database) => {
      await database.execute('INSERT INTO attachment (id, object_key, content_type, size_bytes, created_by_person_id, original_filename, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [attachment.id, attachment.objectKey, attachment.contentType, String(attachment.sizeBytes), attachment.createdByPersonId, attachment.filename]);
      await database.execute('INSERT INTO attachment_scan (id, attachment_id, status, scanned_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [this.createId(), attachment.id, scan]);
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId: attachment.createdByPersonId, action: 'attachment.uploaded', targetType: 'attachment', targetId: attachment.id, result: 'SUCCESS', metadata: { attachmentId: attachment.id, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes } });
    });
  }

  async findById(id: string): Promise<Attachment | null> {
    const [row] = await this.database.query<{ id: string; objectKey: string; contentType: string; sizeBytes: string; createdByPersonId: string; filename: string | null }>('SELECT id, object_key AS objectKey, content_type AS contentType, size_bytes AS sizeBytes, created_by_person_id AS createdByPersonId, original_filename AS filename FROM attachment WHERE id = ?', [id]);
    const contentType = supportedAttachmentContentTypeSchema.safeParse(row?.contentType);
    if (!row || !contentType.success) return null;
    return { ...row, contentType: contentType.data, sizeBytes: Number(row.sizeBytes) };
  }

  async recordDownload(attachmentId: string, actorPersonId: string): Promise<void> {
    await new AuditService(new DatabaseAuditRepository(this.database), this.createId).recordAudit({ actorPersonId, action: 'attachment.downloaded', targetType: 'attachment', targetId: attachmentId, result: 'SUCCESS', metadata: { attachmentId } });
  }
}
