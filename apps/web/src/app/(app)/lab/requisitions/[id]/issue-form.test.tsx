import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { IssueForm } from './issue-form';

const fefo = { lines: [{ lineId: 'line-1', itemId: 'i-1', quantityRequested: 10, suggestion: { ok: false, code: 'INSUFFICIENT_STOCK' }, lots: [{ lotId: 'l-1', lotNo: 'LOT-1', expiryDate: '2027-01-01', createdAt: '2026-01-01T00:00:00.000Z', available: 6 }, { lotId: 'l-2', lotNo: 'LOT-2', expiryDate: null, createdAt: '2026-01-01T00:00:00.000Z', available: 20 }] }] };
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

function setup() {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/fefo') ? fefo : { ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<IssueForm requisitionId="r-1" lines={[{ id: 'line-1', code: 'CBC-01', name: 'น้ำยา CBC', useUnit: 'test', quantityRequested: 10 }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'จ่ายวัสดุ' }));
  return { fetchMock, form: screen.getByRole('form', { name: 'จ่ายวัสดุตามใบขอเบิก' }) };
}

it('starts from FEFO, asks for a note when a line is short, and posts the picks', async () => {
  const { fetchMock, form } = setup();
  const first = await within(form).findByLabelText('จ่ายจาก LOT-1 (CBC-01)');
  expect((first as HTMLInputElement).value).toBe('6');
  fireEvent.change(within(form).getByLabelText('จ่ายจาก LOT-2 (CBC-01)'), { target: { value: '0' } });
  expect(within(form).getByText('ต้องระบุหมายเหตุ')).toBeInTheDocument();
  expect(within(form).getByRole('button', { name: 'บันทึกการจ่าย' })).toBeDisabled();
  fireEvent.change(within(form).getByLabelText('หมายเหตุการจ่าย'), { target: { value: 'ของหมด' } });
  fireEvent.submit(form);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/lab/requisitions/r-1/issue', expect.objectContaining({ method: 'POST' })));
  const post = fetchMock.mock.calls.find(([url]) => url.endsWith('/issue')) as unknown as [string, RequestInit];
  expect(JSON.parse(post[1].body as string)).toEqual({ note: 'ของหมด', lines: [{ lineId: 'line-1', picks: [{ lotId: 'l-1', quantity: 6 }] }] });
});

it('blocks issuing more than was asked for', async () => {
  const { form } = setup();
  fireEvent.change(await within(form).findByLabelText('จ่ายจาก LOT-2 (CBC-01)'), { target: { value: '9' } });
  expect(within(form).getByText('จ่ายเกินจำนวนที่ขอไม่ได้')).toBeInTheDocument();
  expect(within(form).getByRole('button', { name: 'บันทึกการจ่าย' })).toBeDisabled();
});
