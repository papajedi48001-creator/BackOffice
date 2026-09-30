import type { NotificationMessage, OutboxEvent } from '@backoffice/contracts';

export interface NotificationDeliveryStore { claim(eventId: string, channel: NotificationMessage['channel'], recipientPersonId: string): Promise<boolean>; }
export interface EmailNotificationProvider { send(message: NotificationMessage): Promise<void>; }
export interface InAppNotificationProvider { send(message: NotificationMessage): Promise<void>; }

export class NotificationService {
  constructor(private readonly store: NotificationDeliveryStore, private readonly email: EmailNotificationProvider, private readonly inApp: InAppNotificationProvider) {}
  async deliver(event: OutboxEvent): Promise<void> {
    const recipientPersonId = typeof event.payload.recipientPersonId === 'string' ? event.payload.recipientPersonId : null;
    if (!recipientPersonId) throw new Error('INVALID_NOTIFICATION_EVENT');
    const subject = typeof event.payload.subject === 'string' ? event.payload.subject : 'มีงานในระบบ Back Office';
    const channel = event.type === 'notification.email' ? 'email' : 'in_app';
    if (!(await this.store.claim(event.id, channel, recipientPersonId))) return;
    const message: NotificationMessage = { eventId: event.id, recipientPersonId, channel, subject };
    if (channel === 'email') await this.email.send(message); else await this.inApp.send(message);
  }
}
