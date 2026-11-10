import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { CheckInButton, CheckOutButton } from './check-in-card';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });
const professions = [{ id: 'doctor', name: 'แพทย์' }, { id: 'nurse', name: 'พยาบาล' }];

it('confirms รายงานตัว in a popup with the HR profession preselected and posts it', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<CheckInButton professions={professions} defaultProfessionId="nurse" />);
  fireEvent.click(screen.getByRole('button', { name: 'รายงานตัว' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('สายวิชาชีพ')).toHaveValue('nurse');
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันรายงานตัว' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/mci/check-in', expect.objectContaining({ method: 'POST', body: JSON.stringify({ professionId: 'nurse' }) })));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it('needs a profession to be chosen when HR has none', () => {
  render(<CheckInButton professions={professions} defaultProfessionId={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'รายงานตัว' }));
  expect(screen.getByRole('button', { name: 'ยืนยันรายงานตัว' })).toBeDisabled();
});

it('checks out after confirming', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<CheckOutButton responderId="r-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'ออกจากเวร' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยันออกจากเวร' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/mci/responders/r-1/check-out', expect.objectContaining({ method: 'POST' })));
});
