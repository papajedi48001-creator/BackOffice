import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { OpeningDecision } from './opening-actions';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

describe('OpeningDecision', () => {
  it('needs a reason before a return can be confirmed', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    render(<OpeningDecision />);
    fireEvent.click(screen.getByRole('button', { name: 'ส่งกลับแก้ไข' }));
    const confirm = screen.getByRole('button', { name: 'ยืนยัน' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('เหตุผลที่ส่งกลับ'), { target: { value: 'ยอดถุงมือไม่ตรง' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/inventory/opening/decision');
    expect(JSON.parse(init.body)).toEqual({ decision: 'RETURN', reason: 'ยอดถุงมือไม่ตรง' });
  });

  it('certifies after one confirmation and no browser dialog', async () => {
    const confirmDialog = vi.spyOn(window, 'confirm');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    render(<OpeningDecision />);
    fireEvent.click(screen.getByRole('button', { name: 'รับรองยอดยกมา' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ decision: 'CERTIFY' });
    expect(confirmDialog).not.toHaveBeenCalled();
  });
});
