import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { NhsoFiles } from './nhso-files';

const datasets = [
  { hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', region: 'เขต 8', fy: 2569, dateFrom: '2025-10-01', dateTo: '2026-09-30', fileName: 'nhso 11093 2569.xlsx', rowCount: 678, transferTotal: 60587976.02, uploadedAt: '2026-11-13T07:05:00.000Z' },
  { hcode: '11090', name: 'โรงพยาบาลกุดบาก', region: '', fy: 2570, dateFrom: null, dateTo: null, fileName: 'b.xlsx', rowCount: 3, transferTotal: 10, uploadedAt: '2026-11-14T01:00:00.000Z' }
];
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('lists every dataset with the legacy columns and Thai dates', () => {
  render(<NhsoFiles datasets={datasets} />);
  expect(screen.getByRole('heading', { name: 'ข้อมูลในระบบ (2 ไฟล์)' })).toBeInTheDocument();
  const table = screen.getByRole('table', { name: 'ข้อมูลในระบบ' });
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['ปีงบ', 'รหัส', 'หน่วยบริการ', 'ช่วงวันที่โอน', 'แถว', 'เงินโอนเข้าบัญชี', 'ไฟล์', 'อัปโหลดเมื่อ', '']);
  const first = within(table).getAllByRole('row')[1]!;
  for (const text of ['2569', '11093', 'โรงพยาบาลวาริชภูมิ', '1 ต.ค. 2568 – 30 ก.ย. 2569', '678', '60,587,976.02', 'nhso 11093 2569.xlsx', '13 พ.ย. 2569 14:05']) expect(within(first).getByText(text)).toBeInTheDocument();
});

it('deletes one dataset after confirming in a dialog', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<NhsoFiles datasets={datasets} />);
  fireEvent.click(screen.getByRole('button', { name: 'ลบ 11093 โรงพยาบาลวาริชภูมิ ปีงบ 2569' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('ลบข้อมูล 11093 โรงพยาบาลวาริชภูมิ ปีงบ 2569 ?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ลบ' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/money/nhso/datasets/11093/2569', expect.objectContaining({ method: 'DELETE' }));
});

it('deletes everything after confirming, and says when there is nothing', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, removed: 2 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const { rerender } = render(<NhsoFiles datasets={datasets} />);
  fireEvent.click(screen.getByRole('button', { name: 'ลบข้อมูลทั้งหมด' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('ลบข้อมูลเงินโอนทั้งหมด 2 ไฟล์? ลบแล้วกู้คืนไม่ได้ ต้องอัปโหลดใหม่');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ลบทั้งหมด' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ลบข้อมูลทั้งหมดแล้ว (2 ไฟล์)'));
  expect(fetchMock).toHaveBeenCalledWith('/api/money/nhso/datasets', expect.objectContaining({ method: 'DELETE' }));
  rerender(<NhsoFiles datasets={[]} />);
  expect(screen.getByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ลบข้อมูลทั้งหมด' })).toBeNull();
});
