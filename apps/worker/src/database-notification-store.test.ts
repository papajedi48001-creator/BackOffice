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
    expect(await store.claim({ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' })).toBe(true);
  });

  it('does not claim a notification when the idempotent insert is duplicate', async () => {
    const store = new DatabaseNotificationStore({
      execute: async () => undefined,
      query: async <T extends object>() => [] as T[],
      transaction: async (work) => work({} as never), close: async () => undefined
    });
    expect(await store.claim({ eventId: 'event-1', channel: 'in_app', recipientPersonId: 'person-1', requestId: 'request-1', subject: 'มีคำขอรอพิจารณา' })).toBe(false);
  });
});
