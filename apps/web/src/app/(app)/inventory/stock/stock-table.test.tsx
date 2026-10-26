import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockTable } from './stock-table';

const row = { itemId: 'item-1', code: 'AB-01', name: 'ถุงมือยาง', categoryName: 'วัสดุการแพทย์', issueUnit: 'ชิ้น', onHand: 1200, value: '3000.00', nearestExpiry: '2027-06-30', belowReorder: true, isActive: true };

describe('StockTable', () => {
  it('shows quantity, value, nearest expiry and a below-reorder label in words', () => {
    render(<StockTable rows={[row, { ...row, itemId: 'item-2', code: 'PA-01', name: 'กระดาษ', onHand: 5, belowReorder: false, nearestExpiry: null, isActive: false }]} />);
    expect(screen.getByText('1,200 ชิ้น', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getAllByText('3,000.00')).toHaveLength(2);
    expect(screen.getByText('30 มิ.ย. 2570')).toBeInTheDocument();
    expect(screen.getAllByText('ต่ำกว่าจุดสั่งซื้อ')).toHaveLength(1);
    expect(screen.getByText('ปิดใช้')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ถุงมือยาง' })).toHaveAttribute('href', '/inventory/stock/item-1');
  });

  it('says when there is nothing to show', () => {
    render(<StockTable rows={[]} />);
    expect(screen.getByText('ยังไม่มีวัสดุ')).toBeInTheDocument();
  });
});
