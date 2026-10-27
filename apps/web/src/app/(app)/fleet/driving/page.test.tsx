import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn(), refresh: vi.fn(), readSession: vi.fn(), getSharedDatabase: vi.fn(), driving: vi.fn(), isActiveDriver: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: vi.fn(), useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock('../../../../lib/session', () => ({ readSession: mocks.readSession }));
vi.mock('../../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@backoffice/core')>(), FleetQueries: class { driving = mocks.driving; isActiveDriver = mocks.isActiveDriver; } }));

import FleetDrivingPage from './page';

const trip = (id: string, status: string, registration: string) => ({ id, startsAt: '2026-10-27T01:00:00.000Z', endsAt: '2026-10-27T09:00:00.000Z', status, registration, makeModel: 'Toyota Commuter', odometerOut: status === 'DEPARTED' ? 1000 : null, odometerIn: null,
  requests: [{ id: `f-${id}`, reference: 'VR-2570-0001', requesterName: 'นางพรทิพย์ ใจดี', contactPhone: id === 't1' ? '0822222222' : '', destination: 'สสจ.มหาสารคาม', passengerCount: 3 }] });
function ready(driver: boolean) {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'driver-1', roles: [], dataOwnerModules: [] });
  mocks.getSharedDatabase.mockReturnValue({});
  mocks.isActiveDriver.mockResolvedValue(driver);
  mocks.driving.mockResolvedValue([trip('t1', 'PLANNED', 'กข 1234'), trip('t2', 'DEPARTED', 'นข 5678')]);
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('FleetDrivingPage', () => {
  it('offers ออกเดินทาง on a PLANNED เที่ยวรถ and กลับถึง on a DEPARTED one, with who to call', async () => {
    ready(true);
    render(await FleetDrivingPage());
    const planned = screen.getByRole('article', { name: /กข 1234/ });
    expect(within(planned).getByRole('button', { name: 'ออกเดินทาง' })).toBeInTheDocument();
    expect(within(planned).queryByRole('button', { name: 'กลับถึง' })).toBeNull();
    expect(within(planned).getByText(/สสจ.มหาสารคาม/)).toBeInTheDocument();
    expect(within(planned).getByText(/3 คน/)).toBeInTheDocument();
    expect(within(planned).getByRole('link', { name: /0822222222/ })).toHaveAttribute('href', 'tel:0822222222');
    const departed = screen.getByRole('article', { name: /นข 5678/ });
    expect(within(departed).queryByRole('link', { name: /โทร/ })).toBeNull();
    expect(within(departed).getByRole('button', { name: 'กลับถึง' })).toBeInTheDocument();
    expect(within(departed).queryByRole('button', { name: 'ออกเดินทาง' })).toBeNull();
  });

  it('refuses a reading that is not a whole number and sends a whole one', async () => {
    ready(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(await FleetDrivingPage());
    fireEvent.click(within(screen.getByRole('article', { name: /กข 1234/ })).getByRole('button', { name: 'ออกเดินทาง' }));
    const field = screen.getByLabelText('เลขไมล์ (กม.)');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(field, { target: { value: '12345.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('กรอกเลขไมล์เป็นจำนวนเต็ม');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/fleet/trips/t1/departure');
    expect(JSON.parse(init.body as string)).toEqual({ odometer: 12345 });
  });

  it('shows the Thai text when the server refuses a reading', async () => {
    ready(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'ODOMETER_BELOW_OUT' }), { status: 400 })));
    render(await FleetDrivingPage());
    fireEvent.click(within(screen.getByRole('article', { name: /นข 5678/ })).getByRole('button', { name: 'กลับถึง' }));
    fireEvent.change(screen.getByLabelText('เลขไมล์ (กม.)'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('เลขไมล์กลับต้องไม่ต่ำกว่าเลขไมล์ออก');
  });

  it('tells someone who is not an active พนักงานขับรถ what the page is for, and reads no trips', async () => {
    ready(false);
    render(await FleetDrivingPage());
    expect(screen.getByText('หน้านี้สำหรับพนักงานขับรถ คุณยังไม่อยู่ในรายชื่อพนักงานขับรถ')).toBeInTheDocument();
    expect(mocks.driving).not.toHaveBeenCalled();
  });
});
