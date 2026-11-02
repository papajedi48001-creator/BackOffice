import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ModuleSubnav } from './module-subnav';

const path = vi.hoisted(() => ({ current: '/hr/people/123' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));

it('links each section and marks the one the person is in', () => {
  render(<ModuleSubnav sections={[{ href: '/hr/people', labelKey: 'people' }, { href: '/hr/organizations', labelKey: 'organizations' }]} />);
  expect(screen.getByRole('navigation', { name: 'เมนูของโมดูล' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'บุคลากร' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'หน่วยงาน' })).toHaveAttribute('href', '/hr/organizations');
  expect(screen.getByRole('link', { name: 'หน่วยงาน' })).not.toHaveAttribute('aria-current');
});

it('renders nothing for a single section', () => {
  const { container } = render(<ModuleSubnav sections={[{ href: '/hr/people', labelKey: 'people' }]} />);
  expect(container).toBeEmptyDOMElement();
});

it('puts a count on a section with work waiting', () => {
  render(<ModuleSubnav sections={[{ href: '/hr/people', labelKey: 'people' }, { href: '/hr/organizations', labelKey: 'organizations', badge: 2 }]} />);
  expect(screen.getByRole('link', { name: /หน่วยงาน/ })).toContainElement(screen.getByLabelText('2 รายการรอดำเนินการ'));
  expect(screen.getByLabelText('2 รายการรอดำเนินการ')).toHaveClass('count-badge');
});

it('marks only the most specific section when one sits inside another', () => {
  path.current = '/rooms/bookings/new';
  render(<ModuleSubnav sections={[{ href: '/rooms/bookings/new', labelKey: 'bookRoom' }, { href: '/rooms/bookings', labelKey: 'myRoomBookings' }]} />);
  expect(screen.getByRole('link', { name: 'จองห้อง' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'การจองของฉัน' })).not.toHaveAttribute('aria-current');
  path.current = '/hr/people/123';
});
