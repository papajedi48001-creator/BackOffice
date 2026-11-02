import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/leave/mine', search: '', push: vi.fn(), replace: vi.fn() }));
const loader = vi.hoisted(() => ({ loadRequestForm: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() })
}));
vi.mock('../app/(app)/request-forms', () => loader);

import { RequestAction } from './request-action';
import type { NavigationItem } from './app-shell';

const navigation: NavigationItem[] = [
  { href: '/dashboard', label: 'dashboard', module: 'home' },
  { href: '/leave', label: 'moduleLeave', module: 'leave', submitAction: { href: '/leave/new', label: 'leaveNew', icon: 'leave' } },
  { href: '/inventory', label: 'moduleInventory', module: 'inventory' }
];
const leaveForm = { module: 'leave', types: [{ id: 'lt-1', code: 'SICK', name: 'ลาป่วย', counting: 'WORKING_DAYS' }], attachments: false };
afterEach(() => { nav.pathname = '/leave/mine'; nav.search = ''; vi.clearAllMocks(); });

it('shows the module submit action as a large icon button, not a link', () => {
  render(<RequestAction navigation={navigation} />);
  const button = screen.getByRole('button', { name: 'ยื่นใบลา' });
  expect(button).toHaveClass('request-action');
  expect(button.querySelector('svg')).not.toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});

it('opens the module request form in a popup without navigating', async () => {
  loader.loadRequestForm.mockResolvedValue(leaveForm);
  render(<RequestAction navigation={navigation} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ยื่นใบลา' })); });
  const dialog = await screen.findByRole('dialog', { name: 'ยื่นใบลา' });
  expect(dialog).toHaveClass('form-dialog-wide');
  expect(loader.loadRequestForm).toHaveBeenCalledWith('leave', undefined);
  expect(await screen.findByRole('option', { name: 'ลาป่วย' })).toBeInTheDocument();
  expect(nav.push).not.toHaveBeenCalled();
  expect(nav.replace).not.toHaveBeenCalled();
});

it('closes from ยกเลิก and keeps the URL', async () => {
  loader.loadRequestForm.mockResolvedValue(leaveForm);
  render(<RequestAction navigation={navigation} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ยื่นใบลา' })); });
  fireEvent.click(await screen.findByRole('button', { name: 'ยกเลิก' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(nav.push).not.toHaveBeenCalled();
});

it('closes when the form navigates after a successful submit', async () => {
  loader.loadRequestForm.mockResolvedValue(leaveForm);
  const { rerender } = render(<RequestAction navigation={navigation} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'ยื่นใบลา' })); });
  await screen.findByRole('dialog');
  nav.pathname = '/leave/requests/r-1';
  rerender(<RequestAction navigation={navigation} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens on a deep link with ?request=1 and passes the travel to prefill from', async () => {
  nav.pathname = '/fleet/mine'; nav.search = 'request=1&travel=t-1';
  loader.loadRequestForm.mockResolvedValue({ module: 'fleet', fromTravel: false });
  const fleetNav: NavigationItem[] = [{ href: '/fleet', label: 'moduleFleet', module: 'fleet', submitAction: { href: '/fleet/new', label: 'fleetNew', icon: 'car' } }];
  render(<RequestAction navigation={fleetNav} />);
  expect(await screen.findByRole('dialog', { name: 'ขอใช้รถ' })).toBeInTheDocument();
  expect(loader.loadRequestForm).toHaveBeenCalledWith('fleet', 't-1');
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(nav.replace).toHaveBeenCalledWith('/fleet/mine');
});

it('shows nothing for a module without a submit action', () => {
  nav.pathname = '/inventory/stock';
  const { container } = render(<RequestAction navigation={navigation} />);
  expect(container).toBeEmptyDOMElement();
});
