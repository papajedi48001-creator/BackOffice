import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { refresh, readNhsoFile } = vi.hoisted(() => ({ refresh: vi.fn(), readNhsoFile: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../../../../../lib/money/nhso-sheet', () => ({ readNhsoFile }));
import { NhsoUpload } from './nhso-upload';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); readNhsoFile.mockReset(); });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText('เลือกไฟล์รายงานโอนเงิน'), { target: { files } });


/** The upload opens as a popup (FormDialog) from its button, like every add form. */
const open = () => { render(<NhsoUpload />); fireEvent.click(screen.getByRole('button', { name: 'อัปโหลดรายงานโอนเงิน' })); };

it('keeps the drop zone in a popup that opens from its button and closes only from its buttons', () => {
  render(<NhsoUpload />);
  expect(screen.queryByLabelText('เลือกไฟล์รายงานโอนเงิน')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'อัปโหลดรายงานโอนเงิน' }));
  expect(screen.getByRole('dialog', { name: 'อัปโหลดรายงานโอนเงิน' })).toBeInTheDocument();
  expect(screen.getByLabelText('เลือกไฟล์รายงานโอนเงิน')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('reads each file, posts its table and lists the result lines, then refreshes the list', async () => {
  readNhsoFile.mockImplementation(async (file: File) => [{ name: file.name, aoa: [['x']] }]);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', fy: 2569, rows: 678, replaced: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่มีรายการโอน' }), { status: 400 }));
  vi.stubGlobal('fetch', fetchMock);
  open();
  pick([new File(['a'], 'a.xlsx'), new File(['b'], 'b.xlsx')]);
  await waitFor(() => expect(screen.getByText('เสร็จแล้ว นำเข้าได้ 1/2 ไฟล์')).toBeInTheDocument());
  expect(screen.getByText('✓ a.xlsx: นำเข้าแล้ว 11093 โรงพยาบาลวาริชภูมิ ปีงบ 2569 (678 แถว) — แทนที่ข้อมูลเดิม')).toBeInTheDocument();
  expect(screen.getByText('✗ b.xlsx: ไฟล์นี้ไม่มีรายการโอน')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/money/nhso/datasets', expect.objectContaining({ method: 'POST', body: JSON.stringify({ fileName: 'a.xlsx', aoa: [['x']] }) }));
  expect(refresh).toHaveBeenCalled();
});

it('skips a temp file and a file over 10 MB without reading or sending them', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  open();
  const big = new File(['x'], 'big.xlsx');
  Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
  pick([new File(['x'], '~$a.xlsx'), big]);
  await waitFor(() => expect(screen.getByText('เสร็จแล้ว นำเข้าได้ 0/2 ไฟล์')).toBeInTheDocument());
  expect(screen.getByText('✗ ~$a.xlsx: ข้ามไฟล์ชั่วคราวของ Excel')).toBeInTheDocument();
  expect(screen.getByText('✗ big.xlsx: ไฟล์ใหญ่เกิน 10 MB')).toBeInTheDocument();
  expect(readNhsoFile).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('says when a file cannot be read and when the server refuses a large table', async () => {
  readNhsoFile.mockRejectedValueOnce(new Error('bad zip')).mockResolvedValueOnce([{ name: 'c.xlsx', aoa: [] }]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html>413</html>', { status: 413 })));
  open();
  pick([new File(['x'], 'all.zip'), new File(['x'], 'c.xlsx')]);
  await waitFor(() => expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument());
  expect(screen.getByText('✗ all.zip: อ่านไฟล์ไม่ได้')).toBeInTheDocument();
  expect(screen.getByText('✗ c.xlsx: ไฟล์ใหญ่เกินไป')).toBeInTheDocument();
});
