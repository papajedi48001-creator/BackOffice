import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppName } from '../../components/app-name';
import { BrandLogo } from '../../components/brand-logo';
import { getSharedDatabase } from '../../lib/database';
import { externalLoginService, providerSsoConfig, providerTicketCookie } from '../../lib/provider-sso';

// The Provider SSO settings are read at run time; a page prerendered at build time would bake in "disabled".
export const dynamic = 'force-dynamic';

/** ผูกบัญชี Provider ID: reached from the callback when no บุคลากร matched the Provider ID national ID; an admin links it. */
export default async function LinkProviderPage() {
  const config = providerSsoConfig();
  const database = getSharedDatabase();
  if (!config || !database) {
    redirect('/');
    return null;
  }
  // The name from Provider ID is the only on-screen check that the MOPH ID session is this person's own (shared computers reuse it).
  const ticket = (await cookies()).get(providerTicketCookie)?.value ?? '';
  const pending = await externalLoginService(database, config.apiUrl).pendingLogin(ticket);
  if (!pending) {
    redirect('/?provider=failed');
    return null;
  }
  return (
    <main className="welcome-shell">
      <div className="login-card link-provider-card">
        <section aria-labelledby="page-title" className="welcome-panel">
          <div className="login-mobile-brand"><BrandLogo size={48} decorative /><p className="eyebrow"><AppName /></p></div>
          <h1 id="page-title">ผูกบัญชี Provider ID</h1>
          <p className="welcome-status">ยืนยันตัวตนกับ Provider ID แล้ว แต่ไม่พบบุคลากรใน Back Office ที่มีเลขบัตรประชาชนตรงกัน กรุณาติดต่อผู้ดูแลระบบเพื่อผูกบัญชี เมื่อผูกแล้วเข้าสู่ระบบด้วย Provider ID ได้ทันที</p>
          <div className="link-provider-identity" role="note">
            <p>ยืนยันตัวตนกับ Provider ID เป็น</p>
            <p className="link-provider-name">{pending.displayName ?? 'ไม่ทราบชื่อ'}</p>
            <p>ถ้าไม่ใช่ชื่อของคุณ ให้ออกจากระบบ MOPH ID ก่อนแล้วเข้าสู่ระบบใหม่</p>
          </div>
          <p className="login-help">แจ้งผู้ดูแลระบบด้วยชื่อข้างต้น ผู้ดูแลระบบผูกบัญชีให้ได้ที่ ผู้ดูแลระบบ &gt; บัญชี Provider ID</p>
          <p className="login-help"><a href="/">กลับหน้าเข้าสู่ระบบ</a></p>
        </section>
      </div>
    </main>
  );
}
