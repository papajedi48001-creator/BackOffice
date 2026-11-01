// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupError } from '@backoffice/core';

const state = vi.hoisted(() => ({ setupMode: true, codeOk: true, cleared: 0, written: [] as string[], writeFails: false, testConnection: vi.fn(), complete: vi.fn() }));
vi.mock('../../../lib/setup-mode', () => ({ isSetupMode: () => state.setupMode }));
vi.mock('../../../lib/setup-code', () => ({ verifySetupCode: () => state.codeOk, clearSetupCode: () => { state.cleared += 1; } }));
vi.mock('../../../lib/setup-config', () => ({
  migrationsDir: () => '/migrations',
  writeDatabaseConfig: async (url: string) => { if (state.writeFails) throw new SetupError('config_write_failed'); state.written.push(url); }
}));
vi.mock('../../../lib/setup-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/setup-service')>()),
  createFirstRunSetup: () => ({ testConnection: state.testConnection, complete: state.complete })
}));

import { POST as completeSetup } from './complete/route';
import { POST as testConnection } from './test-connection/route';

const database = { host: '192.168.1.254', username: 'backoffice', password: 'p@ss/w:rd#%1' };
const admin = { firstName: 'จีระศักดิ์', lastName: 'หอกคำ', employeeCode: 'IT001', nationalId: '1101700230708', username: 'it001', password: 'long-enough-pw' };
const post = (body: unknown) => new Request('http://localhost/api/setup', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('setup API', () => {
  beforeEach(() => {
    Object.assign(state, { setupMode: true, codeOk: true, cleared: 0, written: [], writeFails: false });
    state.testConnection.mockReset().mockResolvedValue({ serverVersion: '11.8.3-MariaDB', pendingMigrations: 21, hasAccounts: false });
    state.complete.mockReset().mockResolvedValue({ databaseUrl: 'mysql://saved', personId: 'p1', serverVersion: '11.8.3-MariaDB', migrationsApplied: 21 });
  });

  it('is not found once a database is configured', async () => {
    state.setupMode = false;
    expect((await testConnection(post({ code: 'C', database }))).status).toBe(404);
    expect((await completeSetup(post({ code: 'C', database, admin }))).status).toBe(404);
  });

  it('refuses a wrong setup code with 403 without connecting', async () => {
    state.codeOk = false;
    const response = await testConnection(post({ code: 'WRONG', database }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_code' });
    expect(state.testConnection).not.toHaveBeenCalled();
  });

  it('answers invalid_input for a body the schema refuses', async () => {
    const response = await completeSetup(post({ code: 'C', database, admin: { ...admin, password: 'short' } }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_input' });
  });

  it('returns the connection check', async () => {
    const response = await testConnection(post({ code: 'C', database }));
    await expect(response.json()).resolves.toEqual({ ok: true, serverVersion: '11.8.3-MariaDB', pendingMigrations: 21, hasAccounts: false });
  });

  it('passes a SetupError code through with 400', async () => {
    state.testConnection.mockRejectedValue(new SetupError('access_denied'));
    const response = await testConnection(post({ code: 'C', database }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'access_denied' });
  });

  it('never echoes or logs a driver message that names the host and user', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.testConnection.mockRejectedValue(new Error('connect ECONNREFUSED 192.168.1.254:3306 user backoffice'));
    const response = await testConnection(post({ code: 'C', database }));
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain('192.168.1.254');
    expect(text).not.toContain('backoffice');
    expect(JSON.stringify(errors.mock.calls)).not.toContain('192.168.1.254');
    errors.mockRestore();
  });

  it('saves the database URL and forgets the code after setup completes', async () => {
    const response = await completeSetup(post({ code: 'C', database, admin }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.written).toEqual(['mysql://saved']);
    expect(state.cleared).toBe(1);
  });

  it('lets only one of two simultaneous completions run', async () => {
    let finish: () => void = () => undefined;
    state.complete.mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ databaseUrl: 'mysql://saved', personId: 'p1', serverVersion: 'v', migrationsApplied: 0 }); }));
    const first = completeSetup(post({ code: 'C', database, admin }));
    const second = await completeSetup(post({ code: 'C', database, admin }));
    await vi.waitFor(() => expect(state.complete).toHaveBeenCalledTimes(1));
    finish();
    expect([(await first).status, second.status]).toEqual([200, 409]);
    await expect(second.json()).resolves.toEqual({ ok: false, error: 'already_configured' });
    expect(state.complete).toHaveBeenCalledTimes(1);
  });

  it('keeps the setup code when the config file cannot be written', async () => {
    state.writeFails = true;
    const response = await completeSetup(post({ code: 'C', database, admin }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'config_write_failed' });
    expect(state.cleared).toBe(0);
  });
});
