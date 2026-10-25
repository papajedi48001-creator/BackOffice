import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ItemForms } from './item-forms';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => fetchMock.mockReset());

const categories = [{ id: 'medical', name: 'วัสดุการแพทย์', isActive: true }];
const item = { id: 'item-1', code: 'AB-01', name: 'ถุงมือยาง', categoryId: 'medical', categoryName: 'วัสดุการแพทย์', issueUnit: 'ชิ้น', purchaseUnit: 'กล่อง', purchaseUnitFactor: 100, reorderPoint: 50, tracksExpiry: true, isActive: true, barcodes: [] };

function fillNewItem() {
  const form = screen.getByRole('form', { name: 'เพิ่มวัสดุ' });
  const field = (label: string) => form.querySelector(`[name="${label}"]`) as HTMLInputElement;
  fireEvent.change(field('code'), { target: { value: 'ab-02' } });
  fireEvent.change(field('name'), { target: { value: 'สำลี' } });
  fireEvent.change(field('issueUnit'), { target: { value: 'ห่อ' } });
  fireEvent.change(field('purchaseUnit'), { target: { value: 'ลัง' } });
  fireEvent.change(field('purchaseUnitFactor'), { target: { value: '24' } });
  fireEvent.change(field('reorderPoint'), { target: { value: '10' } });
  fireEvent.submit(form);
}

describe('ItemForms', () => {
  it('sends numbers as numbers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));
    render(<ItemForms items={[]} categories={categories} />);
    fillNewItem();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/inventory/items');
    expect(JSON.parse(init.body)).toMatchObject({ code: 'ab-02', categoryId: 'medical', purchaseUnitFactor: 24, reorderPoint: 10, tracksExpiry: false, isActive: true });
  });

  it('explains a duplicate item code', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'DUPLICATE_CODE' }), { status: 409 }));
    render(<ItemForms items={[]} categories={categories} />);
    fillNewItem();
    expect(await screen.findByText('รหัสวัสดุนี้มีอยู่แล้ว')).toBeInTheDocument();
  });

  it('names the item that already owns a barcode', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'DUPLICATE_BARCODE', itemCode: 'ZZ-09' }), { status: 409 }));
    render(<ItemForms items={[item]} categories={categories} />);
    const form = screen.getByRole('form', { name: 'เพิ่มบาร์โค้ด ถุงมือยาง' });
    fireEvent.change(form.querySelector('[name="barcode"]')!, { target: { value: '8851234567890' } });
    fireEvent.submit(form);
    expect(await screen.findByText('บาร์โค้ดนี้ผูกกับวัสดุอื่นแล้ว (ZZ-09)')).toBeInTheDocument();
  });
});
