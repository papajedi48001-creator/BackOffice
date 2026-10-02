import { z } from 'zod';

export type NotificationChannel = 'in_app' | 'email';
export const notificationEventPayloadSchema = z.object({
  recipientPersonId: z.string().min(1),
  requestId: z.string().min(1),
  subject: z.string().trim().min(1).max(255)
});
export type NotificationEventPayload = z.infer<typeof notificationEventPayloadSchema>;
export interface NotificationMessage { eventId: string; recipientPersonId: string; channel: NotificationChannel; requestId: string | null; subject: string; }
export interface LineNotificationProvider { send(message: NotificationMessage): Promise<void>; }
