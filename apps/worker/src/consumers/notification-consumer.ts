import type { NotificationMessage, OutboxEvent } from '@backoffice/contracts';

export interface WorkerNotificationDeliveryStore { claim(eventId: string, channel: 'email' | 'in_app', recipientPersonId: string): Promise<boolean>; }
export interface WorkerEmailProvider { deliverEmail(message: NotificationMessage): Promise<void>; }
export interface WorkerInAppProvider { deliverInApp(message: NotificationMessage): Promise<void>; }

export class NotificationConsumer {
  constructor(private readonly store: WorkerNotificationDeliveryStore, private readonly email: WorkerEmailProvider, private readonly inApp: WorkerInAppProvider) {}
  async consume(event: OutboxEvent): Promise<void> {
    const recipientPersonId = typeof event.payload.recipientPersonId === 'string' ? event.payload.recipientPersonId : null;
    if (!recipientPersonId) throw new Error('INVALID_NOTIFICATION_EVENT');
    const channel = event.type === 'notification.email' ? 'email' : 'in_app';
    if (!(await this.store.claim(event.id, channel, recipientPersonId))) return;
    const message: NotificationMessage = { eventId: event.id, recipientPersonId, channel, subject: typeof event.payload.subject === 'string' ? event.payload.subject : 'มีงานในระบบ Back Office' };
    if (channel === 'email') await this.email.deliverEmail(message); else await this.inApp.deliverInApp(message);
  }
}
