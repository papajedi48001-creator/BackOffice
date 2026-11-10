import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { UsageForm } from './usage-form';

const store = '00000000-0000-4000-b000-000000000011';
const item = '00000000-0000-4000-a000-000000000001';
const usageType = '00000000-0000-4000-b000-000000000021';
const lots = [
  { lotId: 'l-old', lotNo: 'EXP-OLD', expiryDate: '2026-10-01', unitCost: '1.0000', storeId: store, quantity: 9 },
  { lotId: 'l-a', lotNo: 'LOT-A', expiryDate: '2026-12-01', unitCost: '1.0000', storeId: store, quantity: 2 },
  { lotId: 'l-b', lotNo: 'LOT-B', expiryDate: null, unitCost: '1.0000', storeId: store, quantity: 5 }
];
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

function setup() {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/lots') ? { lots } : { ok: true }), { status: url.includes('/lots') ? 200 : 201 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<UsageForm stores={[{ id: store, name: 'เคมีคลินิก' }]} items={[{ id: item, code: 'CBC-01', name: 'น้ำยา CBC', useUnit: 'test' }]} usageTypes={[{ id: usageType, name: 'ตรวจผู้ป่วย' }]} today="2026-11-10" />);
  fireEvent.click(screen.getByRole('button', { name: 'ตัดใช้' }));
  return { fetchMock, form: screen.getByRole('form', { name: 'ตัดใช้วัสดุ' }) };
}

it('previews the FEFO lots, skipping expired ones, and posts with picks null', async () => {
  const { fetchMock, form } = setup();
  fireEvent.change(within(form).getByLabelText('วัสดุ'), { target: { value: item } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/lab/stock/${item}/lots?store=${store}`));
  fireEvent.change(within(form).getByLabelText('จำนวน (test)'), { target: { value: '3' } });
  const preview = await within(form).findByRole('list', { name: 'ล็อตที่จะตัด (หมดอายุก่อนใช้ก่อน)' });
  expect(within(preview).getAllByRole('listitem').map((row) => row.textContent)).toEqual([expect.stringContaining('LOT-A'), expect.stringContaining('LOT-B')]);
  expect(preview.textContent).not.toContain('EXP-OLD');
  fireEvent.change(within(form).getByLabelText('ประเภทการใช้'), { target: { value: usageType } });
  fireEvent.submit(form);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/lab/usages', expect.objectContaining({ method: 'POST' })));
  const post = fetchMock.mock.calls.find(([url]) => url === '/api/lab/usages') as unknown as [string, RequestInit];
  expect(JSON.parse(post[1].body as string)).toEqual({ storeId: store, itemId: item, quantity: 3, usageTypeId: usageType, entryDate: '2026-11-10', note: '', picks: null });
});

it('stays open on Esc', () => {
  setup();
  screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
