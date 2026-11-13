import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { MemberForm } from './member-form';

const member = { personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', displayName: 'สมศรี การเงิน', pages: ['dental' as const] };
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('needs at least one page ticked before saving', () => {
  render(<MemberForm member={member} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
  const dialog = screen.getByRole('dialog');
  const save = within(dialog).getByRole('button', { name: 'บันทึก' });
  expect(save).toBeEnabled();
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'ลูกหนี้ทันตกรรม' }));
  expect(save).toBeDisabled();
});

it('saves the person with the ticked pages and refreshes', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<MemberForm member={member} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'บันทึก' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/money/members');
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body as string)).toEqual({ personId: member.personId, pages: ['dental'] });
});

it('cannot save a new member before a person is picked', () => {
  render(<MemberForm />);
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มเจ้าหน้าที่' }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'บันทึก' })).toBeDisabled();
});

it('stays open on Esc', () => {
  render(<MemberForm member={member} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
  screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
