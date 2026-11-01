import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { DeleteButton } from './delete-button';

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('DeleteButton', () => {
  it('asks first, then deletes and refreshes the list', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DeleteButton url="/api/fleet/vehicles/v-1" name="กข 1234" />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบ กข 1234' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/fleet/vehicles/v-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('explains why one with history cannot be deleted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'HAS_HISTORY' }), { status: 409 })));
    render(<DeleteButton url="/api/fleet/drivers/p-1" name="นายขับ ดี" />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบ นายขับ ดี' }));
    fireEvent.click(screen.getByRole('button', { name: 'ลบ' }));
    expect(await screen.findByText(/มีประวัติเที่ยวรถแล้ว/)).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
