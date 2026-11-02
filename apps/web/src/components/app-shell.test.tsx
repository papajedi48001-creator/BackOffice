import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/leave/requests/1', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/(app)/request-forms', () => ({ loadRequestForm: vi.fn() }));

it('colours the shell and menu by module', () => {
  const { container } = render(<AppShell navigation={[{ href: '/dashboard', label: 'dashboard', module: 'home' }, { href: '/leave', label: 'moduleLeave', module: 'leave' }]}><p>เนื้อหา</p></AppShell>);
  expect(container.querySelector('.app-shell')).toHaveAttribute('data-module', 'leave');
  expect(screen.getByRole('link', { name: 'การลา' })).toHaveAttribute('data-module', 'leave');
  expect(screen.getByText('เนื้อหา')).toBeInTheDocument();
});

it('puts the profile chip, with the unread count, at the top of every page', () => {
  render(<AppShell navigation={[{ href: '/dashboard', label: 'dashboard', module: 'home' }]} profile={{ displayName: 'นายสมชาย ใจดี', positionTitle: null, photoUrl: null }} bell={{ unread: 2, items: [] }}><p>เนื้อหา</p></AppShell>);
  expect(screen.getByRole('button', { name: 'นายสมชาย ใจดี 2 การแจ้งเตือนที่ยังไม่อ่าน' })).toBeInTheDocument();
});

it('puts the module submit action first in the top row, before the permission notice', () => {
  render(<AppShell navigation={[{ href: '/dashboard', label: 'dashboard', module: 'home' }, { href: '/leave', label: 'moduleLeave', module: 'leave', submitAction: { href: '/leave/new', label: 'leaveNew', icon: 'leave' } }]}><p>เนื้อหา</p></AppShell>);
  const action = screen.getByRole('button', { name: 'ยื่นใบลา' });
  expect(action.compareDocumentPosition(screen.getByText('รายการที่แสดงเป็นไปตามสิทธิ์ของคุณ')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
