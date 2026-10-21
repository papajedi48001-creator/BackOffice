import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SidebarNav } from './sidebar-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/hr/people/123' }));

it('marks the section the person is in as the current page', () => {
  render(<SidebarNav items={[{ href: '/dashboard', label: 'dashboard' }, { href: '/hr/people', label: 'people' }, { href: '/notifications', label: 'notifications', badge: 3 }]} />);
  expect(screen.getByRole('link', { name: /บุคลากร/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'ภาพรวม' })).not.toHaveAttribute('aria-current');
  expect(screen.getByLabelText('การแจ้งเตือนที่ยังไม่อ่าน')).toHaveTextContent('3');
  expect(screen.getByLabelText('การแจ้งเตือนที่ยังไม่อ่าน')).toHaveClass('nav-badge');
});
