import { randomUUID } from 'node:crypto';
import { uploadAttachmentInputSchema, type Attachment, type DownloadInput, type UploadAttachmentInput } from '@backoffice/contracts';
import { ScanService, type MalwareScanner, type ScanStatus } from './scan-service';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export interface PrivateObjectStorage { putPrivate(objectKey: string, contentType: string, bytes: Uint8Array): Promise<void>; getPrivate(objectKey: string): Promise<Uint8Array>; }
/** `save` records the file, its scan and the audit event together; `recordDownload` audits each opening. */
export interface AttachmentRepository { save(attachment: Attachment, scan: ScanStatus): Promise<void>; findById(id: string): Promise<Attachment | null>; recordDownload(attachmentId: string, actorPersonId: string): Promise<void>; }
export interface DownloadAuthorizer { canDownload(input: DownloadInput, attachment: Attachment): Promise<boolean>; }

export class AttachmentService {
  constructor(private readonly storage: PrivateObjectStorage, private readonly attachments: AttachmentRepository, scanner: MalwareScanner, private readonly createId: () => string = randomUUID) { this.scanService = new ScanService(scanner); }
  private readonly scanService: ScanService;

  async uploadAttachment(input: UploadAttachmentInput): Promise<Attachment> {
    const validInput = uploadAttachmentInputSchema.parse(input);
    if (validInput.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('FILE_TOO_LARGE');
    if (validInput.bytes.byteLength === 0 || !hasExpectedSignature(validInput.contentType, validInput.bytes)) throw new Error('INVALID_FILE_CONTENT');
    const scan = await this.scanService.ensureClean(validInput);
    const attachment: Attachment = { id: this.createId(), objectKey: `attachments/${this.createId()}`, contentType: validInput.contentType, sizeBytes: validInput.bytes.byteLength, createdByPersonId: validInput.actorPersonId, filename: validInput.filename };
    await this.storage.putPrivate(attachment.objectKey, attachment.contentType, validInput.bytes);
    await this.attachments.save(attachment, scan);
    return attachment;
  }

  /** The bytes of a file the authorizer lets this person see; NOT_FOUND otherwise, so a refusal never confirms the file exists. */
  async openAttachment(input: DownloadInput, authorizer: DownloadAuthorizer): Promise<{ attachment: Attachment; bytes: Uint8Array }> {
    const attachment = await this.attachments.findById(input.attachmentId);
    if (!attachment || !(await authorizer.canDownload(input, attachment))) throw new Error('NOT_FOUND');
    const bytes = await this.storage.getPrivate(attachment.objectKey);
    await this.attachments.recordDownload(attachment.id, input.actorPersonId);
    return { attachment, bytes };
  }
}

function hasExpectedSignature(contentType: UploadAttachmentInput['contentType'], bytes: Uint8Array): boolean {
  const startsWith = (...prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  if (contentType === 'application/pdf') return startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (contentType === 'image/jpeg') return startsWith(0xff, 0xd8, 0xff);
  return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
}
