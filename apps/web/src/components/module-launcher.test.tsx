import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { moduleRegistry, type ModuleEntry } from '../lib/modules';
import { ModuleLauncher } from './module-launcher';

const byCode = (...codes: string[]) => moduleRegistry.filter((entry) => codes.includes(entry.code)) as ModuleEntry[];
const planned = moduleRegistry.filter((entry) => entry.status === 'planned');
const summary = { displayName: 'สมชาย ใจดี', greetingName: null as string | null, organizationName: 'กลุ่มงานบริหารทั่วไป', pendingApprovals: 3, unreadNotifications: 5 };
const today = new Date('2026-10-21T03:00:00Z');

it('links live modules and does not link planned ones', () => {
  render(<ModuleLauncher modules={[...byCode('requests', 'hr'), ...planned]} badges={{}} summary={summary} today={today} />);
  expect(screen.getByRole('link', { name: /งานบุคคล/ })).toHaveAttribute('href', '/hr');
  expect(screen.getByRole('link', { name: /งานบุคคล/ })).toHaveAttribute('data-module', 'hr');
  expect(screen.queryByRole('link', { name: /งานซ่อม/ })).toBeNull();
  expect(screen.getByText('งานซ่อม').closest('[aria-disabled="true"]')).not.toBeNull();
  expect(screen.getAllByText('เร็ว ๆ นี้')).toHaveLength(planned.length);
});

it('shows one flat grid in registry order, without type headings', () => {
  const { container } = render(<ModuleLauncher modules={byCode('fleet', 'requests', 'hr', 'access', 'leave')} badges={{}} summary={summary} today={today} />);
  for (const heading of ['งานของฉัน', 'บุคลากรและองค์กร', 'งานบริการ', 'ความปลอดภัยและการตรวจสอบ']) expect(screen.queryByRole('heading', { name: heading })).toBeNull();
  expect(container.querySelectorAll('ul.module-grid')).toHaveLength(1);
  expect([...container.querySelectorAll('a.module-tile')].map((tile) => tile.getAttribute('data-module'))).toEqual(['requests', 'hr', 'access', 'leave', 'fleet']);
});

it('shows the planned strip only when planned modules were passed (ผู้ดูแลระบบ only)', () => {
  render(<ModuleLauncher modules={[...byCode('requests'), ...planned]} badges={{}} summary={summary} today={today} />);
  expect(screen.getByRole('heading', { name: 'โมดูลที่กำลังพัฒนา' })).toBeInTheDocument();
  render(<ModuleLauncher modules={byCode('requests')} badges={{}} summary={summary} today={today} />);
  expect(screen.getAllByRole('heading', { name: 'โมดูลที่กำลังพัฒนา' })).toHaveLength(1);
});

it('marks a module in development with text, not colour only', () => {
  render(<ModuleLauncher modules={byCode('fleet', 'leave')} modes={{ fleet: 'DEVELOPMENT' }} badges={{}} summary={summary} today={today} />);
  const fleet = screen.getByRole('link', { name: /ยานพาหนะ/ });
  expect(fleet).toHaveClass('is-development');
  expect(fleet).toHaveTextContent('กำลังพัฒนา');
  expect(screen.getByRole('link', { name: /การลา/ })).not.toHaveClass('is-development');
});

it('shows a dash when counts are unavailable', () => {
  render(<ModuleLauncher modules={byCode('requests', 'notifications')} badges={{}} summary={{ ...summary, pendingApprovals: null, unreadNotifications: null }} today={today} />);
  expect(screen.getByRole('link', { name: /คำขอรอพิจารณา/ })).toHaveTextContent('–');
  expect(screen.getByRole('link', { name: /การแจ้งเตือนยังไม่อ่าน/ })).toHaveTextContent('–');
});

it('puts counts on the requests and notifications tiles and on module badges', () => {
  const live = { ...byCode('access')[0]!, code: 'room-booking-live', href: '/rooms-live' };
  render(<ModuleLauncher modules={[...byCode('requests', 'notifications'), live]} badges={{ 'room-booking-live': 4 }} summary={summary} today={today} />);
  expect(screen.getByLabelText('3 รายการรอดำเนินการ')).toBeInTheDocument();
  expect(screen.getByLabelText('5 รายการรอดำเนินการ')).toBeInTheDocument();
  expect(screen.getByLabelText('4 รายการรอดำเนินการ')).toBeInTheDocument();
});

it('greets by name and shows the Buddhist-era date', () => {
  render(<ModuleLauncher modules={[]} badges={{}} summary={summary} today={today} />);
  expect(screen.getByRole('heading', { name: 'สวัสดี สมชาย ใจดี' })).toBeInTheDocument();
  expect(screen.getByText(/21 ตุลาคม 2569/)).toBeInTheDocument();
  expect(screen.getByText(/กลุ่มงานบริหารทั่วไป/)).toBeInTheDocument();
});

it('greets without a name when none is recorded', () => {
  render(<ModuleLauncher modules={[]} badges={{}} summary={{ ...summary, displayName: null }} today={today} />);
  expect(screen.getByRole('heading', { name: 'สวัสดี' })).toBeInTheDocument();
});
