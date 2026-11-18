import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MappingSnapshot } from '@backoffice/core';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { MappingBoard } from './mapping-board';

const snapshot: MappingSnapshot = {
  rights: [
    { code: '10', name: 'ชำระเงินเอง', opd: { code: 'P10', name: 'ลูกหนี้ชำระเงิน OP', modifiedAt: '2026-11-13 14:05:00' }, ipd: { code: 'P10I', name: 'ลูกหนี้ชำระเงิน IP', modifiedAt: '2026-11-01 09:00:00' } },
    { code: '34', name: 'ประกันสังคม', opd: null, ipd: null },
    { code: '89', name: 'UC บัตรทอง', opd: { code: 'GONE', name: null, modifiedAt: null }, ipd: null }
  ],
  opdAccounts: [{ code: 'P10', name: 'ลูกหนี้ชำระเงิน OP' }, { code: 'P31', name: 'ลูกหนี้ประกันสังคม OP' }],
  ipdAccounts: [{ code: 'P10I', name: 'ลูกหนี้ชำระเงิน IP' }]
};
const editors = { '10': { name: 'วศิน ส.', at: '2026-11-13T07:05:00.000Z' } };
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]!.textContent);
const openDialog = (code: string) => {
  const row = within(screen.getByRole('table')).getAllByRole('row').find((element) => within(element).queryAllByRole('cell')[0]?.textContent === code)!;
  fireEvent.click(within(row).getByRole('button', { name: /ผูกผังบัญชี/ }));
  return screen.getByRole('dialog');
};
afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

describe('MappingBoard', () => {
  it('counts the สิทธิ on the tiles and filters by a tile', () => {
    render(<MappingBoard snapshot={snapshot} editors={editors} />);
    expect(screen.getByRole('button', { name: /3\s*สิทธิที่ใช้งาน/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\s*ผูกครบแล้ว/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\s*ยังไม่ผูก OPD/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /2\s*ยังไม่ผูก IPD/ }));
    expect(rows()).toEqual(['34', '89']);
    expect(screen.getByText('แสดง 2 จาก 3 สิทธิ')).toBeInTheDocument();
  });

  it('finds a สิทธิ by its ผังบัญชี code and shows a missing ผังบัญชี by code', () => {
    render(<MappingBoard snapshot={snapshot} editors={editors} />);
    expect(screen.getByText('GONE (ไม่พบในผังบัญชี)')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'p10i' } });
    expect(rows()).toEqual(['10']);
  });

  it('shows the editor and the latest HOSxP stamp in Thai', () => {
    render(<MappingBoard snapshot={snapshot} editors={editors} />);
    const cells = within(within(screen.getByRole('table')).getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells[4]!.textContent).toBe('วศิน ส.13 พ.ย. 2569 14:05');
  });

  it('falls back to the BackOffice save time when both sides were cleared', () => {
    render(<MappingBoard snapshot={snapshot} editors={{ '34': { name: 'วศิน ส.', at: '2026-11-13T07:05:00.000Z' } }} />);
    const row = within(screen.getByRole('table')).getAllByRole('row').find((element) => within(element).queryAllByRole('cell')[0]?.textContent === '34')!;
    expect(within(row).getAllByRole('cell')[4]!.textContent).toMatch(/^วศิน ส\..*14:05$/);
  });

  it('saves only after a change, with the values the person saw, then refreshes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MappingBoard snapshot={snapshot} editors={editors} />);
    const dialog = openDialog('34');
    const save = within(dialog).getByRole('button', { name: 'บันทึกลง HOSxP' });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('ผังบัญชี OPD'), { target: { value: 'P31' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/pttype-mapping/34');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ opd: 'P31', ipd: null, expected: { opd: null, ipd: null } });
  });

  it('keeps a ผังบัญชี missing from the list as a choice and explains a STALE refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'STALE' }), { status: 409 })));
    render(<MappingBoard snapshot={snapshot} editors={editors} />);
    const dialog = openDialog('89');
    expect((within(dialog).getByLabelText('ผังบัญชี OPD') as HTMLSelectElement).value).toBe('GONE');
    fireEvent.change(within(dialog).getByLabelText('ผังบัญชี IPD'), { target: { value: 'P10I' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกลง HOSxP' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('มีคนแก้สิทธินี้ไปแล้ว');
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stays open on Esc', () => {
    render(<MappingBoard snapshot={snapshot} editors={editors} />);
    const dialog = openDialog('34');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
