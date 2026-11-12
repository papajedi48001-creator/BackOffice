import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isPasswordSignInOpen: vi.fn(() => true), providerSsoEnabled: vi.fn(() => true) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../../lib/session', () => ({ readSession: async () => null }));
vi.mock('../../lib/database', () => ({ getSharedDatabase: () => null }));
vi.mock('../../lib/password-sign-in', () => ({ isPasswordSignInOpen: mocks.isPasswordSignInOpen }));
vi.mock('../../lib/provider-sso', () => ({ providerSsoEnabled: mocks.providerSsoEnabled }));

import MciLandingPage from './page';

describe('MciLandingPage', () => {
  it('offers Provider ID instead of a dead password box when password sign-in is closed', async () => {
    mocks.isPasswordSignInOpen.mockReturnValueOnce(false);
    render(await MciLandingPage());
    expect(screen.queryByLabelText('รหัสผ่าน')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' })).toHaveAttribute('href', '/api/auth/provider/start');
  });

  it('keeps the password box while password sign-in is open', async () => {
    render(await MciLandingPage());
    expect(screen.getByLabelText('รหัสผ่าน')).toBeInTheDocument();
  });
});
