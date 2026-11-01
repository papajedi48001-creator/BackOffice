// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), updateCivilService: vi.fn(), updateEducation: vi.fn() }));
vi.mock('../../../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), HrProfileService: class { updateCivilService = mocks.updateCivilService; updateEducation = mocks.updateEducation; } }));

import { PUT as putEducation } from '../education/route';
import { PUT as putCivil } from './route';

const staff = { authenticated: true, personId: 'p1', roles: [], dataOwnerModules: [] };
const params = { params: Promise.resolve({ personId: 'p1' }) };
const put = (body: unknown) => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) });
afterEach(() => vi.clearAllMocks());

it('saves civil-service fields through the service and maps refusals', async () => {
  mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({});
  mocks.updateCivilService.mockResolvedValueOnce({ ok: true });
  expect((await putCivil(put({ salary: 25000 }), params)).status).toBe(200);
  expect(mocks.updateCivilService).toHaveBeenCalledWith('p1', { salary: 25000 }, staff);
  mocks.updateCivilService.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
  expect((await putCivil(put({ salary: 1 }), params)).status).toBe(403);
  const bad = await putCivil(put({ salary: -5 }), params);
  expect(bad.status).toBe(400);
  await expect(bad.json()).resolves.toEqual({ error: 'invalid_input', fields: ['salary'] });
});

it('replaces the education list', async () => {
  mocks.readSession.mockResolvedValue(staff); mocks.getSharedDatabase.mockReturnValue({});
  mocks.updateEducation.mockResolvedValueOnce({ ok: true });
  expect((await putEducation(put({ entries: [{ degree: 'ปริญญาตรี' }] }), params)).status).toBe(200);
  expect(mocks.updateEducation).toHaveBeenCalledWith('p1', { entries: [{ degree: 'ปริญญาตรี' }] }, staff);
  expect((await putEducation(put({ entries: [{ degree: '' }] }), params)).status).toBe(400);
});
