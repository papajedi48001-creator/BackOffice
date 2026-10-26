import type { Database } from '@backoffice/db';
import { describe, expect, it, vi } from 'vitest';
import { loadShellData } from './shell-data';

const session = { authenticated: true as const, personId: 'director', roles: [], dataOwnerModules: [] };

describe('loadShellData', () => {
  it('puts each module\'s count on its menu item and loads the bell', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS found')) return [{ found: 1 }];
      if (sql.includes('COUNT(*) AS total FROM notification')) return [{ total: 1 }];
      if (sql.includes('JOIN approval_step s')) return [{ requestId: 'r-1', reference: 'REQ-1', moduleCode: 'leave', requestorName: null, submittedAt: '2026-10-26T03:00:00.000Z' }];
      if (sql.includes('FROM notification') && sql.includes('LIMIT 10')) return [{ id: 'n-1', moduleCode: 'leave', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล', readAt: null, createdAt: '2026-10-26T03:00:00.000Z' }];
      return [];
    });

    const shell = await loadShellData({ query } as unknown as Database, session);

    expect(shell.navigation.find((item) => item.href === '/requests')?.badge).toBe(1);
    expect(shell.navigation.find((item) => item.href === '/notifications')?.badge).toBe(1);
    expect(shell.bell).toEqual({ unread: 1, items: [{ id: 'n-1', moduleLabel: 'การลา', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล', readAt: null, createdAt: '2026-10-26T03:00:00.000Z' }] });
  });

  it('still gives a menu and an empty bell when the database is down', async () => {
    const query = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const shell = await loadShellData({ query } as unknown as Database, session);
    expect(shell.navigation[0]).toEqual({ href: '/dashboard', label: 'dashboard', module: 'home' });
    expect(shell.navigation.some((item) => item.badge)).toBe(false);
    expect(shell.bell).toEqual({ unread: 0, items: [] });
  });
});
