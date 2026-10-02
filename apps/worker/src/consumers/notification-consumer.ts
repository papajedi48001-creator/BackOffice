import { notificationEventPayloadSchema, type NotificationMessage, type OutboxEvent } from '@backoffice/contracts';

export interface WorkerNotificationDeliveryStore { claim(message: NotificationMessage): Promise<boolean>; }
export interface WorkerEmailProvider { deliverEmail(message: NotificationMessage): Promise<void>; }
export interface WorkerInAppProvider { deliverInApp(message: NotificationMessage): Promise<void>; }

export class NotificationConsumer {
  constructor(private readonly store: WorkerNotificationDeliveryStore, private readonly email: WorkerEmailProvider, private readonly inApp: WorkerInAppProvider) {}
  async consume(event: OutboxEvent): Promise<void> {
    const channel = event.type === 'notification.email' ? 'email' : 'in_app';
    const inAppPayload = channel === 'in_app' ? notificationEventPayloadSchema.safeParse(event.payload) : null;
    if (inAppPayload && !inAppPayload.success) throw new Error('INVALID_NOTIFICATION_EVENT');
    const recipientPersonId = inAppPayload?.data.recipientPersonId ?? (typeof event.payload.recipientPersonId === 'string' ? event.payload.recipientPersonId : null);
    if (!recipientPersonId) throw new Error('INVALID_NOTIFICATION_EVENT');
    const message: NotificationMessage = { eventId: event.id, recipientPersonId, channel, requestId: inAppPayload?.data.requestId ?? null, subject: inAppPayload?.data.subject ?? (typeof event.payload.subject === 'string' ? event.payload.subject : 'มีงานในระบบ Back Office') };
    if (!(await this.store.claim(message))) return;
    if (channel === 'email') await this.email.deliverEmail(message); else await this.inApp.deliverInApp(message);
  }
}
