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

    expect(claimed).toEqual([{ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', targetPath: null, moduleCode: null, subject: 'มีคำขอรอพิจารณา' }]);
    expect(delivered).toEqual([{ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', targetPath: null, moduleCode: null, subject: 'มีคำขอรอพิจารณา' }]);
  });

  it('passes the sending module through to the in-app message', async () => {
    const delivered: unknown[] = [];
    const consumer = new NotificationConsumer({ claim: async () => true }, { deliverEmail: async () => undefined }, { deliverInApp: async (message) => { delivered.push(message); } });

    await consumer.consume({ id: 'event-2', type: 'notification.in_app', idempotencyKey: 'key-2', payload: { recipientPersonId: 'person-1', targetPath: '/rooms/bookings/booking-1', moduleCode: 'room-booking', subject: 'การจองห้องได้รับอนุมัติ' }, occurredAt: new Date().toISOString(), processedAt: null });

    expect(delivered).toEqual([expect.objectContaining({ moduleCode: 'room-booking', targetPath: '/rooms/bookings/booking-1' })]);
  });

  describe('LINE', () => {
    const inApp = (payload: Record<string, unknown>) => ({ id: 'event-9', type: 'notification.in_app', idempotencyKey: 'k', payload, occurredAt: new Date().toISOString(), processedAt: null });

    it('queues a LINE alert for a notice that needs the recipient to act, before the in-app claim', async () => {
      const steps: string[] = [];
      const queued: unknown[] = [];
      const consumer = new NotificationConsumer({ claim: async () => { steps.push('claim'); return true; } }, { deliverEmail: async () => undefined }, { deliverInApp: async () => undefined }, { enqueue: async (eventId, payload) => { steps.push('enqueue'); queued.push({ eventId, payload }); } });
      await consumer.consume(inApp({ recipientPersonId: 'person-1', moduleCode: 'leave', targetPath: '/leave/requests/r-1', subject: 'มีคำขอรอพิจารณา', actionRequired: true }));
      await consumer.consume(inApp({ recipientPersonId: 'person-1', requestId: 'r-2', subject: 'มีคำขอรอพิจารณา', actionRequired: true }));
      await consumer.consume(inApp({ recipientPersonId: 'person-1', moduleCode: 'requests', requestId: 'r-3', subject: 'มีคำขอรอพิจารณา', actionRequired: true }));
      // Without a module there is no กลุ่มแจ้งเตือน to send to, so the second notice is not queued.
      expect(steps).toEqual(['enqueue', 'claim', 'claim', 'enqueue', 'claim']);
      expect(queued).toEqual([
        { eventId: 'event-9', payload: { recipientPersonId: 'person-1', moduleCode: 'leave', targetPath: '/leave/requests/r-1' } },
        { eventId: 'event-9', payload: { recipientPersonId: 'person-1', moduleCode: 'requests', targetPath: '/requests/r-3' } }
      ]);
    });

    it('queues nothing for an information-only notice', async () => {
      const queued: unknown[] = [];
      const consumer = new NotificationConsumer({ claim: async () => true }, { deliverEmail: async () => undefined }, { deliverInApp: async () => undefined }, { enqueue: async (eventId) => { queued.push(eventId); } });
      await consumer.consume(inApp({ recipientPersonId: 'person-1', moduleCode: 'leave', targetPath: '/leave/requests/r-1', subject: 'อนุมัติ' }));
      expect(queued).toEqual([]);
    });

    it('hands a notification.line event to the LINE consumer and nothing else', async () => {
      const handled: string[] = [];
      let claims = 0;
      const consumer = new NotificationConsumer({ claim: async () => { claims += 1; return true; } }, { deliverEmail: async () => undefined }, { deliverInApp: async () => undefined }, undefined, { consume: async (event) => { handled.push(event.id); } });
      await consumer.consume({ id: 'line-1', type: 'notification.line', idempotencyKey: 'k', payload: {}, occurredAt: new Date().toISOString(), processedAt: null });
      expect(handled).toEqual(['line-1']);
      expect(claims).toBe(0);
    });
  });
});
