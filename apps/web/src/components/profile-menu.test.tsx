import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { initialsOf } from '../lib/initials';
import { ProfileMenu } from './profile-menu';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
afterEach(() => { vi.restoreAllMocks(); push.mockReset(); });

const profile = { displayName: 'นางสาวสมใจ ดีมาก', positionTitle: 'พยาบาลวิชาชีพ', photoUrl: null };
const items = [
  { id: 'n-1', moduleLabel: 'การลา', subject: 'อนุมัติ > หัวหน้ากลุ่มการพยาบาล', readAt: null, createdAt: '2026-10-26T03:00:00.000Z' },
  { id: 'n-2', moduleLabel: 'จองห้องประชุม', subject: 'ไม่อนุมัติ > ผู้รับผิดชอบ (RB-2569-0001)', readAt: '2026-10-26T04:00:00.000Z', createdAt: '2026-10-25T03:00:00.000Z' }
];

it('shows the name, position and initials, and the unread count on the chip', () => {
  render(<ProfileMenu profile={profile} unread={1} items={items} />);
  const chip = screen.getByRole('button', { name: 'นางสาวสมใจ ดีมาก 1 การแจ้งเตือนที่ยังไม่อ่าน' });
  expect(chip).toHaveTextContent('พยาบาลวิชาชีพ');
  expect(chip).toHaveTextContent('สด');
  expect(chip.querySelector('.profile-count')).toHaveTextContent('1');
  expect(chip).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(chip);
  expect(chip).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: 'ข้อมูลส่วนตัวของฉัน' })).toHaveAttribute('href', '/hr/me');
  expect(screen.getByRole('button', { name: /การลา.*อนุมัติ > หัวหน้ากลุ่มการพยาบาล/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /จองห้องประชุม/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ดูการแจ้งเตือนทั้งหมด' })).toHaveAttribute('href', '/notifications');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(chip).toHaveAttribute('aria-expanded', 'false');
});

it('marks a notice read and opens its page', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ href: '/leave/requests/r-1' }), { status: 200 }));
  render(<ProfileMenu profile={profile} unread={1} items={items} />);
  fireEvent.click(screen.getByRole('button', { name: /นางสาวสมใจ/ }));
  fireEvent.click(screen.getByRole('button', { name: /การลา/ }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/leave/requests/r-1'));
  expect(fetchMock).toHaveBeenCalledWith('/api/notifications/n-1/read', { method: 'PATCH' });
  expect(screen.queryByRole('button', { name: /การลา/ })).not.toBeInTheDocument();
});

it('has no badge and no notice list when nothing is unread, but keeps the links', () => {
  const { container } = render(<ProfileMenu profile={{ ...profile, photoUrl: '/api/hr/people/p-1/photo?v=a-1' }} unread={0} items={[]} />);
  const chip = screen.getByRole('button', { name: 'นางสาวสมใจ ดีมาก' });
  expect(container.querySelector('.profile-count')).toBeNull();
  expect(container.querySelector('img.profile-avatar')).toHaveAttribute('src', '/api/hr/people/p-1/photo?v=a-1');
  fireEvent.click(chip);
  expect(screen.queryByText('การแจ้งเตือนล่าสุด')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ข้อมูลส่วนตัวของฉัน' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ดูการแจ้งเตือนทั้งหมด' })).toBeInTheDocument();
});

it('makes initials from a Thai name without its prefix', () => {
  expect(initialsOf('นายสมชาย ใจดี')).toBe('สใ');
  expect(initialsOf('นายแพทย์ธนพล สมมติชื่อ')).toBe('ธส');
  expect(initialsOf('Jane Doe')).toBe('JD');
  expect(initialsOf(null)).toBe('?');
});
