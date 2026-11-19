import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { readImcFile } = vi.hoisted(() => ({ readImcFile: vi.fn() }));
vi.mock('../../../../lib/money/imc-sheet', async (importOriginal) => ({ ...await importOriginal<typeof import('../../../../lib/money/imc-sheet')>(), readImcFile }));
import { ImcUpload } from './imc-upload';

afterEach(() => { vi.unstubAllGlobals(); readImcFile.mockReset(); });
const answer = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

it('opens in a popup, sends each file in parts with its kind under one upload id, writes a line per file and reloads the page', async () => {
  const done = vi.fn();
  readImcFile
    .mockResolvedValueOnce({ name: 'ทะเบียน IMC.csv', kind: 'register', head: [['HN']], data: Array.from({ length: 1501 }, (_, at) => [String(at)]) })
    .mockResolvedValueOnce({ name: 'บริการ.csv', kind: null, head: [], data: [], problem: 'ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า ข้อมูลเดียวกันอยู่ในทะเบียนคนไข้ IMC แล้ว' })
    .mockResolvedValueOnce({ name: 'REP.xlsx', kind: 'rep', head: [['REP No.'], ['ชดเชย']], data: [['DDSA1']] });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(answer({ ok: true, kind: 'register', rows: 1500, added: 1500, updated: 0, skipped: 0 }))
    .mockResolvedValueOnce(answer({ ok: true, kind: 'register', rows: 1, added: 0, updated: 1, skipped: 0 }))
    .mockResolvedValueOnce(answer({ error: 'INVALID_REPORT', message: 'ไม่ใช่ไฟล์ REP' }, 400));
  vi.stubGlobal('fetch', fetchMock);
  render(<ImcUpload onDone={done} />);
  expect(screen.queryByLabelText('เลือกไฟล์ทะเบียน IMC หรือ REP')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'นำเข้าไฟล์ IMC' }));
  expect(screen.getByRole('dialog', { name: 'นำเข้าไฟล์ IMC' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('เลือกไฟล์ทะเบียน IMC หรือ REP'), { target: { files: [new File(['a'], 'ทะเบียน IMC.csv'), new File(['b'], 'บริการ.csv'), new File(['c'], 'REP.xlsx')] } });
  await screen.findByText('เสร็จแล้ว นำเข้าได้ 1/3 ไฟล์');
  const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as { kind: string; uploadId: string; rows: unknown[][] });
  expect(bodies.map((body) => [body.kind, body.rows.length])).toEqual([['register', 1501], ['register', 2], ['rep', 3]]);
  expect(bodies[0]!.uploadId).toBe(bodies[1]!.uploadId);
  expect(screen.getByText('✓ ทะเบียน IMC.csv (ทะเบียนคนไข้ IMC): 1,501 แถว · ใหม่ 1,500 · แทนที่ของเดิม 1')).toBeInTheDocument();
  expect(screen.getByText('✗ บริการ.csv: ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า ข้อมูลเดียวกันอยู่ในทะเบียนคนไข้ IMC แล้ว')).toBeInTheDocument();
  expect(screen.getByText('✗ REP.xlsx: ไม่ใช่ไฟล์ REP')).toBeInTheDocument();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
});
