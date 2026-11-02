import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ setupMode: true }));
vi.mock('../../lib/setup-mode', () => ({ isSetupMode: () => state.setupMode }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ push: vi.fn() }) }));

import SetupPage from './page';

afterEach(() => { vi.unstubAllEnvs(); state.setupMode = true; });

describe('SetupPage', () => {
  it('is not found once a database is configured', () => {
    state.setupMode = false;
    expect(() => SetupPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('names the missing keys and disables saving', () => {
    vi.stubEnv('BACKOFFICE_SESSION_SECRET', 'set');
    vi.stubEnv('NATIONAL_ID_ENCRYPTION_KEY', ''); vi.stubEnv('NATIONAL_ID_LOOKUP_KEY', '');
    render(SetupPage());
    expect(screen.getByText(/NATIONAL_ID_ENCRYPTION_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/NATIONAL_ID_LOOKUP_KEY/)).toBeInTheDocument();
    expect(screen.queryByText(/BACKOFFICE_SESSION_SECRET/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'บันทึกและสร้างบัญชี' })).toBeDisabled();
  });
});
