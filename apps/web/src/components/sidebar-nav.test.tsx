import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SidebarNav } from './sidebar-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/hr/people/123' }));

it('marks the section the person is in as the current page', () => {
  render(<SidebarNav items={[{ href: '/dashboard', label: 'dashboard' }, { href: '/hr/people', label: 'people' }, { href: '/notifications', label: 'notifications', badge: 3 }]} />);
  expect(screen.getByRole('link', { name: /บุคลากร/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'หน้าหลัก' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: /การแจ้งเตือน.*3 การแจ้งเตือนที่ยังไม่อ่าน/ })).toBeInTheDocument();
  expect(screen.getByLabelText('3 การแจ้งเตือนที่ยังไม่อ่าน')).toHaveClass('nav-badge');
});

it('puts a red count on any menu item with work waiting', () => {
  render(<SidebarNav items={[{ href: '/leave', label: 'moduleLeave', badge: 2 }, { href: '/rooms', label: 'moduleRoomBooking', badge: 0 }]} />);
  expect(screen.getByLabelText('2 รายการรอดำเนินการ')).toHaveClass('nav-badge');
  expect(screen.queryByLabelText('0 รายการรอดำเนินการ')).not.toBeInTheDocument();
});

it('marks a module in development with a text label', () => {
  render(<SidebarNav items={[{ href: '/fleet', label: 'moduleFleet', module: 'fleet', development: true }, { href: '/leave', label: 'moduleLeave' }]} />);
  const fleet = screen.getByRole('link', { name: /ยานพาหนะ/ });
  expect(fleet).toHaveClass('is-development');
  expect(fleet).toHaveTextContent('พัฒนา');
  expect(screen.getByRole('link', { name: 'การลา' })).not.toHaveClass('is-development');
});

it('shows the module icon in a coloured box beside each name', () => {
  render(<SidebarNav items={[{ href: '/leave', label: 'moduleLeave', module: 'leave', icon: 'leave' }]} />);
  const link = screen.getByRole('link', { name: 'การลา' });
  expect(link.querySelector('.nav-icon svg')).not.toBeNull();
  expect(link.querySelector('.nav-icon')).toHaveAttribute('aria-hidden', 'true');
});

it('keeps the solid pill on the current page until a click, while a faint pill follows the pointer', () => {
  const { container } = render(<SidebarNav items={[{ href: '/dashboard', label: 'dashboard', icon: 'home' }, { href: '/hr/people', label: 'people', icon: 'people' }, { href: '/leave', label: 'moduleLeave', icon: 'leave' }]} />);
  const pill = container.querySelector('.nav-pill')!;
  const ghost = container.querySelector('.nav-ghost')!;
  expect(pill).toHaveAttribute('aria-hidden', 'true');
  expect(ghost).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('.nav-track')).toHaveClass('is-ready');
  expect(pill).toHaveAttribute('data-at', '/hr/people');
  fireEvent.pointerEnter(screen.getByRole('link', { name: 'การลา' }));
  expect(ghost).toHaveAttribute('data-at', '/leave');
  expect(pill).toHaveAttribute('data-at', '/hr/people');
  fireEvent.click(screen.getByRole('link', { name: 'การลา' }));
  expect(pill).toHaveAttribute('data-at', '/leave');
});

it('links to openHref but stays current anywhere under href', () => {
  render(<SidebarNav items={[{ href: '/hr', label: 'moduleHr', openHref: '/hr/people' }]} />);
  const link = screen.getByRole('link', { name: 'งานบุคคล' });
  expect(link).toHaveAttribute('href', '/hr/people');
  expect(link).toHaveAttribute('aria-current', 'page');
});

it('wraps each name so the narrow menu can put it under the icon', () => {
  render(<SidebarNav items={[{ href: '/leave', label: 'moduleLeave', icon: 'leave' }]} />);
  expect(screen.getByRole('link', { name: 'การลา' }).querySelector('.nav-label')).toHaveTextContent('การลา');
});
