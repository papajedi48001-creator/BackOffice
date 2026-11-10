import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { DeviceForm, RevokeDeviceButton } from './device-forms';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('creates a box and shows its pairing code once, in large digits', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'd', pairingCode: '04512378' }), { status: 201 })));
  render(<DeviceForm locations={[{ id: 'loc-1', name: 'ประตูหน้า' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มกล่องลงเวลา' }));
  const form = screen.getByRole('form', { name: 'เพิ่มกล่องลงเวลา' });
  fireEvent.change(within(form).getByLabelText('ชื่อกล่อง'), { target: { value: 'กล่อง OPD' } });
  fireEvent.submit(form);
  expect(await screen.findByText('0451 2378')).toBeInTheDocument();
  expect(screen.getByText(/ใช้ได้ภายใน 10 นาที/)).toBeInTheDocument();
});

it('asks before revoking a box', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<RevokeDeviceButton deviceId="d-1" deviceName="กล่อง OPD" />);
  fireEvent.click(screen.getByRole('button', { name: 'ถอนสิทธิ์ กล่อง OPD' }));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ถอนสิทธิ์' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/attendance/devices/d-1/revoke', expect.objectContaining({ method: 'POST' })));
});
