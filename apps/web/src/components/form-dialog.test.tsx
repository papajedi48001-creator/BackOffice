import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FormDialog } from './form-dialog';

function Fields() {
  return <><label>ชื่อ<input name="name" /></label><label>หมายเหตุ<input name="note" /></label></>;
}

it('opens from its trigger as a modal named by its title and focuses the first field', async () => {
  render(<FormDialog triggerLabel="เพิ่มผู้ขาย" title="เพิ่มผู้ขาย" submitLabel="บันทึก" onSubmit={vi.fn()}><Fields /></FormDialog>);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ขาย' }));
  const dialog = screen.getByRole('dialog', { name: 'เพิ่มผู้ขาย' });
  expect(dialog).toHaveAttribute('open');
  await waitFor(() => expect(screen.getByLabelText('ชื่อ')).toHaveFocus());
});

it('closes after a submit that reports success and stays open otherwise', async () => {
  const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<FormDialog triggerLabel="เพิ่ม" title="เพิ่มรายการ" submitLabel="บันทึก" onSubmit={onSubmit}><Fields /></FormDialog>);
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่ม' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'บันทึก' })); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'บันทึก' })); });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes only from × and cancel, never Esc or the backdrop, and not while submitting', () => {
  const onOpenChange = vi.fn();
  const { rerender } = render(<FormDialog open onOpenChange={onOpenChange} title="แก้ไข" submitLabel="บันทึก" error="บันทึกไม่ได้" onSubmit={vi.fn()}><Fields /></FormDialog>);
  expect(screen.getByRole('alert')).toHaveTextContent('บันทึกไม่ได้');
  const dialog = screen.getByRole('dialog', { name: 'แก้ไข' });
  const esc = new Event('cancel', { cancelable: true });
  fireEvent(dialog, esc);
  fireEvent.click(dialog);
  expect(esc.defaultPrevented).toBe(true);
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(onOpenChange).toHaveBeenCalledTimes(2);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  onOpenChange.mockClear();
  rerender(<FormDialog open onOpenChange={onOpenChange} title="แก้ไข" submitLabel="บันทึก" isSubmitting onSubmit={vi.fn()}><Fields /></FormDialog>);
  expect(screen.getByRole('button', { name: 'กำลังบันทึก' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(onOpenChange).not.toHaveBeenCalled();
});
