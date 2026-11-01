import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disabled = vi.hoisted(() => ({ codes: [] as string[], development: [] as string[], roles: [] as string[], readSession: 0 }));
vi.mock('./lib/database', () => ({ getSharedDatabase: () => ({ query: vi.fn() }) }));
vi.mock('./lib/module-gate', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/module-gate')>()), readModuleModes: async () => Object.fromEntries([...disabled.codes.map((code) => [code, 'OFF']), ...disabled.development.map((code) => [code, 'DEVELOPMENT'])]) }));
vi.mock('./lib/session', () => ({ readSession: async () => { disabled.readSession += 1; return { authenticated: true, personId: 'p-1', roles: disabled.roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] }; } }));

import { proxy } from './proxy';

describe('proxy', () => {
  beforeEach(() => { disabled.codes = ['fleet']; disabled.development = []; disabled.roles = []; disabled.readSession = 0; });

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

  it('refuses a module in development to everyone but ผู้ดูแลระบบ, its ผู้จัดการ and its ผู้ทดสอบ', async () => {
    disabled.codes = []; disabled.development = ['leave'];
    const api = await proxy(new NextRequest('http://localhost/api/leave/requests', { method: 'POST' }));
    expect(api.status).toBe(403);
    await expect(api.json()).resolves.toEqual({ error: 'module_disabled' });
    expect((await proxy(new NextRequest('http://localhost/leave/mine'))).headers.get('x-middleware-rewrite')).toContain('/module-disabled');
    for (const roles of [['leave-tester'], ['leave-manager'], ['admin']]) {
      disabled.roles = roles;
      expect((await proxy(new NextRequest('http://localhost/leave/mine'))).headers.get('x-middleware-next')).toBe('1');
    }
    disabled.roles = ['fleet-tester'];
    expect((await proxy(new NextRequest('http://localhost/leave/mine'))).status).toBe(403);
  });

  it('reads the session only for a module in development', async () => {
    disabled.development = ['leave'];
    await proxy(new NextRequest('http://localhost/rooms'));
    await proxy(new NextRequest('http://localhost/fleet/mine'));
    expect(disabled.readSession).toBe(0);
  });
});
