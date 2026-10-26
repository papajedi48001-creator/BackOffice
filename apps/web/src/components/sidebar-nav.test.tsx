import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SidebarNav } from './sidebar-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/hr/people/123' }));

it('marks the section the person is in as the current page', () => {
  render(<SidebarNav items={[{ href: '/dashboard', label: 'dashboard' }, { href: '/hr/people', label: 'people' }, { href: '/notifications', label: 'notifications', badge: 3 }]} />);
  expect(screen.getByRole('link', { name: /บุคลากร/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'ภาพรวม' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: /การแจ้งเตือน.*3 การแจ้งเตือนที่ยังไม่อ่าน/ })).toBeInTheDocument();
  expect(screen.getByLabelText('3 การแจ้งเตือนที่ยังไม่อ่าน')).toHaveClass('nav-badge');
});

it('puts a red count on any menu item with work waiting', () => {
  render(<SidebarNav items={[{ href: '/leave', label: 'moduleLeave', badge: 2 }, { href: '/rooms', label: 'moduleRoomBooking', badge: 0 }]} />);
  expect(screen.getByLabelText('2 รายการรอดำเนินการ')).toHaveClass('nav-badge');
  expect(screen.queryByLabelText('0 รายการรอดำเนินการ')).not.toBeInTheDocument();
});
