import { redirect } from 'next/navigation';
import { AppName } from '../../components/app-name';
import { BrandLogo } from '../../components/brand-logo';
import { providerSsoEnabled } from '../../lib/provider-sso';
import { LinkProviderForm } from './link-provider-form';

/** ผูกบัญชี Provider ID: reached only from the Provider ID callback, which leaves a ten-minute ticket cookie. */
export default function LinkProviderPage() {
  if (!providerSsoEnabled()) redirect('/');
  return (
    <main className="welcome-shell">
      <div className="login-card link-provider-card">
        <section aria-labelledby="page-title" className="welcome-panel">
          <div className="login-mobile-brand"><BrandLogo size={48} decorative /><p className="eyebrow"><AppName /></p></div>
          <h1 id="page-title">ผูกบัญชี Provider ID</h1>
          <p className="welcome-status">ยืนยันตัวตนกับ Provider ID แล้ว แต่บัญชีนี้ยังไม่ได้ผูกกับบุคลากรใน Back Office กรอกชื่อผู้ใช้และรหัสผ่าน Back Office หนึ่งครั้งเพื่อผูกบัญชี ครั้งต่อไปเข้าสู่ระบบด้วย Provider ID ได้ทันที</p>
          <LinkProviderForm />
          <p className="login-help">ถ้าไม่มีรหัสผ่าน BackOffice ให้ติดต่อผู้ดูแลระบบเพื่อผูกบัญชี</p>
          <p className="login-help"><a href="/">กลับหน้าเข้าสู่ระบบ</a></p>
        </section>
      </div>
    </main>
  );
}
