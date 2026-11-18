import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { refresh, readFdhFile } = vi.hoisted(() => ({ refresh: vi.fn(), readFdhFile: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../../../../../lib/money/fdh-sheet', () => ({ readFdhFile }));
import { FdhUpload } from './fdh-upload';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); readFdhFile.mockReset(); });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText('เลือกไฟล์ REP / STM'), { target: { files } });

it('reads each file, posts its sheets one at a time and lists the result lines, then refreshes the list', async () => {
  readFdhFile.mockImplementation(async (file: File) => [{ name: file.name, sheets: { Detail: [['REP No.']] } }]);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, kind: 'rep', docNo: 'eclaim_1', period: '', items: 56, replaced: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'INVALID_REPORT', message: 'ไฟล์ REP ไม่มีคอลัมน์: SEQ NO' }), { status: 400 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<FdhUpload />);
  pick([new File(['a'], 'a.xls'), new File(['b'], 'b.xls')]);
  await waitFor(() => expect(screen.getByText('เสร็จแล้ว นำเข้าได้ 1/2 ไฟล์')).toBeInTheDocument());
  expect(screen.getByText('✓ a.xls: REP eclaim_1 (56 เคส) — แทนที่ข้อมูลเดิม')).toBeInTheDocument();
  expect(screen.getByText('✗ b.xls: ไฟล์ REP ไม่มีคอลัมน์: SEQ NO')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/money/fdh/documents', expect.objectContaining({ method: 'POST', body: JSON.stringify({ fileName: 'a.xls', sheets: { Detail: [['REP No.']] } }) }));
  expect(refresh).toHaveBeenCalled();
});

it('shows what a .zip held, skips files with a problem and never sends them', async () => {
  readFdhFile.mockResolvedValueOnce([{ name: 'big.xls', sheets: {}, problem: 'ไฟล์ใหญ่เกิน 10 MB' }, { name: 'c.xls', sheets: { Detail: [] } }]);
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, kind: 'stm', docNo: 'STM_1', period: '6910_OP_02', items: 3, replaced: false }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<FdhUpload />);
  pick([new File(['x'], 'month.zip'), new File(['x'], '~$a.xls')]);
  await waitFor(() => expect(screen.getByText('เสร็จแล้ว นำเข้าได้ 1/3 ไฟล์')).toBeInTheDocument());
  expect(screen.getByText('แตกไฟล์ month.zip: พบไฟล์ Excel 2 ไฟล์')).toBeInTheDocument();
  expect(screen.getByText('✗ big.xls: ไฟล์ใหญ่เกิน 10 MB')).toBeInTheDocument();
  expect(screen.getByText('✓ c.xls: STM STM_1 งวด 6910_OP_02 (3 แถว)')).toBeInTheDocument();
  expect(screen.getByText('✗ ~$a.xls: ข้ามไฟล์ชั่วคราวของ Excel')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('says when a .zip cannot be opened and when the server refuses a large file', async () => {
  readFdhFile.mockRejectedValueOnce(new Error('bad zip')).mockResolvedValueOnce([{ name: 'c.xls', sheets: { Detail: [] } }]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<html>413</html>', { status: 413 })));
  render(<FdhUpload />);
  pick([new File(['x'], 'all.zip'), new File(['x'], 'c.xls')]);
  await waitFor(() => expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument());
  expect(screen.getByText('✗ all.zip: แตกไฟล์ zip ไม่ได้')).toBeInTheDocument();
  expect(screen.getByText('✗ c.xls: ไฟล์ใหญ่เกินไป')).toBeInTheDocument();
});
