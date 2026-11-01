import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disabled = vi.hoisted(() => ({ codes: [] as string[] }));
vi.mock('./lib/database', () => ({ getSharedDatabase: () => ({ query: vi.fn() }) }));
vi.mock('./lib/module-gate', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/module-gate')>()), readDisabledModules: async () => disabled.codes }));

import { proxy } from './proxy';

describe('proxy', () => {
  beforeEach(() => { disabled.codes = ['fleet']; });

  it('refuses an API of a switched-off module with 403 and module_disabled', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/fleet/drivers', { method: 'POST' }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'module_disabled' });
  });

  it('shows the switched-off notice in place of the module\'s pages', async () => {
    const response = await proxy(new NextRequest('http://localhost/fleet/settings'));
    expect(response.status).toBe(403);
    expect(response.headers.get('x-middleware-rewrite')).toContain('/module-disabled');
  });

  it('lets other modules, shared pages and the admin module through', async () => {
    disabled.codes = ['fleet', 'admin'];
    for (const path of ['/leave/mine', '/dashboard', '/admin/modules', '/api/admin/modules/fleet']) {
      expect((await proxy(new NextRequest(`http://localhost${path}`))).headers.get('x-middleware-next')).toBe('1');
    }
  });
});
