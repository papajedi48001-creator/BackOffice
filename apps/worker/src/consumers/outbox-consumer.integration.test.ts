import { describe, expect, it } from 'vitest';
import { OutboxConsumer } from './outbox-consumer';
import { NotificationConsumer } from './notification-consumer';

describe('OutboxConsumer', () => {
  it('delivers a notification once when an outbox event is retried', async () => {
    const event = { id: 'event-1', type: 'notification.email', idempotencyKey: 'notification:event-1', payload: { recipientPersonId: 'person-a', subject: 'งานรออนุมัติ' }, occurredAt: new Date().toISOString(), processedAt: null };
    const sent: string[] = [];
    const claimed = new Set<string>();
    const notificationConsumer = new NotificationConsumer(
      { claim: async (eventId) => { if (claimed.has(eventId)) return false; claimed.add(eventId); return true; } },
      { deliverEmail: async (notification) => { sent.push(notification.eventId); } },
      { deliverInApp: async () => undefined }
    );
    const consumer = new OutboxConsumer({ pending: async () => [event], markProcessed: async () => undefined }, notificationConsumer);

    await consumer.publishOutboxBatch();
    await consumer.publishOutboxBatch();

    expect(sent).toEqual(['event-1']);
  });
});
