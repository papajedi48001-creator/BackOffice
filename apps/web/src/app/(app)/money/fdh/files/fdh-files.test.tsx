import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { FdhFiles } from './fdh-files';

const base = { hcode: '11093', hname: '', reportDate: '2026-11-12', fileName: 'x.xls', uploadedAt: '2026-11-13T07:05:00.000Z' };
const stms = [{ ...base, kind: 'stm' as const, docNo: '11093_OPUCS256910_02', period: '6910_OP_02', count: 3, sum: 1611 }];
const reps = [
  { ...base, kind: 'rep' as const, docNo: 'eclaim_11093_OP_2', period: '', count: 56, sum: 12345.5 },
  { ...base, kind: 'rep' as const, docNo: 'eclaim_11093_OP_1', period: '', count: 4, sum: 0, reportDate: null }
];
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

it('lists STM and REP with the legacy columns, counts and Thai dates', () => {
  render(<FdhFiles reps={reps} stms={stms} />);
  expect(screen.getByRole('heading', { name: 'ไฟล์ STM (1 งวด)' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'ไฟล์ REP (2 ไฟล์ · 60 เคส)' })).toBeInTheDocument();
  const stm = screen.getByRole('table', { name: 'ไฟล์ STM' });
  expect(within(stm).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['งวด', 'เลขที่เอกสาร', 'แถว', 'ยอดชดเชยทั้งสิ้น', 'ออกรายงาน', 'อัปโหลดเมื่อ', '']);
  for (const text of ['6910_OP_02', '11093_OPUCS256910_02', '3', '1,611.00', '12 พ.ย. 2569', '13 พ.ย. 2569 14:05']) expect(within(stm).getByText(text)).toBeInTheDocument();
  const rep = screen.getByRole('table', { name: 'ไฟล์ REP' });
  expect(within(rep).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['เลขที่เอกสาร', 'เคส', 'ชดเชยสุทธิ', 'ออกรายงาน', 'อัปโหลดเมื่อ', '']);
  expect(within(rep).getByText('12,345.50')).toBeInTheDocument();
  expect(within(within(rep).getAllByRole('row')[2]!).getByText('-')).toBeInTheDocument();
});

it('deletes one document after confirming in a dialog', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<FdhFiles reps={reps} stms={stms} />);
  fireEvent.click(screen.getByRole('button', { name: 'ลบ REP eclaim_11093_OP_2' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('ลบ REP eclaim_11093_OP_2 ?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ลบ' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/money/fdh/documents/rep/eclaim_11093_OP_2', expect.objectContaining({ method: 'DELETE' }));
  expect(screen.getByRole('status')).toHaveTextContent('ลบข้อมูลแล้ว');
});

it('deletes every STM after confirming, with the legacy wording', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, removed: 1 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<FdhFiles reps={[]} stms={stms} />);
  expect(screen.getByText('ยังไม่มีไฟล์ REP')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ลบ REP ทั้งหมด' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ลบ STM ทั้งหมด' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('ลบไฟล์ STM ทั้งหมด 1 ไฟล์? ลบแล้วกู้คืนไม่ได้ ต้องอัปโหลดใหม่');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ลบทั้งหมด' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ลบไฟล์ STM ทั้งหมดแล้ว (1 ไฟล์)'));
  expect(fetchMock).toHaveBeenCalledWith('/api/money/fdh/documents?kind=stm', expect.objectContaining({ method: 'DELETE' }));
});
