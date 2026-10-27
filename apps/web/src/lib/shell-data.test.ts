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
      if (sql.includes('LEFT JOIN hr_person_profile')) return [{ displayName: 'นายผู้อำนวยการ ทดสอบ', positionTitle: 'ผู้อำนวยการ', photoAttachmentId: 'att-1' }];
      if (sql.includes('FROM notification') && sql.includes('LIMIT 10')) return [{ id: 'n-1', moduleCode: 'leave', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล', readAt: null, createdAt: '2026-10-26T03:00:00.000Z' }];
      return [];
    });

    const shell = await loadShellData({ query } as unknown as Database, session);

    expect(shell.navigation.find((item) => item.href === '/requests')?.badge).toBe(1);
    expect(shell.navigation.find((item) => item.href === '/notifications')?.badge).toBe(1);
    expect(shell.profile).toEqual({ displayName: 'นายผู้อำนวยการ ทดสอบ', positionTitle: 'ผู้อำนวยการ', photoUrl: null });
    expect(shell.bell).toEqual({ unread: 1, items: [{ id: 'n-1', moduleLabel: 'การลา', module: 'leave', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล', readAt: null, createdAt: '2026-10-26T03:00:00.000Z' }] });
  });

  it('leaves the notification menu out when nothing is unread and asks the bell for unread notices only', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS found')) return [{ found: 0 }];
      if (sql.includes('COUNT(*) AS total FROM notification')) return [{ total: 0 }];
      return [];
    });

    const shell = await loadShellData({ query } as unknown as Database, session);

    expect(shell.navigation.some((item) => item.href === '/notifications')).toBe(false);
    expect(shell.navigation.some((item) => item.href === '/requests')).toBe(false);
    expect(query.mock.calls.find(([sql]) => String(sql).includes('LIMIT 10'))?.[0]).toContain('read_at IS NULL');
  });

  it('still gives a menu and an empty bell when the database is down', async () => {
    const query = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const shell = await loadShellData({ query } as unknown as Database, session);
    expect(shell.navigation[0]).toEqual({ href: '/dashboard', label: 'dashboard', module: 'home' });
    expect(shell.navigation.some((item) => item.badge)).toBe(false);
    expect(shell.bell).toEqual({ unread: 0, items: [] });
    expect(shell.profile).toEqual({ displayName: null, positionTitle: null, photoUrl: null });
  });

  it('links the profile photo only when object storage is configured', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://s3'); vi.stubEnv('S3_BUCKET', 'b'); vi.stubEnv('S3_ACCESS_KEY_ID', 'k'); vi.stubEnv('S3_SECRET_ACCESS_KEY', 's'); vi.stubEnv('CLAMD_HOST', 'clamd');
    const query = vi.fn(async (sql: string) => sql.includes('LEFT JOIN hr_person_profile') ? [{ displayName: 'ก ข', positionTitle: null, photoAttachmentId: 'att-1' }] : []);
    const shell = await loadShellData({ query } as unknown as Database, session);
    vi.unstubAllEnvs();
    expect(shell.profile.photoUrl).toBe('/api/hr/people/director/photo?v=att-1');
  });
});
