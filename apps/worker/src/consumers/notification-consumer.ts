import { notificationEventPayloadSchema, type LineAlertPayload, type NotificationMessage, type OutboxEvent } from '@backoffice/contracts';

export interface WorkerNotificationDeliveryStore { claim(message: NotificationMessage): Promise<boolean>; }
export interface WorkerEmailProvider { deliverEmail(message: NotificationMessage): Promise<void>; }
export interface WorkerInAppProvider { deliverInApp(message: NotificationMessage): Promise<void>; }
/** Writes the `notification.line` outbox event for an in-app event; writing it twice is a no-op. */
export interface WorkerLineQueue { enqueue(eventId: string, payload: LineAlertPayload): Promise<void>; }
export interface WorkerLineAlerts { consume(event: OutboxEvent): Promise<void>; }

export class NotificationConsumer {
  constructor(private readonly store: WorkerNotificationDeliveryStore, private readonly email: WorkerEmailProvider, private readonly inApp: WorkerInAppProvider, private readonly lineQueue?: WorkerLineQueue, private readonly lineAlerts?: WorkerLineAlerts) {}
  async consume(event: OutboxEvent): Promise<void> {
    if (event.type === 'notification.line') { await this.lineAlerts?.consume(event); return; }
    const channel = event.type === 'notification.email' ? 'email' : 'in_app';
    const inAppPayload = channel === 'in_app' ? notificationEventPayloadSchema.safeParse(event.payload) : null;
    if (inAppPayload && !inAppPayload.success) throw new Error('INVALID_NOTIFICATION_EVENT');
    const recipientPersonId = inAppPayload?.data.recipientPersonId ?? (typeof event.payload.recipientPersonId === 'string' ? event.payload.recipientPersonId : null);
    if (!recipientPersonId) throw new Error('INVALID_NOTIFICATION_EVENT');
    const message: NotificationMessage = { eventId: event.id, recipientPersonId, channel, requestId: inAppPayload?.data.requestId ?? null, targetPath: inAppPayload?.data.targetPath ?? null, moduleCode: inAppPayload?.data.moduleCode ?? null, subject: inAppPayload?.data.subject ?? (typeof event.payload.subject === 'string' ? event.payload.subject : 'มีงานในระบบ Back Office') };
    // Queued before the claim: both steps are idempotent, so a retry after a failure in between still queues the alert.
    if (inAppPayload?.data.actionRequired && message.moduleCode && this.lineQueue) {
      const targetPath = message.targetPath ?? (message.requestId ? `/requests/${message.requestId}` : null);
      if (targetPath) await this.lineQueue.enqueue(event.id, { recipientPersonId, moduleCode: message.moduleCode, targetPath });
    }
    if (!(await this.store.claim(message))) return;
    if (channel === 'email') await this.email.deliverEmail(message); else await this.inApp.deliverInApp(message);
  }
}
