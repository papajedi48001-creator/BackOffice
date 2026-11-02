import { z } from 'zod';

/** แชตกับผู้ดูแลระบบ: the longest message a person or ผู้ดูแลระบบ may send. */
export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;
/** Pictures a chat message may carry, attached or pasted from the clipboard. */
export const supportChatImageContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

/** One message: text, an image, or both. Whitespace-only text counts as none. There is never a recipient: a person always writes to ผู้ดูแลระบบ. */
export const supportMessageInputSchema = z.object({
  body: z.string().optional().transform((value) => value?.trim() || undefined).pipe(z.string().max(SUPPORT_MESSAGE_MAX_LENGTH).optional()),
  attachmentId: z.string().uuid().optional()
}).strict().transform((value) => ({ ...(value.body ? { body: value.body } : {}), ...(value.attachmentId ? { attachmentId: value.attachmentId } : {}) }))
  .refine((value) => Boolean(value.body || value.attachmentId), { message: 'EMPTY_MESSAGE', path: ['body'] });
export type SupportMessageInput = z.infer<typeof supportMessageInputSchema>;

export interface SupportMessage { id: string; fromAdmin: boolean; senderName: string | null; body: string | null; attachmentId: string | null; createdAt: string; mine: boolean; }
export interface SupportConversationSummary { id: string; personId: string; displayName: string | null; positionTitle: string | null; lastMessage: string | null; lastHasImage: boolean; lastMessageAt: string; unread: number; }
