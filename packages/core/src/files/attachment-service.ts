import { randomUUID } from 'node:crypto';
import { uploadAttachmentInputSchema, type Attachment, type DownloadInput, type TemporaryUrl, type UploadAttachmentInput } from '@backoffice/contracts';
import { ScanService, type MalwareScanner } from './scan-service';

const maxAttachmentBytes = 10 * 1024 * 1024;
export interface PrivateObjectStorage { putPrivate(objectKey: string, contentType: string, bytes: Uint8Array): Promise<void>; createTemporaryUrl(objectKey: string, expiresInSeconds: number): Promise<string>; }
export interface AttachmentRepository { save(attachment: Attachment): Promise<void>; findById(id: string): Promise<Attachment | null>; }
export interface DownloadAuthorizer { canDownload(input: DownloadInput, attachment: Attachment): Promise<boolean>; }

export class AttachmentService {
  constructor(private readonly storage: PrivateObjectStorage, private readonly attachments: AttachmentRepository, scanner: MalwareScanner, private readonly createId: () => string = randomUUID) { this.scanService = new ScanService(scanner); }
  private readonly scanService: ScanService;

  async uploadAttachment(input: UploadAttachmentInput): Promise<Attachment> {
    const validInput = uploadAttachmentInputSchema.parse(input);
    if (validInput.bytes.byteLength === 0 || validInput.bytes.byteLength > maxAttachmentBytes || !hasExpectedSignature(validInput.contentType, validInput.bytes)) throw new Error('INVALID_FILE_CONTENT');
    await this.scanService.ensureClean(validInput);
    const attachment: Attachment = { id: this.createId(), objectKey: `attachments/${this.createId()}`, contentType: validInput.contentType, sizeBytes: validInput.bytes.byteLength, createdByPersonId: validInput.actorPersonId };
    await this.storage.putPrivate(attachment.objectKey, attachment.contentType, validInput.bytes);
    await this.attachments.save(attachment);
    return attachment;
  }

  async createDownloadUrl(input: DownloadInput, authorizer: DownloadAuthorizer): Promise<TemporaryUrl> {
    const attachment = await this.attachments.findById(input.attachmentId);
    if (!attachment || !(await authorizer.canDownload(input, attachment))) throw new Error('FORBIDDEN');
    const expiresInSeconds = 300;
    return { url: await this.storage.createTemporaryUrl(attachment.objectKey, expiresInSeconds), expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
  }
}

function hasExpectedSignature(contentType: UploadAttachmentInput['contentType'], bytes: Uint8Array): boolean {
  const startsWith = (...prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  if (contentType === 'application/pdf') return startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (contentType === 'image/jpeg') return startsWith(0xff, 0xd8, 0xff);
  return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
}
