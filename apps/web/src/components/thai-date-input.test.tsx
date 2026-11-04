import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThaiDateInput, ThaiDateTimeInput } from './thai-date-input';

function Controlled(props: Partial<Parameters<typeof ThaiDateInput>[0]> & { initial?: string; spy?: (value: string) => void }) {
  const [value, setValue] = useState(props.initial ?? '');
  return <><label htmlFor="d">วันที่</label><ThaiDateInput id="d" {...props} value={value} onChange={(next) => { setValue(next); props.spy?.(next); }} /><output data-testid="iso">{value}</output></>;
}

describe('ThaiDateInput', () => {
  it('shows วัน/เดือน/ปี พ.ศ. and the full Thai date, and gives back ISO', () => {
    const spy = vi.fn();
    render(<Controlled initial="2026-11-09" spy={spy} />);
    const input = screen.getByLabelText('วันที่') as HTMLInputElement;
    expect(input.value).toBe('09/11/2569');
    expect(input.title).toBe('จันทร์ 9 พ.ย. 2569');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.dataset.hint).toBe('จันทร์ 9 พ.ย. 2569');
    fireEvent.change(input, { target: { value: '10/11/2569' } });
    expect(spy).toHaveBeenLastCalledWith('2026-11-10');
    expect(screen.getByTestId('iso').textContent).toBe('2026-11-10');
  });
  it('opens a calendar with full Thai weekday and month names, greys holidays with their name and refuses them when blocked', () => {
    const spy = vi.fn();
    render(<Controlled initial="2026-12-01" spy={spy} holidays={[{ date: '2026-12-07', name: 'วันหยุดชดเชย' }]} blockHolidays />);
    fireEvent.click(screen.getByRole('button', { name: 'เลือกวันที่จากปฏิทิน' }));
    const dialog = screen.getByRole('dialog', { name: 'เลือกวันที่' });
    expect(within(dialog).getByText('ธันวาคม 2569')).toBeTruthy();
    expect(within(dialog).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']);
    const holiday = within(dialog).getByRole('button', { name: /จันทร์ 7 ธ.ค. 2569 วันหยุด วันหยุดชดเชย/ }) as HTMLButtonElement;
    expect(holiday.disabled).toBe(true);
    expect(holiday.className).toContain('is-holiday');
    expect(within(dialog).getByText('วันหยุดชดเชย')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /^อังคาร 8 ธ.ค. 2569/ }));
    expect(spy).toHaveBeenLastCalledWith('2026-12-08');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('moves by keyboard: arrows step days and weeks, Enter picks, Escape closes', () => {
    const spy = vi.fn();
    render(<Controlled initial="2026-11-09" spy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'เลือกวันที่จากปฏิทิน' }));
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^อังคาร 17 พ.ย. 2569/);
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('2026-11-17');
    fireEvent.click(screen.getByRole('button', { name: 'เลือกวันที่จากปฏิทิน' }));
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('flags a typed date outside the allowed range or on a blocked holiday', () => {
    const spy = vi.fn();
    render(<Controlled min="2026-11-05" spy={spy} holidays={[{ date: '2026-12-07', name: 'วันหยุดชดเชย' }]} blockHolidays />);
    const input = screen.getByLabelText('วันที่') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '01/11/2569' } });
    expect(spy).not.toHaveBeenCalled();
    expect(input.validationMessage).not.toBe('');
    fireEvent.change(input, { target: { value: '07/12/2569' } });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('วันหยุดชดเชย');
  });
  it('posts the ISO value under its name for plain GET forms', () => {
    const { container } = render(<form><ThaiDateInput id="f" name="from" defaultValue="2026-11-01" aria-label="ตั้งแต่" /></form>);
    expect((container.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement).value).toBe('2026-11-01');
    fireEvent.change(screen.getByLabelText('ตั้งแต่'), { target: { value: '02/11/2569' } });
    expect((container.querySelector('input[name="from"]') as HTMLInputElement).value).toBe('2026-11-02');
  });
});

describe('ThaiDateTimeInput', () => {
  it('joins a Thai date and a quarter-hour time into a datetime-local value', () => {
    const spy = vi.fn();
    function Host() { const [value, setValue] = useState('2026-11-10T08:00'); return <><label htmlFor="dt">ออกเดินทาง</label><ThaiDateTimeInput id="dt" label="ออกเดินทาง" value={value} onChange={(next) => { setValue(next); spy(next); }} /></>; }
    render(<Host />);
    expect((screen.getByLabelText('ออกเดินทาง') as HTMLInputElement).value).toBe('10/11/2569');
    fireEvent.change(screen.getByLabelText('เวลา ออกเดินทาง'), { target: { value: '09:15' } });
    expect(spy).toHaveBeenLastCalledWith('2026-11-10T09:15');
    fireEvent.change(screen.getByLabelText('ออกเดินทาง'), { target: { value: '11/11/2569' } });
    expect(spy).toHaveBeenLastCalledWith('2026-11-11T09:15');
    fireEvent.change(screen.getByLabelText('ออกเดินทาง'), { target: { value: '2026-11-12T10:30' } });
    expect(spy).toHaveBeenLastCalledWith('2026-11-12T10:30');
  });
});
