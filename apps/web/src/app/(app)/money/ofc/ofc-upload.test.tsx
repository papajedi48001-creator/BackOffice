import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { readOfcFile } = vi.hoisted(() => ({ readOfcFile: vi.fn() }));
vi.mock('../../../../lib/money/ofc-sheet', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../lib/money/ofc-sheet')>(), readOfcFile }));
import { OfcUpload } from './ofc-upload';

afterEach(() => { vi.unstubAllGlobals(); readOfcFile.mockReset(); });
const answer = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

it('opens in a popup, sends each file once, writes a line per file and reloads the page', async () => {
  const done = vi.fn();
  readOfcFile
    .mockResolvedValueOnce({ name: 'eclaim.xls', sheets: { Detail: [['REP']], 'Data Instrument': [['TRAN_ID']] } })
    .mockResolvedValueOnce({ name: 'other.xls', sheets: {}, problem: 'ไฟล์นี้ไม่ใช่ REP หรือ Statement ของ OFC' })
    .mockResolvedValueOnce({ name: 'STM.xls', sheets: { 'พึงรับ': [['x']] } });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(answer({ ok: true, kind: 'rep', rows: 42, added: 40, updated: 2, skipped: 0 }))
    .mockResolvedValueOnce(answer({ error: 'INVALID_REPORT', message: 'ไม่พบรายการในชีตพึงรับ' }, 400));
  vi.stubGlobal('fetch', fetchMock);
  render(<OfcUpload onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'นำเข้า REP / Statement' }));
  expect(screen.getByRole('dialog', { name: 'นำเข้า REP / Statement' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('เลือกไฟล์ REP หรือ Statement ของ OFC'), { target: { files: [new File(['a'], 'eclaim.xls'), new File(['b'], 'other.xls'), new File(['c'], 'STM.xls')] } });
  await screen.findByText('เสร็จแล้ว นำเข้าได้ 1/3 ไฟล์');
  expect(fetchMock.mock.calls.map(([url, init]) => [url, Object.keys((JSON.parse((init as RequestInit).body as string) as { sheets: object }).sheets)])).toEqual([['/api/money/ofc', ['Detail', 'Data Instrument']], ['/api/money/ofc', ['พึงรับ']]]);
  expect(screen.getByText('✓ eclaim.xls (REP): 42 รายการ · ใหม่ 40 · แทนที่ของเดิม 2')).toBeInTheDocument();
  expect(screen.getByText('✗ other.xls: ไฟล์นี้ไม่ใช่ REP หรือ Statement ของ OFC')).toBeInTheDocument();
  expect(screen.getByText('✗ STM.xls: ไม่พบรายการในชีตพึงรับ')).toBeInTheDocument();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
});
