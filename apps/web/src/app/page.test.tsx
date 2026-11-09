import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('HomePage', () => {
  it('renders the Thai Back Office title', async () => {
    render(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: 'ระบบสนับสนุนการทำงานภายในองค์กร (Back Office)' })).toBeInTheDocument();
  });

  it('shows the WR logo and hospital name', async () => {
    render(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getAllByRole('img', { name: /WR/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('โรงพยาบาลวาริชภูมิ').length).toBeGreaterThan(0);
    expect(screen.getByText('ลืมรหัสผ่าน ติดต่อกลุ่มงานเทคโนโลยีสารสนเทศ')).toBeInTheDocument();
  });

  it('shows the Provider ID button and message when SSO is configured', async () => {
    vi.stubEnv('PROVIDER_SSO_ISSUER', 'https://portal.test');
    vi.stubEnv('PROVIDER_SSO_CLIENT_ID', 'backoffice');
    vi.stubEnv('PROVIDER_SSO_CLIENT_SECRET', 'secret-value-that-is-long-enough-0123');
    vi.stubEnv('PROVIDER_SSO_REDIRECT_URI', 'https://backoffice.test/api/auth/provider/callback');
    render(await HomePage({ searchParams: Promise.resolve({ provider: 'unavailable' }) }));
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('ระบบ Provider ID ไม่พร้อมใช้งาน');
    vi.unstubAllEnvs();
  });

  it('hides the Provider ID button when SSO is not configured', async () => {
    render(await HomePage({ searchParams: Promise.resolve({ provider: 'failed' }) }));
    expect(screen.queryByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' })).toBeNull();
  });
});
