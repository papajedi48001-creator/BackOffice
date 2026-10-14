import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '@backoffice/core';

const mocks = vi.hoisted(() => ({ getSharedDatabase: vi.fn() }));
vi.mock('./database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));

import { endSession, readSession, sessionCookieName, startSession } from './session';

type Row = { id: string; tokenHash: string; personId: string; revoked: boolean };

function fakeDatabase() {
  const sessions: Row[] = [];
  return {
    sessions,
    execute: vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.startsWith('INSERT INTO user_session')) sessions.push({ id: String(parameters[0]), tokenHash: String(parameters[1]), personId: String(parameters[2]), revoked: false });
      if (sql.startsWith('UPDATE user_session SET revoked_at')) sessions.filter((row) => row.id === parameters[0]).forEach((row) => { row.revoked = true; });
    }),
    query: vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('FROM user_session')) return sessions.filter((row) => row.tokenHash === parameters[0]).map((row) => ({ id: row.id, personId: row.personId, idleSeconds: 0, expired: 0, revoked: row.revoked ? 1 : 0 }));
      if (sql.includes('FROM role_assignment')) return [{ name: 'hr-reader', organizationId: 'unit-a' }];
      return [];
    })
  };
}

function requestWithCookie(token?: string) {
  return new Request('http://localhost/dashboard', { headers: token ? { cookie: `other=1; ${sessionCookieName}=${token}` } : {} });
}

afterEach(() => vi.clearAllMocks());

describe('server-side session', () => {
  it('starts a session whose cookie value is never stored and resolves roles from the database', async () => {
    const database = fakeDatabase();
    mocks.getSharedDatabase.mockReturnValue(database);

    const { token, maxAgeSeconds } = await startSession('person-a');

    expect(maxAgeSeconds).toBe(43_200);
    expect(database.sessions[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(database.execute.mock.calls)).not.toContain(token);
    await expect(readSession(requestWithCookie(token))).resolves.toEqual({ authenticated: true, personId: 'person-a', roles: [{ name: 'hr-reader', organizationId: 'unit-a' }], dataOwnerModules: [], hospitalWideDataOwnerModules: [] });
  });

  it('returns no session without a cookie, for an unknown token, or without a database', async () => {
    mocks.getSharedDatabase.mockReturnValue(fakeDatabase());
    await expect(readSession(requestWithCookie())).resolves.toBeNull();
    await expect(readSession(requestWithCookie('forged'))).resolves.toBeNull();
    mocks.getSharedDatabase.mockReturnValue(null);
    await expect(readSession(requestWithCookie('anything'))).resolves.toBeNull();
  });

  it('rejects a legacy signed cookie issued before server-side sessions', async () => {
    mocks.getSharedDatabase.mockReturnValue(fakeDatabase());
    const legacy = `${Buffer.from(JSON.stringify({ authenticated: true, personId: 'person-a', roles: [], dataOwnerModules: [] })).toString('base64url')}.signature`;
    await expect(readSession(requestWithCookie(legacy))).resolves.toBeNull();
  });

  it('ends a session so its token no longer resolves', async () => {
    mocks.getSharedDatabase.mockReturnValue(fakeDatabase());
    const { token } = await startSession('person-a');

    await expect(endSession(requestWithCookie(token))).resolves.toBe('person-a');
    await expect(readSession(requestWithCookie(token))).resolves.toBeNull();
  });
});
