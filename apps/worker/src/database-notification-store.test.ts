import { describe, expect, it } from 'vitest';
import { DatabaseNotificationStore } from './database-notification-store';

describe('DatabaseNotificationStore', () => {
  it('claims a notification only when its insert creates a row', async () => {
    let inserted = false;
    const store = new DatabaseNotificationStore({
      execute: async () => { inserted = true; },
      query: async <T extends object>() => (inserted ? [{ id: 'claim-id' }] : []) as T[],
      transaction: async (work) => work({} as never), close: async () => undefined
    });
    expect(await store.claim({ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', targetPath: null, moduleCode: null, subject: 'มีคำขอรอพิจารณา' })).toBe(true);
  });

  it('stores the target path and module of a notification that does not link to a request', async () => {
    const executed: unknown[][] = [];
    const store = new DatabaseNotificationStore({
      execute: async (_sql, parameters) => { executed.push(parameters as unknown[]); },
      query: async <T extends object>() => [{ id: 'claim-id' }] as T[],
      transaction: async (work) => work({} as never), close: async () => undefined
    });
    await store.claim({ eventId: 'event-2', channel: 'in_app', recipientPersonId: 'person-1', requestId: null, targetPath: '/rooms/bookings/booking-1', moduleCode: 'room-booking', subject: 'การจองห้องได้รับอนุมัติ' });
    expect(executed[0]).toEqual([expect.any(String), 'event-2', 'in_app', 'person-1', null, '/rooms/bookings/booking-1', 'room-booking', 'การจองห้องได้รับอนุมัติ']);
  });

  it('does not claim a notification when the idempotent insert is duplicate', async () => {
    const store = new DatabaseNotificationStore({
      execute: async () => undefined,
      query: async <T extends object>() => [] as T[],
      transaction: async (work) => work({} as never), close: async () => undefined
    });
    expect(await store.claim({ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', targetPath: null, moduleCode: null, subject: 'มีคำขอรอพิจารณา' })).toBe(false);
  });
});
