import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { DpFiles } from './dp-files';

const years = [
  { fy: 2569, count: 1234, from: '2025-10-01', to: '2025-11-13', claim: 196500, eligible: 180000.5, flagged: 12, latestFile: 'ฟื้นฟู ปี 69.csv', updatedAt: '2026-11-13T07:05:00.000Z' },
  { fy: 2568, count: 10, from: '2024-10-02', to: '2025-09-30', claim: 1500, eligible: 1500, flagged: 0, latestFile: null, updatedAt: '2026-11-01T01:00:00.000Z' }
];
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('lists one row per ปีงบ with the legacy columns, Thai dates and the พึงเบิก note', () => {
  render(<DpFiles years={years} />);
  expect(screen.getByRole('heading', { name: 'ข้อมูลที่นำเข้าแล้ว (2 ปีงบ · 1,244 ครั้ง)' })).toBeInTheDocument();
  const table = screen.getByRole('table', { name: 'ข้อมูลที่นำเข้าแล้ว' });
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['ปีงบ', 'วันที่รับบริการ', 'ครั้ง', 'ขอเบิก', 'พึงเบิก', 'ติดสถานะ', 'ไฟล์ล่าสุด', 'ปรับปรุงเมื่อ', '']);
  const first = within(table).getAllByRole('row')[1]!;
  for (const text of ['2569', '1 ต.ค. 2568 – 13 พ.ย. 2568', '1,234', '196,500.00', '180,000.50', '12', 'ฟื้นฟู ปี 69.csv', '13 พ.ย. 2569 14:05']) expect(within(first).getByText(text)).toBeInTheDocument();
  expect(screen.getByText('พึงเบิก (AF) ในตารางนี้เป็นยอดตามไฟล์ทุกแถว ส่วนหน้า dashboard ไม่รวมแถวที่ติดสถานะ')).toBeInTheDocument();
});

it('says when there is no data', () => {
  render(<DpFiles years={[]} />);
  expect(screen.getByRole('heading', { name: 'ข้อมูลที่นำเข้าแล้ว (0 ปีงบ · 0 ครั้ง)' })).toBeInTheDocument();
  expect(screen.getByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
});

it('deletes a whole ปีงบ after confirming in a dialog, with ปีงบ in the body', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, records: 1234 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<DpFiles years={years} />);
  fireEvent.click(screen.getByRole('button', { name: 'ลบข้อมูลปีงบ 2569' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('ลบข้อมูลปีงบ 2569 ทั้งหมด?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ลบ' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/money/disability/records', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ fy: 2569 }) }));
  expect(screen.getByRole('status')).toHaveTextContent('ลบข้อมูลปีงบ 2569 แล้ว (1,234 ครั้ง)');
});
