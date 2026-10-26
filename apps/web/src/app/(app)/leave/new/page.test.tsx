import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), typesFor: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), LeaveQueries: class { typesFor = mocks.typesFor; } }));

import NewLeavePage from './page';

afterEach(() => vi.clearAllMocks());

describe('NewLeavePage', () => {
  it('offers only the types the signed-in person may file', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'me', roles: [], dataOwnerModules: [] });
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.typesFor.mockResolvedValue([{ id: 'lt-5', code: 'PATERNITY', name: 'ลาไปช่วยภริยาคลอดบุตร', counting: 'WORKING_DAYS', approvalTarget: 'HOSPITAL', attachmentRequiredFromDays: null, eligibleGender: 'MALE', isActive: true, sortOrder: 5 }]);
    render(await NewLeavePage());
    expect(mocks.typesFor).toHaveBeenCalledWith('me');
    expect(screen.getByRole('option', { name: 'ลาไปช่วยภริยาคลอดบุตร' })).toBeInTheDocument();
  });
});
