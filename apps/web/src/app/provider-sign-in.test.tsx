import { render, screen } from '@testing-library/react';
import { ProviderSignIn } from './provider-sign-in';

describe('ProviderSignIn', () => {
  it('renders nothing when Provider SSO is off', () => {
    const { container } = render(<ProviderSignIn enabled={false} outcome="unavailable" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links the button to the start route', () => {
    render(<ProviderSignIn enabled outcome={undefined} />);
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบด้วย Provider ID' })).toHaveAttribute('href', '/api/auth/provider/start');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['unavailable', 'ระบบ Provider ID ไม่พร้อมใช้งาน กรุณาใช้ชื่อผู้ใช้และรหัสผ่าน'],
    ['failed', 'เข้าสู่ระบบด้วย Provider ID ไม่สำเร็จ กรุณาลองใหม่'],
    ['inactive', 'บัญชีบุคลากรนี้ไม่ได้อยู่ในสถานะปฏิบัติงาน กรุณาติดต่อผู้ดูแลระบบ']
  ])('shows the Thai message for %s', (outcome, message) => {
    render(<ProviderSignIn enabled outcome={outcome} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('ignores an unknown outcome', () => {
    render(<ProviderSignIn enabled outcome="<script>" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
