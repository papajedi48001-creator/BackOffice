import { t } from '@backoffice/i18n';
import { AppName } from '../components/app-name';
import { BrandLogo } from '../components/brand-logo';
import { LocalSignInForm } from './local-sign-in-form';

export default function HomePage() {
  return (
    <main className="welcome-shell">
      <div className="login-card">
        <section className="login-hero" aria-label={t('hospitalName')}>
          <BrandLogo size={88} className="login-hero-logo" />
          <p className="login-hero-hospital">{t('hospitalName')}</p>
          <p className="login-hero-system"><AppName /></p>
          <p className="login-hero-copy">พื้นที่กลางสำหรับจัดการคำขอ ทรัพยากร และงานสนับสนุนภายในองค์กร</p>
          <ul className="login-pills" aria-label="โมดูลหลัก">
            {['การลา', 'ไปราชการ', 'จองห้องประชุม', 'ยานพาหนะ', 'คลังพัสดุ', 'งานบุคคล'].map((name) => <li key={name}>{name}</li>)}
          </ul>
        </section>
        <section aria-labelledby="page-title" className="welcome-panel">
          <div className="login-mobile-brand"><BrandLogo size={48} decorative /><p className="eyebrow">{t('hospitalName')}</p></div>
          <h1 id="page-title"><AppName /></h1>
          <p className="welcome-status" role="status">กำลังเตรียมระบบพื้นฐานสำหรับโครงการนำร่อง</p>
          <LocalSignInForm />
          <p className="login-help">ลืมรหัสผ่าน ติดต่อกลุ่มงานเทคโนโลยีสารสนเทศ</p>
        </section>
      </div>
    </main>
  );
}
