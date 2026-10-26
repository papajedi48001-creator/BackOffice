import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/leave/requests/1', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

it('colours the shell and menu by module', () => {
  const { container } = render(<AppShell navigation={[{ href: '/dashboard', label: 'dashboard', module: 'home' }, { href: '/leave', label: 'moduleLeave', module: 'leave' }]}><p>เนื้อหา</p></AppShell>);
  expect(container.querySelector('.app-shell')).toHaveAttribute('data-module', 'leave');
  expect(screen.getByRole('link', { name: 'การลา' })).toHaveAttribute('data-module', 'leave');
  expect(screen.getByText('เนื้อหา')).toBeInTheDocument();
});
