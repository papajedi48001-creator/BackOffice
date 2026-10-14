import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ endSession: vi.fn(), getSharedDatabase: vi.fn(), execute: vi.fn() }));
vi.mock('../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../../lib/session', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/session')>(), endSession: mocks.endSession }));

import { POST } from './route';

afterEach(() => vi.clearAllMocks());

function signOut() {
  return POST(new Request('http://localhost/api/auth/local/sign-out', { method: 'POST', headers: { cookie: 'backoffice_session=opaque-token' } }));
}

test('revokes the server-side session, audits it, and expires the cookie', async () => {
  mocks.endSession.mockResolvedValue('person-a');
  mocks.getSharedDatabase.mockReturnValue({ execute: mocks.execute });

  const response = await signOut();

  expect(response.status).toBe(204);
  expect(mocks.endSession).toHaveBeenCalledOnce();
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_event'), expect.arrayContaining(['person-a', 'identity.local_logout', 'person', 'person-a', 'SUCCESS']));
  expect(response.headers.get('set-cookie')).toContain('backoffice_session=');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});

test('still expires the cookie when no active session is found', async () => {
  mocks.endSession.mockResolvedValue(null);

  const response = await signOut();

  expect(response.status).toBe(204);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
