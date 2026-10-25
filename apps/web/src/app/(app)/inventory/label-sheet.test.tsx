import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LabelSheet } from './label-sheet';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path d="M0 0h1v1H0z"/></svg>';
const labels = [
  { lot: { lotCode: 'LT-2569-000001', itemCode: 'AB-01', itemName: 'ถุงมือยาง', expiryDate: '2027-06-30', receivedOn: '2026-10-22' }, svg },
  { lot: { lotCode: 'LT-2569-000002', itemCode: 'PA-01', itemName: 'กระดาษ', expiryDate: null, receivedOn: '2026-10-22' }, svg }
];
const copies = (lotCode: string) => screen.getByLabelText(`จำนวนฉลาก ${lotCode}`);

describe('LabelSheet', () => {
  it('prints the chosen number of copies per lot with code, name and Thai dates', () => {
    const { container } = render(<LabelSheet labels={labels} />);
    fireEvent.change(copies('LT-2569-000001'), { target: { value: '3' } });
    expect(container.querySelectorAll('.inventory-label')).toHaveLength(4);
    expect(screen.getAllByText('LT-2569-000001', { selector: '.inventory-label *' })).toHaveLength(3);
    expect(screen.getAllByText('ถุงมือยาง', { selector: '.inventory-label *' })).toHaveLength(3);
    expect(screen.getAllByText(/หมดอายุ 30 มิ.ย. 2570/)).toHaveLength(3);
  });

  it('never shows a price or a vendor', () => {
    const { container } = render(<LabelSheet labels={labels} />);
    expect(container.innerHTML).not.toMatch(/฿|ราคา|ผู้ขาย|บริษัท/);
  });

  it('switches to the thermal layout and clamps copies to 1–500', () => {
    const { container } = render(<LabelSheet labels={labels} />);
    fireEvent.change(screen.getByLabelText('รูปแบบกระดาษ'), { target: { value: 'thermal-50x30' } });
    expect(container.querySelector('.inventory-label-sheet')).toHaveAttribute('data-layout', 'thermal-50x30');
    fireEvent.change(copies('LT-2569-000002'), { target: { value: '9999' } });
    expect(container.querySelectorAll('.inventory-label')).toHaveLength(501);
    fireEvent.blur(copies('LT-2569-000002'));
    expect(copies('LT-2569-000002')).toHaveValue(500);
    fireEvent.change(copies('LT-2569-000002'), { target: { value: '' } });
    expect(copies('LT-2569-000002')).toHaveValue(null);
    fireEvent.blur(copies('LT-2569-000002'));
    expect(copies('LT-2569-000002')).toHaveValue(1);
  });

  it('prints through the browser', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<LabelSheet labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: 'พิมพ์ฉลาก' }));
    expect(print).toHaveBeenCalled();
  });
});
