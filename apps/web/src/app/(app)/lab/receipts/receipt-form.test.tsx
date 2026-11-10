import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ReceiptForm } from './receipt-form';

it('shows the usage units and the line value as the keeper types', () => {
  render(<ReceiptForm today="2026-11-10" vendors={[{ id: 'v-1', name: 'บริษัท ก' }]} items={[{ id: 'i-1', code: 'ALC-70', name: 'แอลกอฮอล์', receiveUnit: 'กล่อง', useUnit: 'ขวด', unitsPerReceive: 10 }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'รับเข้า' }));
  const form = screen.getByRole('form', { name: 'รับวัสดุเข้าคลังหลัก' });
  fireEvent.change(within(form).getByLabelText('วัสดุ แถว 1'), { target: { value: 'i-1' } });
  fireEvent.change(within(form).getByLabelText('จำนวน (หน่วยรับ) แถว 1'), { target: { value: '2' } });
  fireEvent.change(within(form).getByLabelText('ราคาต่อหน่วยรับ แถว 1'), { target: { value: '1250' } });
  expect(within(form).getByText('20 ขวด')).toBeInTheDocument();
  expect(within(form).getAllByText('2,500.00 บาท').length).toBeGreaterThan(0);
});
