import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MappingHistoryRow } from '@backoffice/core';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import { HistoryTable } from './history-table';

const rows: MappingHistoryRow[] = [
  { id: 'a', at: '2026-11-13T07:05:00.000Z', actorName: 'วศิน ส.', pttype: '89', opd: { from: 'P1', to: 'P2' }, ipd: null },
  { id: 'b', at: '2026-11-01T18:30:00.000Z', actorName: 'มาลี ก.', pttype: '34', opd: null, ipd: { from: null, to: 'P9' } }
];
const shownPttypes = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[2]!.textContent);

afterEach(() => replace.mockReset());

describe('HistoryTable', () => {
  it('lists each change in Bangkok time with old → new per side', () => {
    render(<HistoryTable rows={rows} />);
    const cells = within(within(screen.getByRole('table')).getAllByRole('row')[1]!).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['13 พ.ย. 2569 14:05', 'วศิน ส.', '89', 'P1 → P2', '—']);
    const second = within(within(screen.getByRole('table')).getAllByRole('row')[2]!).getAllByRole('cell').map((cell) => cell.textContent);
    expect(second[0]).toBe('2 พ.ย. 2569 01:30');
    expect(second[4]).toBe('ยังไม่ผูก → P9');
  });

  it('finds by สิทธิ or editor and by Bangkok date range', () => {
    render(<HistoryTable rows={rows} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'มาลี' } });
    expect(shownPttypes()).toEqual(['34']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '2/11/2569' } });
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '2/11/2569' } });
    expect(shownPttypes()).toEqual(['34']);
    expect(screen.getByText('แสดง 1 จาก 2 รายการ')).toBeInTheDocument();
  });

  it('moves the end date to the start date when the start is picked after it', () => {
    render(<HistoryTable rows={rows} />);
    fireEvent.change(screen.getByLabelText('ถึงวันที่'), { target: { value: '1/11/2569' } });
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '13/11/2569' } });
    fireEvent.blur(screen.getByLabelText('ถึงวันที่'));
    expect((screen.getByLabelText('ถึงวันที่') as HTMLInputElement).value).toBe('ศุกร์ 13 พ.ย. 2569');
  });

  it('asks the server for the chosen range so older changes can be reached', () => {
    render(<HistoryTable rows={rows} />);
    fireEvent.change(screen.getByLabelText('ตั้งแต่วันที่'), { target: { value: '1/4/2562' } });
    expect(replace).toHaveBeenLastCalledWith('/pttype-mapping/history?from=2019-04-01', { scroll: false });
  });

  it('opens on the range in the address and says when only the latest changes are shown', () => {
    render(<HistoryTable rows={rows} from="2026-11-01" to="2026-11-30" limit={2} />);
    expect((screen.getByLabelText('ตั้งแต่วันที่') as HTMLInputElement).value).toBe('อาทิตย์ 1 พ.ย. 2569');
    expect(screen.getByText(/แสดงเฉพาะ 2 รายการล่าสุด/)).toBeInTheDocument();
  });
});
