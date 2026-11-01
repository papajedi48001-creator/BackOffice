import { notFound } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { readRuntimeValue } from '../../lib/runtime-env';
import { isSetupMode } from '../../lib/setup-mode';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

const requiredKeys = ['BACKOFFICE_SESSION_SECRET', 'NATIONAL_ID_ENCRYPTION_KEY', 'NATIONAL_ID_LOOKUP_KEY'] as const;

/** Open only until a database URL exists; after that it is gone for good. */
export default function SetupPage() {
  if (!isSetupMode()) notFound();
  const missingKeys = requiredKeys.filter((name) => !readRuntimeValue(name));
  return (
    <main className="welcome-shell">
      <section aria-labelledby="setup-title" className="welcome-panel setup-panel">
        <p className="eyebrow">{t('hospitalName')}</p>
        <h1 id="setup-title">{t('setupTitle')}</h1>
        <p className="welcome-copy">{t('setupIntro')}</p>
        <SetupForm missingKeys={missingKeys} />
      </section>
    </main>
  );
}
