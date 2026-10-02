import { z } from 'zod';

export const supportedAttachmentContentTypeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
export type SupportedAttachmentContentType = z.infer<typeof supportedAttachmentContentTypeSchema>;
export const uploadAttachmentInputSchema = z.object({ actorPersonId: z.string().min(1), filename: z.string().min(1).max(255), contentType: supportedAttachmentContentTypeSchema, bytes: z.instanceof(Uint8Array) });
export type UploadAttachmentInput = z.infer<typeof uploadAttachmentInputSchema>;
export interface Attachment { id: string; objectKey: string; contentType: SupportedAttachmentContentType; sizeBytes: number; createdByPersonId: string; }
export interface DownloadInput { attachmentId: string; actorPersonId: string; }
export interface TemporaryUrl { url: string; expiresAt: string; }
