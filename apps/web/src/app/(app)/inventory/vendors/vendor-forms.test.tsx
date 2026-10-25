import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { VendorForms } from './vendor-forms';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

describe('VendorForms', () => {
  it('closes a vendor by saving it inactive', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    render(<VendorForms vendors={[{ id: 'vendor-1', name: 'บริษัท เอ จำกัด', phone: '02-000', address: '', isActive: true }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ปิดใช้ บริษัท เอ จำกัด' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init.method]).toEqual(['/api/inventory/vendors/vendor-1', 'PUT']);
    expect(JSON.parse(init.body)).toEqual({ name: 'บริษัท เอ จำกัด', phone: '02-000', address: '', isActive: false });
  });

  it('explains a duplicate vendor name', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'DUPLICATE_NAME' }), { status: 409 }));
    render(<VendorForms vendors={[]} />);
    const form = screen.getByRole('form', { name: 'เพิ่มผู้ขาย' });
    fireEvent.change(form.querySelector('[name="name"]')!, { target: { value: 'บริษัท เอ จำกัด' } });
    fireEvent.submit(form);
    expect(await screen.findByText('ชื่อนี้มีอยู่แล้ว')).toBeInTheDocument();
  });
});
