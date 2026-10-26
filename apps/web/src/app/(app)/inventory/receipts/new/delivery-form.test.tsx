import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ScanItem } from '@backoffice/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
import { DeliveryForm } from './delivery-form';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => { try { sessionStorage.clear(); } catch { /* storage may be blocked */ } });
afterEach(() => { fetchMock.mockReset(); push.mockReset(); });

const gloves: ScanItem = { id: 'item-1', code: 'AB-01', name: 'ถุงมือยาง', issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, tracksExpiry: false, isActive: true };
const vendors = [{ id: 'vendor-1', name: 'บริษัท เอ จำกัด', phone: '', address: '', isActive: true }];
const fill = () => {
  fireEvent.change(screen.getByLabelText('ผู้ขาย'), { target: { value: 'vendor-1' } });
  fireEvent.change(screen.getByLabelText('เลือกวัสดุ'), { target: { value: 'item-1' } });
};

describe('DeliveryForm', () => {
  it('sends one request however often the button is pressed, then opens the receipt', async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    render(<DeliveryForm vendors={vendors} items={[gloves]} today="2026-10-25" canBindBarcode={false} />);
    fill();
    const submit = screen.getByRole('button', { name: 'บันทึกรับเข้า' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'กำลังบันทึก…' })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/inventory/receipts');
    expect(JSON.parse(init.body)).toEqual({ vendorId: 'vendor-1', receivedOn: '2026-10-25', lines: [{ itemId: 'item-1', unitKind: 'ISSUE', quantity: 1, unitPrice: 0 }] });
    finish(new Response(JSON.stringify({ id: 'receipt-1', reference: 'RC-2569-0001' }), { status: 201 }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/inventory/receipts/receipt-1'));
    expect(sessionStorage.getItem('inventory.delivery-draft')).toBeNull();
  });

  it('keeps an unsent draft in the browser and shows server errors in Thai', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'OPENING_NOT_CERTIFIED' }), { status: 409 }));
    const { unmount } = render(<DeliveryForm vendors={vendors} items={[gloves]} today="2026-10-25" canBindBarcode={false} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกรับเข้า' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ต้องรับรองยอดยกมาก่อน');
    unmount();
    render(<DeliveryForm vendors={vendors} items={[gloves]} today="2026-10-25" canBindBarcode={false} />);
    expect(screen.getByText('ถุงมือยาง')).toBeInTheDocument();
    expect(screen.getByLabelText('ผู้ขาย')).toHaveValue('vendor-1');
  });

  it('ignores the Enter a scanner sends into an ordinary field instead of posting', () => {
    render(<DeliveryForm vendors={vendors} items={[gloves]} today="2026-10-25" canBindBarcode={false} />);
    fill();
    const lotField = screen.getByLabelText('เลขล็อตผู้ผลิต ถุงมือยาง');
    expect(fireEvent.keyDown(lotField, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(screen.getByLabelText('เลขที่ใบส่งของ'), { key: 'Enter' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
