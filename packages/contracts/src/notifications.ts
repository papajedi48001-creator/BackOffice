export type NotificationChannel = 'in_app' | 'email';
export interface NotificationMessage { eventId: string; recipientPersonId: string; channel: NotificationChannel; subject: string; }
export interface LineNotificationProvider { send(message: NotificationMessage): Promise<void>; }
