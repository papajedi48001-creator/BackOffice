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

  it('lists the main modules as tiles with an icon each', async () => {
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    const tiles = screen.getByRole('list', { name: 'โมดูลหลัก' }).querySelectorAll('li');
    expect([...tiles].map((tile) => tile.textContent)).toEqual(['การลา', 'ไปราชการ', 'จองห้องประชุม', 'ยานพาหนะ', 'คลังพัสดุ', 'งานบุคคล']);
    for (const tile of tiles) expect(tile.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows the Provider ID button and message when SSO is configured', async () => {
    vi.stubEnv('PROVIDER_ID_HEALTH_CLIENT_ID', 'health-client');
    vi.stubEnv('PROVIDER_ID_HEALTH_CLIENT_SECRET', 'secret-value-that-is-long-enough-0123');
    vi.stubEnv('PROVIDER_ID_CLIENT_ID', 'provider-client');
    vi.stubEnv('PROVIDER_ID_SECRET_KEY', 'provider-secret-key');
    vi.stubEnv('PROVIDER_ID_REDIRECT_URI', 'https://backoffice.test/api/auth/provider/callback');
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
