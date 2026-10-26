import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ActionDialog } from './action-dialog';

it('opens as a modal named by its title and closes on Esc', () => {
  const onClose = vi.fn();
  render(<ActionDialog title="ไม่อนุมัติ" confirmLabel="ไม่อนุมัติ" tone="danger" reason onConfirm={vi.fn()} onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: 'ไม่อนุมัติ' });
  expect(dialog).toHaveAttribute('open');
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalled();
});

it('needs a reason before confirming when asked for one', () => {
  const onConfirm = vi.fn();
  render(<ActionDialog title="ส่งกลับแก้ไข" confirmLabel="ส่งกลับแก้ไข" reason onConfirm={onConfirm} onClose={vi.fn()} />);
  const confirm = screen.getByRole('button', { name: 'ส่งกลับแก้ไข' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('เหตุผล'), { target: { value: '  แนบเอกสารเพิ่ม  ' } });
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith('แนบเอกสารเพิ่ม');
});

it('confirms without a reason field and shows the message and error', () => {
  const onConfirm = vi.fn();
  render(<ActionDialog title="อนุมัติ" message="ยืนยันการอนุมัติรายการนี้" confirmLabel="อนุมัติ" error="ไม่สามารถดำเนินการได้" onConfirm={onConfirm} onClose={vi.fn()} />);
  expect(screen.queryByLabelText('เหตุผล')).toBeNull();
  expect(screen.getByText('ยืนยันการอนุมัติรายการนี้')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('ไม่สามารถดำเนินการได้');
  fireEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }));
  expect(onConfirm).toHaveBeenCalledWith('');
});

it('closes from the close button and blocks both buttons while saving', () => {
  const onClose = vi.fn();
  const { rerender } = render(<ActionDialog title="อนุมัติ" confirmLabel="อนุมัติ" onConfirm={vi.fn()} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
  expect(onClose).toHaveBeenCalled();
  rerender(<ActionDialog title="อนุมัติ" confirmLabel="อนุมัติ" isSubmitting onConfirm={vi.fn()} onClose={onClose} />);
  expect(screen.getByRole('button', { name: 'กำลังบันทึก' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeDisabled();
});
