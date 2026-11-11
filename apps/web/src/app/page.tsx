import { SiteImageService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { AppName } from '../components/app-name';
import { BrandLogo } from '../components/brand-logo';
import { ModuleIcon } from '../components/module-icon';
import type { ModuleIconName } from '../lib/modules';
import { getSharedDatabase } from '../lib/database';
import { providerSsoEnabled } from '../lib/provider-sso';
import { LocalSignInForm } from './local-sign-in-form';
import { ProviderSignIn } from './provider-sign-in';

const heroModules: ReadonlyArray<[string, ModuleIconName]> = [['การลา', 'leave'], ['ไปราชการ', 'travel'], ['จองห้องประชุม', 'room'], ['ยานพาหนะ', 'car'], ['คลังพัสดุ', 'package'], ['งานบุคคล', 'people']];

/** The version of the hospital photo set at ผู้ดูแลระบบ > หน้าตาระบบ; null (plain blue hero) when none is set or the database is down. */
async function loginPhotoVersion(): Promise<string | null> {
  const database = getSharedDatabase();
  if (!database) return null;
  try { return await new SiteImageService(database).version('login-hero'); } catch { return null; }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const provider = (await searchParams).provider;
  const photo = await loginPhotoVersion();
  return (
    <main className="welcome-shell">
      <div className="login-card">
        <section className={photo ? 'login-hero login-hero-photo' : 'login-hero'} aria-label={t('hospitalName')}
          style={photo ? { '--login-photo': `url("/api/site/login-photo?v=${photo}")` } as React.CSSProperties : undefined}>
          <div className="login-hero-head">
            <BrandLogo size={88} className="login-hero-logo" />
            <p className="login-hero-hospital">{t('hospitalName')}</p>
            <p className="login-hero-system"><AppName /></p>
            <p className="login-hero-copy">พื้นที่กลางสำหรับจัดการคำขอ ทรัพยากร และงานสนับสนุนภายในองค์กร</p>
          </div>
          <ul className="login-tiles" aria-label="โมดูลหลัก">
            {heroModules.map(([name, icon]) => <li key={name}><span className="login-tile-icon"><ModuleIcon name={icon} /></span>{name}</li>)}
          </ul>
        </section>
        <section aria-labelledby="page-title" className="welcome-panel">
          <div className="login-mobile-brand"><BrandLogo size={48} decorative /><p className="eyebrow">{t('hospitalName')}</p></div>
          <h1 id="page-title"><AppName /></h1>
          <p className="welcome-status" role="status">กำลังเตรียมระบบพื้นฐานสำหรับโครงการนำร่อง</p>
          <LocalSignInForm />
          <ProviderSignIn enabled={providerSsoEnabled()} outcome={typeof provider === 'string' ? provider : undefined} />
          <p className="login-help">ลืมรหัสผ่าน ติดต่อกลุ่มงานเทคโนโลยีสารสนเทศ</p>
        </section>
      </div>
    </main>
  );
}
