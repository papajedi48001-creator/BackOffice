import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disabled = vi.hoisted(() => ({ codes: [] as string[], development: [] as string[], roles: [] as string[], readSession: 0, pending: false }));
const setup = vi.hoisted(() => ({ on: false }));
vi.mock('./lib/setup-mode', () => ({ isSetupMode: () => setup.on }));
vi.mock('./lib/database', () => ({ getSharedDatabase: () => ({ query: vi.fn() }) }));
vi.mock('./lib/module-gate', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/module-gate')>()), readModuleModes: async () => Object.fromEntries([...disabled.codes.map((code) => [code, 'OFF']), ...disabled.development.map((code) => [code, 'DEVELOPMENT'])]) }));
vi.mock('./lib/session', () => ({ readSession: async () => { disabled.readSession += 1; return { authenticated: true, personId: 'p-1', roles: disabled.roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [], roleSelectionRequired: disabled.pending }; }, sessionCookieName: 'backoffice_session' }));

import { proxy } from './proxy';

describe('proxy', () => {
  beforeEach(() => { disabled.codes = ['fleet']; disabled.development = []; disabled.roles = []; disabled.readSession = 0; disabled.pending = false; setup.on = false; });

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

  it('reads no session for a request without a session cookie outside a module in development', async () => {
    disabled.development = ['leave'];
    await proxy(new NextRequest('http://localhost/rooms'));
    await proxy(new NextRequest('http://localhost/fleet/mine'));
    expect(disabled.readSession).toBe(0);
  });

  describe('while a person with several roles has not chosen one', () => {
    const signedIn = (path: string, method = 'GET') => new NextRequest(`http://localhost${path}`, { method, headers: { cookie: 'backoffice_session=t' } });
    beforeEach(() => { disabled.codes = []; disabled.development = ['leave']; disabled.pending = true; });

    it('sends every app page to /choose-role, reading the session once', async () => {
      for (const path of ['/dashboard', '/leave/mine', '/hr/me']) {
        disabled.readSession = 0;
        const response = await proxy(signedIn(path));
        expect(response.status).toBe(307);
        expect(new URL(response.headers.get('location')!).pathname).toBe('/choose-role');
        expect(disabled.readSession).toBe(1);
      }
    });

    it('answers APIs with 403 role_selection_required', async () => {
      const response = await proxy(signedIn('/api/leave/requests', 'POST'));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'role_selection_required' });
    });

    it('lets the picker, its API, sign-in, sign-out and password change through', async () => {
      for (const path of ['/', '/choose-role', '/api/auth/role', '/api/auth/local', '/api/auth/local/sign-out', '/change-password', '/api/auth/password', '/api/health']) {
        expect((await proxy(signedIn(path))).headers.get('x-middleware-next')).toBe('1');
      }
    });

    it('lets a chosen session through', async () => {
      disabled.pending = false; disabled.development = [];
      expect((await proxy(signedIn('/dashboard'))).headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('while no database is configured', () => {
    beforeEach(() => { setup.on = true; });

    it('sends every page to /setup', async () => {
      for (const path of ['/', '/dashboard', '/leave/mine']) {
        const response = await proxy(new NextRequest(`http://localhost${path}`));
        expect(response.status).toBe(307);
        expect(new URL(response.headers.get('location')!).pathname).toBe('/setup');
      }
    });

    it('answers other APIs with 503 setup_required', async () => {
      const response = await proxy(new NextRequest('http://localhost/api/leave/requests'));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'setup_required' });
    });

    it('lets the setup page, its API and the health check through', async () => {
      for (const path of ['/setup', '/api/setup/test-connection', '/api/health']) {
        expect((await proxy(new NextRequest(`http://localhost${path}`))).headers.get('x-middleware-next')).toBe('1');
      }
    });
  });
});
