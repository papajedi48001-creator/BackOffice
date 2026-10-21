import { z } from 'zod';

export type NotificationChannel = 'in_app' | 'email';
// A target path stays inside the app: one leading slash, no query string, no protocol-relative URL.
export const notificationTargetPathSchema = z.string().max(255).regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/);
export const notificationEventPayloadSchema = z.object({
  recipientPersonId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  targetPath: notificationTargetPathSchema.optional(),
  subject: z.string().trim().min(1).max(255)
}).refine((payload) => payload.requestId !== undefined || payload.targetPath !== undefined, { message: 'requestId or targetPath is required', path: ['requestId'] });
export type NotificationEventPayload = z.infer<typeof notificationEventPayloadSchema>;
export interface NotificationMessage { eventId: string; recipientPersonId: string; channel: NotificationChannel; requestId: string | null; subject: string; }
export interface LineNotificationProvider { send(message: NotificationMessage): Promise<void>; }
