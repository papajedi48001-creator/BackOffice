import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KioskPairing } from './kiosk-pairing';

it('asks for 8 digits before pairing', () => {
  const onPair = vi.fn();
  render(<KioskPairing onPair={onPair} />);
  fireEvent.change(screen.getByLabelText('รหัสจับคู่'), { target: { value: '1234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'จับคู่เครื่อง' }));
  expect(screen.getByRole('alert')).toHaveTextContent('กรอกรหัสจับคู่ 8 หลัก');
  expect(onPair).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('รหัสจับคู่'), { target: { value: '1234 5678' } });
  fireEvent.click(screen.getByRole('button', { name: 'จับคู่เครื่อง' }));
  expect(onPair).toHaveBeenCalledWith('12345678');
});
