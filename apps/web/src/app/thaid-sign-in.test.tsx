import { render, screen } from '@testing-library/react';
import { ThaidSignIn } from './thaid-sign-in';

describe('ThaidSignIn', () => {
  it('renders nothing when ThaID is not ready', () => {
    const { container } = render(<ThaidSignIn enabled={false} outcome="failed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links the button to the ThaID start route', () => {
    render(<ThaidSignIn enabled outcome={undefined} />);
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบด้วย ThaID' })).toHaveAttribute('href', '/api/auth/thaid/start');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['unavailable', 'ระบบ ThaID ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'],
    ['failed', 'เข้าสู่ระบบด้วย ThaID ไม่สำเร็จ กรุณาลองใหม่'],
    ['inactive', 'บัญชีบุคลากรนี้ไม่ได้อยู่ในสถานะปฏิบัติงาน กรุณาติดต่อผู้ดูแลระบบ'],
    ['not_found', 'ไม่พบเลขบัตรประชาชนนี้ในทะเบียนบุคลากร กรุณาติดต่อผู้ดูแลระบบ']
  ])('shows the Thai message for %s', (outcome, message) => {
    render(<ThaidSignIn enabled outcome={outcome} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });
});
