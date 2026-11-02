import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NewPasswordField, passwordProblem } from './new-password-field';

function Harness() {
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  return <NewPasswordField label="hrFieldPassword" value={value} confirm={confirm} onChange={setValue} onConfirmChange={setConfirm} />;
}

describe('passwordProblem', () => {
  it('flags Thai or other non-ASCII letters, then a mismatch', () => {
    expect(passwordProblem('ำพะัีรนยบล', 'ำพะัีรนยบล')).toBe('hrPasswordNotAscii');
    expect(passwordProblem('long-enough-1', 'long-enough-2')).toBe('hrPasswordMismatch');
    expect(passwordProblem('long-enough-1', 'long-enough-1')).toBeNull();
    expect(passwordProblem('', '')).toBeNull();
  });
});

describe('NewPasswordField', () => {
  it('hides by default, shows on request, and turns off browser autofill of saved passwords', () => {
    render(<Harness />);
    const input = screen.getByLabelText('รหัสผ่าน');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('ยืนยันรหัสผ่าน')).toHaveAttribute('type', 'text');
  });

  it('warns about a Thai keyboard and a mismatch as the person types', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'ห' } });
    expect(screen.getByRole('alert')).toHaveTextContent('แป้นพิมพ์อาจเป็นภาษาไทย');
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'long-enough-1' } });
    fireEvent.change(screen.getByLabelText('ยืนยันรหัสผ่าน'), { target: { value: 'long-enough-2' } });
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่ตรงกัน');
  });
});
