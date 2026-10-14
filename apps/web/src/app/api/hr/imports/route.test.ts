// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), getSharedDatabase: vi.fn(), getNationalIdProtector: vi.fn(), validate: vi.fn(), apply: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../../../lib/national-id', () => ({ getNationalIdProtector: mocks.getNationalIdProtector }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), MasterDataImportService: class { validate = mocks.validate; apply = mocks.apply; } }));

import { POST } from './route';

const hrManager = { authenticated: true, personId: 'person-a', roles: [{ name: 'hr-manager', organizationId: null }], dataOwnerModules: ['hr'] };
const summary = { organizationsCreated: 1, organizationsUpdated: 0, peopleCreated: 2, peopleUpdated: 0, assignmentsChanged: 2 };

function upload(mode: string, people = 'employee_code,national_id\n') {
  const form = new FormData();
  form.set('mode', mode);
  form.set('people', new File([people], 'people.csv', { type: 'text/csv' }));
  return POST(new Request('http://localhost/api/hr/imports', { method: 'POST', body: form }));
}

function ready(session: unknown = hrManager) {
  mocks.readSession.mockResolvedValue(session);
  mocks.getSharedDatabase.mockReturnValue({ query: vi.fn(), transaction: vi.fn() });
  mocks.getNationalIdProtector.mockReturnValue({});
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/hr/imports', () => {
  it('rejects a signed-out user and a user without hospital-wide HR management', async () => {
    ready(null);
    expect((await upload('validate')).status).toBe(401);
    ready({ ...hrManager, roles: [{ name: 'hr-manager', organizationId: 'unit-a' }] });
    expect((await upload('validate')).status).toBe(403);
    ready({ ...hrManager, dataOwnerModules: [] });
    expect((await upload('validate')).status).toBe(403);
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('validates without applying and returns the row report', async () => {
    ready();
    mocks.validate.mockResolvedValue({ ok: false, errors: [{ file: 'people', row: 2, column: 'national_id', code: 'INVALID_NATIONAL_ID' }] });

    const response = await upload('validate', 'employee_code,national_id\nE1,1234567890123\n');

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({ mode: 'validate', errors: [{ file: 'people', row: 2, column: 'national_id', code: 'INVALID_NATIONAL_ID' }] });
    expect(JSON.stringify(body)).not.toContain('1234567890123');
    expect(mocks.validate).toHaveBeenCalledWith({ people: 'employee_code,national_id\nE1,1234567890123\n' });
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it('applies as the signed-in person', async () => {
    ready();
    mocks.apply.mockResolvedValue({ ok: true, summary });

    const response = await upload('apply');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mode: 'apply', summary });
    expect(mocks.apply).toHaveBeenCalledWith(expect.any(Object), 'person-a');
  });

  it('refuses a file over 2 MB and an unknown mode', async () => {
    ready();
    expect((await upload('apply', 'x'.repeat(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload('delete')).status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it('answers 503 when the database or national ID keys are missing', async () => {
    ready();
    mocks.getNationalIdProtector.mockReturnValue(null);
    expect((await upload('validate')).status).toBe(503);
  });
});
