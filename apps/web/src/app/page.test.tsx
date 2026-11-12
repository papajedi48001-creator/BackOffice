import { render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import HomePage from './page';
import { clearSignInRoutesCache } from '../lib/sign-in-settings';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
const mocks = vi.hoisted(() => ({ getSharedDatabase: vi.fn(() => null as object | null), version: vi.fn(), isPasswordSignInOpen: vi.fn(() => true) }));
vi.mock('../lib/national-id', () => ({ getNationalIdProtector: () => ({}) }));
vi.mock('../lib/password-sign-in', () => ({ isPasswordSignInOpen: mocks.isPasswordSignInOpen }));
vi.mock('../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), SiteImageService: class { version = mocks.version; } }));

beforeEach(() => clearSignInRoutesCache());

describe('HomePage', () => {
  it('shows no username or password box and no forgot-password line when password sign-in is closed', async () => {
    mocks.isPasswordSignInOpen.mockReturnValueOnce(false);
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByLabelText(/ชื่อผู้ใช้/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/รหัสผ่าน/)).not.toBeInTheDocument();
    expect(screen.queryByText('ลืมรหัสผ่าน ติดต่อกลุ่มงานเทคโนโลยีสารสนเทศ')).not.toBeInTheDocument();
  });

  it('puts the hospital photo the admin uploaded behind the hero, linked by its version', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.version.mockResolvedValue('abcdef0123456789');
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    const hero = screen.getByRole('region', { name: 'โรงพยาบาลวาริชภูมิ' });
    expect(hero).toHaveClass('login-hero-photo');
    expect(hero.style.getPropertyValue('--login-photo')).toBe('url("/api/site/login-photo?v=abcdef0123456789")');
    mocks.getSharedDatabase.mockReturnValue(null);
  });

  it('keeps the plain blue hero when no photo is set or the database is down', async () => {
    mocks.getSharedDatabase.mockReturnValue({});
    mocks.version.mockResolvedValue(null);
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('region', { name: 'โรงพยาบาลวาริชภูมิ' })).not.toHaveClass('login-hero-photo');
    mocks.version.mockRejectedValue(new Error('down'));
    render(await HomePage({ searchParams: Promise.resolve({}) }));
    mocks.getSharedDatabase.mockReturnValue(null);
  });

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

  it('shows the ThaID button and its message when ThaID is ready', async () => {
    vi.stubEnv('THAID_CLIENT_ID', 'thaid-client');
    vi.stubEnv('THAID_CLIENT_SECRET', 'thaid-secret');
    vi.stubEnv('THAID_REDIRECT_URI', 'https://backoffice.test/api/auth/thaid/callback');
    render(await HomePage({ searchParams: Promise.resolve({ thaid: 'not_found' }) }));
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบด้วย ThaID' })).toHaveAttribute('href', '/api/auth/thaid/start');
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่พบเลขบัตรประชาชนนี้ในทะเบียนบุคลากร');
    vi.unstubAllEnvs();
  });

  it('hides the Provider ID button when SSO is not configured', async () => {
    render(await HomePage({ searchParams: Promise.resolve({ provider: 'failed' }) }));
    expect(screen.queryByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' })).toBeNull();
  });
});
