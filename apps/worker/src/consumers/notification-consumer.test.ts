import { describe, expect, it } from 'vitest';
import { NotificationConsumer } from './notification-consumer';

describe('NotificationConsumer', () => {
  it.each([
    [{ recipientPersonId: 'person-1', subject: 'มีคำขอรอพิจารณา' }],
    [{ recipientPersonId: 'person-1', requestId: 'request-1', subject: '' }]
  ])('rejects an incomplete in-app event before it is claimed', async (payload) => {
    let claims = 0;
    const consumer = new NotificationConsumer({ claim: async () => { claims += 1; return true; } }, { deliverEmail: async () => undefined }, { deliverInApp: async () => undefined });

    await expect(consumer.consume({ id: 'event-1', type: 'notification.in_app', idempotencyKey: 'key-1', payload, occurredAt: new Date().toISOString(), processedAt: null })).rejects.toThrow('INVALID_NOTIFICATION_EVENT');
    expect(claims).toBe(0);
  });

  it('claims and delivers a safe in-app request message', async () => {
    const claimed: unknown[] = [];
    const delivered: unknown[] = [];
    const consumer = new NotificationConsumer({ claim: async (message) => { claimed.push(message); return true; } }, { deliverEmail: async () => undefined }, { deliverInApp: async (message) => { delivered.push(message); } });

    await consumer.consume({ id: 'event-1', type: 'notification.in_app', idempotencyKey: 'key-1', payload: { recipientPersonId: 'person-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' }, occurredAt: new Date().toISOString(), processedAt: null });

    expect(claimed).toEqual([{ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' }]);
    expect(delivered).toEqual([{ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' }]);
  });
});
