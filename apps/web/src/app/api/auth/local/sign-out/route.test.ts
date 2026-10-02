import { expect, test } from 'vitest';
import { POST } from './route';

test('expires the local session cookie on sign out', async () => {
  const response = await POST();

  expect(response.status).toBe(204);
  expect(response.headers.get('set-cookie')).toContain('backoffice_session=');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
