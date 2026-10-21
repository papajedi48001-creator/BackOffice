import type { Database } from '@backoffice/db';
import { expect, it } from 'vitest';
import { readUnreadNotifications } from './unread-notifications';

const fakeDatabase = (query: Database['query']) => ({ query, close: async () => {} }) as unknown as Database;

it('counts unread in-app notifications', async () => {
  await expect(readUnreadNotifications('person-1', () => fakeDatabase(async () => [{ unreadCount: 4 }] as never))).resolves.toBe(4);
});

it('returns undefined instead of failing when the database is down', async () => {
  await expect(readUnreadNotifications('person-1', () => fakeDatabase(async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); }))).resolves.toBeUndefined();
});

it('returns undefined when the database cannot even be opened', async () => {
  await expect(readUnreadNotifications('person-1', () => { throw new Error('bad url'); })).resolves.toBeUndefined();
});
