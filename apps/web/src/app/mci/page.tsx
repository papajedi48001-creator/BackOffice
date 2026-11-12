import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MciQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { BrandLogo } from '../../components/brand-logo';
import { getSharedDatabase } from '../../lib/database';
import { mciKindLabel, mciText } from '../../lib/mci-labels';
import { isPasswordSignInOpen } from '../../lib/password-sign-in';
import { providerSsoEnabled } from '../../lib/provider-sso';
import { readSession } from '../../lib/session';
import { LocalSignInForm } from '../local-sign-in-form';
import { ProviderSignIn } from '../provider-sign-in';

export const dynamic = 'force-dynamic';

/** /mci: the รายงานตัว sign-in for staff and ผู้บัญชาการเหตุ alike. A signed-in person goes straight on to ภาพรวม. */
export default async function MciLandingPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (session?.authenticated) redirect('/mci/ops');
  const database = getSharedDatabase();
  const incident = database ? await new MciQueries(database).openIncident() : null;
  return <main className="welcome-shell mci-landing" data-module="mass-casualty">
    <div className="mci-landing-card">
      <header className="mci-landing-header">
        <BrandLogo size={56} decorative />
        <div><p className="eyebrow">{t('hospitalName')}</p><h1>{mciText.module}: {mciText.checkIn}</h1></div>
      </header>
      {incident ? <div className={`mci-incident-banner${incident.kind === 'DRILL' ? ' mci-incident-drill' : ''}`} role="status">
        {incident.kind === 'DRILL' && <strong>{mciText.drillBanner}</strong>}
        <span>{mciKindLabel(incident.kind)}: {incident.title}</span>
        <span>เข้าสู่ระบบแล้วกด “{mciText.checkIn}”</span>
      </div> : <p className="mci-incident-banner mci-incident-none" role="status">{mciText.noIncident}</p>}
      {isPasswordSignInOpen() ? <LocalSignInForm next="/mci/ops" /> : <ProviderSignIn enabled={providerSsoEnabled()} outcome={undefined} passwordOpen={false} />}
      <p><Link href="/mci/board">{mciText.boardLink}</Link></p>
    </div>
  </main>;
}
