import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TTM_CATEGORIES } from '@backoffice/contracts';
import type { TtmItemStat } from '@backoffice/core';
import { TtmItemTable } from './ttm-item-table';

const items: TtmItemStat[] = [
  { icode: '3015001', name: 'M12 นวดทั้งตัว', income: '13', incomeName: 'ค่าบริการฝังเข็ม', isDrug: false, category: 'massage', kind: 'thai_massage', visits: 3, qty: 3, amount: 750 },
  { icode: 'L1', name: 'CBC', income: '07', incomeName: 'ค่าตรวจ', isDrug: false, category: null, kind: null, visits: 1, qty: 1, amount: 90.5 }
];

describe('TtmItemTable', () => {
  it('shows what each icode counts as and searches by code, name or หมวด', () => {
    render(<TtmItemTable items={items} categories={TTM_CATEGORIES} />);
    const table = screen.getByRole('table', { name: 'รายการค่าใช้จ่าย (icode)' });
    expect(within(table).getAllByRole('row')[1]!.textContent).toBe('3015001M12 นวดทั้งตัวค่าบริการ13 ค่าบริการฝังเข็มค่านวด/ประคบ/อบ/หัตถการนวด33750');
    expect(within(table).getAllByRole('row')[2]!.textContent).toBe('L1CBCค่าบริการ07 ค่าตรวจไม่นับ–1190.50');
    fireEvent.change(screen.getByLabelText('ค้นหารายการ'), { target: { value: 'ไม่นับ' } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('CBC')).toBeInTheDocument();
  });
});
