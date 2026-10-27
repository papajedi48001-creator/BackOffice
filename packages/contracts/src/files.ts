import { z } from 'zod';

export const supportedAttachmentContentTypeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
/** Types a profile photo may be. */
export const profilePhotoContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
/** Every type the attachment store keeps: general attachments plus profile photos. */
export const storedAttachmentContentTypeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
export type SupportedAttachmentContentType = z.infer<typeof storedAttachmentContentTypeSchema>;
export const uploadAttachmentInputSchema = z.object({ actorPersonId: z.string().min(1), filename: z.string().min(1).max(255), contentType: storedAttachmentContentTypeSchema, bytes: z.instanceof(Uint8Array) });
export type UploadAttachmentInput = z.infer<typeof uploadAttachmentInputSchema>;
export interface Attachment { id: string; objectKey: string; contentType: SupportedAttachmentContentType; sizeBytes: number; createdByPersonId: string; filename: string | null; }
export interface DownloadInput { attachmentId: string; actorPersonId: string; }
