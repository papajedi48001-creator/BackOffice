import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/leave/mine' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import { RequestAction } from './request-action';
import type { NavigationItem } from './app-shell';

const navigation: NavigationItem[] = [
  { href: '/dashboard', label: 'dashboard', module: 'home' },
  { href: '/leave', label: 'moduleLeave', module: 'leave', submitAction: { href: '/leave/new', label: 'leaveNew', icon: 'leave' } },
  { href: '/inventory', label: 'moduleInventory', module: 'inventory' }
];
afterEach(() => { nav.pathname = '/leave/mine'; });

it('shows the module submit action as a large icon link on every module page', () => {
  render(<RequestAction navigation={navigation} />);
  const link = screen.getByRole('link', { name: 'ยื่นใบลา' });
  expect(link).toHaveAttribute('href', '/leave/new');
  expect(link).toHaveClass('request-action');
  expect(link.querySelector('svg')).not.toBeNull();
});

it('hides on the submit form itself', () => {
  nav.pathname = '/leave/new';
  const { container } = render(<RequestAction navigation={navigation} />);
  expect(container).toBeEmptyDOMElement();
});

it('shows nothing for a module without a submit action', () => {
  nav.pathname = '/inventory/stock';
  const { container } = render(<RequestAction navigation={navigation} />);
  expect(container).toBeEmptyDOMElement();
});
