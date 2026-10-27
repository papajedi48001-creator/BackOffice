import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));

import { TripEdit } from './trip-edit';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const trip = { id: 't1', vehicleId: 'v1', registration: 'กข 1234', makeModel: 'Toyota Commuter', driverPersonId: 'd1', driverName: 'นายขับ ดี', startsAt: '2026-11-10T01:00:00.000Z', endsAt: '2026-11-10T09:00:00.000Z' };
// The trip's own car and driver overlap the trip itself, so availability leaves them out.
const free = { vehicles: [{ id: 'v2', registration: 'นข 5678', makeModel: 'Isuzu D-Max', kind: 'PICKUP', seats: 4 }], drivers: [{ personId: 'd2', displayName: 'นายสอง ขับ', phone: '0812222222' }], trips: [] };
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'เปลี่ยนรถ พนักงานขับรถ หรือเวลา' }));
  await screen.findByRole('option', { name: /นข 5678/ });
};

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('TripEdit', () => {
  it('offers the current car and driver plus those free for the chosen times, and sends only what changed', async () => {
    const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/fleet/availability') ? json(free) : json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<TripEdit trip={trip} />);
    await open();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/fleet/availability?from=2026-11-10T01%3A00%3A00.000Z&to=2026-11-10T09%3A00%3A00.000Z');
    const vehicle = screen.getByLabelText('รถราชการ');
    expect(vehicle).toHaveValue('v1');
    expect(within(vehicle).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['v1', 'v2']);
    expect(within(screen.getByLabelText('พนักงานขับรถ')).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['d1', 'd2']);
    expect(screen.getByLabelText('เริ่มเที่ยวรถ')).toHaveValue('2026-11-10T08:00');
    expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('สิ้นสุดเที่ยวรถ'), { target: { value: '2026-11-10T18:00' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/fleet/availability?from=2026-11-10T01%3A00%3A00.000Z&to=2026-11-10T11%3A00%3A00.000Z'));
    fireEvent.change(vehicle, { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/trips/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ vehicleId: 'v2', endsAt: '2026-11-10T11:00:00.000Z' });
  });

  it('shows the Thai text when the server refuses the change', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/fleet/availability') ? json(free) : json({ error: 'DRIVER_BUSY' }, 409)));
    render(<TripEdit trip={trip} />);
    await open();
    fireEvent.change(screen.getByLabelText('พนักงานขับรถ'), { target: { value: 'd2' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('พนักงานขับรถคนนี้มีเที่ยวรถอื่นในช่วงเวลานี้');
  });
});
