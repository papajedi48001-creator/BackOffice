import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { refresh, readDpFile } = vi.hoisted(() => ({ refresh: vi.fn(), readDpFile: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('../../../../../lib/money/dp-sheet', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../../lib/money/dp-sheet')>(), readDpFile }));
import { DpUpload } from './dp-upload';

afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); readDpFile.mockReset(); });
const pick = (files: File[]) => fireEvent.change(screen.getByLabelText('เลือกไฟล์บริการฟื้นฟู'), { target: { files } });
const answer = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

it('sends a file in parts of 1,500 rows under one upload id and writes one result line, then refreshes', async () => {
  const data = Array.from({ length: 1501 }, (_, at) => [String(at)]);
  readDpFile.mockResolvedValueOnce([{ name: 'ฟื้นฟู.csv', header: ['h'], data }]);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(answer({ ok: true, rows: 1500, added: 1500, updated: 0, skipped: 0, years: { 2569: 1500 } }))
    .mockResolvedValueOnce(answer({ ok: true, rows: 0, added: 0, updated: 0, skipped: 1, years: {} }));
  vi.stubGlobal('fetch', fetchMock);
  render(<DpUpload />);
  pick([new File(['a'], 'ฟื้นฟู.csv')]);
  await waitFor(() => expect(screen.getByText('เสร็จแล้ว นำเข้าได้ 1/1 ไฟล์')).toBeInTheDocument());
  expect(screen.getByText('✓ ฟื้นฟู.csv: 1,500 ครั้ง (ปีงบ 2569: 1,500) · ใหม่ 1,500 · แทนที่ของเดิม 0 · ข้าม 1 แถว (ไม่มีเลขที่อ้างอิง/วันที่)')).toBeInTheDocument();
  const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as { fileName: string; uploadId: string; rows: unknown[][] });
  expect(fetchMock.mock.calls.every(([url, init]) => url === '/api/money/disability/records' && (init as RequestInit).method === 'POST')).toBe(true);
  expect(bodies.map((body) => [body.fileName, body.rows.length, body.rows[0]])).toEqual([['ฟื้นฟู.csv', 1501, ['h']], ['ฟื้นฟู.csv', 2, ['h']]]);
  expect(bodies[0]!.uploadId).toMatch(/^[0-9a-f-]{36}$/);
  expect(bodies[1]!.uploadId).toBe(bodies[0]!.uploadId);
  expect(refresh).toHaveBeenCalled();
});

it('shows the server message, what a .zip held, and files skipped before sending', async () => {
  readDpFile.mockResolvedValueOnce([{ name: 'x.xlsx', header: [], data: [], problem: 'ไม่ใช่ไฟล์ข้อมูลบริการฟื้นฟู (ไม่พบคอลัมน์ "เลขที่อ้างอิง" และ "ชื่อบริการฟื้นฟู")' }, { name: 'b.csv', header: ['h'], data: [['1']] }]);
  const fetchMock = vi.fn().mockResolvedValueOnce(answer({ error: 'INVALID_REPORT', message: 'ไฟล์ขาดคอลัมน์: วันที่รับบริการ' }, 400));
  vi.stubGlobal('fetch', fetchMock);
  render(<DpUpload />);
  pick([new File(['x'], 'all.zip'), new File(['x'], 'a.pdf')]);
  await waitFor(() => expect(screen.getByText('เสร็จแล้ว นำเข้าได้ 0/3 ไฟล์')).toBeInTheDocument());
  expect(screen.getByText('แตกไฟล์ all.zip: พบ 2 ไฟล์')).toBeInTheDocument();
  expect(screen.getByText('✗ x.xlsx: ไม่ใช่ไฟล์ข้อมูลบริการฟื้นฟู (ไม่พบคอลัมน์ "เลขที่อ้างอิง" และ "ชื่อบริการฟื้นฟู")')).toBeInTheDocument();
  expect(screen.getByText('✗ b.csv: ไฟล์ขาดคอลัมน์: วันที่รับบริการ')).toBeInTheDocument();
  expect(screen.getByText('✗ a.pdf: รับเฉพาะไฟล์ .csv .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
});

it('says when a .zip cannot be opened', async () => {
  readDpFile.mockRejectedValueOnce(new Error('bad zip'));
  vi.stubGlobal('fetch', vi.fn());
  render(<DpUpload />);
  pick([new File(['x'], 'all.zip')]);
  await waitFor(() => expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument());
  expect(screen.getByText('✗ all.zip: แตกไฟล์ zip ไม่ได้')).toBeInTheDocument();
});
